// Verify that an engine crash inside SaveHumanRcdTime keeps the last confirmed
// character save. The probe account is isolated from normal personal saves.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile as rawExecFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const execFile = promisify(rawExecFile);
const gatewayUrl = process.env.MIR2_GATEWAY_URL ?? 'ws://127.0.0.1:18800/ws';
const crashDelayMs = Number(process.env.MIR2_POWER_LOSS_DELAY_MS ?? 1000);
if (!Number.isInteger(crashDelayMs) || crashDelayMs < 250 || crashDelayMs >= 60000)
  throw new Error('MIR2_POWER_LOSS_DELAY_MS must be between 250 and 59999');

const credentials = JSON.parse(await readFile(`${root}/.runtime/probe-account.json`, 'utf8'));
const directions = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
const report = { gatewayUrl, crashDelayMs, passed: false, errors: [] };

class Session {
  constructor() {
    this.socket = new WebSocket(gatewayUrl);
    this.queue = [];
    this.waiters = [];
    this.sequence = 0;
    this.socket.addEventListener('message', event => {
      const envelope = JSON.parse(event.data);
      if (!Number.isInteger(envelope.sequence) || envelope.sequence <= this.sequence)
        throw new Error(`non-monotonic sequence ${envelope.sequence}/${this.sequence}`);
      this.sequence = envelope.sequence;
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(envelope.message); else this.queue.push(envelope.message);
    });
    this.socket.addEventListener('close', event => {
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error(`gateway closed (${event.code})`));
    });
  }

  receive(timeout = 20000) {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((resolve, reject) => {
      const waiter = { resolve: value => { clearTimeout(timer); resolve(value); }, reject };
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error('gateway response timed out'));
      }, timeout);
      this.waiters.push(waiter);
    });
  }

  async waitFor(type) {
    for (;;) {
      const message = await this.receive();
      if (message.type === 'error') throw new Error(message.message);
      if (message.type === type) return message;
    }
  }

  send(message) { this.socket.send(JSON.stringify(message)); }
  close() { if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) this.socket.close(); }
}

async function enter() {
  const session = new Session();
  await session.waitFor('connected');
  session.send({ type: 'login', account: credentials.account, password: credentials.password });
  const characters = await session.waitFor('characters');
  const character = credentials.character ?? characters.characters[0]?.name;
  if (!character || !characters.characters.some(value => value.name === character))
    throw new Error(`character ${character ?? '(none)'} unavailable`);
  session.send({ type: 'selectCharacter', name: character });
  const map = await session.waitFor('map');
  for (;;) {
    const message = await session.receive();
    if (message.type === 'entity' && message.self)
      return { session, character, map: map.map, position: [message.x, message.y] };
  }
}

async function runtimeMap(map) {
  const bytes = await readFile(`${root}/.runtime/server/Mir200/Map/${map}.map`);
  return { bytes, width: bytes.readUInt16LE(0), height: bytes.readUInt16LE(2) };
}

function blocked(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  const offset = 52 + (x * map.height + y) * 12;
  return Boolean((map.bytes.readUInt16LE(offset) | map.bytes.readUInt16LE(offset + 4)) & 0x8000);
}

async function move(session, map, position) {
  for (let direction = 0; direction < directions.length; direction++) {
    const [dx, dy] = directions[direction];
    const target = [position[0] + dx, position[1] + dy];
    if (blocked(map, target[0], target[1])) continue;
    session.send({ type: 'move', x: target[0], y: target[1], direction });
    for (;;) {
      const message = await session.receive();
      if (message.type === 'error') throw new Error(message.message);
      if (message.type === 'legacy' && message.id === -1 && String(message.status).startsWith('+GD/')) return target;
      if (message.type === 'legacy' && message.id === 28) break;
    }
  }
  throw new Error(`no open neighbor around ${position.join(',')}`);
}

async function command(...args) {
  return execFile('bash', ['scripts/compose.sh', ...args], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
}

async function restartGameServices() {
  await command('up', '-d', 'engine', 'web-gateway');
  await execFile('python3', ['scripts/wait-ready.py'], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
}

async function sleep(milliseconds) { await new Promise(resolve => setTimeout(resolve, milliseconds)); }

let baselineSession;
let movedSession;
try {
  // A normal stop flushes the current probe account and gives us a known save.
  await command('stop', 'engine');
  await restartGameServices();
  const baseline = await enter();
  baselineSession = baseline.session;
  report.character = baseline.character;
  report.map = baseline.map;
  report.savedPosition = baseline.position;
  baselineSession.close();
  await sleep(1200);

  const moved = await enter();
  movedSession = moved.session;
  if (moved.map !== baseline.map) throw new Error(`baseline map changed (${baseline.map}/${moved.map})`);
  const map = await runtimeMap(moved.map);
  const movedPosition = await move(movedSession, map, moved.position);
  const movedAt = Date.now();
  report.unsavedPosition = movedPosition;
  await sleep(crashDelayMs);

  // Keep the game session connected while killing the engine; this avoids a
  // graceful disconnect becoming an accidental save acknowledgement.
  const killStarted = Date.now();
  await command('kill', '-s', 'KILL', 'engine');
  report.crashElapsedMs = killStarted - movedAt;
  await command('stop', 'web-gateway');
  await restartGameServices();
  movedSession.close();

  const restored = await enter();
  report.restoredPosition = restored.position;
  report.restoredMap = restored.map;
  restored.session.close();
  const sameSavedPosition = restored.map === baseline.map
    && restored.position[0] === baseline.position[0]
    && restored.position[1] === baseline.position[1];
  const movedWasDifferent = movedPosition[0] !== baseline.position[0] || movedPosition[1] !== baseline.position[1];
  report.restoredSavedState = sameSavedPosition;
  report.unsavedMoveWasDifferent = movedWasDifferent;
  report.passed = sameSavedPosition && movedWasDifferent && report.crashElapsedMs < 60000;
  if (!report.passed) throw new Error(`power-loss state mismatch: ${JSON.stringify(report)}`);
  console.log(`PASS power-loss rollback ${report.unsavedPosition.join(',')} -> ${report.restoredPosition.join(',')} within ${report.crashElapsedMs}ms`);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  report.errors.push(report.error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  baselineSession?.close();
  movedSession?.close();
  try { await restartGameServices(); } catch (error) {
    report.passed = false;
    report.errors.push(`service recovery failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
  await mkdir(`${root}/.runtime/reports/`, { recursive: true });
  await writeFile(`${root}/.runtime/reports/power-loss.json`, `${JSON.stringify(report, null, 2)}\n`);
}
