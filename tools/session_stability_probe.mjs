// Hold one browser gateway session, exercise harmless snapshot requests, then
// reconnect with the same character and verify authoritative state resumes.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const gatewayUrl = process.env.MIR2_GATEWAY_URL ?? 'ws://127.0.0.1:18800/ws';
const durationMs = Number(process.env.MIR2_STABILITY_MS ?? 30000);
if (!Number.isFinite(durationMs) || durationMs < 5000 || durationMs > 7200000)
  throw new Error('MIR2_STABILITY_MS must be between 5000 and 7200000');
const credentials = JSON.parse(await readFile(new URL('.runtime/probe-account.json', root), 'utf8'));
const report = { gatewayUrl, durationMs, passed: false, snapshots: 0, reconnect: false, errors: [] };

class Session {
  constructor() {
    this.socket = new WebSocket(gatewayUrl);
    this.queue = [];
    this.waiters = [];
    this.sequence = 0;
    this.mapGeneration = 0;
    this.events = [];
    this.socket.addEventListener('message', event => {
      const envelope = JSON.parse(event.data);
      if (!Number.isInteger(envelope.sequence) || envelope.sequence <= this.sequence)
        this.fail(`non-monotonic sequence ${envelope.sequence}/${this.sequence}`);
      if (envelope.mapGeneration < this.mapGeneration)
        this.fail(`map generation regressed ${envelope.mapGeneration}/${this.mapGeneration}`);
      this.sequence = envelope.sequence;
      this.mapGeneration = Math.max(this.mapGeneration, envelope.mapGeneration);
      const message = envelope.message;
      this.events.push(message);
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(message); else this.queue.push(message);
    });
    this.socket.addEventListener('close', event => {
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error(`gateway closed (${event.code})`));
    });
  }

  fail(message) { report.errors.push(message); }

  receive(timeout = 15000) {
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

  async waitFor(type, timeout = 15000) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const message = await this.receive(Math.max(1, deadline - Date.now()));
      if (message.type === 'error') throw new Error(message.message);
      if (message.type === type) return message;
    }
  }

  send(message) { this.socket.send(JSON.stringify(message)); }
  close() { this.socket.close(); }
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
  let self;
  for (;;) {
    const entity = await session.receive();
    if (entity.type === 'error') throw new Error(entity.message);
    if (entity.type === 'entity' && entity.self) { self = entity; break; }
  }
  return { session, character, map: map.map, position: [self.x, self.y] };
}

async function collectSnapshot(session) {
  session.send({ type: 'inventory' });
  const wanted = new Set(['attributes', 'equipment', 'skills', 'inventory']);
  const seen = new Set();
  const deadline = Date.now() + 15000;
  while (seen.size < wanted.size && Date.now() < deadline) {
    const message = await session.receive(Math.max(1, deadline - Date.now()));
    if (message.type === 'error') throw new Error(message.message);
    if (wanted.has(message.type)) seen.add(message.type);
  }
  if (seen.size !== wanted.size) throw new Error(`incomplete authoritative snapshot: ${[...wanted].filter(type => !seen.has(type)).join(',')}`);
  return [...seen].sort();
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let first;
let second;
try {
  first = await enter();
  first.snapshot = await collectSnapshot(first.session);
  const started = Date.now();
  let nextSnapshot = started;
  while (Date.now() - started < durationMs) {
    if (Date.now() >= nextSnapshot) {
      first.session.send({ type: 'inventory' });
      first.session.send({ type: 'attackMode', mode: 0 });
      report.snapshots++;
      nextSnapshot += 3000;
    }
    await sleep(100);
  }
  report.firstSession = {
    map: first.map,
    position: first.position,
    sequence: first.session.sequence,
    mapGeneration: first.session.mapGeneration,
    events: first.session.events.length,
    snapshot: first.snapshot
  };
  first.session.close();
  await sleep(500);
  second = await enter();
  second.snapshot = await collectSnapshot(second.session);
  report.reconnect = true;
  report.secondSession = {
    map: second.map,
    position: second.position,
    sequence: second.session.sequence,
    mapGeneration: second.session.mapGeneration,
    events: second.session.events.length,
    snapshot: second.snapshot
  };
  if (second.map !== first.map) throw new Error(`map changed across reconnect (${first.map}/${second.map})`);
  report.passed = report.errors.length === 0;
  if (!report.passed) throw new Error(report.errors.join('; '));
  console.log(`PASS session stability ${durationMs}ms, ${report.snapshots} snapshots, reconnect ${second.map}:${second.position.join(',')}`);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  report.errors.push(report.error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  first?.session.close();
  second?.session.close();
  await mkdir(new URL('.runtime/reports/', root), { recursive: true });
  await writeFile(new URL('.runtime/reports/session-stability.json', root), `${JSON.stringify(report, null, 2)}\n`);
}
