import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // G12. The three complexity rules the harness documents, at the thresholds it documents.
    // Errors, not warnings: `harness check` grades a verb by its exit code, and a rule that only
    // warns is a rule the loop never has to answer for.
    rules: {
      complexity: ["error", 10],
      "max-lines-per-function": ["error", 60],
      "max-params": ["error", 4],
    },
  },
];
