// Lists the design tokens that differ between two figma.tokens.json files, as a
// Markdown table. Prints nothing when only the export metadata changed, so a
// re-export of identical variables does not count as a change.
//
//   node scripts/token-diff.mjs <before.json> <after.json>

import { readFileSync } from 'node:fs';

const MODES_KEY = 'paws.modes';

/** Token path -> what it holds, in a form that compares as a string. */
function flatten(node, path = [], out = new Map()) {
  if ('$value' in node) {
    const modes = node.$extensions?.[MODES_KEY];
    out.set(path.join('.'), modes ? JSON.stringify(modes) : String(node.$value));
    return out;
  }
  for (const [key, child] of Object.entries(node)) {
    if (!key.startsWith('$')) flatten(child, [...path, key], out);
  }
  return out;
}

/** Modes that disagree read better as "candy: a, neon: b" than as JSON. */
function show(value) {
  if (value === undefined) return '(none)';
  if (!value.startsWith('{"')) return `\`${value}\``;
  return Object.entries(JSON.parse(value))
    .map(([mode, v]) => `${mode}: \`${v}\``)
    .join(', ');
}

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw new Error('Usage: token-diff.mjs <before.json> <after.json>');
const before = flatten(JSON.parse(readFileSync(beforePath, 'utf8')));
const after = flatten(JSON.parse(readFileSync(afterPath, 'utf8')));

const names = [...new Set([...before.keys(), ...after.keys()])].sort();
const changed = names.filter((name) => before.get(name) !== after.get(name));

if (changed.length > 0) {
  console.log('| Token | Before | After |\n| --- | --- | --- |');
  for (const name of changed) {
    console.log(`| \`${name}\` | ${show(before.get(name))} | ${show(after.get(name))} |`);
  }
}
