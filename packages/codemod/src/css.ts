import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import type { Mapping } from './mapping.js';
import { rewriteClasses, ruleForCustomProperty } from './text.js';
import type { Hit } from './text.js';

export interface TransformResult {
  code: string;
  hits: Hit[];
}

/** Rename legacy custom properties referenced in a declaration value or at-rule params. */
function rewriteValue(value: string, mapping: Mapping, hits: Hit[]): string {
  if (!value.includes('--')) return value;
  const parsed = valueParser(value);
  let changed = false;
  parsed.walk((node) => {
    if (node.type !== 'word') return;
    const rule = ruleForCustomProperty(node.value, mapping);
    if (!rule) return;
    hits.push({ name: rule.legacy, kind: 'var' });
    node.value = rule.cssVar;
    changed = true;
  });
  return changed ? parsed.toString() : value;
}

/**
 * Rewrite a stylesheet: custom property declarations, var() and other
 * references in values, @property names and Tailwind classes in @apply.
 */
export function transformCss(code: string, mapping: Mapping, from?: string): TransformResult {
  const hits: Hit[] = [];
  const root = postcss.parse(code, { from });

  root.walkDecls((decl) => {
    const rule = ruleForCustomProperty(decl.prop, mapping);
    if (rule) {
      hits.push({ name: rule.legacy, kind: 'declaration' });
      decl.prop = rule.cssVar;
    }
    const value = rewriteValue(decl.value, mapping, hits);
    if (value !== decl.value) decl.value = value;
  });

  root.walkAtRules((atRule) => {
    const params =
      atRule.name === 'apply'
        ? rewriteClasses(atRule.params, mapping, hits)
        : rewriteValue(atRule.params, mapping, hits);
    if (params !== atRule.params) atRule.params = params;
  });

  return { code: hits.length ? root.toString() : code, hits };
}
