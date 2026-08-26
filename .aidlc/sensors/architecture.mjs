// Repository-specific dependency boundary: provider projections may call the neutral kernel,
// but kernel code may never import a coding-agent projection.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function files(dir) {
  if (!statSync(dir).isDirectory()) return [dir];
  return readdirSync(dir).flatMap((name) => files(path.join(dir, name)));
}
const roots = ['lib', 'checks', 'hooks'].map((name) => path.join(process.cwd(), '.aidlc', name));
const offenders = roots.flatMap(files).filter((file) => file.endsWith('.mjs')).filter((file) => /(?:from\s+|import\s*\()['"](?:\.\.\/)*adapters\//.test(readFileSync(file, 'utf8')));
if (offenders.length) {
  for (const file of offenders) console.error(`architecture: neutral kernel imports provider adapter: ${path.relative(process.cwd(), file)}`);
  process.exit(1);
}
