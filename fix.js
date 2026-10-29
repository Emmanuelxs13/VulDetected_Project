const fs = require('fs');
const p = 'apps/web/src/components/app-sidebar.tsx';
let c = fs.readFileSync(p,'utf8');
c = c.replace(/return \[[\s\S]*?\];/, "return [\n    { href: '/dashboard', label: t('dashboard'), icon: IconDashboard },\n    { href: '/scans', label: t('scans'), icon: IconScan },\n    { href: '/findings', label: t('findings'), icon: IconFindings },\n    { href: '/reports', label: t('reports'), icon: IconReport },\n    { href: '/remediation', label: t('remediation'), icon: IconGuides },\n    { href: '/schedules', label: t('schedules'), icon: IconSchedule },\n    { href: '/settings', label: t('settings'), icon: IconSettings },\n  ];");
c = c.replace(/<span className="text-base" aria-hidden="true">\s*\{item\.icon\}\s*<\/span>/g, '<item.icon className="h-4 w-4" aria-hidden="true" />');
fs.writeFileSync(p,c);
console.log('done');
