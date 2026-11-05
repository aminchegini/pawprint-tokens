import type { Mapping, Rule } from './mapping.js';

export type HitKind = 'declaration' | 'var' | 'class' | 'string';

/** One legacy usage that was found (and, when rewriting, replaced). */
export interface Hit {
  name: string;
  kind: HitKind;
}

// Tailwind utilities that take a colour, so "<prefix>-<legacy name>" is a legacy usage.
const COLOR_UTILITIES = [
  'bg',
  'text',
  'border',
  'border-x',
  'border-y',
  'border-t',
  'border-r',
  'border-b',
  'border-l',
  'border-s',
  'border-e',
  'divide',
  'outline',
  'ring',
  'ring-offset',
  'inset-ring',
  'shadow',
  'inset-shadow',
  'drop-shadow',
  'text-shadow',
  'accent',
  'caret',
  'fill',
  'stroke',
  'decoration',
  'placeholder',
  'from',
  'via',
  'to',
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Matchers {
  byLegacy: Map<string, Rule>;
  /** --name or --color-name, not part of a longer identifier. */
  customProperty: RegExp;
  /** <utility>-<name> as a whole class, after variants and before any /opacity. */
  utility: RegExp;
}

const cache = new WeakMap<Mapping, Matchers>();

function matchers(mapping: Mapping): Matchers {
  let m = cache.get(mapping);
  if (!m) {
    const names = mapping.map((rule) => escape(rule.legacy)).join('|');
    const utilities = [...COLOR_UTILITIES].sort((a, b) => b.length - a.length).join('|');
    m = {
      byLegacy: new Map(mapping.map((rule) => [rule.legacy, rule])),
      customProperty: new RegExp(`(?<![\\w-])--(color-)?(${names})(?![\\w-])`, 'g'),
      utility: new RegExp(`^(-?)(${utilities})-(${names})$`),
    };
    cache.set(mapping, m);
  }
  return m;
}

/** The rule for a custom property name such as "--pink" or "--color-pink", if it is legacy. */
export function ruleForCustomProperty(name: string, mapping: Mapping): Rule | undefined {
  const { byLegacy } = matchers(mapping);
  if (!name.startsWith('--')) return undefined;
  const bare = byLegacy.get(name.slice(2));
  if (bare) return bare;
  // Tailwind v4 theme variables: --color-pink names the same colour as --pink.
  const themed = name.startsWith('--color-') ? byLegacy.get(name.slice(8)) : undefined;
  return themed?.semantic.startsWith('color.') ? themed : undefined;
}

/** Rewrite --legacy custom property names anywhere in free text. */
export function rewriteCustomProperties(text: string, mapping: Mapping, hits: Hit[], kind: HitKind): string {
  return text.replace(matchers(mapping).customProperty, (match) => {
    const rule = ruleForCustomProperty(match, mapping);
    if (!rule) return match;
    hits.push({ name: rule.legacy, kind });
    return rule.cssVar;
  });
}

/** Index of the last top-level ":" in a class, ignoring those inside [] or (). */
function variantEnd(token: string): number {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    else if (ch === ':' && depth === 0) last = i;
  }
  return last;
}

function rewriteClass(token: string, mapping: Mapping, hits: Hit[]): string {
  const split = variantEnd(token) + 1;
  const variants = token.slice(0, split);
  let rest = token.slice(split);
  // Important marker: leading in v3, trailing in v4.
  const lead = rest.startsWith('!') ? '!' : '';
  if (lead) rest = rest.slice(1);
  const trail = rest.endsWith('!') ? '!' : '';
  if (trail) rest = rest.slice(0, -1);
  const slash = rest.indexOf('/');
  const base = slash === -1 ? rest : rest.slice(0, slash);
  const modifier = slash === -1 ? '' : rest.slice(slash);

  const { utility, byLegacy } = matchers(mapping);
  const match = utility.exec(base);
  if (!match) return token;
  const rule = byLegacy.get(match[3]!)!;
  hits.push({ name: rule.legacy, kind: 'class' });
  return `${variants}${lead}${match[1]}${match[2]}-${rule.utility}${modifier}${trail}`;
}

/** Rewrite Tailwind colour utilities in a whitespace-separated class list. */
export function rewriteClasses(text: string, mapping: Mapping, hits: Hit[]): string {
  return text.replace(/\S+/g, (token) => rewriteClass(token, mapping, hits));
}

/** Everything a string literal can hold: custom property names and class names. */
export function rewriteString(text: string, mapping: Mapping, hits: Hit[]): string {
  return rewriteClasses(rewriteCustomProperties(text, mapping, hits, 'string'), mapping, hits);
}
