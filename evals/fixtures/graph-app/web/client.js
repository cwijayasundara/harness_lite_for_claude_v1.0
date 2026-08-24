import { slugify } from './util.js';

export function linkFor(title) {
  return `/p/${slugify(title)}`;
}
