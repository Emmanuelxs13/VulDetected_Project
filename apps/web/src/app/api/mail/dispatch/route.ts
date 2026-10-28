import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getEnv } from '@/lib/env';
import { deliverDueMail } from '@/lib/mail/outbox';

export const dynamic = 'force-dynamic';

/**
 * Flushes the mail outbox.
 *
 * ## Why an endpoint and not a `setInterval`
 *
 * A timer inside the Next process dies with the process, runs once per replica
 * (so three replicas send three copies or, worse, race on the same rows), and
 * cannot be inspected. An endpoint is triggered by whatever the deployment
 * already has — a cron job, a platform scheduler, a curl in the runbook — and it
 * reports what it did.
 *
 * ## Why it needs its own secret
 *
 * The scanner callback has `SCANNER_CALLBACK_SECRET`; this is the same shape for
 * the same reason. Without it, anyone who can reach the route can force a
 * delivery pass, which is a cheap way to turn a mail-provider rate limit into an
 * outage. `MAIL_DISPATCH_SECRET` is compared in constant time, and an unset
 * secret refuses everything rather than defaulting open.
 */

function authorised(request: Request): boolean {
  const expected = getEnv().MAIL_DISPATCH_SECRET;
  if (!expected) {
    return false;
  }

  const header = request.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return false;
  }

  const provided = header.slice(7);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  // Length is compared first because `timingSafeEqual` throws on a mismatch, and
  // a thrown error is a timing signal of its own.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await deliverDueMail();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    console.error('[mail] dispatch pass failed', error);
    return NextResponse.json({ ok: false, error: 'dispatch_failed' }, { status: 500 });
  }
}
