// Bundle the plugin's main thread. Figma loads a single script, so the
// serialiser is inlined; the sandbox wants a conservative syntax target.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/code.ts'],
  outfile: 'dist/code.js',
  bundle: true,
  format: 'iife',
  target: 'es2017',
  logLevel: 'info',
});
