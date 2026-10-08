import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
} from '@vuldetected/ui';
import Link from 'next/link';

import { getServerSession } from '@/features/auth/session';

/**
 * Landing page.
 *
 * ## THE HONEST VERSION
 *
 * This page lists what actually works. Sprint 1 shipped the data layer and
 * authentication — no scanning, no findings, no integrations. A landing page that
 * implies otherwise is not marketing, it is a false capability claim to anyone
 * evaluating the project, and it makes the empty dashboard look broken rather than
 * early.
 *
 * So the feature list is real, and the not-real part is stated plainly.
 */
export default async function HomePage() {
  const session = await getServerSession();

  return (
    <Container size="narrow" className="flex flex-col gap-8 py-12">
      <section className="flex flex-col gap-4">
        <Badge variant="neutral">Sprint 1 · data layer and authentication</Badge>

        <h1 className="text-3xl font-semibold tracking-tight">
          Vulnerability intelligence for the stacks you actually ship.
        </h1>

        <p className="max-w-prose text-sm leading-6 text-text-muted">
          VulDetected scans a target, normalises what it finds, and tells you which vulnerabilities
          are real for your stack. This repository is at the foundation: the provider-neutral
          PostgreSQL schema, the append-only audit trail, and authentication built on argon2id.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {session?.user ? (
            <Button asChild variant="primary">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="primary">
                <Link href="/register">Create an account</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/login">Sign in</Link>
              </Button>
            </>
          )}
          <Button asChild variant="ghost">
            <Link href="/dev/sprint-1">See what works</Link>
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>What works today</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm text-text-muted">
            <Worked item="PostgreSQL schema with five tables and generated migrations" />
            <Worked item="Email-and-password registration, sign-in and sign-out" />
            <Worked item="Passwords hashed with argon2id at OWASP minimum parameters" />
            <Worked item="Append-only audit log, enforced by a database trigger" />
            <Worked item="Progressive account lockout and user-enumeration-safe errors" />
          </ul>
        </CardContent>
      </Card>

      <Alert
        variant="info"
        title="Not built yet"
        description="Target scanning, CVE correlation, findings, and integrations are later sprints. The dashboard is empty by design, not because something failed."
      />

      {/*
        The `/dev/sprint-1` page is the answer to "how do I verify this works?"
        without a seeded database or a terminal full of curl commands.
      */}
      {!session?.user ? (
        <EmptyState
          title="Sign in to see your account"
          description="The dashboard reads the session on the server, so an unauthenticated request never reaches protected content."
          action={
            <Button asChild variant="primary" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          }
        />
      ) : null}
    </Container>
  );
}

function Worked({ item }: { item: string }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-low" />
      {item}
    </li>
  );
}
