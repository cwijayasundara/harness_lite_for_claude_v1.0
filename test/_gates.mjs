// G06. `[gates]` defaults to `advisory`, so a test that asserts a *refusal* is a test of `human`
// mode and has to say which mode it means. Before this the answer was a constant and no test had
// to name it; now it is a policy, and a test that left it implicit would be asserting whatever
// the default happened to be on the day it was written — which is exactly the failure the
// `require_contract` default cost this repository once already.
//
// Spread into a cfg literal, or over a `loadConfig` result, right where the assertion is made.
export const HUMAN = { spec: 'human', plan: 'human', merge: 'human' };
export const ADVISORY = { spec: 'advisory', plan: 'advisory', merge: 'human' };
export const AUTO = { spec: 'auto', plan: 'auto', merge: 'human' };
