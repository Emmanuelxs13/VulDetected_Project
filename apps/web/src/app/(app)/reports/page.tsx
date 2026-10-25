'use client';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Container, Badge } from '@vuldetected/ui';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'Alta', count: 3, fill: 'var(--color-critical)' },
  { name: 'Media', count: 5, fill: 'var(--color-medium)' },
  { name: 'Baja', count: 8, fill: 'var(--color-low)' },
];

export default function ReportsPage() {
  const generatePDF = () => {
    toast.info('Generando reporte PDF...');
    setTimeout(() => {
      toast.success('Reporte PDF generado y descargado');
    }, 1500);
  };

  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Informes</h1>
        <p className="text-text-muted">Reportes ejecutivos y técnicos</p>
      </div>

      <Card className="border-critical/50 bg-critical-tint">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>⚠️</span> Estado Global: Riesgo Crítico
          </CardTitle>
          <CardDescription>Banner semáforo ineludible - Acción inmediata requerida</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <Badge variant="high">Alta: 3</Badge>
            <Badge variant="medium">Media: 5</Badge>
            <Badge variant="low">Baja: 8</Badge>
          </div>
          <Button variant="primary" onClick={generatePDF}>Descargar Reporte Ejecutivo (PDF)</Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Desglose por Severidad</CardTitle>
            <CardDescription>Distribución de hallazgos</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-text-muted)" />
                <YAxis stroke="var(--color-text-muted)" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--color-surface-raised)', 
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumen Ejecutivo</CardTitle>
            <CardDescription>Para dirección y stakeholders</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Hallazgos Principales</h4>
              <ul className="space-y-2 text-sm text-text-muted">
                <li>• Cross-Site Scripting (XSS) - 3 instancias</li>
                <li>• Cabeceras de seguridad faltantes - 1 instancia</li>
                <li>• Otras configuraciones - 12 instancias</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Recomendación</h4>
              <p className="text-sm text-text-muted">
                Se requiere atención inmediata a las vulnerabilidades de severidad alta. 
                Se recomienda implementar las correcciones según las guías de remediación.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial Comparativo</CardTitle>
          <CardDescription>Compara escaneos anteriores</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-muted">No hay escaneos anteriores para comparar</p>
        </CardContent>
      </Card>
    </Container>
  );
}
