/** URL slug helpers. */

const SEPARATORS = /[\s_]+/g;

export function slugify(value: string): string {
  if (value.trim() === '') {
    throw new Error('value must not be empty');
  }
  return value.trim().toLowerCase().replace(SEPARATORS, '-').replace(/[^a-z0-9-]/g, '');
}

export function linkFor(title: string, prefix = '/p'): string {
  return `${prefix}/${slugify(title)}`;
}
