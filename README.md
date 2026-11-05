# pawprint-tokens

An automated loop between design and code: Figma variables are exported as design tokens, the tokens are built into CSS, a Tailwind theme and a typed map, components and apps consume them, and CI checks that code and Figma have not drifted apart.

```
Figma variables
   |  @paws/figma-export (plugin)
   v
figma.tokens.json            DTCG, three layers, four modes
   |  @paws/tokens (Style Dictionary)
   v
tokens.css  theme.css  tokens.ts
   |                         \
   v                          v
@paws/ui components        apps (CSS, Tailwind, three.js materials)
                              ^
                              |  @paws/codemod: legacy names -> semantic names
```

## Layer model

Tokens come in three layers, and each layer may only point at the one below it.

| Layer | Example | Rule |
| --- | --- | --- |
| Primitive | `primitive.color.pink.500` = `#ff3f94` | Raw values: colour ramps, space, radius, font sizes. Never used outside the token file. |
| Semantic | `color.cabinet.body` = `{primitive.color.pink.500}` | Names a purpose. Always a reference to a primitive. May differ per mode. |
| Component | `--button-bg: var(--color-action-primary)` | Lives in the component stylesheet. Always an alias of a semantic token. |

A fourth group, `legacy`, holds deprecated aliases (`pink`, `trim`, `btn-red`, ...) that point at semantic tokens and carry a `$deprecated` note. They exist so an app can adopt the tokens first and rename later.

Semantic tokens have four modes: `candy` (default), `neon`, `diner` and `walnut`. In `figma.tokens.json` a token's `$value` holds the default mode and `$extensions["paws.modes"]` holds one value per mode; tokens that are the same in every mode have only `$value`.

The build enforces the model: a semantic token that holds a raw value, or a legacy alias without a `$deprecated` note, fails it.

## Packages

| Package | What it is |
| --- | --- |
| `@paws/tokens` | `figma.tokens.json` and its Style Dictionary build. |
| `@paws/ui` | React 19 `Button`, `Card`, `Input`, `Badge`, styled only through component and semantic variables. |
| `@paws/codemod` | CLI that rewrites legacy names to semantic names and counts what is left. |
| `@paws/figma-export` | Figma plugin that writes `figma.tokens.json` from local variable collections. |

### @paws/tokens

`pnpm build` writes `packages/tokens/dist`:

- `tokens.css`: semantic tokens and legacy aliases as custom properties, one block per mode under `[data-skin="<mode>"]`, with `candy` also on `:root`.
- `theme.css`: a Tailwind v4 `@theme` block with semantic names only. It clears Tailwind's default colour palette, so `bg-surface-page` exists and `bg-red-500` does not.
- `tokens.ts`, `tokens.js`, `tokens.d.ts`: a typed map `tokens[mode][name]` and `colorNumber(mode, name)`, which returns a number for three.js materials.
- `legacy-map.json`: legacy name to semantic name, the mapping file for the codemod.

`dist` is committed on purpose. CI rebuilds it and fails on any difference.

```css
@import "tailwindcss";
@import "@paws/tokens/tokens.css";
@import "@paws/tokens/theme.css";
```

```ts
import { colorNumber, tokens } from '@paws/tokens';

tokens.neon['color.surface.page']; // '#05040c'
material.color.setHex(colorNumber('walnut', 'color.cabinet.trim'));
```

Switch mode by setting `data-skin` on any element: `<html data-skin="diner">`.

### @paws/ui

```tsx
import '@paws/tokens/tokens.css';
import '@paws/ui/styles.css';
import { Badge, Button, Card, Input } from '@paws/ui';
```

Restyle a component by overriding its variables (`--button-bg`, `--card-padding`, ...), not its properties.

### @paws/codemod

```bash
paws-codemod rewrite --map node_modules/@paws/tokens/dist/legacy-map.json src
```

```bash
paws-codemod count --map node_modules/@paws/tokens/dist/legacy-map.json src
```

`rewrite` handles custom property declarations (`--pink:`), `var(--pink)` uses, Tailwind classes (`hover:bg-pink/50`, `@apply text-muted`) and the same patterns inside JS, JSX, TS and TSX string and template literals. `--dry-run` reports without writing. Bare words such as `'pink'` and property names built at runtime (`'--' + name`) are not rewritten; review the diff, and any `@theme` block that defined the legacy colours.

`count` prints `{ "total": n, "byName": { "<legacy name>": n } }` and exits 1 while any usage remains, so it can gate CI in the consuming repo.

### @paws/figma-export

Build the package, then in the Figma desktop app choose Plugins, Development, Import plugin from manifest and pick `packages/figma-export/manifest.json`. Run it, enter the file key, export, and save the result as `packages/tokens/figma.tokens.json`.

The plugin expects three collections named `primitive`, `semantic` and `legacy`, with variable names using `/` for groups (`color/surface/page`). Aliases become `{group.path}` references. A description starting with "Deprecated" becomes `$deprecated`; aliases in the `legacy` collection get the note automatically.

The serialiser (`src/serialize.ts`) is a pure function over plain data and is the package's main export, so the same code can run against the Figma REST API.

## Commands

Requires Node 22 or later and pnpm 10.

| Command | What it does |
| --- | --- |
| `pnpm install` | Install the workspace. |
| `pnpm build` | Build every package, tokens first. |
| `pnpm test` | Run every package's Vitest suite. |
| `pnpm typecheck` | Type-check sources and tests. |
| `pnpm --filter @paws/tokens build` | Rebuild only the tokens. |
| `pnpm check:freshness` | Run the Figma freshness check locally (needs `FIGMA_TOKEN`). |

## CI gates

`.github/workflows/ci.yml` runs three jobs in order.

1. **Install, build, test.** The workspace must install from the lockfile, build, type-check and pass its tests.
2. **Token drift.** Rebuilds the tokens and fails if `git diff --exit-code packages/tokens/dist` is not empty: the committed output must be exactly what the committed `figma.tokens.json` produces.
3. **Figma freshness.** When the `FIGMA_TOKEN` secret is set and `$metadata.figmaFileKey` is not empty, asks `GET https://api.figma.com/v1/files/<key>?depth=1` for `lastModified` and fails if it is later than `$metadata.exportedAt`: Figma changed and nobody exported. Otherwise the job reports a skip.

## Releases

Pushing a `v*` tag runs `.github/workflows/release.yml`: it stamps the tag version into each package, builds, tests, runs `pnpm pack` per package and attaches the tarballs to a GitHub Release. Consumers install from those URLs:

```json
{
  "dependencies": {
    "@paws/tokens": "https://github.com/aminchegini/pawprint-tokens/releases/download/v0.1.0/paws-tokens-0.1.0.tgz"
  }
}
```

## License

MIT. See [LICENSE](LICENSE).
