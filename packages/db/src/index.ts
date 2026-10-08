/**
 * `@vuldetected/db` — the single data layer for VulDetected.
 *
 * Apps import from here. Nothing in this package knows a hostname, a socket
 * path, or a provider name (ADR 0004).
 */

export { bindDb, createDb, createPool } from './client';
export type { CreateDbOptions, VulDetectedDb } from './client';

export { closeDb, createDbFrom, getDb, getDbClient } from './singleton';

export {
  accountStatusEnum,
  accounts,
  accountsRelations,
  auditLogs,
  auditLogsRelations,
  schema,
  sessions,
  sessionsRelations,
  tokenPurposeEnum,
  users,
  usersRelations,
  verificationTokens,
  citext,
  CASCADE_TARGETS,
  EXPIRED_SESSIONS,
} from './schema';

export type {
  Account,
  AccountStatus,
  AuditLog,
  NewAccount,
  NewAuditLog,
  NewSession,
  NewUser,
  NewVerificationToken,
  SessionRow,
  TokenPurpose,
  User,
  VerificationToken,
} from './schema';

// Re-exported so callers do not need a direct `drizzle-orm` dependency for the
// query-builder types they actually annotate with.
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
export type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
