import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cssVar, tokens } from '@paws/tokens';
import type { TokenName } from '@paws/tokens';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const srcDir = join(fileURLToPath(import.meta.url), '../../src');
const css = readFileSync(join(srcDir, 'styles.css'), 'utf8');
const root = postcss.parse(css);

const COMPONENT_VAR = /^--(button|card|input|badge)-[a-z0-9-]+$/;
const RAW_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/i;
const semanticVars = new Set((Object.keys(tokens.candy) as TokenName[]).map(cssVar));
const usedVars = (value: string) => [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]!);

describe('styles.css layering', () => {
  it('contains no raw colours', () => {
    root.walkDecls((decl) => {
      expect(decl.value, `${decl.prop} at line ${decl.source?.start?.line}`).not.toMatch(RAW_COLOR);
    });
  });

  it('declares only component-level variables', () => {
    root.walkDecls(/^--/, (decl) => {
      expect(decl.prop).toMatch(COMPONENT_VAR);
    });
  });

  it('aliases component variables to semantic tokens that exist', () => {
    let aliases = 0;
    root.walkDecls(/^--/, (decl) => {
      for (const name of usedVars(decl.value)) {
        expect(semanticVars, `${decl.prop}: ${decl.value}`).toContain(name);
        aliases++;
      }
    });
    expect(aliases).toBeGreaterThan(0);
  });

  it('styles properties through component variables only', () => {
    root.walkDecls((decl) => {
      if (decl.prop.startsWith('--')) return;
      for (const name of usedVars(decl.value)) {
        expect(name, `${decl.prop}: ${decl.value}`).toMatch(COMPONENT_VAR);
      }
    });
  });

  it('gives every component its own variables', () => {
    for (const component of ['button', 'card', 'input', 'badge']) {
      expect(css).toContain(`.paws-${component} {`);
      expect(css).toMatch(new RegExp(`--${component}-[a-z-]+: var\\(--`));
    }
    expect(css).toContain('--button-bg: var(--color-action-primary);');
    expect(css).toContain('--card-padding: var(--space-lg);');
  });
});

describe('component sources', () => {
  it('carry no colours or inline styles', () => {
    for (const file of readdirSync(srcDir).filter((name) => /\.tsx?$/.test(name))) {
      const source = readFileSync(join(srcDir, file), 'utf8');
      expect(source, file).not.toMatch(RAW_COLOR);
      expect(source, file).not.toMatch(/\bstyle=/);
    }
  });
});
