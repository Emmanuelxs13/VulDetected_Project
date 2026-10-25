'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Container, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@vuldetected/ui';
import { toast } from 'sonner';

type VerificationMethod = 'dns' | 'well-known' | 'meta';
type VerificationStatus = 'idle' | 'pending' | 'verified' | 'failed';

export default function NewScanPage() {
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<VerificationMethod>('dns');
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [token, setToken] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const generateToken = () => {
    const newToken = `vuldetected-verification-${Math.random().toString(36).substring(2, 15)}`;
    setToken(newToken);
    setStatus('pending');
    toast.info('Token de verificación generado');
  };

  const verifyDomain = async () => {
    if (!url) {
      toast.error('Ingresa una URL válida');
      return;
    }
    setIsVerifying(true);
    
    // Simulación de verificación
    setTimeout(() => {
      const success = Math.random() > 0.3;
      setStatus(success ? 'verified' : 'failed');
      setIsVerifying(false);
      
      if (success) {
        toast.success('Dominio verificado correctamente');
      } else {
        toast.error('No se pudo verificar el dominio. Revisa los registros e inténtalo de nuevo.');
      }
    }, 1500);
  };

  const startScan = () => {
    if (!url) {
      toast.error('Ingresa una URL válida');
      return;
    }
    if (status !== 'verified') {
      toast.error('Debes verificar la propiedad del dominio primero');
      return;
    }
    
    setIsScanning(true);
    toast.info('Iniciando escaneo...');
    
    setTimeout(() => {
      setIsScanning(false);
      toast.success('Escaneo iniciado. Redirigiendo al progreso...');
      window.location.href = '/scans/active';
    }, 1000);
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'verified':
        return <Badge variant="low">Verificado</Badge>;
      case 'pending':
        return <Badge variant="medium">Pendiente de verificación</Badge>;
      case 'failed':
        return <Badge variant="high">Verificación fallida</Badge>;
      default:
        return <Badge variant="unknown">Sin verificar</Badge>;
    }
  };

  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Nuevo Escaneo</h1>
        <p className="text-text-muted">Inicia un análisis de seguridad automatizado de tu sitio web</p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Configurar Escaneo</CardTitle>
          <CardDescription>Ingresa la URL del sitio web que deseas analizar</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="url" className="text-sm font-medium">
              URL del Sitio Web
            </label>
            <Input 
              id="url" 
              placeholder="https://ejemplo.com" 
              className="text-lg h-12"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-text-muted">Solo URLs públicas con protocolo http o https</p>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Validación de Propiedad del Dominio</h3>
              {getStatusBadge()}
            </div>
            <p className="text-sm text-text-muted mb-4">
              Para escanear dominios, debes demostrar que eres el propietario. Elige uno de los métodos de verificación:
            </p>

            <Tabs value={method} onValueChange={(v) => setMethod(v as VerificationMethod)} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="dns">DNS TXT</TabsTrigger>
                <TabsTrigger value="well-known">Archivo .well-known</TabsTrigger>
                <TabsTrigger value="meta">Meta Tag</TabsTrigger>
              </TabsList>

              <TabsContent value="dns" className="space-y-4 mt-4">
                <div className="rounded bg-surface-raised p-4 space-y-3">
                  <p className="text-sm font-medium">Instrucciones:</p>
                  <ol className="text-sm text-text-muted space-y-2 list-decimal list-inside">
                    <li>Agrega un registro TXT en tu DNS con el siguiente nombre/host: <code className="px-1 py-0.5 bg-surface rounded">@</code> o <code className="px-1 py-0.5 bg-surface rounded">_vuldetected</code></li>
                    <li>Usa el siguiente valor:</li>
                  </ol>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-surface rounded text-xs break-all">{token || 'Genera un token primero'}</code>
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (token) {
                        navigator.clipboard.writeText(token);
                        toast.success('Token copiado');
                      }
                    }} disabled={!token}>Copiar</Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="well-known" className="space-y-4 mt-4">
                <div className="rounded bg-surface-raised p-4 space-y-3">
                  <p className="text-sm font-medium">Instrucciones:</p>
                  <ol className="text-sm text-text-muted space-y-2 list-decimal list-inside">
                    <li>Crea el archivo: <code className="px-1 py-0.5 bg-surface rounded">/.well-known/vuldetected-verification.txt</code></li>
                    <li>Coloca el siguiente contenido en el archivo:</li>
                  </ol>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-surface rounded text-xs break-all">{token || 'Genera un token primero'}</code>
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (token) {
                        navigator.clipboard.writeText(token);
                        toast.success('Token copiado');
                      }
                    }} disabled={!token}>Copiar</Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="meta" className="space-y-4 mt-4">
                <div className="rounded bg-surface-raised p-4 space-y-3">
                  <p className="text-sm font-medium">Instrucciones:</p>
                  <ol className="text-sm text-text-muted space-y-2 list-decimal list-inside">
                    <li>Agrega la siguiente meta tag al <code className="px-1 py-0.5 bg-surface rounded">&lt;head&gt;</code> de tu página:</li>
                  </ol>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-surface rounded text-xs break-all">
                      {token ? `<meta name="vuldetected-verification" content="${token}" />` : 'Genera un token primero'}
                    </code>
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (token) {
                        navigator.clipboard.writeText(`<meta name="vuldetected-verification" content="${token}" />`);
                        toast.success('Meta tag copiado');
                      }
                    }} disabled={!token}>Copiar</Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex gap-2 mt-4">
              <Button variant="secondary" onClick={generateToken} disabled={!url}>
                Generar Token
              </Button>
              <Button 
                variant="primary" 
                onClick={verifyDomain} 
                disabled={!token || isVerifying || status === 'verified'}
              >
                {isVerifying ? 'Verificando...' : status === 'verified' ? 'Verificado' : 'Verificar Dominio'}
              </Button>
            </div>
          </div>

          <Button 
            variant="primary" 
            size="lg" 
            className="w-full"
            onClick={startScan}
            disabled={status !== 'verified' || isScanning}
          >
            {isScanning ? 'Iniciando...' : 'Iniciar Escaneo'}
          </Button>
        </CardContent>
      </Card>
    </Container>
  );
}
