/**
 * The clock for scheduled scans.
 *
 * This is deliberately a plain script and not an in-process timer inside the web
 * app: a `setInterval` there dies with the process, runs once per replica, and is
 * invisible to monitoring. The script drives an authenticated, idempotent
 * endpoint, so a restart or a second copy costs nothing — the endpoint's
 * compare-and-set claim is what makes overlapping runners safe.
 *
 * ## Why the loop waits for the tick to finish
 *
 * `setInterval` does not: if a tick takes longer than the interval (a slow
 * database, a broker that is retrying), the next one starts on top of it and the
 * number of in-flight requests grows without bound. This loop schedules the next
 * tick only after the current one settles, so a slow period slows the cadence
 * instead of piling up.
 *
 * ## Why a failed tick does not kill the process
 *
 * A scheduler that exits on the first 502 from a proxy is a scheduler an operator
 * has to babysit. Failures are logged with the status and body, and the next tick
 * tries again. An unreachable endpoint and a wrong secret look different in the
 * log — the second returns 401 on every tick, which is the point.
 */

const baseUrl = process.env.SCHEDULER_BASE_URL ?? 'http://localhost:3000';
const secret = process.env.SCANNER_CALLBACK_SECRET;
const intervalMs = Number(process.env.SCHEDULER_INTERVAL_MS ?? 60_000);
const requestTimeoutMs = 30_000;

if (!secret) {
  throw new Error('SCANNER_CALLBACK_SECRET is required.');
}

if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
  throw new Error(
    `SCHEDULER_INTERVAL_MS must be a positive number of milliseconds; received ${process.env.SCHEDULER_INTERVAL_MS}.`,
  );
}

let stopping = false;

async function tick() {
  // Bearer, matching the callback route: one machine credential for every
  // internal endpoint, so there is no second scheme to keep in sync.
  const response = await fetch(`${baseUrl}/api/internal/schedules/run`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Scheduler returned ${response.status}: ${body}`);
  }

  console.log(`[scheduler] ${new Date().toISOString()} ${body}`);
}

async function loop() {
  while (!stopping) {
    const started = Date.now();

    try {
      await tick();
    } catch (error) {
      console.error('[scheduler] tick failed:', error instanceof Error ? error.message : error);
    }

    if (stopping) {
      break;
    }

    const elapsed = Date.now() - started;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, intervalMs - elapsed)));
  }
}

process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});

await loop();
