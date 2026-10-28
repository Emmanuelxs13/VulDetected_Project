import { sql } from '@vuldetected/db';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getLogger } from '@/lib/logger';
import { withRedis } from '@/lib/redis';

/**
 * Readiness probe: can this instance serve real traffic?
 *
 * ## DATABASE IS REQUIRED, REDIS IS REPORTED
 *
 * Postgres holds every fact the product has: accounts, domains, scans,
 * findings. Without it no page can render an honest answer, so the probe answers
 * `503` and the load balancer takes the instance out.
 *
 * Redis is different. It is the scan queue (Celery), the cross-replica rate
 * limiter and the cancellation flag. When it is down the app still authenticates,
 * still shows stored scans and reports, and the rate limiter degrades to a
 * per-process window. Failing readiness would take down login and dashboards —
 * including the dashboard an operator would use to notice the outage — to
 * protect a queue. So Redis is reported as a check with its real state and the
 * response stays `200`, with `status: "degraded"`. That word is the signal for
 * an alert rule, not for a traffic cut.
 *
 * ## WHY EVERY PROBE IS TIME-BOUNDED
 *
 * A readiness probe that hangs is worse than one that fails: the orchestrator
 * waits for the timeout, then retries, and the instance is neither serving nor
 * marked unhealthy. Each check has its own deadline and reports the elapsed time,
 * so a slow dependency shows up as a number in the payload instead of as a
 * mystery in the platform's events.
 */
export const dynamic = 'force-dynamic';

const PROBE_TIMEOUT_MS = 2_000;

interface ProbeResult {
  ok: boolean;
  ms: number;
  /** Stable machine-readable reason. Never a driver message with a host in it. */
  error?: string;
}

function timeoutAfter(ms: number, label: string): Promise<never> {
  return new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    // A pending timer holds the process open; the probe itself is short-lived.
    timer.unref?.();
  });
}

async function probe(label: string, run: () => PromiseLike<unknown>): Promise<ProbeResult> {
  const started = performance.now();

  try {
    await Promise.race([Promise.resolve(run()), timeoutAfter(PROBE_TIMEOUT_MS, label)]);
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch (error) {
    getLogger('health').warn({ err: error, check: label }, 'readiness probe failed');

    // The payload is public, so it names the check and the failure class, not
    // the driver's message: those carry hostnames and connection strings.
    const timedOut = error instanceof Error && error.message === `${label}_timeout`;
    return {
      ok: false,
      ms: Math.round(performance.now() - started),
      error: timedOut ? 'timeout' : 'unreachable',
    };
  }
}

export async function GET() {
  const [database, redis] = await Promise.all([
    probe('database', () => db().execute(sql`select 1`)),
    probe('redis', () => withRedis((client) => client.ping())),
  ]);

  // `unavailable` when a required dependency is down, `degraded` when the app is
  // serving but something it needs for full function is not.
  const status = !database.ok ? 'unavailable' : redis.ok ? 'ok' : 'degraded';

  return NextResponse.json(
    { status, checks: { database, redis } },
    {
      status: database.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
