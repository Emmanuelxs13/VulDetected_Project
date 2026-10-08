import { relations } from 'drizzle-orm';

import { accounts } from './accounts';
import { auditLogs } from './audit-logs';
import { sessions } from './sessions';
import { users } from './users';

/**
 * Relation graph, in ONE module on purpose.
 *
 * The tables used to declare their own `relations()` next to their columns, which
 * forced a circular import: `users.ts` needed `sessions` to say "one user has many
 * sessions", and `sessions.ts` needed `users` for its foreign key. ES modules
 * handle cycles by returning a partially-initialised module, so `relations(users, …)`
 * would capture an `undefined` table at evaluation time and Drizzle would either
 * throw at import or — worse — build a relation graph with a hole in it.
 *
 * Direction of the dependency is now strictly one-way:
 *
 * ```
 *   accounts ─┐
 *   sessions ─┤
 *   users ────┼──▶ relations.ts   (imports the tables, declares the graph)
 *   auditLogs ┘
 * ```
 *
 * A table module never imports another table module for relation purposes. The
 * `references(() => users.id)` callbacks inside the tables are safe because they
 * are lazy — evaluated when Drizzle builds the schema, long after every module has
 * finished initialising.
 *
 * `verification_tokens` is ABSENT, and that is not an oversight. It has no
 * `user_id` column on purpose: a verification token is addressed to an
 * `identifier` and very often exists before the user row it will produce, so a
 * FK would invite resolving tokens by user id instead of by the value that was
 * actually emailed. The full argument is in `verification-tokens.ts`.
 */
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  auditLogs: many(auditLogs),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));
