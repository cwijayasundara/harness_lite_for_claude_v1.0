// A is the harness itself. C is the .claude directory that contains it and the generated projection.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const A = path.join(ROOT, '.claude/harness');
export const C = path.join(ROOT, '.claude');
export const BIN = path.join(A, 'bin', 'harness');
