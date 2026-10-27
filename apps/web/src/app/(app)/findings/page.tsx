'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardContent, Container } from '@vuldetected/ui';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@vuldetected/ui';
import { toast } from 'sonner';

type FindingStatus = 'open' | 'resolved' | 'false-positive';

const initialFindings = [
  {
    id: 1,
    severity: 'high' as const,
    title: 'Cross-Site Scripting (XSS) Reflejado',
    description: 'Se detectó una vulnerabilidad de XSS reflejado en el parámetro de búsqueda. Un atacante puede inyectar código JavaScript malicioso.',
    location: 'https://ejemplo.com/search?q=',
    evidence: "<script>alert('XSS')</script>",
    status: 'open' as FindingStatus,
    owasp: 'A03: Injection',
  },
  {
    id: 2,
    severity: 'medium' as const,
    title: 'Cabeceras de Seguridad Faltantes',
    description: 'Faltan cabeceras importantes como Content-Security-Policy, X-Frame-Options o Strict-Transport-Security.',
    location: 'https://ejemplo.com/',
    evidence: 'Headers ausentes: CSP, X-Frame-Options',
    status: 'open' as FindingStatus,
    owasp: 'A05: Security Misconfiguration',
  },
];

export default function FindingsPage() {
  const [findings, setFindings] = useState(initialFindings);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const updateStatus = (id: number, newStatus: FindingStatus) => {
    setFindings(prev => prev.map(f => f.id === id ? { ...f, status: newStatus } : f));
    if (newStatus === 'resolved') {
      toast.success('Hallazgo marcado como resuelto');
    } else if (newStatus === 'false-positive') {
      toast.info('Hallazgo marcado como falso positivo');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado al portapapeles');
  };

  const filteredFindings = findings.filter((f) => {
    const finding = f as { severity: string; status: string };
    if (severityFilter !== 'all' && finding.severity !== severityFilter) return false;
    if (statusFilter !== 'all' && finding.status !== statusFilter) return false;
    return true;
  });

  const counts = {
    total: findings.length,
    open: findings.filter(f => f.status === 'open').length,
    high: findings.filter(f => f.severity === 'high').length,
  };

  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Hallazgos / Vulnerabilidades</h1>
        <p className="text-text-muted">Listado con filtros y gestión de estados</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{counts.total}</div>
            <p className="text-sm text-text-muted">Total de hallazgos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-critical">{counts.high}</div>
            <p className="text-sm text-text-muted">Críticos/Altos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-medium">{counts.open}</div>
            <p className="text-sm text-text-muted">Abiertos</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <select 
              value={severityFilter} 
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full sm:w-[200px] px-3 py-2 bg-surface border border-border rounded-md text-sm"
            >
              <option value="all">Todas las severidades</option>
              <option value="critical">Crítica</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-[200px] px-3 py-2 bg-surface border border-border rounded-md text-sm"
            >
              <option value="all">Todos los estados</option>
              <option value="open">Abierto</option>
              <option value="resolved">Resuelto</option>
              <option value="false-positive">Falso Positivo</option>
            </select>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {filteredFindings.map((finding) => {
              const f = finding as { id: number; severity: string; title: string; status: string; owasp: string; location: string; description: string; evidence: string };
              return (
                <AccordionItem key={f.id} value={`item-${f.id}`}>
                  <AccordionTrigger>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant={f.severity === 'high' ? 'high' : f.severity === 'medium' ? 'medium' : f.severity === 'critical' ? 'critical' : f.severity === 'low' ? 'low' : 'unknown'}>{f.severity === 'high' ? 'Alta' : f.severity === 'medium' ? 'Media' : f.severity === 'critical' ? 'Crítica' : f.severity === 'low' ? 'Baja' : 'Desconocido'}</Badge>
                      <span className="text-left">{f.title}</span>
                      {f.status === 'resolved' && <Badge variant="low">Resuelto</Badge>}
                      {f.status === 'false-positive' && <Badge variant="unknown">Falso Positivo</Badge>}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      <div className="grid gap-2 text-sm">
                        <div><span className="font-medium">OWASP:</span> <span className="text-text-muted">{f.owasp}</span></div>
                        <div><span className="font-medium">Ubicación:</span> <span className="text-text-muted">{f.location}</span></div>
                      </div>
                      <p className="text-text-muted">{f.description}</p>
                      <div>
                        <p className="text-sm font-medium mb-2">Evidencia:</p>
                        <div className="rounded bg-surface p-3 font-mono text-xs overflow-x-auto"><code>{f.evidence}</code></div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {f.status === 'open' && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => updateStatus(f.id, 'resolved')}>Marcar como Resuelto</Button>
                            <Button size="sm" variant="ghost" onClick={() => updateStatus(f.id, 'false-positive')}>Falso Positivo</Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => copyToClipboard(f.evidence)}>Copiar Evidencia</Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>
    </Container>
  );
}
