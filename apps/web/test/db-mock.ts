import { vi } from 'vitest';

/**
 * Queue-driven stand-in for `db()` from `@/lib/db`.
 *
 * Every chainable Drizzle builder method (`from`, `where`, `limit`, `orderBy`,
 * `values`, `onConflictDoUpdate`, `returning`) returns the same thenable
 * chain, so code under test can `await db().select().from().where().limit()`
 * while each *creation* of a chain — one per `select()` / `insert()` /
 * `delete()` call — shifts the next canned result off `dbQueue`. Awaiting the
 * chain resolves to that canned result. `transaction(cb)` runs `cb` against
 * the same chain object and records the call.
 *
 * Every chainable call is appended to `dbCalls` as `{ method, args }`, which
 * is how tests assert what was written (insert payloads, conflict guards,
 * deletes) without reaching into Drizzle internals.
 */

export const dbQueue: unknown[] = [];

export const dbCalls: { method: string; args: unknown[] }[] = [];

type Chain = Record<string, unknown> & PromiseLike<unknown>;

function createChain(result: unknown): Chain {
  const calls =
    (method: string) =>
    (...args: unknown[]) => {
      dbCalls.push({ method, args });
      return chain;
    };

  // Delegates to a real promise so the generic `then` signature of
  // `PromiseLike` type-checks without casts.
  const then: PromiseLike<unknown>['then'] = (onfulfilled, onrejected) =>
    Promise.resolve(result).then(onfulfilled, onrejected);

  const chain: Chain = {
    from: calls('from'),
    innerJoin: calls('innerJoin'),
    where: calls('where'),
    limit: calls('limit'),
    orderBy: calls('orderBy'),
    values: calls('values'),
    set: calls('set'),
    onConflictDoUpdate: calls('onConflictDoUpdate'),
    returning: calls('returning'),
    then,
  };

  return chain;
}

export function createDbMock() {
  const nextResult = () => (dbQueue.length > 0 ? dbQueue.shift() : []);

  const builder = (method: 'select' | 'insert' | 'update' | 'delete') =>
    vi.fn(() => {
      dbCalls.push({ method, args: [] });
      return createChain(nextResult());
    });

  const dbObject = {
    select: builder('select'),
    insert: builder('insert'),
    update: builder('update'),
    delete: builder('delete'),
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
      dbCalls.push({ method: 'transaction', args: [] });
      return cb(dbObject);
    }),
  };

  return dbObject;
}

/** Clears the queue and the call log between tests. */
export function resetDbMock(): void {
  dbQueue.length = 0;
  dbCalls.length = 0;
}
