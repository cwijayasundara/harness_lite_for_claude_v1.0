// Explicit simulated inputs for older approval tests. Only call before committing drafts
// in disposable repos; never alter an approved artifact or real product fixture source.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse, render, behavioursOf } from '../.aidlc/lib/artifacts.mjs';

export function traceFixture(root) {
  const artifacts = path.join(root, '.aidlc/artifacts');
  if (!existsSync(artifacts)) return;
  for (const slug of readdirSync(artifacts)) {
    const specPath = path.join(artifacts, slug, 'spec.md'), intentPath = path.join(artifacts, slug, 'intent.md');
    if (!existsSync(specPath) || !existsSync(intentPath)) continue;
    const spec = parse(readFileSync(specPath, 'utf8'));
    if (spec.front.status === 'approved') continue;
    const intent = parse(readFileSync(intentPath, 'utf8'));
    if (!intent.front.source) writeFileSync(intentPath, render({ ...intent.front,
      source: 'https://example.invalid/simulated-requirement', source_revision: 'fixture-v1' }, intent.body));
    if (!/^## Requirements$/m.test(spec.body)) {
      const rows = behavioursOf(spec.body).map(id => `| local:fixture-${id} | ${id} |`).join('\n');
      writeFileSync(specPath, render(spec.front, spec.body + `\n## Requirements\n\n| Source criterion | Behaviour IDs |\n|---|---|\n${rows}\n\n## Fixture notes\n`));
    }
  }
}
