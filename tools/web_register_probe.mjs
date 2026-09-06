// Verify the browser-facing account registration path through the WebSocket gateway.
// The account is intentionally fresh on every run so an already-used fixture
// cannot mask a broken 2002/504 legacy exchange.
import { mkdir, writeFile } from 'node:fs/promises';

const gatewayUrl = process.env.MIR2_GATEWAY_URL ?? 'ws://127.0.0.1:18800/ws';
const account = `w${Date.now().toString(36).slice(-8)}`.slice(0, 10);
const password = `p${Math.random().toString(36).slice(2, 10)}`.slice(0, 10);
const report = { gatewayUrl, account, registered: false, loggedIn: false, characters: false };
const socket = new WebSocket(gatewayUrl);
let sequence = 0;
const queue = [];
const waiters = [];

socket.addEventListener('message', event => {
  const envelope = JSON.parse(event.data);
  if (!Number.isInteger(envelope.sequence) || envelope.sequence <= sequence)
    throw new Error('Gateway sequence is not monotonic');
  sequence = envelope.sequence;
  const waiter = waiters.shift();
  if (waiter) waiter.resolve(envelope.message);
  else queue.push(envelope.message);
});
socket.addEventListener('close', () => {
  for (const waiter of waiters.splice(0)) waiter.reject(new Error('Gateway disconnected'));
});

function receive(timeout = 20000) {
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

const send = command => socket.send(JSON.stringify(command));

try {
  const greeting = await receive();
  if (greeting.type !== 'connected') throw new Error(`Missing gateway greeting: ${JSON.stringify(greeting)}`);
  send({ type: 'register', account, password });
  const registration = await receive();
  if (registration.type !== 'registrationResult' || !registration.accepted)
    throw new Error(`Registration failed: ${JSON.stringify(registration)}`);
  report.registered = true;
  send({ type: 'login', account, password });
  const characters = await receive();
  if (characters.type !== 'characters') throw new Error(`Login after registration failed: ${JSON.stringify(characters)}`);
  report.loggedIn = true;
  report.characters = true;
  console.log(`PASS browser registration and login (${account}, ${characters.characters.length} characters)`);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  socket.close();
  await mkdir('.runtime/reports', { recursive: true });
  await writeFile('.runtime/reports/web-registration.json', JSON.stringify(report, null, 2));
}
