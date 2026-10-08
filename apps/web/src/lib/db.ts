import 'server-only';

import { getDb } from '@vuldetected/db';

/**
 * Database handle for the app.
 *
 * A one-line module so that application code has exactly ONE import path to the
 * data layer (`from '@/lib/db'`) instead of two, and so the lazy behaviour in
 * `@vuldetected/db`'s `getDb()` is preserved rather than accidentally bypassed
 * by importing `createDb` and calling it at module scope.
 *
 * The handle is resolved per call rather than captured, because capturing it in
 * a module-scope constant would run the `DATABASE_URL` lookup during
 * `next build`.
 */
export function db() {
  return getDb();
}
