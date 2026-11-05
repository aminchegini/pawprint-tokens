import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseMapping } from './mapping.js';
import { count, rewrite } from './run.js';

export const USAGE = `Usage:
  paws-codemod rewrite --map <mapping.json> [--dry-run] <path...>
  paws-codemod count   --map <mapping.json> <path...>

rewrite  Replace legacy token names with semantic ones in CSS custom
         properties, var() uses, Tailwind class names and string literals.
count    Print the remaining legacy usages per name as JSON. Exits 1 when
         any remain.

The mapping file is a JSON object of legacy name -> semantic name, for
example { "pink": "color.cabinet.body" }. Paths are files or directories;
node_modules, dist, build, coverage and .git are skipped.
`;

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

/** Run the CLI. Returns the exit code: 0 done, 1 legacy usages remain, 2 bad usage. */
export function main(argv: string[], io: Io): number {
  let command: string | undefined;
  let paths: string[];
  let map: string | undefined;
  let dryRun: boolean;
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        map: { type: 'string', short: 'm' },
        'dry-run': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
    if (values.help) {
      io.out(USAGE);
      return 0;
    }
    [command, ...paths] = positionals;
    map = values.map;
    dryRun = values['dry-run'];
  } catch (error) {
    io.err(`${(error as Error).message}\n\n${USAGE}`);
    return 2;
  }

  if ((command !== 'rewrite' && command !== 'count') || !map || paths.length === 0) {
    io.err(USAGE);
    return 2;
  }

  try {
    const mapping = parseMapping(JSON.parse(readFileSync(map, 'utf8')));
    if (command === 'count') {
      const report = count(paths, mapping);
      io.out(`${JSON.stringify(report, null, 2)}\n`);
      return report.total > 0 ? 1 : 0;
    }
    const report = rewrite(paths, mapping, { dryRun });
    for (const { file, rewritten } of report.files) io.out(`${file}: ${rewritten}\n`);
    io.out(`${dryRun ? 'Would rewrite' : 'Rewrote'} ${report.total} legacy usage(s) in ${report.files.length} file(s).\n`);
    return 0;
  } catch (error) {
    io.err(`paws-codemod: ${(error as Error).message}\n`);
    return 2;
  }
}
