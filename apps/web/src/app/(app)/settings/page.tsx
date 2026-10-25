import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Container } from '@vuldetected/ui';

export default function SettingsPage() {
  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-text-muted">Perfil, dominios, integraciones</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
            <CardDescription>Información de tu cuenta</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary">Editar Perfil</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dominios Verificados</CardTitle>
            <CardDescription>Gestiona tus dominios</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="primary">Agregar Dominio</Button>
          </CardContent>
        </Card>
      </div>
    </Container>
  );
}
