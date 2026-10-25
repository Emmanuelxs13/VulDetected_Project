import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Container } from '@vuldetected/ui';
import Link from 'next/link';
import { getServerSession } from '@/features/auth/session';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Panel</h1>
        <p className="text-text-muted">Resumen de seguridad de tus dominios</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Escaneos Totales</CardTitle>
            <span className="text-muted-foreground">🔍</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-text-muted">+0 desde el mes pasado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hallazgos Críticos</CardTitle>
            <span className="text-muted-foreground">⚠️</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-critical">0</div>
            <p className="text-xs text-text-muted">Sin hallazgos críticos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dominios</CardTitle>
            <span className="text-muted-foreground">🌐</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-text-muted">Dominios verificados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estado General</CardTitle>
            <span className="text-muted-foreground">🛡️</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-low">Seguro</div>
            <p className="text-xs text-text-muted">Sin riesgos activos</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actividad Reciente</CardTitle>
          <CardDescription>Últimos escaneos y hallazgos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-text-muted">No hay actividad reciente</p>
            <Button asChild className="mt-4" variant="primary">
              <Link href="/scanner/new">Iniciar primer escaneo</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </Container>
  );
}
