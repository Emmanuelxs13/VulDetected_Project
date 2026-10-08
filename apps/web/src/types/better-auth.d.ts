/**
 * Better Auth type augmentation for VulDetected's custom `users` columns.
 *
 * ## WHY THIS FILE IS NECESSARY
 *
 * `user.additionalFields` in `lib/auth.ts` declares five extra fields at
 * runtime, but TypeScript cannot infer them onto `session.user` from an
 * `additionalFields` object: the inference is threaded through
 * `InferDBFieldsFromOptions<DBOptions>`, and that path collapses when the
 * instance is held behind a memoised factory (which it must be — see the lazy
 * construction note in `lib/auth.ts`). The result is that `user.status` and
 * `user.locale` fail to compile even though they are always present at runtime.
 *
 * Declaring them on Better Auth's own `User` interface fixes it at the source:
 * one declaration, and every `session.user` in the app is typed correctly,
 * including the ones the library produces internally.
 *
 * ## THE COST, STATED PLAINLY
 *
 * Module augmentation is a global, ambient change. It says "`user.status` is
 * `AccountStatus | undefined`" everywhere, including in code that has nothing to
 * do with this configuration. That is only safe because the database column and
 * the declaration here are maintained together — the column is NOT NULL with a
 * default, so the `undefined` in the type is a concession to Better Auth's own
 * `User` shape, not a statement that the value can be absent.
 *
 * A local cast on each read site would avoid the global change, at the cost of a
 * type assertion in every component. For five fields that are part of the
 * product's vocabulary, one honest declaration is the better trade.
 */
declare module 'better-auth' {
  interface User {
    /**
     * Account lifecycle state. Maps to `users.status` (`account_status` enum,
     * NOT NULL, default `'active'`).
     */
    status?: 'pending' | 'active' | 'suspended' | 'deleted';

    /** UI language. Maps to `users.locale`, NOT NULL, default `'es'`. */
    locale?: string;

    /**
     * Consecutive failed logins. NOT NULL, default 0.
     *
     * Declared but deliberately absent from the API response: `lib/auth.ts` sets
     * `returned: false` on it so internal throttling state never reaches a
     * client. It is declared here because server-side code reads it from the
     * database directly, where it is always present.
     */
    failedLoginCount?: number;

    /** While `now() < lockedUntil`, password login is refused. */
    lockedUntil?: Date | null;

    /** Soft-deletion instant. Never physically removed; `status` carries the truth. */
    deletedAt?: Date | null;
  }
}

export {};
