// The three complexity rules the harness's `doctor` documents (ESLINT_THRESHOLDS in
// .aidlc/lib/toolchain.mjs), so "lint is configured" means the same thing here as it does there.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      complexity: ['error', 10],
      'max-lines-per-function': ['error', 60],
      'max-params': ['error', 4],
    },
  },
);
