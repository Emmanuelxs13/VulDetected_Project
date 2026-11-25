export const landingContent = {
  navbar: {
    logo: 'VulDetected',
    links: [
      { href: '#como-funciona', label: 'Cómo funciona' },
      { href: '#beneficios', label: 'Beneficios' },
      { href: '#funcionalidades', label: 'Funcionalidades' },
      { href: '#planes', label: 'Planes' },
      { href: '#preguntas', label: 'Preguntas' },
      { href: '#equipo', label: 'Equipo' },
    ],
    login: 'Iniciar sesión',
    cta: 'Escanear gratis',
  },
  hero: {
    h1: 'Encuentra y corrige las vulnerabilidades de tu sitio web en menos de 24 horas.',
    subtitle: 'VulDetected audita tu aplicación, detecta los fallos del OWASP Top 10 y te dice exactamente cómo solucionarlos, con código listo para copiar. Sin ser experto en ciberseguridad.',
    ctaPrimary: 'Escanear mi sitio',
    ctaSecondary: 'Ver cómo funciona',
    microtext: 'Sin instalar nada · Resultados en pantalla · Reporte PDF para tu equipo',
  },
  problem: {
    title: 'La seguridad web no debería ser solo para expertos.',
    points: [
      'Los ataques automatizados crecen cada día, y las herramientas de auditoría son complejas, costosas o hechas para especialistas.',
      'Las pymes y los equipos pequeños no tienen un equipo de seguridad dedicado.',
      'El resultado: se sale a producción sin saber si el sitio es vulnerable.',
    ],
  },
  howItWorks: {
    title: 'De tu URL a un plan de acción en 4 pasos.',
    steps: [
      { number: '01', title: 'Ingresa tu URL', description: 'Escribe la dirección de tu sitio web.' },
      { number: '02', title: 'Confirma que es tuyo', description: 'Valida la propiedad del dominio. Así evitamos usos maliciosos y protegemos a todos.' },
      { number: '03', title: 'Mira el escaneo en vivo', description: 'Barra de progreso en tiempo real con el porcentaje completado y el módulo que se está analizando.' },
      { number: '04', title: 'Recibe tu plan de acción', description: 'Reporte semaforizado, guías con código y un PDF ejecutivo.' },
    ],
  },
  benefits: {
    title: 'Hecho para cada persona de tu equipo.',
    roles: [
      {
        id: 'dev',
        name: 'Desarrolladores',
        headline: 'Pasa de ignorar la seguridad a corregirla con el código del reporte.',
        items: [
          'Guías paso a paso con código',
          'Exportación a JSON/CSV',
          'Marcar hallazgos como Resuelto o Falso positivo',
        ],
      },
      {
        id: 'it',
        name: 'Administradores de TI',
        headline: 'Deja las revisiones manuales: automatiza y reacciona rápido.',
        items: [
          'Escaneos programados',
          'Alertas por correo ante vulnerabilidades críticas',
          'Cancelar un escaneo en curso',
        ],
      },
      {
        id: 'business',
        name: 'Dueños de negocio',
        headline: 'Entiende tu nivel de riesgo sin leer una línea de código.',
        items: [
          'Semáforo de riesgo',
          'Reporte ejecutivo en PDF',
          'Historial comparativo',
        ],
      },
    ],
  },
  preview: {
    title: 'Así se ve tu seguridad, de un vistazo.',
    blocks: [
      {
        title: 'Semáforo de riesgo',
        description: 'Un banner que te dice si tu sitio está Seguro, en Riesgo Medio o en estado Crítico, con el conteo de fallos Altos, Medios y Bajos.',
        label: 'Datos de ejemplo',
      },
      {
        title: 'Cada hallazgo, con su solución',
        description: 'Abre un hallazgo como XSS o Inyección SQL y obtén la explicación en lenguaje claro y el código exacto para corregirlo.',
        label: 'Datos de ejemplo',
      },
      {
        title: 'Mide tu mejora en el tiempo',
        description: 'Compara tus escaneos y comprueba cómo baja tu riesgo.',
        label: 'Datos de ejemplo',
      },
    ],
  },
  features: {
    title: 'Seguridad web, sin puntos ciegos.',
    intro:
      'Pasa de una URL a una visión clara de tus riesgos. Analiza, prioriza y sigue cada hallazgo desde un solo lugar.',
    items: [
      {
        title: 'Escaneo web bajo demanda',
        description:
          'Inicia una revisión desde la URL de tu sitio y consulta los resultados en un mismo panel.',
        icon: 'scan',
        flag: null,
      },
      {
        title: 'Verificación de dominio',
        description:
          'Confirma que tienes autorización para analizar el sitio mediante una prueba de propiedad.',
        icon: 'domain',
        flag: null,
      },
      {
        title: 'Progreso en tiempo real',
        description: 'Sigue el avance del análisis y conoce qué etapa se está ejecutando.',
        icon: 'progress',
        flag: null,
      },
      {
        title: 'Riesgos priorizados',
        description:
          'Entiende la severidad de cada hallazgo con un resumen visual y fácil de interpretar.',
        icon: 'findings',
        flag: null,
      },
      {
        title: 'Reportes listos para compartir',
        description: 'Consulta y comparte un resumen ejecutivo de los resultados en PDF.',
        icon: 'report',
        flag: 'technicalPdf',
      },
      {
        title: 'Historial de escaneos',
        description:
          'Vuelve a tus análisis anteriores y compara cómo evoluciona la seguridad de tus sitios.',
        icon: 'history',
        flag: null,
      },
      {
        title: 'Guías para corregir hallazgos',
        description:
          'Revisa explicaciones claras y recomendaciones prácticas para abordar cada riesgo.',
        icon: 'guides',
        flag: null,
      },
      {
        title: 'Exportación de resultados',
        description:
          'Descarga los hallazgos en formatos JSON o CSV para compartirlos con tu equipo.',
        icon: 'export',
        flag: null,
      },
      {
        title: 'Escaneos programados y alertas',
        description:
          'Organiza revisiones recurrentes y recibe avisos por correo sobre hallazgos críticos.',
        icon: 'schedule',
        flag: null,
      },
      {
        title: 'Seguimiento de hallazgos',
        description:
          'Marca los resultados como resueltos o falsos positivos para dar seguimiento al trabajo.',
        icon: 'status',
        flag: null,
      },
    ],
  },
  owasp: {
    title: 'Cubrimos los riesgos que más importan.',
    text: 'Detectamos vulnerabilidades del OWASP Top 10, como XSS, Inyección SQL y configuraciones defectuosas, y las traducimos a lenguaje claro con pasos de mitigación directos.',
    categories: ['A01: Broken Access Control', 'A02: Cryptographic Failures', 'A03: Injection', 'A04: Insecure Design', 'A05: Security Misconfiguration', 'A06: Vulnerable Components', 'A07: Auth Failures', 'A08: Software/Data Integrity', 'A09: Logging Failures', 'A10: SSRF'],
  },
  security: {
    title: 'Tu seguridad empieza por la nuestra.',
    guarantees: [
      { text: 'Solo escaneas sitios que demuestras que son tuyos.' },
      { text: 'Tu historial de escaneos queda protegido en tu cuenta.' },
    ],
  },
  pricing: {
    title: 'Empieza gratis. Amplía tu capacidad cuando lo necesites.',
    intro:
      'Todos los planes incluyen las mismas comprobaciones, reportes y guías de remediación. Elige el nivel de uso que se ajuste a tus sitios.',
    plans: [
      {
        name: 'Gratis',
        price: 'Sin costo',
        description: 'Para empezar a conocer la seguridad de tus sitios.',
        features: [
          'Hasta 3 dominios verificados',
          '60 escaneos al mes',
          'Hasta 2 escaneos simultáneos',
          '1 escaneo programado',
          'Reportes, alertas y guías de remediación',
        ],
        cta: 'Empezar gratis',
      },
      {
        name: 'Pro',
        price: 'Próximamente',
        description: 'Más capacidad para desarrolladores y proyectos en crecimiento.',
        features: [
          'Hasta 20 dominios verificados',
          '400 escaneos al mes',
          'Hasta 5 escaneos simultáneos',
          'Hasta 10 escaneos programados',
          'Reportes, alertas y guías de remediación',
        ],
        cta: 'Próximamente',
      },
      {
        name: 'Equipo',
        price: 'Próximamente',
        description: 'Para equipos que protegen varias aplicaciones.',
        features: [
          'Hasta 100 dominios verificados',
          'Escaneos mensuales sin límite',
          'Hasta 15 escaneos simultáneos',
          'Hasta 50 escaneos programados',
          'Reportes, alertas y guías de remediación',
        ],
        cta: 'Próximamente',
      },
    ],
  },
  faq: {
    title: 'Preguntas frecuentes',
    items: [
      { q: '¿Necesito saber de seguridad para usarlo?', a: 'No. VulDetected traduce los hallazgos a lenguaje claro y te da pasos prácticos.' },
      { q: '¿Por qué debo validar que soy el dueño del sitio?', a: 'Para evitar usos maliciosos y proteger a todos los usuarios de la plataforma.' },
      { q: '¿Qué vulnerabilidades detecta?', a: 'Detectamos vulnerabilidades del OWASP Top 10 con guías de remediación.' },
      { q: '¿Qué recibo al terminar el escaneo?', a: 'Un reporte semaforizado con hallazgos, severidad, explicación y código de corrección.' },
      { q: '¿Puedo escanear páginas que requieren inicio de sesión?', a: 'Esta funcionalidad está marcada como Próximamente.' },
      { q: '¿Puedo programar escaneos automáticos?', a: 'Esta funcionalidad está marcada como Próximamente.' },
      { q: '¿Cómo comparto los resultados con mi equipo?', a: 'Puedes exportar a PDF, JSON o CSV según tu plan.' },
    ],
  },
  cta: {
    title: 'Descubre hoy qué tan seguro está tu sitio.',
    button: 'Escanear mi sitio',
    microtext: 'Sin instalar nada · Resultados en pantalla',
  },
  team: {
    title: 'El equipo detrás de VulDetected.',
    subtitle: 'Proyecto desarrollado en la asignatura de Ingeniería de Software.',
    members: [
      { name: 'Emmanuel Berrio Jimenez', role: '[PLACEHOLDER]', github: '[PLACEHOLDER]', linkedin: '[PLACEHOLDER]' },
      { name: 'Juan Esteban Correa', role: '[PLACEHOLDER]', github: '[PLACEHOLDER]', linkedin: '[PLACEHOLDER]' },
      { name: 'Victor Salinas', role: '[PLACEHOLDER]', github: '[PLACEHOLDER]', linkedin: '[PLACEHOLDER]' },
    ],
    group: 'Grupo ET0123 · Institución Universitaria Pascual Bravo · Medellín',
  },
  footer: {
    copyright: '© 2026 VulDetected',
  },
};

export const featureFlags = {
  googleSso: false,
  stripe: false,
  authenticatedScan: false,
  technicalPdf: true,
};
