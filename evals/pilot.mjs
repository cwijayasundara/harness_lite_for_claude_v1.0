#!/usr/bin/env node
// Experiment orchestration stays outside the production kernel. This command assigns a committed
// prospective portfolio or analyzes its productivity-event export; it launches no model.

import path from 'node:path';
import { assign, analyze, readEvidence, readRegistration } from './lib/pilot.mjs';

const argv = process.argv.slice(2);
const action = argv[0];
const flag = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1];
};
const usage = () => {
  console.error('usage: node evals/pilot.mjs assign|analyze --registration <pilot.json> [--events <events.jsonl>]');
  return 2;
};

try {
  const registrationFile = flag('registration');
  if (!registrationFile || !['assign', 'analyze'].includes(action)) process.exitCode = usage();
  else {
    const registration = readRegistration(path.resolve(registrationFile));
    if (action === 'assign') {
      process.stdout.write(JSON.stringify(assign(registration), null, 2) + '\n');
      process.exitCode = 0;
    } else {
      const eventsFile = flag('events');
      if (!eventsFile) process.exitCode = usage();
      else {
        const result = analyze(registration, readEvidence(path.resolve(eventsFile)));
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        process.exitCode = result.decision === 'advance' ? 0 : 1;
      }
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
