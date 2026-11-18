#!/usr/bin/env node
/**
 * `pnpm demo:reset-billing` — returns the demo accounts to their seeded plans
 * (Sprint 2, HU-02b).
 *
 * ## Why this exists as its own accelerator
 *
 * `pnpm demo:reset` rebuilds the scan history and would wipe a live demo; the
 * billing demo needs a much narrower reset. Without one, every run of the
 * Playwright spec (or of the demo itself) leaves `demo.free@` on a paid plan, and
 * the next run starts from a state the presenter did not expect — "Free" showing
 * Pro limits is exactly the kind of contradiction an audience notices.
 *
 * ## Why the seeded plans are restored, not everything set to Free
 *
 * `demo.pro@` and `demo.business@` exist precisely to show what a paid plan looks
 * like. Flattening all three to Free would make this script "fix" the demo into a
 * state the demo does not want. Each account is returned to the plan
 * `seed-demo-users.mjs` gives it.
 *
 * ## What it does NOT touch
 *
 * Nothing outside billing: no users, no domains, no scans, no sessions. The
 * accounts, their passwords and their verified domains survive, which is what
 * makes this safe to run between takes.
 *
 * ## Why it also deletes the ledgers
 *
 * `checkout_sessions` and `payment_events` are the evidence that the webhook
 * worked. Leaving them would make the next run's `appliedEvents` counter start at
 * five and the billing screen claim history the presenter cannot explain. The
 * demo starts from zero on purpose.
 */
import { openDb, requireDemoMode } from './_shared.mjs';

const SCRIPT = 'demo:reset-billing';

/** Mirrors `seed-demo-users.mjs`; the plan each account is meant to show. */
const SEEDED_PLANS = [
  { email: 'demo.free@vuldetected.local', plan: 'free' },
  { email: 'demo.pro@vuldetected.local', plan: 'pro' },
  { email: 'demo.business@vuldetected.local', plan: 'business' },
];

async function main() {
  requireDemoMode(SCRIPT);

  const sql = openDb();

  try {
    const emails = SEEDED_PLANS.map((row) => row.email);
    const users = await sql`SELECT id, email FROM users WHERE email IN ${sql(emails)}`;

    if (users.length === 0) {
      console.error(`[${SCRIPT}] No demo accounts found. Run "pnpm seed:demo" first.`);
      process.exitCode = 1;
      return;
    }

    const ids = users.map((row) => row.id);

    const events = await sql`
      DELETE FROM payment_events
      WHERE payload -> 'data' ->> 'userId' IN ${sql(ids)}
      RETURNING id
    `;

    const checkouts = await sql`
      DELETE FROM checkout_sessions WHERE user_id IN ${sql(ids)} RETURNING id
    `;

    let reset = 0;
    for (const { email, plan } of SEEDED_PLANS) {
      const rows = await sql`
        UPDATE users
        SET subscription_plan = ${plan},
            subscription_status = 'active',
            subscription_provider = NULL,
            subscription_last_event_at = NULL,
            subscription_period_end = NULL,
            subscription_cancel_at_period_end = false,
            updated_at = now()
        WHERE email = ${email}
        RETURNING id
      `;
      reset += rows.length;
    }

    console.log(`[${SCRIPT}] demo profile armed: ${process.env.DEMO_MODE}`);
    console.log(`[${SCRIPT}] accounts restored to their seeded plans: ${reset}`);
    console.log(`[${SCRIPT}] checkout sessions removed: ${checkouts.length}`);
    console.log(`[${SCRIPT}] payment events removed: ${events.length}`);
    console.log(`[${SCRIPT}] done — /settings/billing shows Free, Pro and Business as seeded.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(`[${SCRIPT}] failed:`, error);
  process.exitCode = 1;
});
