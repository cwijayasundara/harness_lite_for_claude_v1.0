import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productFixture } from './_product-context-fixture.mjs';
import { revisionPack, renderRevisionPack } from '../.aidlc/lib/product-context.mjs';
import { pack } from '../.aidlc/lib/pack.mjs';
import * as graph from '../.aidlc/lib/graph.mjs';
import { rmSync, existsSync } from 'node:fs';

test('revision pack keeps graph/contract snapshots isolated, budgets omissions and reports unsafe coverage', () => {
  const f = productFixture();
  try {
    const c = f.prepare('original', { files: ['src/app/text.py', 'tests/test_rule.py', 'schema.sql'] });
    f.write('schema.sql', 'CREATE TABLE names (name TEXT);\n');
    const candidate = f.code(); f.record(c);
    const g = graph.ensure(f.cfg);
    const unsupported = revisionPack(f.cfg, 'schema.sql', { revision: candidate, budget: 2000 });
    assert.equal(unsupported.hit, false);
    assert(unsupported.included.some(p => p.kind === 'delivery'));
    assert.match(renderRevisionPack(unsupported), /No structural graph entry/);
    const oldPack = pack(f.cfg, g, 'titlecase');
    rmSync(f.cfg.layout.graph);
    assert.deepEqual(graph.ensure(f.cfg).modules, g.modules);
    assert(existsSync(f.cfg.layout.graph));
    const small = revisionPack(f.cfg, 'titlecase', { revision: candidate, budget: 30 });
    assert(small.tokens <= 30); assert(small.omitted.some(x => x.includes('delivery context')));
    assert.deepEqual(pack(f.cfg, g, 'titlecase'), oldPack);
    assert.throws(() => revisionPack(f.cfg, 'titlecase', { revision: candidate, budget: NaN }), /budget/);
    f.write('.aidlc/harness.toml', '[graph]\ninclude = ["../"]\n');
    const unsafe = f.commit('Unsafe graph configuration');
    const result = revisionPack(f.cfg, 'titlecase', { revision: unsafe });
    assert.match(result.unavailable, /unsafe graph include/);
    assert.match(result.fallback, /git grep/);
  } finally { f.cleanup(); }
});
