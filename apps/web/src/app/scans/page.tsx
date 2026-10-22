import type { Metadata } from 'next';
import { desc, domains, eq, scans } from '@vuldetected/db';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vuldetected/ui';
import Link from 'next/link';

import { getServerSession } from '@/features/auth/session';
import { NewScanForm } from '@/features/scans/components/new-scan-form';
import { ScanStatusBadge } from '@/features/scans/components/scan-status';
import type { ScanStatus } from '@/features/scans/components/scan-status';
import { db } from '@/lib/db';

export const metadata: Metadata = { title: 'Escaneos' };

/**
 * Scans list and the entry point of the ownership flow.
 *
 * ## WHY THIS PAGE IS A SERVER COMPONENT
 *
 * The list and the set of already verified domains are database reads, and
 * there is no reason to ship them to the browser and fetch them again from
 * there. The server renders the truth; the only interactive part is the form,
 * which is a small client island.
 *
 * ## WHY THE SESSION IS NOT ENOUGH
 *
 * The pages under `/scans` are protected by the session AND by the ownership
 * guard inside the submit path. The session says "this is your account"; the
 * guard says "you proved you control this domain". Only the second one
 * authorises a scan (DO-1, SS-3).
 */
export default async function ScansPage() {
  const session = await getServerSession();

  if (!session?.user) {
    return (
      <Container size="narrow" className="py-12">
        <EmptyState
          title="Sesión no activa"
          description="Inicia sesión para ver tus escaneos y crear nuevos."
        />
      </Container>
    );
  }

  const userId = session.user.id;

  const [verifiedDomains, scanRows] = await Promise.all([
    db()
      .select({ hostname: domains.normalizedHostname })
      .from(domains)
      .where(eq(domains.userId, userId))
      .orderBy(desc(domains.createdAt)),
    db()
      .select({
        id: scans.id,
        targetUrl: scans.targetUrl,
        status: scans.status,
        createdAt: scans.createdAt,
        hostname: domains.normalizedHostname,
      })
      .from(scans)
      .innerJoin(domains, eq(scans.domainId, domains.id))
      .where(eq(domains.userId, userId))
      .orderBy(desc(scans.createdAt))
      .limit(50),
  ]);

  return (
    <Container size="default" className="flex flex-col gap-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Escaneos</h1>
        <p className="max-w-prose text-sm text-text-muted">
          Para escanear un dominio primero debes demostrar que lo controlas: solicitas un reto,
          publicas la prueba y verificas la propiedad. Solo después puedes encolar un escaneo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo escaneo</CardTitle>
          <CardDescription>
            Verificación de propiedad y envío del objetivo, en ese orden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewScanForm verifiedHosts={verifiedDomains.map((domain) => domain.hostname)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tus escaneos</CardTitle>
          <CardDescription>
            Los últimos 50 escaneos de los dominios que has verificado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scanRows.length === 0 ? (
            <EmptyState
              title="Todavía no hay escaneos"
              description="En el formulario de arriba puedes verificar un dominio y encolar tu primer escaneo."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Objetivo</TableHead>
                  <TableHead>Dominio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead>
                    <span className="sr-only">Detalle</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scanRows.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell>
                      <span className="font-mono text-xs">{scan.targetUrl}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{scan.hostname}</span>
                    </TableCell>
                    <TableCell>
                      <ScanStatusBadge status={scan.status as ScanStatus} />
                    </TableCell>
                    <TableCell>
                      <time
                        className="tabular text-xs text-text-muted"
                        dateTime={scan.createdAt.toISOString()}
                      >
                        {scan.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                      </time>
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/scans/${scan.id}`}>Ver detalle</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
