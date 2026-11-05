/** One legacy name and everything it turns into. */
export interface Rule {
  /** Legacy name as written in the mapping file, for example "trim-deep". */
  legacy: string;
  /** Semantic token name, for example "color.accent.trim-pressed". */
  semantic: string;
  /** Semantic custom property, for example "--color-accent-trim-pressed". */
  cssVar: string;
  /** Tailwind utility suffix, for example "accent-trim-pressed" (as in bg-accent-trim-pressed). */
  utility: string;
}

export type Mapping = Rule[];

const LEGACY_NAME = /^[a-z][a-z0-9-]*$/i;
const SEMANTIC_NAME = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/i;

/**
 * Validate a mapping file: a flat JSON object of legacy name -> semantic name.
 * Longer legacy names come first so "trim-deep" is tried before "trim".
 */
export function parseMapping(json: unknown): Mapping {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('Mapping must be a JSON object of legacy name -> semantic name');
  }
  const rules: Rule[] = [];
  for (const [legacy, semantic] of Object.entries(json)) {
    if (!LEGACY_NAME.test(legacy)) throw new Error(`Invalid legacy name "${legacy}"`);
    if (typeof semantic !== 'string' || !SEMANTIC_NAME.test(semantic)) {
      throw new Error(`Invalid semantic name for "${legacy}": ${JSON.stringify(semantic)}`);
    }
    const dashed = semantic.replaceAll('.', '-');
    rules.push({
      legacy,
      semantic,
      cssVar: `--${dashed}`,
      // Tailwind names colour utilities without the namespace: --color-x-y -> bg-x-y.
      utility: dashed.replace(/^color-/, ''),
    });
  }
  if (rules.length === 0) throw new Error('Mapping is empty');
  return rules.sort((a, b) => b.legacy.length - a.legacy.length || a.legacy.localeCompare(b.legacy));
}
