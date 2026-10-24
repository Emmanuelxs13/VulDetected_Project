import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getEnv } from '@/lib/env';
import { runDueSchedules } from '@/lib/scheduled-scans';

export const dynamic = 'force-dynamic';

/**
 * The clock for scheduled scans.
 *
 * ## WHY AN ENDPOINT AND NOT AN IN-PROCESS TIMER
 *
 * A `setInterval` inside the Next.js server dies with the process, runs once per
 * instance (so a second replica double-fires), and is invisible to monitoring.
 * An authenticated endpoint is idempotent, observable, and can be driven by
 * whatever the deployment already trusts as a clock — Windows Task Scheduler,
 * a container cron, or an external pinger. The schedule contract needs a
 * reliable tick, not a specific daemon.
 *
 * ## AUTHORIZATION
 *
 * Same shared secret as the scanner callback: this is machine-to-machine, not a
 * user session. A missing secret disables the endpoint (401) rather than
 * leaving it open — a runner that can queue scans must never be anonymous.
 * Comparison is constant-time for the same reason as the callback route.
 */
export async function POST(req: Request) {
  const env = getEnv();
  const expected = env.SCANNER_CALLBACK_SECRET;

  if (!expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const header = req.headers.get('authorization');
  const token =
    header !== null && header.toLowerCase().startsWith('bearer ') ? header.slice(7) : null;

  if (token === null || !timingSafeEqualString(token, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runDueSchedules();

  return NextResponse.json(result);
}

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
