import type { Metadata } from 'next';
import { Container, Tabs, TabsContent, TabsList, TabsTrigger } from '@vuldetected/ui';
import { getTranslations } from 'next-intl/server';
import { and, desc, domains, eq } from '@vuldetected/db';

import { getServerSession } from '@/features/auth/session';
import { NewScanForm } from '@/features/scans/components/new-scan-form';
import { db } from '@/lib/db';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('scan');
  return { title: t('list.newScan.title') };
}

export default async function ScannerPage() {
  const session = await getServerSession();
  
  if (!session?.user) {
    return null;
  }

  const verifiedDomains = await db()
    .select({ id: domains.id, hostname: domains.normalizedHostname })
    .from(domains)
    .where(and(eq(domains.userId, session.user.id), eq(domains.verified, true)))
    .orderBy(desc(domains.createdAt));

  return (
    <Container size="default" className="flex flex-col gap-6 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Escáner</h1>
        <p className="max-w-prose text-sm text-text-muted">
          Ejecuta escaneos por URL, archivo o búsqueda
        </p>
      </div>

      <Tabs defaultValue="url" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="url">URL</TabsTrigger>
          <TabsTrigger value="file">Archivo</TabsTrigger>
          <TabsTrigger value="search">Buscar</TabsTrigger>
        </TabsList>
        <TabsContent value="url" className="mt-4">
          <NewScanForm verifiedHosts={verifiedDomains.map((d) => d.hostname)} />
        </TabsContent>
        <TabsContent value="file" className="mt-4">
          <div className="rounded-lg border border-border bg-surface p-6 text-center text-text-muted">
            Análisis de archivos próximo a implementar
          </div>
        </TabsContent>
        <TabsContent value="search" className="mt-4">
          <div className="rounded-lg border border-border bg-surface p-6 text-center text-text-muted">
            Búsqueda de activos próximo a implementar
          </div>
        </TabsContent>
      </Tabs>
    </Container>
  );
}
