import { NextResponse } from 'next/server';

/**
 * Liveness probe.
 *
 * ## WHY THIS TOUCHES NOTHING
 *
 * A liveness probe answers exactly one question: *is this process alive?* If it
 * also checked the database, an outage of the database would make the platform
 * kill and restart every application container — restarting healthy processes
 * that cannot fix a dependency they do not own, and turning a degraded read
 * path into a restart loop.
 *
 * Readiness (`/api/ready`) is the probe that looks at dependencies, and it is
 * the one a load balancer should use to decide whether to send traffic.
 *
 * ## WHY IT LIVES UNDER `/api`
 *
 * The middleware matcher excludes `/api` and protects everything else. A probe
 * outside that prefix would be redirected to `/login` for the exact audience
 * that has no cookie: the orchestrator.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'vuldetected-web',
      // Seconds since the process started. A number that keeps growing is the
      // cheapest proof that this response came from a live process and not from
      // a cached file.
      uptimeSeconds: Math.round(process.uptime()),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
