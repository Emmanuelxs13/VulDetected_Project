import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Container } from '@vuldetected/ui';

export default function SchedulesPage() {
  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Programación y Alertas</h1>
        <p className="text-text-muted">Configura escaneos periódicos y alertas por correo</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Escaneos Programados</CardTitle>
          <CardDescription>Próximamente - Requiere configuración</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="primary" disabled>Crear Programación</Button>
        </CardContent>
      </Card>
    </Container>
  );
}
