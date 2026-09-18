// G05. Which installed plugin defines an agent by the same name as one of ours.
//
// An agent is selected by name. Two plugins that both define `evaluator` are two different sets of
// instructions answering to one name, and nothing in a run says which one answered — so a campaign
// can obtain its "independent review" from a reviewer belonging to a different harness entirely,
// and every number that run produces is about something nobody meant to measure.
//
// MEASURED 2026-09-13 on the machine this was developed on: `harness-eng-v2@harness-eng-v2` v2.0.0
// defines a bare `evaluator`, colliding with this repository's. `harness@harness-local` v0.3.1,
// which the completion plan named as the problem, turned out to be namespaced already
// (`harness-evaluator`, `harness-generator`) and collides with nothing.
//
// This reports; it refuses nothing. Which plugins an operator keeps installed is their decision,
// and a check that blocked on it would be this repository legislating for the rest of the machine.
// What it must not do is let the collision stay invisible.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const PLUGIN_CACHE = path.join(homedir(), '.claude', 'plugins', 'cache');

const nameOf = (text) => /^name:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null;

// Agent markdown lives at <cache>/<marketplace>/<plugin>/<version>/agents/*.md. Walked to a fixed
// depth rather than recursively: this is a diagnostic on someone else's directory, and it should
// cost nothing and reach nowhere it was not invited.
export function installedAgents(cacheDir = PLUGIN_CACHE) {
  const found = [];
  if (!existsSync(cacheDir)) return found;
  const dirs = (at) => { try { return readdirSync(at, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } };
  for (const marketplace of dirs(cacheDir)) {
    for (const plugin of dirs(path.join(cacheDir, marketplace))) {
      for (const version of dirs(path.join(cacheDir, marketplace, plugin))) {
        const agents = path.join(cacheDir, marketplace, plugin, version, 'agents');
        if (!existsSync(agents)) continue;
        let files = [];
        try { files = readdirSync(agents); } catch { /* unreadable: not our directory to repair */ }
        for (const file of files) {
          if (!file.endsWith('.md')) continue;
          try {
            const name = nameOf(readFileSync(path.join(agents, file), 'utf8'));
            if (name) found.push({ name, plugin, marketplace, version });
          } catch { /* unreadable: not our directory to repair */ }
        }
      }
    }
  }
  return found;
}

export function ourAgents(rolesDir) {
  if (!existsSync(rolesDir)) return [];
  return readdirSync(rolesDir).filter((f) => f.endsWith('.md'))
    .map((f) => { try { return nameOf(readFileSync(path.join(rolesDir, f), 'utf8')); } catch { return null; } })
    .filter(Boolean);
}

export function collisions({ rolesDir, cacheDir = PLUGIN_CACHE, self = null }) {
  const ours = new Set(ourAgents(rolesDir));
  return installedAgents(cacheDir)
    // Our own plugin, installed, is not a collision with itself.
    .filter((a) => ours.has(a.name) && a.plugin !== self)
    .map((a) => ({ ...a, ours: true }));
}

export function collisionLines(found) {
  if (!found.length) return ['agents    no installed plugin defines an agent by one of our names'];
  return [
    `agents    COLLISION: ${found.length} installed agent(s) answer to a name this harness also uses`,
    ...found.map((a) => `            "${a.name}" is also defined by ${a.plugin}@${a.marketplace} v${a.version}`),
    '          An agent is selected by name, so a run can reach the other one and say nothing.',
    '          Uninstall it, or rename its agents — `claude plugin uninstall <plugin>@<marketplace>`.',
  ];
}
