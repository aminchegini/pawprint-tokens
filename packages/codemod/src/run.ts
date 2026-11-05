import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { transformCss } from './css.js';
import type { TransformResult } from './css.js';
import { transformJs } from './js.js';
import type { Mapping } from './mapping.js';

const CSS_EXTENSIONS = new Set(['.css']);
const JS_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts']);
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

const isSupported = (file: string) => CSS_EXTENSIONS.has(extname(file)) || JS_EXTENSIONS.has(extname(file));

/** Expand files and directories into the supported source files under them, sorted. */
export function collectFiles(paths: string[]): string[] {
  const files = new Set<string>();
  const visit = (path: string, explicit: boolean) => {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
        visit(join(path, entry.name), false);
      }
    } else if (stat.isFile() && isSupported(path)) {
      files.add(path);
    } else if (explicit) {
      throw new Error(`Unsupported file type: ${path}`);
    }
  };
  for (const path of paths) visit(path, true);
  return [...files].sort();
}

export function transformFile(file: string, code: string, mapping: Mapping): TransformResult {
  return CSS_EXTENSIONS.has(extname(file)) ? transformCss(code, mapping, file) : transformJs(code, file, mapping);
}

export interface RewriteReport {
  /** Files that contained legacy usages, with the number rewritten in each. */
  files: Array<{ file: string; rewritten: number }>;
  total: number;
}

/** Rewrite legacy names in place. With dryRun, report what would change and write nothing. */
export function rewrite(paths: string[], mapping: Mapping, options: { dryRun?: boolean } = {}): RewriteReport {
  const report: RewriteReport = { files: [], total: 0 };
  for (const file of collectFiles(paths)) {
    const code = readFileSync(file, 'utf8');
    const result = transformFile(file, code, mapping);
    if (result.hits.length === 0) continue;
    if (!options.dryRun && result.code !== code) writeFileSync(file, result.code);
    report.files.push({ file, rewritten: result.hits.length });
    report.total += result.hits.length;
  }
  return report;
}

export interface CountReport {
  total: number;
  /** Remaining usages per legacy name, every name of the mapping included. */
  byName: Record<string, number>;
}

/** Count the legacy usages that a rewrite would still find. */
export function count(paths: string[], mapping: Mapping): CountReport {
  const byName: Record<string, number> = Object.fromEntries(
    mapping.map((rule) => [rule.legacy, 0]).sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
  let total = 0;
  for (const file of collectFiles(paths)) {
    for (const hit of transformFile(file, readFileSync(file, 'utf8'), mapping).hits) {
      byName[hit.name] = (byName[hit.name] ?? 0) + 1;
      total++;
    }
  }
  return { total, byName };
}
