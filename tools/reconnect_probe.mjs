#!/usr/bin/env node
// Reconnect the same character 20 times and require authoritative snapshots each time.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const gatewayUrl = process.env.MIR2_GATEWAY_URL ?? 'ws://127.0.0.1:18800/ws';
const cycles = Math.max(2, Math.min(40, Number(process.env.MIR2_RECONNECTS ?? 20)));
const credentials = JSON.parse(await readFile(new URL('.runtime/probe-account.json', root), 'utf8'));
const report = { gatewayUrl, cycles, passed: false, reconnects: [] };

class Session {
  constructor() {
    this.socket = new WebSocket(gatewayUrl);
    this.queue = [];
    this.waiters = [];
    this.sequence = 0;
    this.mapGeneration = 0;
    this.socket.addEventListener('message', event => {
      const envelope = JSON.parse(event.data);
      if (!Number.isInteger(envelope.sequence) || envelope.sequence <= this.sequence)
        throw new Error(`non-monotonic sequence ${envelope.sequence}`);
      this.sequence = envelope.sequence;
      this.mapGeneration = Math.max(this.mapGeneration, envelope.mapGeneration ?? 0);
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(envelope.message); else this.queue.push(envelope.message);
    });
    this.socket.addEventListener('close', event => {
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error(`gateway closed (${event.code})`));
    });
  }
  receive(timeout = 15000) {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((resolve, reject) => {
      const waiter = { resolve: value => { clearTimeout(timer); resolve(value); }, reject };
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error('timed out'));
      }, timeout);
      this.waiters.push(waiter);
    });
  }
  async waitFor(type, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const message = await this.receive(Math.max(1, deadline - Date.now()));
      if (message.type === 'error') throw new Error(message.message);
      if (message.type === type) return message;
    }
    throw new Error(`timed out waiting for ${type}`);
  }
  send(message) { this.socket.send(JSON.stringify(message)); }
  close() { this.socket.close(); }
}

async function enter() {
  const session = new Session();
  await session.waitFor('connected');
  session.send({ type: 'login', account: credentials.account, password: credentials.password });
  const characters = await session.waitFor('characters');
  const character = credentials.character ?? characters.characters[0]?.name;
  if (!character) throw new Error('probe account has no character');
  session.send({ type: 'selectCharacter', name: character });
  const map = await session.waitFor('map');
  let self;
  for (;;) {
    const message = await session.receive();
    if (message.type === 'entity' && message.self) { self = message; break; }
  }
  session.send({ type: 'inventory' });
  const wanted = new Set(['attributes', 'equipment', 'skills', 'inventory']);
  const seen = new Set();
  const deadline = Date.now() + 12000;
  while (seen.size < wanted.size && Date.now() < deadline) {
    const message = await session.receive(Math.max(1, deadline - Date.now()));
    if (wanted.has(message.type)) seen.add(message.type);
  }
  if (seen.size !== wanted.size) throw new Error(`incomplete snapshot ${[...wanted].filter(type => !seen.has(type)).join(',')}`);
  return { session, character, map: map.map, position: [self.x, self.y], snapshot: [...seen].sort() };
}

try {
  let previous;
  for (let cycle = 1; cycle <= cycles; cycle++) {
    const visit = await enter();
    report.reconnects.push({ cycle, map: visit.map, position: visit.position, snapshot: visit.snapshot });
    if (previous && (visit.map !== previous.map)) throw new Error(`map changed at reconnect ${cycle}`);
    previous = visit;
    visit.session.close();
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  report.passed = report.reconnects.length === cycles;
  console.log(`PASS ${cycles} reconnects at ${previous.map}:${previous.position.join(',')}`);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  await mkdir(new URL('.runtime/reports/', root), { recursive: true });
  await writeFile(new URL('.runtime/reports/reconnect.json', root), `${JSON.stringify(report, null, 2)}\n`);
}
