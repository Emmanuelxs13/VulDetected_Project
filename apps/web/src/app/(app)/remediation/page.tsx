'use client';

import { useState } from 'react';
import { Button, Card, CardContent, Container } from '@vuldetected/ui';
import { toast } from 'sonner';

const guides = [
  {
    id: 'xss',
    title: 'Cross-Site Scripting (XSS)',
    category: 'Injection',
    description: 'XSS permite a atacantes inyectar scripts maliciosos en páginas web vistas por otros usuarios.',
    prevention: [
      'Escapar siempre la salida de datos del usuario',
      'Usar Content-Security-Policy (CSP)',
      'Validar y sanitizar entradas',
      'Usar frameworks con protección XSS integrada',
    ],
    codeExamples: {
      javascript: `// Mal - vulnerable
element.innerHTML = userInput;

// Bien - seguro
element.textContent = userInput;
// o usar DOMPurify
element.innerHTML = DOMPurify.sanitize(userInput);`,
      php: `// Mal - vulnerable
echo $_GET['search'];

// Bien - seguro
echo htmlspecialchars($_GET['search'], ENT_QUOTES, 'UTF-8');`,
      python: `# Mal - vulnerable
return f"<div>{user_input}</div>"

# Bien - seguro
from markupsafe import escape
return f"<div>{escape(user_input)}</div>"`,
    },
  },
  {
    id: 'sql-injection',
    title: 'Inyección SQL',
    category: 'Injection',
    description: 'Los atacantes pueden manipular consultas SQL para acceder, modificar o eliminar datos.',
    prevention: [
      'Usar consultas parametrizadas (prepared statements)',
      'Usar ORM con protección integrada',
      'Validar y sanitizar entradas',
      'Aplicar principio de menor privilegio',
    ],
    codeExamples: {
      javascript: `// Mal - vulnerable
db.query(\`SELECT * FROM users WHERE id = \${userId}\`);

// Bien - seguro con prepared statements
db.query('SELECT * FROM users WHERE id = ?', [userId]);`,
      php: `// Mal - vulnerable
mysqli_query($conn, "SELECT * FROM users WHERE id = $id");

// Bien - seguro
$stmt = $conn->prepare("SELECT * FROM users WHERE id = ?");
$stmt->bind_param("i", $id);
$stmt->execute();`,
      python: `# Mal - vulnerable
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")

# Bien - seguro
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))`,
    },
  },
];

export default function RemediationPage() {
  const [activeGuide, setActiveGuide] = useState(guides[0]);
  const [framework, setFramework] = useState('javascript');

  const copyCode = () => {
    const examples = activeGuide?.codeExamples as Record<string, string> | undefined;
    const code = examples?.[framework] || '';
    navigator.clipboard.writeText(code);
    toast.success('Código copiado al portapapeles');
  };

  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Guías de Remediación</h1>
        <p className="text-text-muted">Documentación técnica con código de corrección listo para copiar</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardContent className="pt-6">
            <nav className="space-y-2">
              <div className="text-sm font-medium mb-3">Categorías</div>
              {guides.map((guide) => (
                <button
                  key={guide.id}
                  onClick={() => setActiveGuide(guide)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    activeGuide?.id === guide.id 
                      ? 'bg-brand/10 text-brand font-medium' 
                      : 'text-text-muted hover:text-text hover:bg-surface'
                  }`}
                >
                  {guide.title}
                </button>
              ))}
            </nav>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6 space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-2">{activeGuide?.title || ''}</h2>
              <p className="text-text-muted">{activeGuide?.description || ''}</p>
            </div>

            <section>
              <h3 className="font-medium mb-3 text-lg">¿Qué es?</h3>
              <p className="text-text-muted">{activeGuide?.description || ''}</p>
            </section>

            <section>
              <h3 className="font-medium mb-3 text-lg">Medidas de Prevención</h3>
              <ul className="space-y-2">
                {(activeGuide?.prevention || []).map((item: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-text-muted">
                    <span className="text-brand mt-1">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-lg">Cómo corregirlo</h3>
                <select 
                  value={framework} 
                  onChange={(e) => setFramework(e.target.value)}
                  className="w-[150px] px-3 py-2 bg-surface border border-border rounded-md text-sm"
                >
                  <option value="javascript">JavaScript</option>
                  <option value="php">PHP</option>
                  <option value="python">Python</option>
                </select>
              </div>
              <div className="rounded-lg bg-surface p-4 relative">
                <pre className="overflow-x-auto text-sm">
                  <code className="text-text">
                    {((activeGuide?.codeExamples as Record<string, string>)?.[framework]) || ''}
                  </code>
                </pre>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="absolute top-2 right-2"
                  onClick={copyCode}
                >
                  Copiar
                </Button>
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
    </Container>
  );
}
