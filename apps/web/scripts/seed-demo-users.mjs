import { hash } from '@node-rs/argon2';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

function loadLocalEnv() {
  for (const path of ['.env', 'apps/web/.env.local']) {
    try {
      const text = readFileSync(path, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
        }
      }
    } catch {
      // The caller can provide DATABASE_URL directly in the environment.
    }
  }
}

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to seed demo users.');
}

const sql = postgres(process.env.DATABASE_URL);
const password = 'VulDetected-Demo-2026!';
const users = [
  { email: 'demo.free@vuldetected.local', name: 'Demo Free', plan: 'free' },
  { email: 'demo.pro@vuldetected.local', name: 'Demo Pro', plan: 'pro' },
  { email: 'demo.business@vuldetected.local', name: 'Demo Business', plan: 'business' },
];

try {
  for (const demo of users) {
    const userId = randomUUID();
    const accountId = randomUUID();
    const passwordHash = await hash(password, {
      algorithm: 2,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    await sql.begin(async (transaction) => {
      const rows = await transaction`
        INSERT INTO users (
          id, email, email_verified, name, status, locale,
          subscription_plan, subscription_status
        )
        VALUES (
          ${userId}, ${demo.email}, true, ${demo.name}, 'active', 'es',
          ${demo.plan}, 'active'
        )
        ON CONFLICT (email) DO UPDATE SET
          email_verified = true,
          name = EXCLUDED.name,
          status = 'active',
          subscription_plan = EXCLUDED.subscription_plan,
          subscription_status = 'active'
        RETURNING id
      `;

      const resolvedUserId = rows[0].id;
      await transaction`
        INSERT INTO accounts (id, account_id, provider_id, user_id, password)
        VALUES (${accountId}, ${resolvedUserId}, 'credential', ${resolvedUserId}, ${passwordHash})
        ON CONFLICT (provider_id, account_id) DO UPDATE SET password = EXCLUDED.password
      `;
    });
  }
} finally {
  await sql.end();
}

console.log('Demo users seeded. Shared local password:', password);
