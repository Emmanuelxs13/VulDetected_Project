const fs = require('node:fs');

const roadmap = fs.readFileSync('docs/roadmap.md', 'utf8');
const sprintHeading = /^## Sprint (\d+)[^\n]*$/gm;

for (const match of roadmap.matchAll(sprintHeading)) {
  const start = match.index;
  const nextHeading = roadmap.indexOf('\n## ', start + match[0].length);
  const section = roadmap.slice(start, nextHeading === -1 ? undefined : nextHeading);
  const status = section.match(/^\*\*Estado:\*\*\s*([^\n]+)$/m)?.[1]?.trim() ?? 'UNKNOWN';
  console.log(`Sprint ${match[1]}: ${status}`);
}
