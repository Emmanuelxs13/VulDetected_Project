import { Button, Card, CardContent, Container } from '@vuldetected/ui';

export default function ActiveScansPage() {
  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Escaneos en Curso</h1>
        <p className="text-text-muted">Monitoreo en tiempo real de tus análisis</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-text-muted">No hay escaneos en curso</p>
          <Button asChild className="mt-4" variant="primary">
            <a href="/scanner/new">Iniciar nuevo escaneo</a>
          </Button>
        </CardContent>
      </Card>
    </Container>
  );
}
