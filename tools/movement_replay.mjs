// Deterministic movement replay for the browser gateway.
// The replay only walks out and back in the current map, so it does not alter
// the character's long-term route or inventory.
import { readFile, writeFile } from 'node:fs/promises';

const credentials = JSON.parse(await readFile('.runtime/probe-account.json', 'utf8'));
const report = {
  accepted: 0,
  rejected: 0,
  walkAccepted: 0,
  runAccepted: 0,
  timedWalk: undefined,
  timedRun: undefined,
  directions: [],
  sequenceMonotonic: true,
  mapGenerationMonotonic: true,
};
const directions = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
const socket = new WebSocket('ws://127.0.0.1:18800/ws');
let sequence = 0;
let mapGeneration = 0;
const queue = [], waiters = [];
const entities = new Map();
let currentMap;
let position;

socket.addEventListener('message', event => {
  const envelope = JSON.parse(event.data);
  if (envelope.sequence <= sequence) report.sequenceMonotonic = false;
  sequence = Math.max(sequence, envelope.sequence);
  if (envelope.mapGeneration < mapGeneration) report.mapGenerationMonotonic = false;
  mapGeneration = Math.max(mapGeneration, envelope.mapGeneration);
  const message = envelope.message;
  if (message.type === 'map') currentMap = message.map;
  if (message.type === 'entity') entities.set(message.id, message);
  if (message.type === 'entityRemoved') entities.delete(message.id);
  if (waiters.length) waiters.shift().resolve(message);
  else queue.push(message);
});
socket.addEventListener('close', () => {
  for (const waiter of waiters.splice(0)) waiter.reject(new Error('Gateway disconnected'));
});

function receive(timeout = 15000) {
  if (queue.length) return Promise.resolve(queue.shift());
  return new Promise((resolve, reject) => {
    const waiter = { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } };
    const timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error('Gateway response timed out'));
    }, timeout);
    waiters.push(waiter);
  });
}

const send = command => socket.send(JSON.stringify(command));

async function until(predicate, limit = 300) {
  for (let index = 0; index < limit; index++) {
    const message = await receive();
    if (message.type === 'error') throw new Error(message.message);
    if (predicate(message)) return message;
  }
  throw new Error('Replay event budget exhausted');
}

async function readMap(name) {
  const candidates = [name, name.toUpperCase(), name.toLowerCase()];
  for (const candidate of candidates) {
    try {
      const bytes = await readFile(`.runtime/server/Mir200/Map/${candidate}.map`);
      return { bytes, width: bytes.readUInt16LE(0), height: bytes.readUInt16LE(2) };
    } catch { /* try the next casing */ }
  }
  throw new Error(`Runtime map ${name} is unavailable`);
}

function blocked(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  const offset = 52 + (x * map.height + y) * 12;
  return (map.bytes.readUInt16LE(offset) | map.bytes.readUInt16LE(offset + 4)) & 0x8000;
}

function occupied(x, y) {
  for (const entity of entities.values()) {
    if (!entity.self && entity.x === x && entity.y === y) return true;
  }
  return false;
}

function candidateSteps(map, origin) {
  const result = [];
  for (let direction = 0; direction < directions.length; direction++) {
    const [dx, dy] = directions[direction];
    const walk = { direction, run: false, x: origin[0] + dx, y: origin[1] + dy };
    const run = { direction, run: true, x: origin[0] + dx * 2, y: origin[1] + dy * 2 };
    if (!blocked(map, walk.x, walk.y) && !occupied(walk.x, walk.y)) result.push(walk);
    if (!blocked(map, walk.x, walk.y) && !blocked(map, run.x, run.y)
      && !occupied(walk.x, walk.y) && !occupied(run.x, run.y)) result.push(run);
  }
  return result;
}

function timedLine(map, origin, stepSize, count) {
  for (let direction = 0; direction < directions.length; direction++) {
    const [dx, dy] = directions[direction];
    const cells = Array.from({ length: stepSize * count }, (_, index) => [
      origin[0] + dx * (index + 1), origin[1] + dy * (index + 1),
    ]);
    if (cells.some(([x, y]) => blocked(map, x, y) || occupied(x, y))) continue;
    return {
      direction,
      steps: Array.from({ length: count }, (_, index) => ({
        direction,
        run: stepSize === 2,
        x: origin[0] + dx * stepSize * (index + 1),
        y: origin[1] + dy * stepSize * (index + 1),
      })),
    };
  }
  return undefined;
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function replayTimedLine(map, origin, line, intervalMs) {
  const samples = [];
  let sentAt;
  for (const step of line.steps) {
    if (sentAt !== undefined) await sleep(intervalMs);
    const beforeSend = Date.now();
    if (!await move(step)) return { accepted: false, samples };
    if (sentAt !== undefined) samples.push(beforeSend - sentAt);
    sentAt = beforeSend;
  }
  const reverseTargets = [...line.steps.slice(0, -1).reverse(), { x: origin[0], y: origin[1] }];
  for (const target of reverseTargets) {
    await sleep(intervalMs);
    const beforeSend = Date.now();
    const step = { direction: (line.direction + 4) % 8, run: line.steps[0].run, x: target.x, y: target.y };
    if (!await move(step)) return { accepted: false, samples };
    samples.push(beforeSend - sentAt);
    sentAt = beforeSend;
  }
  return {
    accepted: true,
    samples,
    returnedToStart: position[0] === origin[0] && position[1] === origin[1],
    direction: line.direction,
    steps: line.steps.length,
    intervalMs,
  };
}

async function move(step) {
  send({ type: 'move', x: step.x, y: step.y, direction: step.direction, run: step.run });
  const result = await until(message => message.type === 'legacy' && (message.id === -1 || message.id === 28));
  if (result.id === 28) {
    report.rejected++;
    return false;
  }
  report.accepted++;
  if (step.run) report.runAccepted++; else report.walkAccepted++;
  position = [step.x, step.y];
  report.directions.push(step.direction);
  return true;
}

try {
  if ((await receive()).type !== 'connected') throw new Error('Missing gateway greeting');
  send({ type: 'login', account: credentials.account, password: credentials.password });
  const characters = await until(message => message.type === 'characters');
  if (!characters.characters.length) throw new Error('Probe account has no character');
  send({ type: 'selectCharacter', name: characters.characters[0].name });
  await until(message => message.type === 'map');
  const self = await until(message => message.type === 'entity' && message.self);
  position = [self.x, self.y];
  report.map = currentMap;
  report.start = [...position];
  report.sequenceAtStart = sequence;
  report.mapGenerationAtStart = mapGeneration;
  const map = await readMap(currentMap);
  const first = candidateSteps(map, position);
  if (!first.length) throw new Error(`No open movement cell at ${position.join(',')}`);

  // Replay the browser's held-key cadence in both modes and return to the
  // original cell before the ordinary directional coverage below.
  const walkLine = timedLine(map, position, 1, 3) ?? timedLine(map, position, 1, 2) ?? timedLine(map, position, 1, 1);
  if (!walkLine) throw new Error(`No timed walk line at ${position.join(',')}`);
  report.timedWalk = await replayTimedLine(map, [...position], walkLine, 600);
  if (!report.timedWalk.accepted || !report.timedWalk.returnedToStart)
    throw new Error(`Timed walk did not return to origin: ${JSON.stringify(report.timedWalk)}`);
  const runLine = timedLine(map, position, 2, 2) ?? timedLine(map, position, 2, 1);
  if (!runLine) throw new Error(`No timed run line at ${position.join(',')}`);
  report.timedRun = await replayTimedLine(map, [...position], runLine, 400);
  if (!report.timedRun.accepted || !report.timedRun.returnedToStart)
    throw new Error(`Timed run did not return to origin: ${JSON.stringify(report.timedRun)}`);

  // Exercise four distinct directions where possible, alternating walk and run.
  const chosen = [];
  const seen = new Set();
  for (let direction = 0; direction < directions.length && chosen.length < 4; direction++) {
    const options = first.filter(step => step.direction === direction);
    const step = chosen.length % 2 === 1
      ? (options.find(value => value.run) ?? options[0])
      : (options.find(value => !value.run) ?? options[0]);
    if (!step || seen.has(step.direction)) continue;
    seen.add(step.direction);
    chosen.push(step);
  }
  for (const step of chosen) {
    const origin = [...position];
    if (!await move(step)) continue;
    const [dx, dy] = directions[step.direction];
    const back = { direction: (step.direction + 4) % 8, run: step.run, x: origin[0], y: origin[1] };
    if (!await move(back)) throw new Error(`Could not return from ${step.direction}`);
    if (position[0] !== origin[0] || position[1] !== origin[1]) throw new Error('Replay did not return to origin');
    // Keep the local entity table useful when the engine sends an object update
    // between the outbound command and its movement acknowledgement.
    const own = [...entities.values()].find(entity => entity.self);
    if (own && (own.x !== position[0] || own.y !== position[1])) own.x = position[0], own.y = position[1];
  }
  report.end = [...position];
  report.returnedToStart = report.start[0] === report.end[0] && report.start[1] === report.end[1];
  report.pass = report.accepted >= 2 && report.returnedToStart && report.sequenceMonotonic && report.mapGenerationMonotonic;
  if (!report.pass) throw new Error(`Movement replay did not pass: ${JSON.stringify(report)}`);
  console.log(`PASS movement replay ${report.accepted} accepted moves, ${report.rejected} blocked moves, map ${report.map}`);
} catch (error) {
  report.pass = false;
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  report.sequence = sequence;
  report.mapGeneration = mapGeneration;
  await writeFile('.runtime/reports/movement-replay.json', JSON.stringify(report, null, 2));
  socket.close();
}
