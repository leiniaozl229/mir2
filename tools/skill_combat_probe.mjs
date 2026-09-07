// Live WebSocket check of the pinned 15-skill combat list and summon follow/attack.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const gatewayUrl = process.env.MIR2_GATEWAY_URL ?? 'ws://127.0.0.1:18800/ws';
const combat = JSON.parse(await readFile(new URL('content/classic-176/skill-combat.json', root), 'utf8'));
const rules = JSON.parse(await readFile(new URL('content/classic-176/skill-rules.json', root), 'utf8')).skills;
const mapData = new Map();
for (const mapName of ['0', 'D001']) {
  const bytes = await readFile(new URL(`.runtime/server/Mir200/Map/${mapName}.map`, root));
  mapData.set(mapName, { bytes, width: bytes.readUInt16LE(0), height: bytes.readUInt16LE(2) });
}
const directions = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
const kits = [
  { job: 0, command: '@warriorset', names: ['基本剑术', '攻杀剑术', '刺杀剑术', '半月弯刀', '烈火剑法'] },
  { job: 1, command: '@wizardset', names: ['火球术', '大火球', '雷电术', '抗拒火环', '魔法盾'] },
  { job: 2, command: '@taoistset', names: ['治愈术', '施毒术', '灵魂火符', '幽灵盾', '召唤骷髅'] },
];
const selectedKits = process.env.MIR2_SKILL_JOBS
  ? kits.filter(kit => process.env.MIR2_SKILL_JOBS.split(',').map(value => Number(value.trim())).includes(kit.job))
  : kits;
const report = { gatewayUrl, passed: false, jobs: [] };

class Client {
  constructor(label) {
    this.label = label;
    this.socket = new WebSocket(gatewayUrl);
    this.queue = [];
    this.waiters = [];
    this.events = [];
    this.sequence = 0;
    this.map = '0';
    this.entities = new Map();
    this.skills = [];
    this.inventory = [];
    this.equipment = [];
    this.position = null;
    this.selfId = null;
    this.mp = null;
    this.hp = null;
    this.socket.addEventListener('message', event => {
      const envelope = JSON.parse(event.data);
      if (!Number.isInteger(envelope.sequence) || envelope.sequence <= this.sequence)
        throw new Error(`${this.label}: gateway sequence is not monotonic`);
      this.sequence = envelope.sequence;
      const message = envelope.message;
      this.apply(message);
      this.events.push(message);
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(message); else this.queue.push(message);
    });
    this.socket.addEventListener('close', event => {
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error(`${this.label}: gateway closed (${event.code})`));
    });
  }

  apply(message) {
    if (message.type === 'map') {
      this.map = message.map;
      this.entities.clear();
      this.selfId = null;
      this.position = null;
    } else if (message.type === 'entity') {
      const prior = this.entities.get(message.id) ?? {};
      const entity = { ...prior, ...message, name: message.name ?? prior.name ?? '', feature: message.feature ?? prior.feature ?? 0 };
      this.entities.set(message.id, entity);
      if (entity.self) { this.selfId = entity.id; this.position = [entity.x, entity.y]; }
    } else if (message.type === 'entityName' || message.type === 'nameColor' || message.type === 'entityDied' || message.type === 'entityAlive' || message.type === 'entityAction') {
      const entity = this.entities.get(message.id);
      if (!entity) return;
      if (message.type === 'entityName') Object.assign(entity, { name: message.name, nameColor: message.nameColor ?? entity.nameColor, kind: message.kind ?? entity.kind });
      else if (message.type === 'nameColor') Object.assign(entity, { nameColor: message.color, kind: message.color === 254 ? 'slave' : entity.kind });
      else if (message.type === 'entityDied') Object.assign(entity, { dead: true, x: message.x, y: message.y });
      else if (message.type === 'entityAlive') Object.assign(entity, { dead: false, x: message.x, y: message.y });
      else Object.assign(entity, { x: message.x, y: message.y, action: message.action });
    } else if (message.type === 'entityRemoved') this.entities.delete(message.id);
    else if (message.type === 'skills') this.skills = message.skills;
    else if (message.type === 'skillAdded') this.skills = [...this.skills.filter(skill => skill.magicId !== message.skill.magicId), message.skill];
    else if (message.type === 'inventory') this.inventory = message.items;
    else if (message.type === 'itemAdded') this.inventory = [...this.inventory.filter(item => item.makeIndex !== message.item.makeIndex), message.item];
    else if (message.type === 'equipment') this.equipment = message.slots;
    else if (message.type === 'attributes') { this.hp = message.hp; this.mp = message.mp; }
    else if (message.type === 'resources') { this.hp = message.hp; this.mp = message.mp; }
    else if (message.type === 'legacy' && message.id === -1 && String(message.status).startsWith('+GD/') && this.pendingMove)
      this.position = this.pendingMove;
  }

  receive(timeout = 20000) {
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

  async waitFor(type, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      let message;
      try { message = await this.receive(Math.max(1, deadline - Date.now())); }
      catch (error) { throw new Error(`${this.label}: timed out waiting for ${type} (${error.message})`); }
      if (message.type === type) return message;
      if (message.type === 'error') throw new Error(`${this.label}: ${message.message}`);
    }
    throw new Error(`${this.label}: timed out waiting for ${type}`);
  }

  async drain(ms = 800) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      try { await this.receive(Math.max(1, deadline - Date.now())); }
      catch { break; }
    }
  }

  close() { this.socket.close(); }
}

function walkable(map, x, y) {
  const data = mapData.get(map);
  if (!data || x < 0 || y < 0 || x >= data.width || y >= data.height) return false;
  const offset = 52 + (x * data.height + y) * 12;
  return ((data.bytes.readUInt16LE(offset) | data.bytes.readUInt16LE(offset + 4)) & 0x8000) === 0;
}

function spellCost(skill) {
  return Math.round(skill.spell / 4 * (skill.level + 1)) + skill.defSpell;
}

async function enterWorld(job) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(-7);
  const account = `k${suffix}`.slice(0, 10);
  const password = `p${suffix}`.slice(0, 10);
  const character = `K${suffix}`.slice(0, 10);
  const client = new Client(character);
  try {
    await client.waitFor('connected');
    client.send({ type: 'register', account, password });
    if (!(await client.waitFor('registrationResult')).accepted) throw new Error(`${character}: registration rejected`);
    client.send({ type: 'login', account, password });
    await client.waitFor('characters');
    client.send({ type: 'createCharacter', name: character, job, sex: 0, hair: 0 });
    if (!(await client.waitFor('characterCreationResult')).accepted) throw new Error(`${character}: character creation rejected`);
    await client.waitFor('characters');
    client.send({ type: 'selectCharacter', name: character });
    await client.waitFor('map', 45000);
    const deadline = Date.now() + 15000;
    while (!client.selfId && Date.now() < deadline) await client.drain(400);
    if (!client.selfId || !client.position) throw new Error(`${character}: self entity missing after entry`);
    console.error(`${character}: entered ${client.position} with ${client.entities.size} entities`);
    client.send({ type: 'inventory' });
    await client.drain(1200);
    return client;
  } catch (error) {
    client.close();
    throw error;
  }
}

async function stepToward(client, x, y) {
  const [cx, cy] = client.position;
  const dx = Math.sign(x - cx), dy = Math.sign(y - cy);
  if (!dx && !dy) return true;
  const direction = directions.findIndex(([ox, oy]) => ox === dx && oy === dy);
  const nx = cx + dx, ny = cy + dy;
  if (!walkable(client.map, nx, ny)) return false;
  client.pendingMove = [nx, ny];
  client.send({ type: 'move', x: nx, y: ny, direction });
  const deadline = Date.now() + 4000;
  try {
    while (Date.now() < deadline) {
      const message = await client.receive(Math.max(1, deadline - Date.now()));
      if (message.type === 'legacy' && message.id === -1 && String(message.status).startsWith('+GD/')) {
        client.position = [nx, ny];
        client.pendingMove = undefined;
        return true;
      }
      if (message.type === 'entity' && message.self && message.x === nx && message.y === ny) {
        client.pendingMove = undefined;
        return true;
      }
      if (message.type === 'legacy' && message.id === 28) { client.pendingMove = undefined; return false; }
      if (message.type === 'error') throw new Error(message.message);
    }
  } catch (error) {
    client.pendingMove = undefined;
    if (String(error.message).includes('timed out')) return false;
    throw error;
  }
  client.pendingMove = undefined;
  return false;
}

async function walkTo(client, x, y, budget = 12) {
  const start = client.position;
  if (Math.max(Math.abs(start[0] - x), Math.abs(start[1] - y)) > budget) return false;
  for (let step = 0; step < budget; step++) {
    const [cx, cy] = client.position;
    if (Math.max(Math.abs(cx - x), Math.abs(cy - y)) <= 1) return true;
    if (!await stepToward(client, x, y)) {
      for (const [ox, oy] of directions) {
        const nx = cx + ox, ny = cy + oy;
        if (walkable(client.map, nx, ny) && Math.max(Math.abs(nx - x), Math.abs(ny - y)) < Math.max(Math.abs(cx - x), Math.abs(cy - y))) {
          if (await stepToward(client, nx, ny)) break;
        }
      }
    }
  }
  return Math.max(Math.abs(client.position[0] - x), Math.abs(client.position[1] - y)) <= 1;
}

async function talk(client, command, npcPattern = /导师/, maxDistance = 20) {
  await client.drain(800);
  const [x, y] = client.position;
  const trainers = [...client.entities.values()].filter(entity => npcPattern.test(entity.name || '') && (entity.feature & 255) === 50);
  trainers.sort((a, b) => Math.max(Math.abs(a.x - x), Math.abs(a.y - y)) - Math.max(Math.abs(b.x - x), Math.abs(b.y - y)));
  const trainer = trainers[0];
  if (!trainer) throw new Error(`${client.label}: NPC ${npcPattern} is not in view at ${x},${y}`);
  const distance = Math.max(Math.abs(trainer.x - x), Math.abs(trainer.y - y));
  if (distance > maxDistance) throw new Error(`${client.label}: nearest NPC ${trainer.name} is ${distance} cells away at ${trainer.x},${trainer.y}`);
  if (distance > 1 && !await walkTo(client, trainer.x, trainer.y, Math.max(12, maxDistance)))
    throw new Error(`${client.label}: could not reach ${trainer.name} at ${trainer.x},${trainer.y} from ${client.position}`);
  client.send({ type: 'npc', targetId: trainer.id });
  const dialogue = await client.waitFor('npcDialogue');
  const option = (dialogue.options ?? []).find(entry => entry.command === command);
  if (!option) throw new Error(`${client.label}: missing ${command} in ${JSON.stringify(dialogue.options)}`);
  client.send({ type: 'dialogueSelect', npcId: trainer.id, command });
  if (command === '@orcgrave' || command === '@boss') {
    await client.waitFor('map', 45000);
    const deadline = Date.now() + 15000;
    while ((!client.selfId || !client.position) && Date.now() < deadline) await client.drain(400);
    if (!client.selfId || !client.position) throw new Error(`${client.label}: self entity missing after ${command}`);
    await client.drain(1200);
  } else await client.drain(2500);
}

async function waitSkills(client, names) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (names.every(name => client.skills.some(skill => skill.name === name))) return;
    await client.drain(400);
  }
  throw new Error(`missing skills ${names.filter(name => !client.skills.some(skill => skill.name === name)).join(',')}`);
}

async function nearbyHostile(client) {
  const [x, y] = client.position;
  const live = [...client.entities.values()].filter(entity => {
    if (entity.self || entity.dead) return false;
    const race = entity.feature & 255;
    return race !== 0 && race !== 50 && entity.kind !== 'slave';
  }).map(entity => ({ entity, distance: Math.max(Math.abs(entity.x - x), Math.abs(entity.y - y)) }))
    .filter(value => value.distance <= 12)
    .sort((a, b) => a.distance - b.distance);
  return live[0]?.entity ?? await nearest(client, '鸡') ?? await nearest(client, '鹿');
}

async function waitForHostile(client, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const target = await nearbyHostile(client);
    if (target) return target;
    await client.drain(500);
  }
  return undefined;
}

async function nearest(client, name, range = 12) {
  const [x, y] = client.position;
  const live = [...client.entities.values()].filter(entity => entity.name === name && !entity.dead)
    .map(entity => ({ entity, distance: Math.max(Math.abs(entity.x - x), Math.abs(entity.y - y)) }))
    .filter(value => value.distance <= range)
    .sort((a, b) => a.distance - b.distance);
  return live[0]?.entity;
}

async function castAndCollect(client, skill, targetId) {
  const beforeMp = client.mp;
  const before = client.events.length;
  client.send({ type: 'castMagic', magicId: skill.magicId, targetId });
  const result = { name: skill.name, magicId: skill.magicId, use: combat.skills[skill.name].use, accepted: false };
  const deadline = Date.now() + 8000;
  try {
    while (Date.now() < deadline) {
      const message = await client.receive(Math.max(1, deadline - Date.now()));
      if (message.type === 'spellResult' && message.magicId === skill.magicId) result.accepted = message.accepted;
      if (message.type === 'magicEffect') result.effect = { type: message.effectType, effect: message.effect };
      if (message.type === 'warriorSkill') result.warriorSkill = message;
      if (message.type === 'characterStatus') result.status = message.status;
      if (message.type === 'error') { result.error = message.message; break; }
      if (result.accepted || result.warriorSkill) break;
    }
  } catch (error) {
    result.error = result.error ?? error.message;
  }
  if (result.accepted || result.warriorSkill) await client.drain(350);
  result.mpBefore = beforeMp;
  result.mpAfter = client.mp;
  const statusMessages = client.events.slice(before).filter(event => event.type === 'characterStatus');
  if (statusMessages.length) result.status = statusMessages.at(-1).status;
  result.events = client.events.slice(before).map(event => event.type).filter(type => type !== 'legacy');
  return result;
}

async function exerciseSummon(client, skill, jobReport) {
  const entitiesBeforeCast = new Set(client.entities.keys());
  const outcome = await castAndCollect(client, skill, client.selfId);
  outcome.expectedEffect = { type: rules[skill.name].effectType, effect: rules[skill.name].effect };
  outcome.expectedCost = spellCost(skill);
  jobReport.skills.push(outcome);
  await client.drain(5000);
  const slave = [...client.entities.values()].find(entity =>
    !entitiesBeforeCast.has(entity.id)
    && (entity.kind === 'slave'
      || entity.name === combat.summon.name
      || entity.name?.startsWith(`${combat.summon.name}(${client.label})`)
      || ((entity.feature & 255) === 23 && (entity.feature >>> 16) === 37)));
  jobReport.summon = slave ? {
    spawned: true, id: slave.id, name: slave.name, kind: slave.kind, nameColor: slave.nameColor,
    classified: slave.kind === 'slave', position: [slave.x, slave.y],
  } : { spawned: false };
  if (!slave) return;

  // The boss stays far from the teleport landing point. Walk away from it so
  // the follower has an unambiguous master-follow movement to reproduce.
  const origin = [slave.x, slave.y];
  let movedAny = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const [px, py] = client.position;
    const hostile = await waitForHostile(client, 500);
    const towardHostile = hostile
      ? directions.findIndex(([dx, dy]) => dx === Math.sign(hostile.x - px) && dy === Math.sign(hostile.y - py))
      : -1;
    const candidates = towardHostile < 0
      ? directions
      : [directions[(towardHostile + 4) % 8], ...directions.filter((_, index) => index !== (towardHostile + 4) % 8)];
    let stepped = false;
    for (const [dx, dy] of candidates) {
      if (walkable(client.map, px + dx, py + dy) && await stepToward(client, px + dx, py + dy)) {
        movedAny = true;
        stepped = true;
        break;
      }
    }
    if (!stepped) break;
  }
  await client.drain(6000);
  const moved = client.entities.get(slave.id);
  jobReport.summon.followed = movedAny && Boolean(moved)
    && Math.max(Math.abs(moved.x - origin[0]), Math.abs(moved.y - origin[1])) > 0;

  const followPrey = await waitForHostile(client, 5000);
  if (followPrey && Math.max(Math.abs(followPrey.x - client.position[0]), Math.abs(followPrey.y - client.position[1])) > 1)
    await walkTo(client, followPrey.x, followPrey.y, 12);
  if (followPrey && Math.max(Math.abs(followPrey.x - client.position[0]), Math.abs(followPrey.y - client.position[1])) === 1) {
    jobReport.summon.attackTarget = { id: followPrey.id, name: followPrey.name, position: [followPrey.x, followPrey.y], playerPosition: [...client.position] };
    const dir = directions.findIndex(([ox, oy]) => ox === Math.sign(followPrey.x - client.position[0]) && oy === Math.sign(followPrey.y - client.position[1]));
    client.send({ type: 'attack', direction: dir });
    const until = Date.now() + 12000;
    while (Date.now() < until) {
      const message = await client.receive(Math.max(1, until - Date.now())).catch(() => undefined);
      if (message?.type === 'entityAction' && message.id === slave.id && message.action === 'attack') {
        jobReport.summon.attacked = true;
        break;
      }
    }
  }
}

async function exerciseJob(kit) {
  const client = await enterWorld(kit.job);
  const jobReport = { job: kit.job, character: client.label, skills: [], summon: null };
  try {
    await talk(client, kit.command);
    await waitSkills(client, kit.names);
    console.error(`${client.label}: skills ${client.skills.map(skill => skill.name).join(',')}`);
    if (kit.job === 2) {
      const charm = client.inventory.find(item => item.name === '护身符');
      const powder = client.inventory.find(item => item.name === '灰色药粉(少量)');
      if (charm) {
        client.send({ type: 'equipItem', makeIndex: charm.makeIndex, slot: 9 });
        await client.drain(1200);
      }
      if (powder) {
        client.send({ type: 'equipItem', makeIndex: powder.makeIndex, slot: 5 });
        await client.drain(1200);
      }
    }
    // Use the dedicated dungeon boss fixture for repeatable hostile casts.
    // The normal chicken/deer area is shared by all probe clients and its
    // short-lived targets can be exhausted by an earlier job.
    if (kit.job === 0) await talk(client, '@nearmonsters');
    else {
      await talk(client, '@orcgrave');
      await talk(client, '@boss', /古墓向导|首领测试官/, 60);
    }
    let summonDone = false;
    if (kit.job === 2) {
      const summonSkill = client.skills.find(skill => skill.name === '召唤骷髅');
      await exerciseSummon(client, summonSkill, jobReport);
      summonDone = true;
    }
    const prey = await waitForHostile(client, 8000);
    if (prey && Math.max(Math.abs(prey.x - client.position[0]), Math.abs(prey.y - client.position[1])) > 1)
      await walkTo(client, prey.x, prey.y, 12);
    for (const name of kit.names) {
      const spec = combat.skills[name];
      const skill = client.skills.find(entry => entry.name === name);
      if (spec.summon && summonDone) continue;
      const rule = rules[name];
      if (spec.use === 'passive') {
        jobReport.skills.push({ name, magicId: skill.magicId, use: 'passive', learned: true, cost: spellCost(skill) });
        continue;
      }
      let targetId = client.selfId;
      if (spec.use === 'hostile') {
        const target = await waitForHostile(client, 15000);
        if (!target) { jobReport.skills.push({ name, error: 'no nearby hostile target' }); continue; }
        targetId = target.id;
      }
      const outcome = await castAndCollect(client, skill, targetId);
      outcome.expectedEffect = { type: rule.effectType, effect: rule.effect };
      outcome.expectedCost = spellCost(skill);
      if (name === '魔法盾') outcome.expectedStatusBit = 0x00100000;
      jobReport.skills.push(outcome);
      await client.drain(400);
    }
  } finally {
    client.close();
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  console.error(`${client.label}: job ${kit.job} done`);
  return jobReport;
}

try {
  for (const kit of selectedKits) report.jobs.push(await exerciseJob(kit));
  const expected = selectedKits.flatMap(kit => kit.names);
  const seen = new Set(report.jobs.flatMap(job => job.skills.map(skill => skill.name)));
  const failed = report.jobs.flatMap(job => job.skills.filter(skill => skill.use !== 'passive'
    && (skill.accepted !== true || skill.name === '魔法盾' && ((skill.status ?? 0) & 0x00100000) === 0)));
  const summon = report.jobs.find(job => job.summon)?.summon;
  report.coverage = expected.filter(name => seen.has(name));
  report.missing = expected.filter(name => !seen.has(name));
  report.failed = failed.map(skill => skill.name);
  report.summon = summon ?? null;
  report.passed = report.missing.length === 0 && failed.length === 0
    && Boolean(summon?.spawned) && summon?.classified === true
    && summon?.followed === true && summon?.attacked === true;
  if (!report.passed) throw new Error(`skill combat incomplete: missing=${report.missing.join(',') || 'none'} failed=${report.failed.join(',') || 'none'} summon=${JSON.stringify(summon)}`);
  console.log(`PASS 15-skill combat probe (${report.jobs.map(job => job.character).join(', ')})`);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  await mkdir(new URL('.runtime/reports/', root), { recursive: true });
  await writeFile(new URL('.runtime/reports/skill-combat.json', root), `${JSON.stringify(report, null, 2)}\n`);
}
