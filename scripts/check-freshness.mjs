// Freshness gate: fails when the Figma file changed after the last export.
//
// Compares lastModified from GET /v1/files/<key>?depth=1 with $metadata.exportedAt
// in figma.tokens.json. Skips (exit 0) unless both the FIGMA_TOKEN environment
// variable and a non-empty figmaFileKey are present.
import { readFileSync } from 'node:fs';

const tokensPath = new URL('../packages/tokens/figma.tokens.json', import.meta.url);
const { exportedAt, figmaFileKey } = JSON.parse(readFileSync(tokensPath, 'utf8')).$metadata;
const token = process.env.FIGMA_TOKEN;

if (!token || !figmaFileKey) {
  const missing = [!token && 'the FIGMA_TOKEN secret', !figmaFileKey && 'a figmaFileKey in figma.tokens.json']
    .filter(Boolean)
    .join(' and ');
  console.log(`Freshness check skipped: needs ${missing}.`);
  process.exit(0);
}

const exported = Date.parse(exportedAt);
if (Number.isNaN(exported)) {
  console.error(`$metadata.exportedAt is not a valid time: ${JSON.stringify(exportedAt)}`);
  process.exit(1);
}

const response = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(figmaFileKey)}?depth=1`, {
  headers: { 'X-Figma-Token': token },
});
if (!response.ok) {
  console.error(`Figma API answered ${response.status} ${response.statusText} for file ${figmaFileKey}.`);
  process.exit(1);
}

const { lastModified } = await response.json();
const modified = Date.parse(lastModified);
if (Number.isNaN(modified)) {
  console.error(`Figma returned no usable lastModified: ${JSON.stringify(lastModified)}`);
  process.exit(1);
}

if (modified > exported) {
  console.error(
    `Tokens are stale: the Figma file changed at ${lastModified}, after the export at ${exportedAt}.\n` +
      'Run the Paws Token Export plugin, replace packages/tokens/figma.tokens.json and rebuild.',
  );
  process.exit(1);
}

console.log(`Tokens are fresh: exported ${exportedAt}, Figma last modified ${lastModified}.`);
