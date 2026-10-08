import 'server-only';

import { headers } from 'next/headers';

/** The request headers, which `auth.api.*` requires for cookie context. */
export async function authHeaders() {
  return headers();
}

/** Best-effort client IP for the audit row. */
export async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
    return h.get('x-real-ip');
  } catch {
    return null;
  }
}
