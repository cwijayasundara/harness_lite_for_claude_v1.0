// Minimal TOML subset parser. Zero deps, ~90 lines.
// Supports: comments, [tables], [nested.tables], key = "str" | 123 | 1.5 | true | ["a","b"]
// Why this exists instead of a dependency: harness.toml is the only registry (Law 3) and the
// harness must run on a cold clone with no install step. A full TOML parser is not worth a
// node_modules directory in every repo we touch.

function parseValue(raw, ctx) {
  const s = raw.trim();
  if (s === '') throw new Error(`empty value at ${ctx}`);
  if (s.startsWith('[')) {
    if (!s.endsWith(']')) throw new Error(`unterminated array at ${ctx}`);
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTop(inner).map((p) => parseValue(p, ctx));
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
  }
  if (/^-?\d+$/.test(s)) return Number.parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return Number.parseFloat(s);
  throw new Error(`unparseable value ${JSON.stringify(s)} at ${ctx}`);
}

// split on commas that are not inside quotes
function splitTop(s) {
  const out = [];
  let cur = '', q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

function stripComment(line) {
  let q = null, out = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { out += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; out += ch; continue; }
    if (ch === '#') break;
    out += ch;
  }
  return out;
}

export function parseToml(text) {
  const root = {};
  let table = root;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim();
    if (line === '') continue;
    if (line.startsWith('[')) {
      if (!line.endsWith(']')) throw new Error(`bad table header on line ${i + 1}`);
      const path = line.slice(1, -1).trim().split('.').map((p) => p.trim().replace(/^["']|["']$/g, ''));
      table = root;
      for (const key of path) {
        if (typeof table[key] !== 'object' || table[key] === null || Array.isArray(table[key])) table[key] = {};
        table = table[key];
      }
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) throw new Error(`expected key = value on line ${i + 1}: ${line}`);
    const key = line.slice(0, eq).trim().replace(/^["']|["']$/g, '');
    table[key] = parseValue(line.slice(eq + 1), `line ${i + 1}`);
  }
  return root;
}
