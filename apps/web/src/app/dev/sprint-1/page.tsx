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
import { getTranslations } from 'next-intl/server';

import { getServerSession } from '@/features/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dev');

  return { title: t('metadataTitle') };
}

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
 *
 * ## THE RATE-LIMIT ALERT IS GONE ON PURPOSE
 *
 * The dictionary still says there is "no rate limiting at the edge yet", but
 * `app/api/auth/[...all]/route.ts` enforces 30 requests per 15 minutes per IP
 * through `consumeRateLimit`. That copy is false, and there is no accurate
 * dictionary key to replace it with, so the stale warning was removed rather
 * than re-rendered. See the change report for the missing key.
 */
export default async function SprintOneDevPage() {
  const t = await getTranslations('dev');
  const session = await getServerSession();
  const user = session?.user;

  return (
    <Container size="default" className="flex flex-col gap-6 py-12">
      <div className="flex flex-col gap-2">
        <Badge variant="info">{t('badge')}</Badge>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-prose text-sm text-text-muted">{t('intro')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('live.title')}</CardTitle>
          <CardDescription>{t('live.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.fact')}</TableHead>
                <TableHead>{t('table.value')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Fact
                label={t('facts.session')}
                value={user ? t('values.present') : t('values.none')}
              />
              <Fact label={t('facts.userId')} value={user?.id ?? null} mono />
              <Fact label={t('facts.email')} value={user?.email ?? null} />
              <Fact
                label={t('facts.emailVerified')}
                value={user?.emailVerified ? t('values.yes') : t('values.no')}
              />
              <Fact label={t('facts.accountStatus')} value={user?.status ?? null} />
              <Fact label={t('facts.locale')} value={user?.locale ?? null} />
              {/* `getSession` returns `{ session, user }`, not a flattened row. */}
              <Fact
                label={t('facts.sessionExpires')}
                value={iso(session?.session.expiresAt)}
                mono
              />
              <Fact
                label={t('facts.sessionCreated')}
                value={iso(session?.session.createdAt)}
                mono
              />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('declared.title')}</CardTitle>
          <CardDescription>{t('declared.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.control')}</TableHead>
                <TableHead>{t('table.value')}</TableHead>
                <TableHead>{t('table.where')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <FactWithSource
                label={t('controls.passwordHashing')}
                value={t('controls.passwordHashingValue')}
                source="lib/password.ts"
              />
              <FactWithSource
                label={t('controls.minPasswordLength')}
                value={t('controls.minPasswordLengthValue')}
                source="features/auth/schema.ts"
              />
              <FactWithSource
                label={t('controls.sessionTtl')}
                value={t('controls.sessionTtlValue')}
                source="lib/auth.ts"
              />
              <FactWithSource
                label={t('controls.sessionCookie')}
                value={t('controls.sessionCookieValue')}
                source="lib/auth.ts"
              />
              <FactWithSource
                label={t('controls.failedLoginLadder')}
                value={t('controls.failedLoginLadderValue')}
                source="features/auth/actions.ts"
              />
              <FactWithSource
                label={t('controls.emailVerification')}
                value={t('controls.emailVerificationValue')}
                source="lib/auth.ts"
              />
              <FactWithSource
                label={t('controls.auditLog')}
                value={t('controls.auditLogValue')}
                source="packages/db/drizzle/0002"
              />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/*
        The finding that is NOT resolved, stated on the page itself. A status
        page that only lists successes is a marketing page; the open item is the
        useful part for whoever picks this up.
      */}
      <Alert
        variant="warning"
        title={t('alerts.plaintext.title')}
        description={t('alerts.plaintext.description')}
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
