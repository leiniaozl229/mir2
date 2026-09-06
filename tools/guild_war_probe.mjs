// Verify two independent browser gateway sessions can create guilds, declare
// war through the king NPC, and observe the authoritative two-way timer. The
// optional castle mode also submits the first castle request and checks token
// consumption; the wrapper prepares disposable characters and removes all state.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const gatewayUrl = process.env.MIR2_GATEWAY_URL ?? 'ws://127.0.0.1:18800/ws';
const redCredentials = JSON.parse(await readFile(new URL(
  process.env.MIR2_GUILD_RED_CREDENTIALS ?? '.runtime/pvp-attacker.json', root), 'utf8'));
const blueCredentials = JSON.parse(await readFile(new URL(
  process.env.MIR2_GUILD_BLUE_CREDENTIALS ?? '.runtime/pvp-victim.json', root), 'utf8'));
const redGuild = process.env.MIR2_GUILD_RED_NAME;
const blueGuild = process.env.MIR2_GUILD_BLUE_NAME;
if (!redGuild || !blueGuild) throw new Error('MIR2_GUILD_RED_NAME and MIR2_GUILD_BLUE_NAME are required');
const redCharacter = process.env.MIR2_GUILD_RED_CHARACTER ?? redCredentials.character;
const blueCharacter = process.env.MIR2_GUILD_BLUE_CHARACTER ?? blueCredentials.character;
if (!redCharacter || !blueCharacter) throw new Error('Guild-war credentials require character names');

const report = {
  gatewayUrl,
  passed: false,
  red: { character: redCharacter, guild: redGuild },
  blue: { character: blueCharacter, guild: blueGuild },
  path: [],
};

class Client {
  constructor(identity, label) {
    this.identity = identity;
    this.label = label;
    this.socket = new WebSocket(gatewayUrl);
    this.queue = [];
    this.waiters = [];
    this.events = [];
    this.sequence = 0;
    this.map = undefined;
    this.position = undefined;
    this.entities = new Map();
    this.socket.addEventListener('message', event => {
      const envelope = JSON.parse(event.data);
      if (!Number.isInteger(envelope.sequence) || envelope.sequence <= this.sequence)
        throw new Error(`${this.label}: gateway sequence regressed at ${envelope.sequence}`);
      this.sequence = envelope.sequence;
      const message = envelope.message;
      this.events.push(message);
      if (message.type === 'map') {
        this.map = message.map;
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
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error(`${this.label}: gateway closed (${event.code})`));
    });
  }

  receive(timeout = 20000) {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((resolve, reject) => {
      const waiter = { resolve: value => { clearTimeout(timer); resolve(value); }, reject };
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`${this.label}: gateway response timed out`));
      }, timeout);
      this.waiters.push(waiter);
    });
  }

  send(message) { this.socket.send(JSON.stringify(message)); }

  async waitFor(predicate, description, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const message = await this.receive(Math.max(1, deadline - Date.now()));
      if (message.type === 'error') throw new Error(`${this.label}: ${message.message}`);
      if (predicate(message)) return message;
    }
    throw new Error(`${this.label}: timed out waiting for ${description}`);
  }

  async waitForEventSince(index, predicate, description, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const match = this.events.slice(index).find(predicate);
      if (match) return match;
      try {
        const message = await this.receive(Math.max(1, Math.min(250, deadline - Date.now())));
        if (message.type === 'error') throw new Error(`${this.label}: ${message.message}`);
      } catch (error) {
        // A quiet legacy session is expected between packets. Keep polling
        // until the operation deadline while still surfacing real failures.
        if (!(error instanceof Error) || !error.message.endsWith('gateway response timed out')) throw error;
      }
    }
    throw new Error(`${this.label}: timed out waiting for ${description}`);
  }

  close() { this.socket.close(); }
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function login(client) {
  await client.waitFor(message => message.type === 'connected', 'gateway greeting');
  client.send({ type: 'login', account: client.identity.account, password: client.identity.password });
  const characters = await client.waitFor(message => message.type === 'characters', 'character list');
  if (!characters.characters.some(value => value.name === client.identity.character))
    throw new Error(`${client.label}: character ${client.identity.character} is unavailable`);
  client.send({ type: 'selectCharacter', name: client.identity.character });
  await client.waitFor(message => message.type === 'map', 'map entry');
  await client.waitFor(message => message.type === 'entity' && message.self, 'self entity');
  const attributes = await client.waitFor(message => message.type === 'attributes', 'authoritative attributes');
  if (client.map !== '0122') throw new Error(`${client.label}: expected 0122, got ${client.map}`);
  report.path.push({ label: `${client.label} login`, map: client.map, position: client.position, gameGold: attributes.gameGold, hp: attributes.hp, maxHp: attributes.maxHp });
}

function findKing(client) {
  return [...client.entities.values()].find(entity => (entity.feature & 255) === 50
    && String(entity.name ?? '').includes('国王'));
}

async function openKing(client) {
  const visibleOfficials = [...client.entities.values()]
    .filter(entity => (entity.feature & 255) === 50)
    .map(entity => ({ id: entity.id, name: entity.name, x: entity.x, y: entity.y, feature: entity.feature }));
  report.path.push({ label: `${client.label} visible officials`, officials: visibleOfficials.filter(entity => String(entity.name ?? '').includes('国王')) });
  const king = findKing(client);
  if (!king) throw new Error(`${client.label}: king NPC was not visible`);
  if (!client.position || Math.max(Math.abs(king.x - client.position[0]), Math.abs(king.y - client.position[1])) > 1)
    throw new Error(`${client.label}: king NPC is out of reach at ${king.x},${king.y}`);
  client.send({ type: 'npc', targetId: king.id });
  const dialogue = await client.waitFor(message => message.type === 'npcDialogue' && message.npcId === king.id, 'king dialogue');
  report.path.push({ label: `${client.label} king dialogue`, npcId: king.id, options: dialogue.options });
  client.lastKingDialogue = dialogue;
  return king;
}

async function createGuild(client, guildName) {
  const king = await openKing(client);
  const start = client.events.length;
  client.send({ type: 'guildCreate', npcId: king.id, guildName });
  const result = await client.waitForEventSince(start,
    message => message.type === 'guildResult' && message.action === 'create', 'guild creation result');
  if (!result.accepted) throw new Error(`${client.label}: guild creation rejected (${result.reason})`);
  report.path.push({ label: `${client.label} guild creation`, guildName, result });
  return king;
}

async function verifyGuildKit(client) {
  const start = client.events.length;
  client.send({ type: 'inventory' });
  const inventory = await client.waitForEventSince(start, message => message.type === 'inventory', `${client.label} guild kit`, 10000);
  const names = inventory.items.map(item => item.name);
  if (!names.includes('沃玛号角')) throw new Error(`${client.label}: guild kit missing Woma Horn (${names.join(', ')})`);
  report.path.push({ label: `${client.label} guild kit`, names, gold: client.events.filter(message => message.type === 'currency').at(-1)?.gameGold });
  return inventory;
}

async function openGuild(client, label) {
  const start = client.events.length;
  client.send({ type: 'guildOpen' });
  const info = await client.waitForEventSince(start, message => message.type === 'guildInfo', `${label} guild info`);
  if (!info.guildName) throw new Error(`${client.label}: empty guild name in guild info`);
  report.path.push({ label, guildName: info.guildName, warGuilds: info.warGuilds, warGuildTimers: info.warGuildTimers });
  return info;
}

async function submitCastleApplication(client, king, expectedMakeIndex) {
  if (!Number.isInteger(expectedMakeIndex))
    throw new Error(`${client.label}: prepared castle token was not present in inventory`);
  // Re-click the king after the guild panel/war flow. This resets the legacy
  // NPC script label so the first castle link is accepted by LableIsCanJmp.
  const freshKing = await openKing(client);
  const entryOption = client.lastKingDialogue.options.find(option => option.command === '@requestcastlewarA');
  if (!entryOption) throw new Error(`${client.label}: king dialogue did not expose castle-war entry`);
  const entryStart = client.events.length;
  client.send({ type: 'dialogueSelect', npcId: freshKing.id, command: entryOption.command });
  const entry = await client.waitForEventSince(entryStart,
    message => message.type === 'npcDialogue' && message.npcId === king.id
      && message.options.some(option => option.command === '@requestcastlewar'),
    'castle application entry dialogue');

  const listStart = client.events.length;
  client.send({ type: 'dialogueSelect', npcId: freshKing.id, command: '@requestcastlewar' });
  const list = await client.waitForEventSince(listStart,
    message => message.type === 'npcDialogue' && message.npcId === king.id
      && message.options.some(option => option.command.startsWith('@requestcastlewarnow')),
    'castle list dialogue');
  const castleOption = list.options.find(option => option.command.startsWith('@requestcastlewarnow'));
  if (!castleOption) throw new Error(`${client.label}: castle list did not expose a selectable castle`);

  const resultStart = client.events.length;
  client.send({ type: 'dialogueSelect', npcId: freshKing.id, command: castleOption.command });
  const result = await client.waitForEventSince(resultStart,
    message => ['dialogueMessage', 'npcDialogue', 'systemMessage'].includes(message.type)
      && /你的请求被许可|申请成功/.test(String(message.text ?? '')),
    'successful castle application', 10000);
  const removed = await client.waitForEventSince(resultStart,
    message => message.type === 'itemRemoved' && message.makeIndex === expectedMakeIndex,
    'castle token consumption', 5000);

  report.castleApplication = {
    entry,
    list,
    selected: castleOption,
    result,
    removed,
    consumedMakeIndex: expectedMakeIndex,
  };
}

const red = new Client({ ...redCredentials, character: redCharacter }, 'red');
const blue = new Client({ ...blueCredentials, character: blueCharacter }, 'blue');
try {
  await login(red);
  await sleep(1200);
  await login(blue);
  await sleep(1500);
  const redInventory = await verifyGuildKit(red);

  const redKing = await createGuild(red, redGuild);
  const blueKing = await createGuild(blue, blueGuild);
  await sleep(1200);

  const warStart = red.events.length;
  red.send({ type: 'guildWarRequest', npcId: redKing.id, guildName: blueGuild });
  // The legacy server may persist the first declaration without producing a
  // direct gateway result. Re-open both guild panels as the authoritative
  // confirmation and retain any announcement packets as supporting evidence.
  await sleep(1200);

  const redAfterWar = await openGuild(red, 'red guild after war request');
  const blueAfterWar = await openGuild(blue, 'blue guild after war request');
  const redTimer = redAfterWar.warGuildTimers?.find(value => value.name === blueGuild && value.remainingMs > 0);
  const blueTimer = blueAfterWar.warGuildTimers?.find(value => value.name === redGuild && value.remainingMs > 0);
  if (!redTimer || !blueTimer) {
    throw new Error(`two-way war timer missing: red=${JSON.stringify(redAfterWar)} blue=${JSON.stringify(blueAfterWar)}`);
  }

  await sleep(1400);
  const redLater = await openGuild(red, 'red guild timer follow-up');
  const laterTimer = redLater.warGuildTimers?.find(value => value.name === blueGuild);
  if (!laterTimer || laterTimer.remainingMs >= redTimer.remainingMs)
    throw new Error(`war timer did not decrease: before=${redTimer.remainingMs} after=${laterTimer?.remainingMs}`);

  report.war = {
    announcedToRed: red.events.slice(warStart).filter(message => message.type === 'chat' || message.type === 'systemMessage'),
    redInfo: redAfterWar,
    blueInfo: blueAfterWar,
    timerBeforeMs: redTimer.remainingMs,
    timerAfterMs: laterTimer.remainingMs,
    decreased: true,
  };
  if (process.env.MIR2_GUILD_EXPECT_CASTLE_SUBMISSION === '1')
    await submitCastleApplication(red, redKing, redInventory.items.find(item => item.name === '祖玛头像')?.makeIndex);
  report.passed = true;
  const suffix = report.castleApplication ? ', valid castle application' : '';
  console.log(`PASS live two-guild war, two-way relation and decreasing timer${suffix} (${redGuild} ↔ ${blueGuild})`);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  report.debug = {
    redTail: red.events.slice(-40),
    blueTail: blue.events.slice(-20),
  };
  process.exitCode = 1;
  console.error(report.error);
} finally {
  report.eventCounts = { red: red.events.length, blue: blue.events.length };
  await mkdir(new URL('.runtime/reports/', root), { recursive: true });
  await writeFile(new URL('.runtime/reports/guild-war.json', root), JSON.stringify(report, null, 2));
  red.close();
  blue.close();
}
