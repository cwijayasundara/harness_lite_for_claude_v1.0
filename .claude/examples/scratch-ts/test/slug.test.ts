import assert from 'node:assert/strict';
import { test } from 'node:test';

import { linkFor, slugify } from '../src/slug.js';

test('slugify lowercases and hyphenates', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('slugify rejects an empty value', () => {
  assert.throws(() => slugify('   '), /must not be empty/);
});

test('linkFor composes a path', () => {
  assert.equal(linkFor('Hello World'), '/p/hello-world');
});
