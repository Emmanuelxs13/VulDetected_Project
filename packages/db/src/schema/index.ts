/**
 * Schema barrel.
 *
 * `drizzle.config.ts` points at THIS file, so every table must be re-exported
 * here or it will not appear in the generated migration. That is the single
 * most common way a Drizzle schema silently drifts from its migrations.
 *
 * The relation graph is re-exported from `./relations` rather than from the table
 * modules. It used to live beside the columns, which created a circular import
 * between `users.ts` and `sessions.ts`/`accounts.ts`; see that file for the full
 * argument. Importing it here keeps the barrel the one place a consumer has to
 * look.
 */

import { accounts } from './accounts';
import { auditLogs } from './audit-logs';
import { domains } from './domains';
import { findings } from './findings';
import { scanEvents } from './scan-events';
import { scans } from './scans';
import { sessions } from './sessions';
import { users } from './users';
import { verificationTokens } from './verification-tokens';

export { accountStatusEnum, citext, scanStatusEnum, severityEnum, tokenPurposeEnum } from './enums';
export type { AccountStatus, ScanStatus, Severity, TokenPurpose } from './enums';

export { users } from './users';
export type { NewUser, User } from './users';

export { sessions, EXPIRED_SESSIONS } from './sessions';
export type { NewSession, SessionRow } from './sessions';

export { accounts, CASCADE_TARGETS } from './accounts';
export type { Account, NewAccount } from './accounts';

export { verificationTokens } from './verification-tokens';
export type { NewVerificationToken, VerificationToken } from './verification-tokens';

export { auditLogs } from './audit-logs';
export type { AuditLog, NewAuditLog } from './audit-logs';

export { domains } from './domains';
export type { Domain, NewDomain } from './domains';

export { scans } from './scans';
export type { NewScan, Scan } from './scans';

export { findings } from './findings';
export type { Finding, NewFinding } from './findings';

export { scanEvents } from './scan-events';
export type { NewScanEvent, ScanEvent } from './scan-events';

export {
  accountsRelations,
  auditLogsRelations,
  domainsRelations,
  findingsRelations,
  scanEventsRelations,
  scansRelations,
  sessionsRelations,
  usersRelations,
} from './relations';

/**
 * The object handed to `drizzle(postgres(url), { schema })` and to the Better
 * Auth adapter's `schema` option. Keys here are Drizzle table objects; the
 * Better Auth mapping lives in `apps/web/src/lib/auth.ts`.
 *
 * Only tables. Relations are not part of Drizzle's runtime schema object — they
 * are registered by the `relations()` calls themselves — and adding them here
 * would make Drizzle treat them as tables it cannot find columns on.
 */
export const schema = {
  users,
  sessions,
  accounts,
  verificationTokens,
  auditLogs,
  domains,
  scans,
  findings,
  scanEvents,
};
