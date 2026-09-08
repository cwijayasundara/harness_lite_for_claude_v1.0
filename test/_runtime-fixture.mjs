// Test-only installation record from the actual running checkout, never invented provenance.
import { installationIdentity, RUNTIME_ROOT } from '../.aidlc/lib/runtime-identity.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
export function seedRuntimeRecord(root) {
  const identity = installationIdentity(RUNTIME_ROOT);
  mkdirSync(path.join(root, '.aidlc'), { recursive: true });
  writeFileSync(path.join(root, '.aidlc/harness-install.json'), JSON.stringify({ commit: identity.commit, identity }));
}
