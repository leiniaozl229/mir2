// Create one disposable character through the same gateway path as the browser.
const gatewayUrl = process.env.MIR2_GATEWAY_URL ?? 'ws://127.0.0.1:18800/ws';
const account = process.env.MIR2_CREATE_ACCOUNT;
const password = process.env.MIR2_CREATE_PASSWORD;
const character = process.env.MIR2_CREATE_CHARACTER;
if (!account || !password || !character) throw new Error('create-character credentials are required');

const socket = new WebSocket(gatewayUrl);
const queue = [];
const waiters = [];
let sequence = 0;
socket.addEventListener('message', event => {
  const envelope = JSON.parse(event.data);
  if (!Number.isInteger(envelope.sequence) || envelope.sequence <= sequence)
    throw new Error('gateway sequence regressed');
  sequence = envelope.sequence;
  const waiter = waiters.shift();
  if (waiter) waiter.resolve(envelope.message); else queue.push(envelope.message);
});
socket.addEventListener('close', event => {
  for (const waiter of waiters.splice(0)) waiter.reject(new Error('gateway closed (' + event.code + ')'));
});

function receive(timeout = 30000) {
  if (queue.length) return Promise.resolve(queue.shift());
  return new Promise((resolve, reject) => {
    const waiter = { resolve: value => { clearTimeout(timer); resolve(value); }, reject };
    const timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error('gateway response timed out'));
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

try {
  await waitFor('connected');
  socket.send(JSON.stringify({ type: 'login', account, password }));
  const characters = await waitFor('characters');
  if (characters.characters.some(value => value.name === character)) {
    console.log('READY existing character ' + account + '/' + character);
  } else {
    if (characters.characters.length >= 2) throw new Error('account already has two characters');
    socket.send(JSON.stringify({ type: 'createCharacter', name: character, job: 0, sex: 0, hair: 1 }));
    const result = await waitFor('characterCreationResult');
    if (!result.accepted) throw new Error('character creation rejected (' + result.reason + ')');
    const refreshed = await waitFor('characters');
    if (!refreshed.characters.some(value => value.name === character)) throw new Error('created character missing');
    console.log('PASS created character ' + account + '/' + character);
  }
} finally {
  socket.close();
}
