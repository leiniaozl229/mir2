// Verify a real two-client item trade through the browser gateway.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const gatewayUrl = process.env.MIR2_GATEWAY_URL ?? 'ws://127.0.0.1:18800/ws';
const loadCredentials = async (name, fallback) => {
  try { return JSON.parse(await readFile(new URL(name, root), 'utf8')); }
  catch { return JSON.parse(await readFile(new URL(fallback, root), 'utf8')); }
};
const attacker = { ...(await loadCredentials('.runtime/pvp-attacker.json', '.runtime/probe-account.json')), label: 'attacker' };
const victim = { ...(await loadCredentials('.runtime/pvp-victim.json', '.runtime/web-ui-test.json')), label: 'victim' };
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

  async waitFor(type, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const message = await this.receive(Math.max(1, deadline - Date.now()));
      if (message.type === type) return message;
      if (message.type === 'error') throw new Error(`${this.label}: ${message.message}`);
    }
    throw new Error(`${this.label}: missing ${type}`);
  }

  async waitForAny(types, timeout = 15000) {
    const wanted = new Set(types);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const message = await this.receive(Math.max(1, deadline - Date.now()));
      if (wanted.has(message.type)) return message;
      if (message.type === 'error') throw new Error(`${this.label}: ${message.message}`);
    }
    throw new Error(`${this.label}: missing one of ${types.join(', ')}`);
  }

  async login() {
    await this.waitFor('connected');
    this.send({ type: 'login', account: this.account, password: this.password });
    const list = await this.waitFor('characters');
    const character = this.character ?? list.characters[0]?.name;
    if (!character || !list.characters.some(value => value.name === character))
      throw new Error(`${this.label}: character is unavailable`);
    this.character = character;
    this.send({ type: 'selectCharacter', name: character });
    const map = await this.waitFor('map');
    let self;
    let inventory;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && (!self || !inventory)) {
      const message = await this.receive(Math.max(1, deadline - Date.now()));
      if (message.type === 'error') throw new Error(`${this.label}: ${message.message}`);
      if (message.type === 'entity' && message.self) self = message;
      if (message.type === 'entity' && message.self && !inventory) this.send({ type: 'inventory' });
      if (message.type === 'inventory') inventory = message.items;
    }
    if (!self || !inventory) throw new Error(`${this.label}: missing world snapshot`);
    this.map = map.map;
    this.self = self;
    this.inventory = inventory;
    return { map: this.map, x: self.x, y: self.y };
  }

  send(message) { this.socket.send(JSON.stringify(message)); }
  close() { this.socket.close(); }
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const latest = (events, predicate) => [...events].reverse().find(predicate);
const attackerClient = new Client(attacker);
const victimClient = new Client(victim);

try {
  report.attacker = await attackerClient.login();
  await sleep(1800);
  report.victim = await victimClient.login();
  await sleep(3600);
  if (report.attacker.map !== report.victim.map)
    throw new Error(`trade fixtures are on different maps (${report.attacker.map}/${report.victim.map})`);
  report.visibleEntities = attackerClient.events.filter(event => event.type === 'entity' && !event.self).length;

  const item = attackerClient.inventory.find(candidate => candidate.name && candidate.makeIndex > 0);
  if (!item) throw new Error('attacker has no transferable inventory item');
  report.item = { name: item.name, makeIndex: item.makeIndex };

  attackerClient.send({ type: 'tradeRequest', target: victimClient.character });
  const [attackerTrade, victimTrade] = await Promise.all([
    attackerClient.waitForAny(['tradeOpened', 'tradeResult']),
    victimClient.waitForAny(['tradeOpened', 'tradeResult'])
  ]);
  if (attackerTrade.type !== 'tradeOpened' || victimTrade.type !== 'tradeOpened')
    throw new Error(`trade request was rejected: ${JSON.stringify({ attacker: attackerTrade, victim: victimTrade })}`);
  attackerClient.send({ type: 'tradeAdd', makeIndex: item.makeIndex });
  const added = await attackerClient.waitFor('tradeResult');
  if (added.action !== 'add' || !added.accepted || added.item?.makeIndex !== item.makeIndex)
    throw new Error(`attacker trade add was rejected: ${JSON.stringify(added)}`);
  const remote = await victimClient.waitFor('tradeRemoteItemAdded');
  if (remote.item?.makeIndex !== item.makeIndex || remote.item?.name !== item.name)
    throw new Error(`victim did not see transferred item: ${JSON.stringify(remote)}`);

  // The legacy server deliberately requires DealOKTime after the last item change.
  await sleep(1300);
  attackerClient.send({ type: 'tradeAccept' });
  victimClient.send({ type: 'tradeAccept' });
  await Promise.all([attackerClient.waitFor('tradeSuccess'), victimClient.waitFor('tradeSuccess')]);
  // The legacy server sends the receiver's SM_ADDITEM before SM_DEALSUCCESS;
  // that packet is consumed while waiting for tradeSuccess. Read it from the
  // recorded event stream, and rely on the already accepted tradeResult for
  // the sender-side removal. A second inventory request is rate limited by
  // the legacy server immediately after a trade.
  const received = latest(victimClient.events,
    event => event.type === 'itemAdded' && event.item?.makeIndex === item.makeIndex)?.item;
  if (!received || received.name !== item.name)
    throw new Error(`victim inventory did not receive transferred item: ${JSON.stringify(victimClient.events.filter(event => event.type === 'itemAdded'))}`);
  report.received = received;
  report.senderTradeRemoval = { makeIndex: item.makeIndex, accepted: true };
  report.passed = true;
  console.log(`PASS two-client item trade (${item.name}/${item.makeIndex})`);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  report.attackerEvents = attackerClient.events.slice(-20);
  report.victimEvents = victimClient.events.slice(-20);
  report.attackerTradeEvents = attackerClient.events.filter(event => event.type.startsWith('trade') || event.type.startsWith('item'));
  report.victimTradeEvents = victimClient.events.filter(event => event.type.startsWith('trade') || event.type.startsWith('item'));
  report.attackerSystemMessages = attackerClient.events.filter(event => event.type === 'systemMessage').map(event => event.text).slice(-20);
  report.victimSystemMessages = victimClient.events.filter(event => event.type === 'systemMessage').map(event => event.text).slice(-20);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  await mkdir(new URL('.runtime/reports/', root), { recursive: true });
  await writeFile(new URL('.runtime/reports/trade.json', root), `${JSON.stringify(report, null, 2)}\n`);
  attackerClient.close();
  victimClient.close();
}
