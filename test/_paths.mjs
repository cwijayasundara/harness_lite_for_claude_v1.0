// A is the agent-neutral harness. C is only the Claude-native projection.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const A = path.join(ROOT, '.aidlc');
export const C = path.join(ROOT, '.claude');
export const BIN = path.join(A, 'bin', 'harness');
