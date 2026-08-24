// The suite sits beside the harness, not inside it: .claude/ is the harness, and everything
// that exercises the harness lives at the repo root. That costs the tests one thing — they can
// no longer reach the plugin root by walking up from their own file. This module is the single
// place that knows the plugin directory is called `.claude`, so a rename stays a one-line
// change instead of a fifteen-file one.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const C = path.join(ROOT, '.claude');
export const BIN = path.join(C, 'bin', 'harness');
