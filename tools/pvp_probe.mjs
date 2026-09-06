// Verify two independent browser gateway sessions on one map.
// The local fixtures are deliberately read from .runtime so credentials stay out of source control.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const gatewayUrl = process.env.MIR2_GATEWAY_URL ?? 'ws://127.0.0.1:18800/ws';
// Keep the two-player fixture in the same walkable starter area. The regular
// WebCheck browser fixture may be left elsewhere by route tests, so an optional
// dedicated credential file takes precedence when present.
const attackerFile = new URL('.runtime/pvp-attacker.json', root);
let attackerCredentials;
try {
  attackerCredentials = JSON.parse(await readFile(attackerFile, 'utf8'));
} catch {
  attackerCredentials = JSON.parse(await readFile(new URL('.runtime/probe-account.json', root), 'utf8'));
}
const victimFile = new URL('.runtime/pvp-victim.json', root);
let victimCredentials;
try {
  victimCredentials = JSON.parse(await readFile(victimFile, 'utf8'));
} catch {
  victimCredentials = JSON.parse(await readFile(new URL('.runtime/web-ui-test.json', root), 'utf8'));
}
const victim = {
  ...victimCredentials,
  label: 'victim',
};
const attacker = {
  ...attackerCredentials,
  label: 'attacker',
  character: attackerCredentials.character ?? `Mir${attackerCredentials.account.slice(1)}`,
};
const directions = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
const report = { gatewayUrl, passed: false };

class Client {
  constructor(identity) {
    Object.assign(this, identity);
    this.socket = new WebSocket(gatewayUrl);
    this.queue = [];
    this.waiters = [];
    this.events = [];
    this.sequence = 0;
    this.socket.addEventListener('message', event => {
      const envelope = JSON.parse(event.data);
      if (!Number.isInteger(envelope.sequence) || envelope.sequence <= this.sequence)
        throw new Error(`${this.label}: gateway sequence is not monotonic`);
      this.sequence = envelope.sequence;
      const message = envelope.message;
      this.events.push(message);
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(message); else this.queue.push(message);
    });
    this.socket.addEventListener('close', event => {
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error(`${this.label}: gateway closed (${event.code})`));
    });
  }

  receive(timeout = 15000) {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((resolve, reject) => {
      const waiter = { resolve: value => { clearTimeout(timer); resolve(value); }, reject };
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`${this.label}: response timed out`));
      }, timeout);
      this.waiters.push(waiter);
    });
  }

  send(message) { this.socket.send(JSON.stringify(message)); }

  async waitFor(type, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const message = await this.receive(deadline - Date.now());
      if (message.type === type) return message;
      if (message.type === 'error') throw new Error(`${this.label}: ${message.message}`);
    }
    throw new Error(`${this.label}: missing ${type}`);
  }

  async login() {
    await this.waitFor('connected');
    this.send({ type: 'login', account: this.account, password: this.password });
    const list = await this.waitFor('characters');
    if (!list.characters.some(character => character.name === this.character))
      throw new Error(`${this.label}: character ${this.character} is unavailable`);
    this.send({ type: 'selectCharacter', name: this.character });
    return this.waitFor('map');
  }

  close() { this.socket.close(); }
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const latest = (events, predicate) => [...events].reverse().find(predicate);

async function moveAdjacent(client, target) {
  for (let step = 0; step < 8; step++) {
    const actor = latest(client.events, event => event.type === 'entity' && event.self);
    if (!actor) throw new Error(`${client.label}: own entity is unavailable`);
    const distance = Math.max(Math.abs(target.x - actor.x), Math.abs(target.y - actor.y));
    if (distance <= 1) return actor;
    const dx = Math.sign(target.x - actor.x), dy = Math.sign(target.y - actor.y);
    const direction = directions.findIndex(([x, y]) => x === dx && y === dy);
    if (direction < 0) throw new Error(`${client.label}: invalid pursuit direction`);
    const x = actor.x + dx, y = actor.y + dy;
    client.send({ type: 'move', x, y, direction });
    let accepted = false;
    for (let eventIndex = 0; eventIndex < 100; eventIndex++) {
      const event = await client.receive();
      if (event.type === 'legacy' && event.id === -1 && event.status?.startsWith('+GD/')) { accepted = true; break; }
      if (event.type === 'error') throw new Error(`${client.label}: ${event.message}`);
    }
    if (!accepted) throw new Error(`${client.label}: movement was not confirmed`);
    await sleep(300);
  }
  throw new Error(`${client.label}: could not reach adjacent attack position`);
}

const attackerClient = new Client(attacker);
const victimClient = new Client(victim);
try {
  report.attackerMap = await attackerClient.login();
  await sleep(1800);
  report.victimMap = await victimClient.login();
  if (report.attackerMap.map !== report.victimMap.map)
    throw new Error(`characters are on different maps (${report.attackerMap.map}/${report.victimMap.map}); place both test fixtures on one map first`);
  // The old server suppresses attacks for a short map-entry grace period.
  await sleep(3600);
  const target = latest(attackerClient.events, event => event.type === 'entity' && event.name === victim.character && !event.self);
  if (!target) throw new Error('attacker did not receive the other player entity');
  report.target = { id: target.id, x: target.x, y: target.y, name: target.name };
  const actor = await moveAdjacent(attackerClient, target);
  const direction = directions.findIndex(([x, y]) => x === Math.sign(target.x - actor.x) && y === Math.sign(target.y - actor.y));
  if (direction < 0) throw new Error('players are not adjacent after pursuit');
  attackerClient.send({ type: 'attackMode', mode: 0 });
  await sleep(250);
  for (let count = 0; count < 10; count++) {
    attackerClient.send({ type: 'attack', direction });
    await sleep(700);
  }
  report.attackerHealth = attackerClient.events.filter(event => event.type === 'health' && event.id === target.id);
  report.victimHealth = victimClient.events.filter(event => event.type === 'health' && event.id === target.id);
  report.victimActions = victimClient.events.filter(event => event.type === 'entityAction' && event.id === attackerClient.events.find(candidate => candidate.type === 'entity' && candidate.self)?.id);
  const damage = report.victimHealth.find(event => event.damage > 0);
  if (!damage) throw new Error('player attacks produced no authoritative health event');
  report.damage = damage.damage;
  report.passed = true;
  console.log(`PASS two-client PvP sync, attack mode and player health (${report.attackerHealth.length} health events)`);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  await mkdir(new URL('.runtime/reports/', root), { recursive: true });
  await writeFile(new URL('.runtime/reports/pvp.json', root), JSON.stringify(report, null, 2));
  attackerClient.close();
  victimClient.close();
}
