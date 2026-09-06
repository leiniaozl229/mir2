// Verify the browser gateway's live king-NPC castle-war dialogue path.
// The default path stops before submitting a castle and therefore does not
// consume the gold bar/Zuma Piece or modify castle state. Set
// MIR2_CASTLE_EXPECT_LIST=1 only for a prepared character carrying a gold bar.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const gatewayUrl = process.env.MIR2_GATEWAY_URL ?? 'ws://127.0.0.1:18800/ws';
const credentialsPath = process.env.MIR2_CASTLE_CREDENTIALS ?? '.runtime/web-ui-test.json';
const credentials = JSON.parse(await readFile(new URL(credentialsPath, root), 'utf8'));
const expectList = process.env.MIR2_CASTLE_EXPECT_LIST === '1';
const report = {
  gatewayUrl,
  character: credentials.character,
  expectedCastleList: expectList,
  passed: false,
  path: [],
};

const directions = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

class Client {
  constructor() {
    this.socket = new WebSocket(gatewayUrl);
    this.queue = [];
    this.waiters = [];
    this.sequence = 0;
    this.map = undefined;
    this.mapGeneration = 0;
    this.position = undefined;
    this.entities = new Map();
    this.socket.addEventListener('message', event => {
      const envelope = JSON.parse(event.data);
      if (!Number.isInteger(envelope.sequence) || envelope.sequence <= this.sequence)
        throw new Error(`gateway sequence regressed at ${envelope.sequence}`);
      this.sequence = envelope.sequence;
      const message = envelope.message;
      if (message.type === 'map') {
        this.map = message.map;
        this.mapGeneration = envelope.mapGeneration ?? this.mapGeneration;
        this.entities.clear();
      } else if (message.type === 'entity') {
        const prior = this.entities.get(message.id) ?? {};
        const entity = { ...prior, ...message };
        this.entities.set(message.id, entity);
        if (entity.self) this.position = [entity.x, entity.y];
      } else if (message.type === 'entityName' || message.type === 'nameColor') {
        const entity = this.entities.get(message.id);
        if (entity) {
          if (message.type === 'entityName') Object.assign(entity, message);
          else entity.nameColor = message.color;
        }
      } else if (message.type === 'entityRemoved') {
        this.entities.delete(message.id);
      } else if (message.type === 'legacy' && message.id === -1 && String(message.status).startsWith('+GD/')) {
        this.position = [message.param, message.tag];
      }
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(message); else this.queue.push(message);
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

  send(message) { this.socket.send(JSON.stringify(message)); }

  async waitFor(predicate, description, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const message = await this.receive(Math.max(1, deadline - Date.now()));
      if (message.type === 'error') throw new Error(message.message);
      if (predicate(message)) return message;
    }
    throw new Error(`timed out waiting for ${description}`);
  }

  close() { this.socket.close(); }
}

async function loadMap(mapName) {
  const candidates = [mapName, mapName.toUpperCase(), mapName.toLowerCase()];
  for (const candidate of candidates) {
    try {
      const bytes = await readFile(new URL(`.runtime/server/Mir200/Map/${candidate}.map`, root));
      return { bytes, width: bytes.readUInt16LE(0), height: bytes.readUInt16LE(2) };
    } catch { /* try the next casing */ }
  }
  throw new Error(`runtime map ${mapName} is unavailable`);
}

function blocked(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  const offset = 52 + (x * map.height + y) * 12;
  return Boolean((map.bytes.readUInt16LE(offset) | map.bytes.readUInt16LE(offset + 4)) & 0x8000);
}

function adjacent(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) <= 1;
}

function routeToAdjacent(map, start, target, occupiedCells, rejectedCells) {
  const total = map.width * map.height;
  const parent = new Int32Array(total).fill(-2);
  const queue = new Int32Array(total);
  let head = 0, tail = 0;
  const startIndex = start[0] * map.height + start[1];
  parent[startIndex] = -1;
  queue[tail++] = startIndex;
  let end = -1;
  while (head < tail) {
    const index = queue[head++];
    const x = Math.floor(index / map.height), y = index % map.height;
    if (adjacent([x, y], target)) { end = index; break; }
    for (let direction = 0; direction < directions.length; direction++) {
      const [dx, dy] = directions[direction];
      const nx = x + dx, ny = y + dy;
      if (blocked(map, nx, ny)) continue;
      const next = nx * map.height + ny;
      if (occupiedCells.has(`${nx},${ny}`)) continue;
      if (rejectedCells.has(`${nx},${ny}`)) continue;
      if (parent[next] !== -2) continue;
      parent[next] = index;
      queue[tail++] = next;
    }
  }
  if (end < 0) throw new Error(`could not find route from ${start.join(',')} near ${target.join(',')}`);
  const path = [];
  for (let index = end; index !== startIndex; index = parent[index]) {
    path.push([Math.floor(index / map.height), index % map.height]);
  }
  return path.reverse();
}

async function walkTo(client, mapName, target, label) {
  if (client.map !== mapName) throw new Error(`${label}: expected map ${mapName}, got ${client.map}`);
  const map = await loadMap(mapName);
  const occupiedCells = new Set([...client.entities.values()]
    .filter(entity => !entity.self)
    .map(entity => `${entity.x},${entity.y}`));
  const rejectedCells = new Set();
  const routeEvidence = { map: mapName, label, start: [...client.position], target, retries: 0, rejected: [] };
  for (;;) {
    const path = routeToAdjacent(map, client.position, target, occupiedCells, rejectedCells);
    routeEvidence.steps = (routeEvidence.steps ?? 0) + path.length;
    let reroute = false;
    for (const [x, y] of path) {
      const dx = x - client.position[0], dy = y - client.position[1];
      const direction = directions.findIndex(([mx, my]) => mx === dx && my === dy);
      if (direction < 0) throw new Error(`${label}: invalid route step ${x},${y}`);
      client.send({ type: 'move', x, y, direction });
      const acknowledgement = await client.waitFor(message => message.type === 'legacy' && (message.id === 28
        || (message.id === -1 && String(message.status).startsWith('+GD/'))), `${label} movement acknowledgement`);
      if (acknowledgement.id === 28) {
        const key = `${x},${y}`;
        rejectedCells.add(key);
        routeEvidence.rejected.push(key);
        routeEvidence.retries++;
        if (routeEvidence.retries > 20) throw new Error(`${label}: repeated route rejection near ${key}`);
        reroute = true;
        break;
      }
      // The legacy movement acknowledgement carries the server's movement
      // record in a format that may lag the requested destination by one cell.
      // The accepted request is the authoritative step for this bounded route;
      // later entity packets can still correct the position if needed.
      client.position = [x, y];
      await new Promise(resolve => setTimeout(resolve, 650));
    }
    if (!reroute) break;
  }
  report.path.push(routeEvidence);
}

function findNpc(client, predicate) {
  return [...client.entities.values()].find(entity => (entity.feature & 255) === 50 && predicate(entity));
}

async function openNpc(client, npc, label) {
  client.send({ type: 'npc', targetId: npc.id });
  const dialogue = await client.waitFor(message => message.type === 'npcDialogue' && message.npcId === npc.id, `${label} dialogue`);
  report[`${label}Dialogue`] = { npcId: npc.id, npcName: dialogue.npcName, text: dialogue.text, options: dialogue.options };
  return dialogue;
}

async function select(client, npcId, command, label) {
  client.send({ type: 'dialogueSelect', npcId, command });
  const dialogue = await client.waitFor(message => message.type === 'npcDialogue' || message.type === 'dialogueMessage'
    || message.type === 'systemMessage' || message.type === 'npcDialogueClosed', `${label} response`);
  report.path.push({ label, command, responseType: dialogue.type });
  return dialogue;
}

const client = new Client();
try {
  await client.waitFor(message => message.type === 'connected', 'gateway greeting');
  client.send({ type: 'login', account: credentials.account, password: credentials.password });
  const characters = await client.waitFor(message => message.type === 'characters', 'character list');
  const character = credentials.character ?? characters.characters[0]?.name;
  if (!character || !characters.characters.some(value => value.name === character)) throw new Error(`character ${character} is unavailable`);
  client.send({ type: 'selectCharacter', name: character });
  await client.waitFor(message => message.type === 'map', 'map entry');
  await client.waitFor(message => message.type === 'entity' && message.self, 'self entity');
  if (client.map === '0122') {
    await walkTo(client, '0122', [26, 27], 'palace return guide');
    const palaceGuide = findNpc(client, entity => entity.name.includes('皇宫向导') || (entity.x === 26 && entity.y === 27));
    if (!palaceGuide) throw new Error('palace return guide NPC was not visible');
    const palaceDialogue = await openNpc(client, palaceGuide, 'palace return guide');
    const home = palaceDialogue.options.find(option => option.command === '@home');
    if (!home) throw new Error('palace return guide did not expose return-to-Biqi action');
    client.send({ type: 'dialogueSelect', npcId: palaceGuide.id, command: home.command });
    await client.waitFor(message => message.type === 'map' && message.map === '0', 'return to Biqi');
    await client.waitFor(message => message.type === 'entity' && message.self, 'Biqi self entity');
    report.path.push({ label: 'palace cleanup', command: home.command, responseType: 'map' });
  }
  if (client.map !== '0') throw new Error(`castle probe requires map 0 start, got ${client.map}`);
  report.start = { map: client.map, position: [...client.position] };

  await walkTo(client, '0', [295, 610], 'extension guide');
  const guide = findNpc(client, entity => entity.name.includes('扩展向导') || (entity.x === 295 && entity.y === 610));
  if (!guide) throw new Error('extension guide NPC was not visible');
  const main = await openNpc(client, guide, 'guide');
  const page = main.options.find(option => option.command === '@page7');
  if (!page) throw new Error('extension guide did not expose page 8');
  const page7 = await select(client, guide.id, page.command, 'castle directory page');
  const castleRoute = page7.options?.find(option => option.command === '@route7_7');
  if (!castleRoute) throw new Error('castle directory page did not expose map 0122');
  client.send({ type: 'dialogueSelect', npcId: guide.id, command: castleRoute.command });
  await client.waitFor(message => message.type === 'map' && message.map === '0122', 'palace map transition');
  await client.waitFor(message => message.type === 'entity' && message.self, 'palace self entity');

  await walkTo(client, '0122', [29, 32], 'king');
  const king = findNpc(client, entity => entity.name.includes('国王') || (entity.x === 29 && entity.y === 32));
  if (!king) throw new Error('king NPC was not visible');
  const kingMain = await openNpc(client, king, 'king');
  const requestEntry = kingMain.options.find(option => option.command === '@requestcastlewarA');
  if (!requestEntry) throw new Error('king dialogue did not expose castle-war entry');
  const requestMenu = await select(client, king.id, requestEntry.command, 'castle-war entry');
  const requestCommand = requestMenu.options?.find(option => option.command === '@requestcastlewar');
  if (!requestCommand) throw new Error('castle-war entry did not expose request action');
  report.castleWarEntry = { npcId: king.id, option: requestEntry, requestMenu: requestMenu.options };

  const result = await select(client, king.id, requestCommand.command, 'castle-war request');
  if (expectList) {
    if (result.type !== 'npcDialogue' || !result.options?.some(option => option.command.startsWith('@requestcastlewarnow'))) {
      throw new Error(`prepared guild fixture did not expose castle list: ${JSON.stringify(result)}`);
    }
    report.castleList = result.options;
    const castleRequest = result.options.find(option => option.command.startsWith('@requestcastlewarnow'));
    if (!castleRequest) throw new Error('castle list did not expose a castle request command');
    report.castleRequestEntry = castleRequest;
  } else {
    const text = result.text ?? '';
    const safeRejection = result.type === 'systemMessage' || result.type === 'npcDialogueClosed' || text.includes('没有');
    if (!safeRejection) throw new Error(`castle request did not return a safe qualification response: ${JSON.stringify(result)}`);
    report.qualificationResponse = result;
  }
  report.end = { map: client.map, position: [...client.position] };
  report.passed = true;
  console.log(`PASS live king NPC castle-war dialogue (${expectList ? 'castle list' : 'entry and qualification response'})`);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  await mkdir(new URL('.runtime/reports/', root), { recursive: true });
  await writeFile(new URL('.runtime/reports/castle-war.json', root), JSON.stringify(report, null, 2));
  client.close();
}
