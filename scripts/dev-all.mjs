#!/usr/bin/env node
/**
 * One command to bring the whole local stack up.
 *
 * ## Why this script checks before it starts anything
 *
 * The previous version always ran `docker compose up -d postgres redis mailpit`
 * and exited when that failed. On a workstation with a native PostgreSQL
 * already listening on 5432 (this project's supported setup, see
 * `docs/local-postgres-setup.md`), the compose `postgres` service cannot bind
 * its port, the command exits non-zero, and the script aborts even though every
 * dependency the app needs was already running. A launcher must be idempotent:
 * "already up" is a success, not a conflict.
 *
 * Each dependency is therefore probed first and only started when missing.
 * Redis and Mailpit prefer a local binary when one is configured or found in the
 * usual tools directory, and fall back to Docker. PostgreSQL is never started by
 * this script when something already answers on 5432.
 *
 * ## What it starts
 *
 *   1. PostgreSQL   (probe only: native install is the documented default)
 *   2. Redis        (Celery broker + cancellation flags + rate limits)
 *   3. Mailpit      (SMTP catcher for verification and scan emails)
 *   4. Fixture site (the local target the demo scans)
 *   5. Scheduler    (drives /api/internal/schedules/run)
 *   6. Next.js dev  (foreground; Ctrl+C stops everything this script spawned)
 *
 * The Python scanner worker is expected either as the `vuldetected-scanner`
 * Docker container or as a local `celery` process. This script starts the local
 * worker when neither is present.
 *
 * ## Why the web app is the foreground process
 *
 * It is the only one the developer interacts with. Everything else is a child
 * whose output is prefixed, and all of them are terminated together on exit so
 * no orphan keeps a port busy on the next run.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const COMPOSE_FILE = join(ROOT, 'infra', 'docker-compose.dev.yml');
const TOOLS_DIR = join(
  process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? ROOT, 'AppData', 'Local'),
  'VulDetected',
  'tools',
);

const DEFAULT_REDIS_BIN = join(TOOLS_DIR, 'redis', 'redis-server.exe');
const DEFAULT_MAILPIT_BIN = join(TOOLS_DIR, 'mailpit', 'mailpit.exe');

/** Children this script owns. Killed together on exit. */
const children = [];
let shuttingDown = false;

/**
 * Loads `apps/web/.env.local` into `process.env` without overriding values the
 * shell already set. Deliberately minimal: this file is a launcher, not a
 * dotenv library, and the variables it needs are simple `KEY=value` lines.
 */
function loadEnvLocal() {
  const file = join(ROOT, 'apps', 'web', '.env.local');
  if (!existsSync(file)) return;

  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function checkTcp(host, port, timeoutMs = 2_000) {
  return new Promise((done) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      done(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function checkHttp(url, timeoutMs = 3_000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(label, probe, maxWaitMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    if (await probe()) {
      console.log(`[dev:all] ${label}: OK`);
      return true;
    }
    await sleep(500);
  }
  console.error(`[dev:all] ${label}: TIMEOUT after ${maxWaitMs} ms`);
  return false;
}

/**
 * Starts a child and prefixes its output.
 *
 * `stdio: 'inherit'` would interleave five processes into one unreadable
 * stream; a prefix makes "which service logged this" answerable.
 */
function startChild(label, command, args, options = {}) {
  /**
   * `shell` is opt-in, not the default.
   *
   * On Windows, `spawn(cmd, args, { shell: true })` hands the command line to
   * `cmd.exe`, which splits on spaces: `C:\Program Files\nodejs\node.exe`
   * becomes the command `C:\Program` and the launch fails. Absolute executable
   * paths must be spawned without a shell. Only package-manager shims such as
   * `pnpm.cmd` need one.
   */
  const child = spawn(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    shell: options.shell ?? false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const pipe = (stream, sink) => {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) sink.write(`[${label}] ${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[dev:all] ${label} exited with code ${code ?? 'null'}`);
    }
  });

  children.push({ label, child });
  return child;
}

function dockerComposeUp(services) {
  const result = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', ...services], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

function dockerContainerRunning(name) {
  const result = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', name], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return result.status === 0 && result.stdout.trim() === 'true';
}

function findBinary(envName, fallback) {
  const configured = process.env[envName];
  if (configured && existsSync(configured)) return configured;
  if (existsSync(fallback)) return fallback;
  return null;
}

async function ensurePostgres() {
  if (await checkTcp('127.0.0.1', 5432)) {
    console.log('[dev:all] Postgres (5432): OK (existing server)');
    return true;
  }
  console.log('[dev:all] Postgres (5432): not listening, starting the compose service...');
  if (!dockerComposeUp(['postgres'])) {
    console.error(
      '[dev:all] Could not start Postgres. Start your native server or Docker, then retry.',
    );
    return false;
  }
  return waitFor('Postgres (5432)', () => checkTcp('127.0.0.1', 5432));
}

async function ensureRedis() {
  if (await checkTcp('127.0.0.1', 6379)) {
    console.log('[dev:all] Redis (6379): OK (existing server)');
    return true;
  }

  const binary = findBinary('VULDETECTED_REDIS_BIN', DEFAULT_REDIS_BIN);
  if (binary) {
    console.log(`[dev:all] Redis (6379): starting local binary ${binary}`);
    startChild('redis', binary, ['--port', '6379', '--save', '', '--appendonly', 'no'], {
      cwd: dirname(binary),
    });
  } else {
    console.log('[dev:all] Redis (6379): starting the compose service...');
    if (!dockerComposeUp(['redis'])) return false;
  }

  return waitFor('Redis (6379)', () => checkTcp('127.0.0.1', 6379));
}

async function ensureMailpit() {
  const smtpUp = await checkTcp('127.0.0.1', 1025);
  const httpUp = await checkHttp('http://127.0.0.1:8025');
  if (smtpUp && httpUp) {
    console.log('[dev:all] Mailpit (1025/8025): OK (existing server)');
    return true;
  }

  const binary = findBinary('VULDETECTED_MAILPIT_BIN', DEFAULT_MAILPIT_BIN);
  if (binary) {
    console.log(`[dev:all] Mailpit (1025/8025): starting local binary ${binary}`);
    startChild(
      'mailpit',
      binary,
      ['--smtp', '127.0.0.1:1025', '--listen', '127.0.0.1:8025'],
      { cwd: dirname(binary) },
    );
  } else {
    console.log('[dev:all] Mailpit (1025/8025): starting the compose service...');
    if (!dockerComposeUp(['mailpit'])) return false;
  }

  const smtpReady = await waitFor('Mailpit SMTP (1025)', () => checkTcp('127.0.0.1', 1025));
  const uiReady = await waitFor('Mailpit UI (8025)', () => checkHttp('http://127.0.0.1:8025'));
  return smtpReady && uiReady;
}

async function ensureFixture() {
  const port = Number(process.env.DEMO_TARGET_PORT ?? 8099);
  if (await checkTcp('127.0.0.1', port)) {
    console.log(`[dev:all] Fixture site (${port}): OK (existing server)`);
    return true;
  }

  console.log(`[dev:all] Fixture site (${port}): starting e2e/fixtures/vulnerable-site`);
  startChild('fixture', process.execPath, [join(ROOT, 'e2e', 'fixtures', 'vulnerable-site', 'server.mjs')], {
    env: { PORT: String(port) },
  });

  return waitFor(`Fixture site (${port})`, () => checkTcp('127.0.0.1', port));
}

function ensureScannerWorker() {
  if (dockerContainerRunning('vuldetected-scanner')) {
    console.log('[dev:all] Scanner worker: OK (docker container vuldetected-scanner)');
    return true;
  }

  const python = process.env.VULDETECTED_PYTHON ?? 'python';
  const probe = spawnSync(python, ['-c', 'import celery'], { stdio: 'ignore' });
  if (probe.status !== 0) {
    console.error(
      '[dev:all] Scanner worker: neither the docker container nor a local Celery install was found.',
    );
    return false;
  }

  console.log('[dev:all] Scanner worker: starting local Celery (pool=solo, required on Windows)');
  startChild(
    'worker',
    python,
    ['-m', 'celery', '-A', 'scanner', 'worker', '--pool=solo', '--loglevel=info'],
    {
      cwd: join(ROOT, 'services', 'scanner'),
      env: {
        CELERY_BROKER_URL: process.env.CELERY_BROKER_URL ?? 'redis://localhost:6379/0',
        SCANNER_CALLBACK_BASE_URL: process.env.SCANNER_CALLBACK_BASE_URL ?? 'http://localhost:3000',
      },
    },
  );
  return true;
}

function ensureScheduler() {
  if (!process.env.SCANNER_CALLBACK_SECRET) {
    console.error('[dev:all] Scheduler: SCANNER_CALLBACK_SECRET is not set; skipping.');
    return false;
  }

  console.log('[dev:all] Scheduler: starting apps/web/scripts/run-scheduler.mjs');
  startChild('scheduler', process.execPath, [join(ROOT, 'apps', 'web', 'scripts', 'run-scheduler.mjs')], {
    env: { SCHEDULER_INTERVAL_MS: process.env.SCHEDULER_INTERVAL_MS ?? '15000' },
  });
  return true;
}

function ensureMailDispatcher() {
  if (!process.env.MAIL_DISPATCH_SECRET) {
    console.error('[dev:all] Mail dispatcher: MAIL_DISPATCH_SECRET is not set; skipping.');
    return false;
  }

  console.log('[dev:all] Mail dispatcher: starting apps/web/scripts/run-mail-dispatcher.mjs');
  startChild(
    'mail-dispatch',
    process.execPath,
    [join(ROOT, 'apps', 'web', 'scripts', 'run-mail-dispatcher.mjs')],
    { env: { MAIL_DISPATCH_INTERVAL_MS: process.env.MAIL_DISPATCH_INTERVAL_MS ?? '5000' } },
  );
  return true;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { label, child } of children) {
    try {
      child.kill();
      console.log(`[dev:all] stopped ${label}`);
    } catch {
      // Already gone.
    }
  }
  process.exit(code);
}

async function main() {
  loadEnvLocal();

  console.log('[dev:all] Bringing up local dependencies...');
  const ready =
    (await ensurePostgres()) &&
    (await ensureRedis()) &&
    (await ensureMailpit()) &&
    (await ensureFixture());

  if (!ready) {
    console.error('[dev:all] A required dependency is not available. Aborting.');
    shutdown(1);
  }

  ensureScannerWorker();
  ensureScheduler();
  ensureMailDispatcher();

  console.log('[dev:all] Starting the web app (Ctrl+C stops everything this script started).');
  const web = startChild('web', 'pnpm', ['run', 'dev'], { shell: process.platform === 'win32' });

  web.on('exit', (code) => shutdown(code ?? 0));
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch((error) => {
  console.error('[dev:all] Fatal error:', error instanceof Error ? error.message : error);
  shutdown(1);
});
