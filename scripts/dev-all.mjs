#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const COMPOSE_FILE = 'infra/docker-compose.dev.yml';
const SERVICES = ['postgres', 'redis', 'mailpit'];

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(cmd + ' ' + args.join(' ') + ' exited with code ' + code));
    });
    p.on('error', reject);
  });
}

async function checkHttp(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    clearTimeout(t);
    return false;
  }
}

async function checkTcp(host, port, timeoutMs = 3000) {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const onDone = (ok) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => onDone(true));
    socket.once('timeout', () => onDone(false));
    socket.once('error', () => onDone(false));
    socket.connect(port, host);
  });
}

async function waitForService(name, checkFn, maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await checkFn()) {
      console.log('[dev:all] ' + name + ': OK');
      return;
    }
    await sleep(1000);
  }
  throw new Error('[dev:all] ' + name + ': TIMEOUT - service not responding');
}

async function main() {
  console.log('[dev:all] Starting infrastructure with docker compose...');
  try {
    await run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', ...SERVICES]);
  } catch (e) {
    console.error('[dev:all] ERROR starting docker compose:', e.message);
    console.error('[dev:all] Make sure Docker is running and docker compose is available.');
    process.exit(1);
  }

  console.log('[dev:all] Waiting for services to be healthy...');
  try {
    await waitForService('Postgres (5432)', () => checkTcp('localhost', 5432));
    await waitForService('Redis (6379)', () => checkTcp('localhost', 6379));
    await waitForService('Mailpit SMTP (1025)', () => checkTcp('localhost', 1025));
    await waitForService('Mailpit UI (8025)', () => checkHttp('http://localhost:8025'));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  console.log('[dev:all] Infrastructure ready. Starting web + scanner + scheduler...');
  console.log('[dev:all] Press Ctrl+C to stop all processes');
  await run('pnpm', ['run', 'dev']);
}

main().catch((e) => {
  console.error('[dev:all] Fatal error:', e.message);
  process.exit(1);
});

