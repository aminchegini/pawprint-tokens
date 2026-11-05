import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { colorNumber, cssVar, defaultMode, modes, tokens } from '../dist/tokens.js';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = JSON.parse(read('../figma.tokens.json'));
const css = read('../dist/tokens.css');
const theme = read('../dist/theme.css');
const legacyMap: Record<string, string> = JSON.parse(read('../dist/legacy-map.json'));

const REQUIRED_SEMANTIC = [
  'color.surface.page',
  'color.surface.panel',
  'color.surface.card',
  'color.border.default',
  'color.text.default',
  'color.text.muted',
  'color.action.primary',
  'color.action.primary-pressed',
  'color.accent.trim',
  'color.accent.highlight',
  'color.feedback.win',
  'color.feedback.miss',
  'color.display.on',
  'color.display.off',
  'color.cabinet.body',
  'color.cabinet.trim',
  'color.prize.rose',
  'color.prize.tangerine',
  'color.prize.mint',
  'color.prize.sky',
  'color.prize.grape',
  'color.prize.sun',
  'color.prize.cherry',
  'color.prize.gold',
];

// Plush Grab's :root values before the migration. The default mode must
// reproduce them, so swapping its stylesheet for tokens.css changes nothing.
const PLUSH_GRAB_ROOT: Record<string, string> = {
  bg: '#0c0820',
  panel: '#150e2b',
  card: '#1f1538',
  line: '#352652',
  cream: '#fff6e8',
  muted: '#b9acd3',
  pink: '#ff3f94',
  trim: '#ffd23f',
  'trim-deep': '#b38a00',
  mint: '#2ad4bd',
  'mint-deep': '#139b8a',
  drop: '#ff3b30',
  'drop-deep': '#b3160e',
  plum: '#2a0f3a',
  led: '#ff9f1c',
};
const OTHER_APP_LEGACY = ['brand-candy', 'btn-red', 'shelf-wood'];

/** Declarations of each rule in tokens.css, keyed by selector. */
function blocks(): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = new Map<string, string>();
    for (const [, prop, value] of body!.matchAll(/(--[\w-]+):\s*([^;]+);/g)) decls.set(prop!, value!);
    out.set(selector!.replace(/\/\*.*?\*\//gs, '').trim().replace(/\s+/g, ' '), decls);
  }
  return out;
}

describe('figma.tokens.json', () => {
  it('has the three layers and export metadata', () => {
    expect(Object.keys(source)).toEqual(['$metadata', 'primitive', 'semantic', 'legacy']);
    expect(Number.isNaN(Date.parse(source.$metadata.exportedAt))).toBe(false);
    // The file is exported from Figma, so it names the file it came from.
    expect(source.$metadata.figmaFileKey).toMatch(/^[0-9a-zA-Z]{22,}$/);
  });

  it('marks every legacy alias as deprecated and pointing at a semantic token', () => {
    for (const [name, token] of Object.entries<any>(source.legacy)) {
      expect(token.$value, name).toMatch(/^\{semantic\.[\w.-]+\}$/);
      expect(token.$deprecated, name).toMatch(/^Use /);
    }
  });
});

describe('tokens.ts', () => {
  it('exposes the four modes with candy as the default', () => {
    expect(modes).toEqual(['candy', 'neon', 'diner', 'walnut']);
    expect(defaultMode).toBe('candy');
  });

  it('carries every required semantic name in every mode', () => {
    for (const mode of modes) {
      for (const name of REQUIRED_SEMANTIC) {
        expect(tokens[mode], `${mode} ${name}`).toHaveProperty([name]);
      }
      const names = Object.keys(tokens[mode]);
      expect(names).toEqual(Object.keys(tokens.candy));
      expect(names.some((n) => n.startsWith('space.'))).toBe(true);
      expect(names.some((n) => n.startsWith('radius.'))).toBe(true);
      expect(names.some((n) => n.startsWith('font.size.'))).toBe(true);
    }
  });

  it('holds hex strings for colours and px strings for dimensions', () => {
    for (const mode of modes) {
      for (const [name, value] of Object.entries(tokens[mode])) {
        expect(value, `${mode} ${name}`).toMatch(name.startsWith('color.') ? /^#[0-9a-f]{6}$/ : /^\d+px$/);
      }
    }
  });

  it('never exposes a primitive name', () => {
    const primitives = Object.keys(source.primitive.color);
    for (const name of Object.keys(tokens.candy)) {
      expect(name.startsWith('primitive')).toBe(false);
      for (const ramp of primitives) expect(name).not.toMatch(new RegExp(`\\.${ramp}\\.\\d+$`));
    }
  });

  it('returns colours as numbers for three.js', () => {
    expect(colorNumber('candy', 'color.cabinet.body')).toBe(0xff3f94);
    expect(colorNumber('neon', 'color.cabinet.trim')).toBe(0xff2bd6);
    expect(colorNumber('walnut', 'color.surface.page')).toBe(0x120e0b);
  });

  it('names the custom property of a token', () => {
    expect(cssVar('color.action.primary-pressed')).toBe('--color-action-primary-pressed');
  });
});

describe('tokens.css', () => {
  const rules = blocks();

  it('has one block per mode, with the default mode also on :root', () => {
    expect([...rules.keys()]).toEqual([
      ':root, [data-skin="candy"]',
      '[data-skin="neon"]',
      '[data-skin="diner"]',
      '[data-skin="walnut"]',
    ]);
  });

  it('declares every semantic token and legacy alias in every block', () => {
    const selectors = [...rules.keys()];
    modes.forEach((mode, i) => {
      const decls = rules.get(selectors[i]!)!;
      for (const [name, value] of Object.entries(tokens[mode])) {
        expect(decls.get(`--${name.replaceAll('.', '-')}`), `${mode} ${name}`).toBe(value);
      }
      for (const [legacy, semantic] of Object.entries(legacyMap)) {
        expect(decls.get(`--${legacy}`), `${mode} ${legacy}`).toBe(`var(--${semantic.replaceAll('.', '-')})`);
      }
    });
  });

  it('contains no primitive custom properties', () => {
    expect(css).not.toMatch(/--primitive/);
    for (const ramp of Object.keys(source.primitive.color)) {
      expect(css).not.toMatch(new RegExp(`--color-${ramp}-\\d`));
    }
  });
});

describe('theme.css', () => {
  it('is a single Tailwind v4 @theme block that clears the default palette', () => {
    expect(theme.match(/@theme/g)).toHaveLength(1);
    expect(theme).toContain('--color-*: initial;');
  });

  it('exposes semantic names only', () => {
    const declared = [...theme.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]!);
    const allowed = Object.keys(tokens.candy).map((name) =>
      name
        .replace(/^color\./, '--color-')
        .replace(/^space\./, '--spacing-')
        .replace(/^radius\./, '--radius-')
        .replace(/^font\.size\./, '--text-')
        .replaceAll('.', '-'),
    );
    expect(declared.sort()).toEqual(allowed.sort());
    for (const legacy of Object.keys(legacyMap)) expect(declared).not.toContain(`--color-${legacy}`);
  });
});

describe('legacy aliases', () => {
  it('cover both apps', () => {
    expect(Object.keys(legacyMap)).toEqual(expect.arrayContaining([...Object.keys(PLUSH_GRAB_ROOT), ...OTHER_APP_LEGACY]));
  });

  it('resolve to the values Plush Grab ships today in the default mode', () => {
    for (const [legacy, hex] of Object.entries(PLUSH_GRAB_ROOT)) {
      const semantic = legacyMap[legacy] as keyof typeof tokens.candy;
      expect(tokens.candy[semantic], legacy).toBe(hex);
    }
  });
});
