const baseUrl = process.env.SCHEDULER_BASE_URL ?? 'http://localhost:3000';
const secret = process.env.SCANNER_CALLBACK_SECRET;
const intervalMs = Number(process.env.SCHEDULER_INTERVAL_MS ?? 60_000);

if (!secret) {
  throw new Error('SCANNER_CALLBACK_SECRET is required.');
}

async function tick() {
  const response = await fetch(`${baseUrl}/api/internal/schedules/run`, {
    method: 'POST',
    headers: { 'x-scanner-secret': secret },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Scheduler returned ${response.status}: ${body}`);
  }
  console.log(`[scheduler] ${new Date().toISOString()} ${body}`);
}

await tick();
setInterval(() => {
  tick().catch((error) => console.error('[scheduler] tick failed', error));
}, intervalMs);
