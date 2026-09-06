// Exercise the browser-facing registration, character creation and first map entry.
// A fresh account is used on every run so the legacy selection throttle is tested
// against the same empty-account path as a new player.
import { mkdir, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const gatewayUrl = process.env.MIR2_GATEWAY_URL ?? 'ws://127.0.0.1:18800/ws';
const suffix = Date.now().toString(36).slice(-7);
const account = `c${suffix}`.slice(0, 10);
const password = `p${Math.random().toString(36).slice(2, 10)}`.slice(0, 10);
const character = `C${suffix}`.slice(0, 10);
const report = { gatewayUrl, account, character, registered: false, created: false, entered: false };

const socket = new WebSocket(gatewayUrl);
let sequence = 0;
const queue = [];
const waiters = [];
socket.addEventListener('message', event => {
  const envelope = JSON.parse(event.data);
  if (!Number.isInteger(envelope.sequence) || envelope.sequence <= sequence)
    throw new Error(`Gateway sequence is not monotonic (${envelope.sequence}/${sequence})`);
  sequence = envelope.sequence;
  const waiter = waiters.shift();
  if (waiter) waiter.resolve(envelope.message); else queue.push(envelope.message);
});
socket.addEventListener('close', () => {
  for (const waiter of waiters.splice(0)) waiter.reject(new Error('Gateway disconnected'));
});

function receive(timeout = 30000) {
  if (queue.length) return Promise.resolve(queue.shift());
  return new Promise((resolve, reject) => {
    const waiter = { resolve: value => { clearTimeout(timer); resolve(value); }, reject };
    const timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error('Gateway response timed out'));
    }, timeout);
    waiters.push(waiter);
  });
}

async function waitFor(type) {
  for (;;) {
    const message = await receive();
    if (message.type === 'error') throw new Error(message.message);
    if (message.type === type) return message;
  }
}

const send = message => socket.send(JSON.stringify(message));

try {
  if ((await waitFor('connected')).type !== 'connected') throw new Error('Missing gateway greeting');
  send({ type: 'register', account, password });
  const registration = await waitFor('registrationResult');
  if (!registration.accepted) throw new Error(`Registration rejected (${registration.reason})`);
  report.registered = true;

  send({ type: 'login', account, password });
  const empty = await waitFor('characters');
  if (empty.characters.length) throw new Error('Fresh account unexpectedly has characters');

  send({ type: 'createCharacter', name: character, job: 0, sex: 0, hair: 1 });
  const creation = await waitFor('characterCreationResult');
  if (!creation.accepted) throw new Error(`Character creation rejected (${creation.reason})`);
  report.created = true;
  const characters = await waitFor('characters');
  if (!characters.characters.some(value => value.name === character)) throw new Error('Created character missing from list');

  send({ type: 'selectCharacter', name: character });
  const map = await waitFor('map');
  let self;
  for (let index = 0; index < 400; index++) {
    const message = await receive();
    if (message.type === 'entity' && message.self) { self = message; break; }
  }
  if (!self) throw new Error('Self entity was not received after character selection');
  report.entered = true;
  report.map = map.map;
  report.position = [self.x, self.y];
  console.log(`PASS registration, character creation and entry (${account}/${character} @ ${map.map}:${self.x},${self.y})`);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  socket.close();
  await new Promise(resolve => setTimeout(resolve, 1200));
  await mkdir(new URL('.runtime/reports/', root), { recursive: true });
  await writeFile(new URL('.runtime/reports/character-creation.json', root), `${JSON.stringify(report, null, 2)}\n`);
}
