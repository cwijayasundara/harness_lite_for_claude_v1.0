/**
 * G14's worked example of the `layers` verb: a declared dependency direction, validated
 * structurally. `src/http` is the edge — it may reach the core; the core may never reach back.
 * A rule nobody can break is a rule that proves nothing, so `test/layers.plant.ts` exists to
 * break this one deliberately.
 */
module.exports = {
  forbidden: [
    {
      name: "core-must-not-import-http",
      comment: "the core is reachable from the edge, never the other way round",
      severity: "error",
      from: { path: "^src/(?!http/)" },
      to: { path: "^src/http/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(dist|coverage|node_modules)/" },
    tsConfig: { fileName: "tsconfig.json" },
  },
};
