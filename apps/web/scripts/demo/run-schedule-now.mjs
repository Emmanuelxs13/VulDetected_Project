/**
 * `pnpm demo:run-schedule-now` — make the REAL scheduler fire a scheduled scan.
 *
 * ## Why this does not enqueue a scan directly
 *
 * A script that inserts a `scans` row and publishes a Celery message would prove
 * that the worker can scan. It would prove nothing about the scheduler, which is
 * the feature being demonstrated (HU-07): the claim, the compare-and-set, the
 * `next_run_at` arithmetic, the verified-domain re-check and the "new finding"
 * detection all live on the scheduler's path.
 *
 * So this script does exactly one thing to the data — it moves `next_run_at`
 * into the past — and then calls the same authenticated endpoint the cron
 * script calls. What runs after that is production code with no demo branch.
 *
 * ## Why it calls the endpoint instead of waiting for the tick
 *
 * The dev scheduler ticks every 15 s. Waiting would work, but a demo that pauses
 * for an unpredictable interval in front of an audience is a demo that looks
 * broken. The endpoint is idempotent and compare-and-set safe, so calling it
 * early costs nothing and makes the step deterministic.
 *
 * ## Why the scan is NOT created if no schedule exists
 *
 * Creating the schedule is part of what HU-07 asks the user to do in the UI. A
 * script that silently invents one would let the presenter skip the screen that
 * has to be shown. When none exists, the script says exactly where to create it.
 */
import { createClient } from 'redis';

import { closeRedis, openDb, requireDemoMode } from './_shared.mjs';

const SCRIPT = 'demo:run-schedule-now';

requireDemoMode(SCRIPT);

const DEFAULT_HOSTNAME = '127-0-0-1.nip.io';

/** Reads `--domain <hostname>` (or `--domain=<hostname>`). */
function parseDomainArg(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--domain') return argv[index + 1] ?? null;
    if (arg.startsWith('--domain=')) return arg.slice('--domain='.length);
  }
  return null;
}

const hostname = parseDomainArg(process.argv.slice(2)) ?? DEFAULT_HOSTNAME;

const sql = openDb();

let scheduleId;
let domainId;
let previousNextRunAt;

/**
 * Captured BEFORE the row becomes due, not before our own HTTP call.
 *
 * The dev scheduler ticks on its own every 15 s. If a tick lands in the window
 * between "we made it due" and "our call arrives", the tick wins the claim and
 * creates the scan — which is the correct outcome and must not be reported as
 * a failure. Starting the window here means the confirmation below recognises a
 * scan created by either path.
 */
let runStartedAt = new Date();

try {
  const rows = await sql`
    select s.id, s.domain_id, s.next_run_at, s.enabled, d.verified, d.normalized_hostname
    from scan_schedules s
    join domains d on d.id = s.domain_id
    where d.normalized_hostname = ${hostname}
    limit 1
  `;

  if (rows.length === 0) {
    console.error(
      `[${SCRIPT}] No schedule exists for ${hostname}.\n` +
        `  Create it in the UI first: http://localhost:3000/schedules\n` +
        `  (sign in as demo.pro@vuldetected.local). Then re-run this script.`,
    );
    process.exit(1);
  }

  const row = rows[0];

  if (!row.enabled) {
    console.error(
      `[${SCRIPT}] The schedule for ${hostname} is disabled, so the scheduler would\n` +
        `  correctly skip it. Enable it in http://localhost:3000/schedules first.`,
    );
    process.exit(1);
  }

  if (!row.verified) {
    console.error(
      `[${SCRIPT}] ${hostname} is not verified. The scheduler re-checks verification\n` +
        `  at run time and would skip it. Verify the domain first.`,
    );
    process.exit(1);
  }

  scheduleId = row.id;
  domainId = row.domain_id;
  previousNextRunAt = row.next_run_at;

  /**
   * Wait out an in-flight scan of the same domain first.
   *
   * The runner skips a due window while the previous run is still queued or
   * running (that is the overlap guard, and it is correct). But this script is
   * driven in front of an audience, and "skipped" would look like a broken
   * scheduler. Waiting here keeps the step deterministic without weakening the
   * guard: we simply stop competing with a run that is already on its way.
   */
  const waitStartedAt = Date.now();
  const WAIT_LIMIT_MS = 180_000;
  for (;;) {
    const inFlight = await sql`
      select id, status
      from scans
      where domain_id = ${domainId}
        and status in ('queued', 'running')
      order by created_at desc
      limit 1
    `;

    if (inFlight.length === 0) break;

    if (Date.now() - waitStartedAt > WAIT_LIMIT_MS) {
      console.error(
        `[${SCRIPT}] A scan for ${hostname} is still ${inFlight[0].status} after ` +
          `${Math.round(WAIT_LIMIT_MS / 1000)} s (${inFlight[0].id}).\n` +
          `  The overlap guard would skip this window. Open that scan, or cancel it,\n` +
          `  then re-run this script.`,
      );
      process.exit(1);
    }

    console.log(
      `  waiting             ${inFlight[0].id} is ${inFlight[0].status}; ` +
        `the overlap guard would skip this window`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  // One second in the past, not `now()`: `lte(next_run_at, now)` is evaluated in
  // the database, and a value that is exactly "now" from the client can land a
  // few milliseconds in the future once the clock skew of two processes is
  // involved. A due row must be unambiguously due.
  runStartedAt = new Date();

  await sql`
    update scan_schedules
    set next_run_at = now() - interval '1 second'
    where id = ${scheduleId}
  `;

  console.log(`  schedule            ${scheduleId}`);
  console.log(`  domain              ${hostname} (${domainId})`);
  console.log(`  next_run_at         ${previousNextRunAt?.toISOString() ?? 'null'} -> past`);
} finally {
  await sql.end();
}

// Same machine credential and same endpoint as `scripts/run-scheduler.mjs`.
const baseUrl = process.env.SCHEDULER_BASE_URL ?? 'http://localhost:3000';
const secret = process.env.SCANNER_CALLBACK_SECRET;

if (!secret) {
  console.error(`[${SCRIPT}] SCANNER_CALLBACK_SECRET is required to call the scheduler endpoint.`);
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/internal/schedules/run`, {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(30_000),
});

const body = await response.text();

if (!response.ok) {
  console.error(`[${SCRIPT}] Scheduler endpoint returned ${response.status}: ${body}`);
  process.exit(1);
}

console.log(`\n[${SCRIPT}] Scheduler ran (real code path): ${body}`);

// Confirm the scan the scheduler created, so the presenter knows what to open.
const verifySql = openDb();
try {
  const scans = await verifySql`
    select id, status, source, created_at
    from scans
    where domain_id = ${domainId}
      and source = 'schedule'
      and is_demo = false
      and created_at >= ${runStartedAt.toISOString()}::timestamptz
    order by created_at desc
    limit 1
  `;

  if (scans.length === 0) {
    console.log(
      '  No scheduled scan was created. Read the counts above: the scheduler may have\n' +
        '  skipped this row (disabled, unverified or already claimed by another runner).',
    );
  } else {
    const scan = scans[0];
    console.log(`  scheduled scan      ${scan.id} (${scan.status})`);
    console.log(`  open it at          ${baseUrl}/scans/${scan.id}`);
  }
} finally {
  await verifySql.end();
}

// The broker list is where the job waits for the worker. If Redis is down the
// enqueue above would already have failed, so this is informational only.
if (process.env.REDIS_URL) {
  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', () => {});
  try {
    await client.connect();
    const queued = await client.lLen('celery');
    console.log(`  broker              ${queued} job(s) waiting in the celery list`);
  } catch {
    // Informational; never fails the demo step.
  } finally {
    await closeRedis(client);
  }
}
