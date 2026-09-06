import {test} from 'node:test';
import assert from 'node:assert/strict';
test('runtime is available',()=>assert.ok(process.versions.node));
