// Create two short-lived browser fixtures in the same starter region.
// The regular WebCheck account can be moved by other route tests, so the PvP
// probe uses these dedicated credentials when they are available.
import { mkdir, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const gatewayUrl = process.env.MIR2_GATEWAY_URL ?? 'ws://127.0.0.1:18800/ws';

class Client {
  constructor() {
    this.socket = new WebSocket(gatewayUrl);
    this.queue = [];
    this.waiters = [];
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data).message;
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(message); else this.queue.push(message);
    });
    this.socket.addEventListener('close', () => {
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error('Gateway disconnected'));
    });
  }

  receive(timeout = 30000) {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((resolve, reject) => {
      const waiter = { resolve: value => { clearTimeout(timer); resolve(value); }, reject };
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error('Gateway response timed out'));
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
  close() { this.socket.close(); }
}

const suffix = Date.now().toString(36).slice(-6);
const randomPassword = () => `p${Math.random().toString(36).slice(2, 10)}`.slice(0, 10);

async function createFixture(prefix) {
  const account = `${prefix}${suffix}`.slice(0, 10);
  const password = randomPassword();
  const character = `PvP${prefix}${suffix}`.slice(0, 10);
  const client = new Client();
  try {
    await client.waitFor('connected');
    client.send({ type: 'register', account, password });
    const registration = await client.waitFor('registrationResult');
    if (!registration.accepted) throw new Error(`Registration rejected for ${account}`);
    client.send({ type: 'login', account, password });
    const emptyCharacters = await client.waitFor('characters');
    if (emptyCharacters.characters.length) throw new Error(`Fresh account ${account} already has characters`);
    client.send({ type: 'createCharacter', name: character, job: 0, sex: 0, hair: 1 });
    const creation = await client.waitFor('characterCreationResult');
    if (!creation.accepted) throw new Error(`Character creation rejected for ${character}`);
    const characters = await client.waitFor('characters');
    if (!characters.characters.some(value => value.name === character)) throw new Error(`Character list did not refresh for ${character}`);
    client.send({ type: 'selectCharacter', name: character });
    const map = await client.waitFor('map');
    let self;
    for (let index = 0; index < 400; index++) {
      const message = await client.receive();
      if (message.type === 'entity' && message.self) { self = message; break; }
    }
    if (!self) throw new Error(`Self entity was not received for ${character}`);
    return { gatewayUrl, account, password, character, registered: true, spawn: { map: map.map, x: self.x, y: self.y } };
  } finally {
    // Let the legacy game gate finish its leave notification before the next
    // candidate uses the same local connection and account slot.
    await new Promise(resolve => setTimeout(resolve, 1200));
    client.close();
  }
}

await mkdir(new URL('.runtime/', root), { recursive: true });
const attacker = await createFixture('p');
let victim;
for (let attempt = 0; attempt < 7; attempt++) {
  let candidate;
  try {
    candidate = await createFixture(`v${attempt}`);
  } catch (error) {
    console.error(`candidate v${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  const sameMap = candidate.spawn.map === attacker.spawn.map;
  const closeEnough = Math.max(Math.abs(candidate.spawn.x - attacker.spawn.x), Math.abs(candidate.spawn.y - attacker.spawn.y)) <= 6;
  if (sameMap && closeEnough) { victim = candidate; break; }
}
if (!victim) throw new Error(`Could not create two nearby starter fixtures around ${attacker.spawn.map}:${attacker.spawn.x},${attacker.spawn.y}`);
await writeFile(new URL('.runtime/pvp-attacker.json', root), `${JSON.stringify(attacker, null, 2)}\n`, { mode: 0o600 });
await writeFile(new URL('.runtime/pvp-victim.json', root), `${JSON.stringify(victim, null, 2)}\n`, { mode: 0o600 });
console.log(`PASS PvP fixtures ${attacker.character}@${attacker.spawn.x},${attacker.spawn.y} and ${victim.character}@${victim.spawn.x},${victim.spawn.y}`);
