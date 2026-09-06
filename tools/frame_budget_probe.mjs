#!/usr/bin/env node
// Sample 800×600 Pixi map rendering on the locked Bichon scene and record p95 frame time.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const root = new URL('..', import.meta.url);
const playUrl = process.env.MIR2_PERF_URL ?? 'http://127.0.0.1:5173/perf.html?ms=8000';
const debugPort = Number(process.env.MIR2_CHROME_PORT ?? 19222);
const report = { playUrl, passed: false, skipped: false };

function chromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  return candidates.find(path => existsSync(path)) ?? null;
}

async function cdp(socket, id, method, params = {}) {
  const payload = JSON.stringify({ id, method, params });
  socket.send(payload);
  return new Promise((resolve, reject) => {
    const onMessage = event => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    socket.addEventListener('message', onMessage);
    setTimeout(() => reject(new Error(`${method} timed out`)), 20000);
  });
}

async function sampleWithChrome(binary, url, port) {
  const child = spawn(binary, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/mir2-chrome-${port}`,
    '--headless=new',
    '--disable-background-networking',
    '--disable-extensions',
    '--no-first-run',
    '--enable-webgl',
    '--use-gl=angle',
    'about:blank',
  ], { stdio: 'ignore' });
  try {
    let targets;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
        if (Array.isArray(targets) && targets.length) break;
      } catch {}
      await sleep(150);
    }
    const page = targets?.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
    if (!page) throw new Error('chrome DevTools target missing');
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve);
      socket.addEventListener('error', () => reject(new Error('chrome DevTools websocket failed')));
    });
    let next = 1;
    await cdp(socket, next++, 'Page.enable');
    await cdp(socket, next++, 'Runtime.enable');
    await cdp(socket, next++, 'Page.navigate', { url });
    const deadline = Date.now() + 28000;
    let snapshot;
    while (Date.now() < deadline) {
      const result = await cdp(socket, next++, 'Runtime.evaluate', {
        expression: 'window.__mir2FrameBudget ? JSON.stringify(window.__mir2FrameBudget) : null',
        returnByValue: true,
      });
      if (result.result?.value) {
        snapshot = JSON.parse(result.result.value);
        break;
      }
      await sleep(400);
    }
    socket.close();
    if (!snapshot) throw new Error(`frame budget sample did not finish for ${url}`);
    return snapshot;
  } finally {
    child.kill('SIGTERM');
  }
}

try {
  const ready = await fetch('http://127.0.0.1:5173/perf.html').then(response => response.ok).catch(() => false);
  if (!ready) throw new Error('Vite is not serving http://127.0.0.1:5173/perf.html');
  const binary = chromePath();
  if (!binary) {
    report.skipped = true;
    report.reason = 'Chrome/Chromium is not installed';
  } else {
    report.chrome = binary;
    report.sample = await sampleWithChrome(binary, playUrl, debugPort);
    const pressureUrl = playUrl.includes('?') ? `${playUrl}&pressure=100` : `${playUrl}?pressure=100`;
    report.pressure = await sampleWithChrome(binary, pressureUrl, debugPort + 1);
    report.passed = Boolean(report.sample?.passed) && report.sample.p95Ms <= 33.4;
    if (!report.passed) throw new Error(`frame budget p95 ${report.sample?.p95Ms}ms exceeds 33.4ms (30 FPS floor)`);
    console.log(`PASS frame budget p95 ${report.sample.p95Ms}ms (~${report.sample.fpsEstimate} FPS, n=${report.sample.samples}); pressure100 p95 ${report.pressure?.p95Ms}ms`);
  }
  if (report.skipped) console.log(`SKIP frame budget: ${report.reason}`);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  report.passed = false;
  process.exitCode = 1;
  console.error(report.error);
} finally {
  await mkdir(new URL('.runtime/reports/', root), { recursive: true });
  await writeFile(new URL('.runtime/reports/frame-budget.json', root), `${JSON.stringify(report, null, 2)}\n`);
}
