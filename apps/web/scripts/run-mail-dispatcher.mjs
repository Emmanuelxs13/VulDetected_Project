/**
 * The clock for outgoing mail.
 *
 * The outbox is durable and the dispatch endpoint is idempotent, so delivery is
 * simply "call the endpoint often". In development nothing else calls it, and an
 * outbox nobody drains is a feature that looks broken: the completion email and
 * the new-vulnerability alert would sit in a table forever.
 *
 * ## Why five seconds
 *
 * Sprint 2 promises that an alert is queued when the scan closes and delivered in
 * under sixty seconds (CA-12). A five-second poll leaves plenty of room for the
 * SMTP round trip and makes the measurement in `PRUEBA_SPRINT_2.md` honest — the
 * guarantee comes from the poll interval, not from a lucky run.
 *
 * ## Why the loop waits for the tick
 *
 * Same reason as the scheduler: a slow SMTP server must slow the cadence, not
 * stack requests on top of each other.
 */

const baseUrl = process.env.MAIL_DISPATCH_BASE_URL ?? 'http://localhost:3000';
const secret = process.env.MAIL_DISPATCH_SECRET;
const intervalMs = Number(process.env.MAIL_DISPATCH_INTERVAL_MS ?? 5_000);
const requestTimeoutMs = 30_000;

if (!secret) {
  throw new Error('MAIL_DISPATCH_SECRET is required.');
}

if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
  throw new Error(
    `MAIL_DISPATCH_INTERVAL_MS must be a positive number of milliseconds; received ${process.env.MAIL_DISPATCH_INTERVAL_MS}.`,
  );
}

let stopping = false;

async function tick() {
  const response = await fetch(`${baseUrl}/api/mail/dispatch`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Mail dispatch returned ${response.status}: ${body}`);
  }

  const report = JSON.parse(body);
  // Only log passes that did something: a five-second heartbeat is noise.
  if (report.sent > 0 || report.failed > 0 || report.reclaimed > 0) {
    console.log(`[mail-dispatch] ${new Date().toISOString()} ${body}`);
  }
}

async function loop() {
  while (!stopping) {
    const started = Date.now();

    try {
      await tick();
    } catch (error) {
      console.error(
        '[mail-dispatch] tick failed:',
        error instanceof Error ? error.message : error,
      );
    }

    if (stopping) break;

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
