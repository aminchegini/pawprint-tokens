import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectFiles, count, main, parseMapping, rewrite, transformCss, transformJs } from '../src/index.js';

const fixtures = join(fileURLToPath(import.meta.url), '../fixtures');
const mapFile = join(fixtures, 'legacy-map.json');
const mapping = parseMapping(JSON.parse(readFileSync(mapFile, 'utf8')));
const input = (name: string) => readFileSync(join(fixtures, 'input', name), 'utf8');
const expected = (name: string) => readFileSync(join(fixtures, 'expected', name), 'utf8');
const FILES = ['App.jsx', 'styles.css', 'theme.ts'];

const tally = (hits: Array<{ name: string }>) => {
  const out: Record<string, number> = {};
  for (const { name } of hits) out[name] = (out[name] ?? 0) + 1;
  return out;
};

/** Run the CLI in process, capturing its output. */
function cli(...argv: string[]) {
  let out = '';
  let err = '';
  const code = main(argv, { out: (text) => (out += text), err: (text) => (err += text) });
  return { code, out, err };
}

describe('parseMapping', () => {
  it('derives the custom property and the Tailwind utility name', () => {
    expect(parseMapping({ 'trim-deep': 'color.accent.trim-pressed' })).toEqual([
      {
        legacy: 'trim-deep',
        semantic: 'color.accent.trim-pressed',
        cssVar: '--color-accent-trim-pressed',
        utility: 'accent-trim-pressed',
      },
    ]);
  });

  it('rejects anything that is not legacy name -> semantic name', () => {
    expect(() => parseMapping(['pink'])).toThrow(/JSON object/);
    expect(() => parseMapping({})).toThrow(/empty/);
    expect(() => parseMapping({ pink: 'cabinet' })).toThrow(/Invalid semantic name/);
    expect(() => parseMapping({ '--pink': 'color.cabinet.body' })).toThrow(/Invalid legacy name/);
  });
});

describe('transformCss', () => {
  it('rewrites declarations, var() uses, @property and @apply', () => {
    const { code, hits } = transformCss(input('styles.css'), mapping);
    expect(code).toBe(expected('styles.css'));
    expect(tally(hits)).toEqual({
      bg: 2,
      pink: 3,
      trim: 2,
      'trim-deep': 2,
      mint: 1,
      muted: 2,
      card: 1,
      line: 2,
      'btn-red': 1,
    });
  });

  it('leaves comments and longer names alone', () => {
    const { code } = transformCss(input('styles.css'), mapping);
    expect(code).toContain('/* keep: --line in a comment */');
    expect(code).toContain('--pinkish: #ff99cc;');
    expect(code).toContain('var(--pinkish)');
  });

  it('rewrites Tailwind theme variables named after a legacy colour', () => {
    const { code } = transformCss('@theme { --color-btn-red: #ff3b30; }\n.a { color: var(--color-btn-red); }', mapping);
    expect(code).toBe('@theme { --color-action-primary: #ff3b30; }\n.a { color: var(--color-action-primary); }');
  });

  it('returns the source untouched when nothing is legacy', () => {
    const source = '.a{color:var(--color-text-muted)}';
    expect(transformCss(source, mapping)).toEqual({ code: source, hits: [] });
  });

  it('finds nothing on a second pass', () => {
    expect(transformCss(expected('styles.css'), mapping).hits).toEqual([]);
  });
});

describe('transformJs', () => {
  it('rewrites custom properties and Tailwind classes in JSX string and template literals', () => {
    const { code, hits } = transformJs(input('App.jsx'), 'App.jsx', mapping);
    expect(code).toBe(expected('App.jsx'));
    expect(tally(hits)).toEqual({
      pink: 3,
      line: 2,
      bg: 1,
      muted: 2,
      card: 1,
      trim: 2,
      'btn-red': 1,
      'trim-deep': 1,
      mint: 1,
    });
  });

  it('rewrites TypeScript and keeps import paths and bare words', () => {
    const { code, hits } = transformJs(input('theme.ts'), 'theme.ts', mapping);
    expect(code).toBe(expected('theme.ts'));
    expect(tally(hits)).toEqual({ bg: 1, line: 2, card: 1 });
  });

  it('keeps variants, important markers, negatives and opacity modifiers', () => {
    const source = 'const c = "dark:md:hover:bg-pink/50 !text-trim border-line! [&>svg]:fill-mint group-hover/item:stroke-pink";';
    expect(transformJs(source, 'c.ts', mapping).code).toBe(
      'const c = "dark:md:hover:bg-cabinet-body/50 !text-accent-trim border-border-default! [&>svg]:fill-accent-highlight group-hover/item:stroke-cabinet-body";',
    );
  });

  it('does not touch utilities that only look similar', () => {
    const source = 'const c = "bg-pink-500 text-trimmed flex-card card bg-card-foreground";';
    expect(transformJs(source, 'c.ts', mapping)).toEqual({ code: source, hits: [] });
  });

  it('leaves require() and dynamic import() paths alone', () => {
    const source = 'const a = require("./bg-card"); const b = import("text-muted");';
    expect(transformJs(source, 'c.js', mapping)).toEqual({ code: source, hits: [] });
  });

  it('finds nothing on a second pass', () => {
    expect(transformJs(expected('App.jsx'), 'App.jsx', mapping).hits).toEqual([]);
    expect(transformJs(expected('theme.ts'), 'theme.ts', mapping).hits).toEqual([]);
  });
});

describe('on a project directory', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'paws-codemod-'));
    cpSync(join(fixtures, 'input'), join(dir, 'src'), { recursive: true });
    cpSync(join(fixtures, 'input'), join(dir, 'node_modules/pkg'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const REMAINING = {
    total: 34,
    byName: { bg: 4, 'btn-red': 2, card: 3, line: 6, mint: 2, muted: 4, pink: 6, trim: 4, 'trim-deep': 3 },
  };

  it('collects supported files and skips node_modules', () => {
    expect(collectFiles([dir])).toEqual(FILES.map((name) => join(dir, 'src', name)));
  });

  it('counts legacy usages per name', () => {
    expect(count([dir], mapping)).toEqual(REMAINING);
  });

  it('rewrites every file in place, after which nothing remains', () => {
    const report = rewrite([dir], mapping);
    expect(report.total).toBe(34);
    expect(report.files).toEqual([
      { file: join(dir, 'src/App.jsx'), rewritten: 14 },
      { file: join(dir, 'src/styles.css'), rewritten: 16 },
      { file: join(dir, 'src/theme.ts'), rewritten: 4 },
    ]);
    for (const name of FILES) expect(readFileSync(join(dir, 'src', name), 'utf8')).toBe(expected(name));
    expect(count([dir], mapping).total).toBe(0);
    expect(readFileSync(join(dir, 'node_modules/pkg/styles.css'), 'utf8')).toBe(input('styles.css'));
  });

  it('writes nothing on a dry run', () => {
    expect(rewrite([dir], mapping, { dryRun: true }).total).toBe(34);
    for (const name of FILES) expect(readFileSync(join(dir, 'src', name), 'utf8')).toBe(input(name));
  });

  describe('cli', () => {
    it('count prints JSON and exits 1 while legacy usages remain', () => {
      const { code, out } = cli('count', '--map', mapFile, dir);
      expect(code).toBe(1);
      expect(JSON.parse(out)).toEqual(REMAINING);
    });

    it('rewrite then count exits 0 with every name at zero', () => {
      const rewritten = cli('rewrite', '--map', mapFile, dir);
      expect(rewritten.code).toBe(0);
      expect(rewritten.out).toContain('Rewrote 34 legacy usage(s) in 3 file(s).');

      const { code, out } = cli('count', '--map', mapFile, dir);
      expect(code).toBe(0);
      const report = JSON.parse(out);
      expect(report.total).toBe(0);
      expect(Object.keys(report.byName)).toEqual(Object.keys(REMAINING.byName));
      expect(new Set(Object.values(report.byName))).toEqual(new Set([0]));
    });

    it('rewrite --dry-run reports without writing', () => {
      const { code, out } = cli('rewrite', '--map', mapFile, '--dry-run', dir);
      expect(code).toBe(0);
      expect(out).toContain('Would rewrite 34 legacy usage(s) in 3 file(s).');
      expect(readFileSync(join(dir, 'src/theme.ts'), 'utf8')).toBe(input('theme.ts'));
    });

    it('exits 2 on bad usage', () => {
      expect(cli('count', dir).code).toBe(2);
      expect(cli('polish', '--map', mapFile, dir).code).toBe(2);
      expect(cli('count', '--map', join(dir, 'missing.json'), dir).code).toBe(2);
      expect(cli('count', '--map', mapFile).err).toContain('Usage:');
    });

    it('prints usage with --help', () => {
      const { code, out } = cli('--help');
      expect(code).toBe(0);
      expect(out).toContain('paws-codemod rewrite');
    });
  });
});
