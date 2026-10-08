import type { Metadata } from 'next';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vuldetected/ui';

import { getServerSession } from '@/features/auth/session';

export const metadata: Metadata = { title: 'Sprint 1 status' };

/**
 * `/dev/sprint-1` — the verification surface.
 *
 * ## WHY THIS PAGE EXISTS
 *
 * Proving the auth stack works otherwise means a terminal, `curl`, a cookie jar,
 * and hand-inspecting a session row. This page reports the same facts from inside
 * the app, so the claims in the changelog can be checked by looking at a screen.
 *
 * Two sections, deliberately asymmetric:
 *
 *   - **Live** — session and account facts, read from the database on this
 *     request. If the row says something, the row really says it.
 *   - **Declared** — constants this codebase commits to (cookie flags, argon2id
 *     parameters, TTLs). These are *intentions*. A configuration can drift between
 *     the code and what is actually in effect, and printing a constant from a table
 *     would look like a verification while being a copy of a literal.
 *
 * Labelling which is which is the whole point of the page.
 */
export default async function SprintOneDevPage() {
  const session = await getServerSession();
  const user = session?.user;

  return (
    <Container size="default" className="flex flex-col gap-6 py-12">
      <div className="flex flex-col gap-2">
        <Badge variant="info">Sprint 1</Badge>
        <h1 className="text-2xl font-semibold tracking-tight">What this build does</h1>
        <p className="max-w-prose text-sm text-text-muted">
          Live rows below are read from PostgreSQL during this request. Declared values are
          configuration this codebase commits to.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live — read from the database</CardTitle>
          <CardDescription>
            Empty values mean no session, which is the expected state for a visitor who has not
            signed in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fact</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Fact label="Session" value={user ? 'present' : 'none'} />
              <Fact label="User ID" value={user?.id ?? null} mono />
              <Fact label="Email" value={user?.email ?? null} />
              <Fact label="Email verified" value={user?.emailVerified ? 'yes' : 'no'} />
              <Fact label="Account status" value={user?.status ?? null} />
              <Fact label="Locale" value={user?.locale ?? null} />
              {/* `getSession` returns `{ session, user }`, not a flattened row. */}
              <Fact label="Session expires" value={iso(session?.session.expiresAt)} mono />
              <Fact label="Session created" value={iso(session?.session.createdAt)} mono />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Declared — configuration, not verified state</CardTitle>
          <CardDescription>
            Values below are literals from the source. They state intent; they do not read the live
            cookie or the live environment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Control</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Where</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <FactWithSource
                label="Password hashing"
                value="argon2id · 19 MiB · 2 iterations · parallelism 1"
                source="lib/password.ts"
              />
              <FactWithSource
                label="Minimum password length"
                value="12 characters, no composition rules"
                source="features/auth/schema.ts"
              />
              <FactWithSource label="Session TTL" value="7 days, absolute" source="lib/auth.ts" />
              <FactWithSource
                label="Session cookie"
                value="HttpOnly · SameSite=Lax · Secure off only for http"
                source="lib/auth.ts"
              />
              <FactWithSource
                label="Failed-login ladder"
                value="5 → 1 min · 8 → 15 min · 11+ → 60 min"
                source="features/auth/actions.ts"
              />
              <FactWithSource
                label="Email verification required"
                value="no (open product question)"
                source="lib/auth.ts"
              />
              <FactWithSource
                label="Audit log"
                value="append-only via BEFORE UPDATE/DELETE trigger"
                source="packages/db/drizzle/0002"
              />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/*
        The two findings that are NOT resolved, stated on the page itself. A status
        page that only lists successes is a marketing page; the open items are the
        useful part for whoever picks this up.
      */}
      <Alert
        variant="warning"
        title="Session and verification tokens are stored in plaintext"
        description="Better Auth derives the session cookie from the token it reads back from the database, so hashing at rest would put the digest in the cookie. Documented as Open in docs/security.md; the mitigations are a 7-day absolute expiry, real revocation, and account-state hooks."
      />

      <Alert
        variant="info"
        title="No rate limiting at the edge yet"
        description="Per-account lockout exists, but there is no IP-level limiter in front of the auth route. Server-side throttling is a Sprint 2 item and is required before this is exposed publicly."
      />
    </Container>
  );
}

function iso(value: Date | string | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function Fact({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className={mono ? 'font-mono text-xs' : 'text-sm'}>
        {value ?? <span className="text-text-subtle">—</span>}
      </TableCell>
    </TableRow>
  );
}

function FactWithSource({
  label,
  value,
  source,
}: {
  label: string;
  value: string;
  source: string;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className="text-sm">{value}</TableCell>
      <TableCell className="font-mono text-xs text-text-muted">{source}</TableCell>
    </TableRow>
  );
}
