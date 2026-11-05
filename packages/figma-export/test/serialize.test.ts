import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { colorToHex, MODES_KEY, serialize, stringify } from '../src/serialize.js';
import type { PlainCollection, PlainVariable, SerializeInput } from '../src/serialize.js';
import { toPlain } from './plain.js';

const exportedAt = '2026-11-05T12:00:00.000Z';

const primitive: PlainCollection = {
  id: 'c:primitive',
  name: 'Primitive',
  modes: [{ modeId: 'p:0', name: 'Value' }],
  defaultModeId: 'p:0',
  variableIds: ['v:pink', 'v:night', 'v:space'],
};
const semantic: PlainCollection = {
  id: 'c:semantic',
  name: 'Semantic',
  modes: [
    { modeId: 's:0', name: 'Candy' },
    { modeId: 's:1', name: 'Neon' },
  ],
  defaultModeId: 's:0',
  variableIds: ['v:body', 'v:gap'],
};
const legacy: PlainCollection = {
  id: 'c:legacy',
  name: 'Legacy',
  modes: [{ modeId: 'l:0', name: 'Mode 1' }],
  defaultModeId: 'l:0',
  variableIds: ['v:legacy-pink'],
};

const variables: PlainVariable[] = [
  {
    id: 'v:pink',
    name: 'color/pink/500',
    resolvedType: 'COLOR',
    variableCollectionId: 'c:primitive',
    valuesByMode: { 'p:0': { r: 1, g: 63 / 255, b: 148 / 255, a: 1 } },
  },
  {
    id: 'v:night',
    name: 'color/violet/600',
    resolvedType: 'COLOR',
    variableCollectionId: 'c:primitive',
    valuesByMode: { 'p:0': { r: 36 / 255, g: 29 / 255, b: 56 / 255, a: 1 } },
  },
  {
    id: 'v:space',
    name: 'space/12',
    resolvedType: 'FLOAT',
    scopes: ['GAP'],
    variableCollectionId: 'c:primitive',
    valuesByMode: { 'p:0': 12 },
  },
  {
    id: 'v:body',
    name: 'color/cabinet/body',
    description: 'Main cabinet finish',
    resolvedType: 'COLOR',
    variableCollectionId: 'c:semantic',
    valuesByMode: {
      's:0': { type: 'VARIABLE_ALIAS', id: 'v:pink' },
      's:1': { type: 'VARIABLE_ALIAS', id: 'v:night' },
    },
  },
  {
    id: 'v:gap',
    name: 'space/md',
    resolvedType: 'FLOAT',
    scopes: ['GAP'],
    variableCollectionId: 'c:semantic',
    valuesByMode: {
      's:0': { type: 'VARIABLE_ALIAS', id: 'v:space' },
      's:1': { type: 'VARIABLE_ALIAS', id: 'v:space' },
    },
  },
  {
    id: 'v:legacy-pink',
    name: 'pink',
    resolvedType: 'COLOR',
    variableCollectionId: 'c:legacy',
    valuesByMode: { 'l:0': { type: 'VARIABLE_ALIAS', id: 'v:body' } },
  },
];

const input = (overrides: Partial<SerializeInput> = {}): SerializeInput => ({
  collections: [primitive, semantic, legacy],
  variables,
  exportedAt,
  figmaFileKey: 'abc123',
  ...overrides,
});

/** A one-collection, one-variable input. */
const single = (variable: Partial<PlainVariable>, collection: Partial<PlainCollection> = {}): SerializeInput => ({
  exportedAt,
  collections: [
    {
      id: 'c',
      name: 'Primitive',
      modes: [{ modeId: 'm', name: 'Value' }],
      defaultModeId: 'm',
      variableIds: ['v'],
      ...collection,
    },
  ],
  variables: [
    { id: 'v', name: 'x', resolvedType: 'FLOAT', variableCollectionId: 'c', valuesByMode: { m: 1 }, ...variable },
  ],
});

describe('serialize', () => {
  it('produces the figma.tokens.json shape', () => {
    expect(serialize(input())).toEqual({
      $metadata: { exportedAt, figmaFileKey: 'abc123' },
      primitive: {
        color: {
          pink: { '500': { $type: 'color', $value: '#ff3f94' } },
          violet: { '600': { $type: 'color', $value: '#241d38' } },
        },
        space: { '12': { $type: 'dimension', $value: '12px' } },
      },
      semantic: {
        color: {
          cabinet: {
            body: {
              $type: 'color',
              $value: '{primitive.color.pink.500}',
              $description: 'Main cabinet finish',
              $extensions: {
                [MODES_KEY]: {
                  candy: '{primitive.color.pink.500}',
                  neon: '{primitive.color.violet.600}',
                },
              },
            },
          },
        },
        space: { md: { $type: 'dimension', $value: '{primitive.space.12}' } },
      },
      legacy: {
        pink: {
          $type: 'color',
          $value: '{semantic.color.cabinet.body}',
          $deprecated: 'Use color.cabinet.body',
        },
      },
    });
  });

  it('puts metadata first and defaults the file key to an empty string', () => {
    const file = serialize(input({ figmaFileKey: undefined }));
    expect(Object.keys(file)).toEqual(['$metadata', 'primitive', 'semantic', 'legacy']);
    expect(file.$metadata).toEqual({ exportedAt, figmaFileKey: '' });
  });

  it('takes $value from the default mode, wherever it sits', () => {
    const file: any = serialize(input({ collections: [primitive, { ...semantic, defaultModeId: 's:1' }, legacy] }));
    expect(file.semantic.color.cabinet.body.$value).toBe('{primitive.color.violet.600}');
  });

  it('writes modes only when their values differ', () => {
    const file: any = serialize(input());
    expect(file.semantic.color.cabinet.body.$extensions[MODES_KEY]).toBeDefined();
    expect(file.semantic.space.md.$extensions).toBeUndefined();
  });

  it('reads a deprecation note from the variable description', () => {
    const file: any = serialize(single({ description: 'Deprecated: use space/md instead' }));
    expect(file.primitive.x).toEqual({ $type: 'dimension', $value: '1px', $deprecated: 'use space/md instead' });
    const bare: any = serialize(single({ description: 'deprecated' }));
    expect(bare.primitive.x.$deprecated).toBe(true);
  });

  it('types numbers by scope: lengths are dimensions, opacity and weight are numbers', () => {
    const type = (scopes?: string[]) => (serialize(single({ scopes, valuesByMode: { m: 0.5 } })) as any).primitive.x;
    expect(type(['GAP'])).toEqual({ $type: 'dimension', $value: '0.5px' });
    expect(type(['ALL_SCOPES'])).toEqual({ $type: 'dimension', $value: '0.5px' });
    expect(type(undefined)).toEqual({ $type: 'dimension', $value: '0.5px' });
    expect(type(['OPACITY'])).toEqual({ $type: 'number', $value: 0.5 });
    expect(type(['FONT_WEIGHT', 'LINE_HEIGHT'])).toEqual({ $type: 'number', $value: 0.5 });
  });

  it('passes strings and booleans through', () => {
    const text: any = serialize(single({ resolvedType: 'STRING', valuesByMode: { m: 'Bungee' } }));
    expect(text.primitive.x).toEqual({ $type: 'string', $value: 'Bungee' });
    const flag: any = serialize(single({ resolvedType: 'BOOLEAN', valuesByMode: { m: true } }));
    expect(flag.primitive.x).toEqual({ $type: 'boolean', $value: true });
  });

  it('cleans names into valid token keys', () => {
    const file: any = serialize(
      single({ name: 'Font Size / $base.5 ' }, { name: ' Brand Tokens ', modes: [{ modeId: 'm', name: 'Mode 1' }] }),
    );
    expect(file['brand-tokens']['Font-Size']['base-5'].$value).toBe('1px');
  });

  it('refuses aliases to variables outside the file', () => {
    expect(() => serialize(single({ valuesByMode: { m: { type: 'VARIABLE_ALIAS', id: 'library:1' } } }))).toThrow(
      /not local to this file/,
    );
  });

  it('refuses variable types it cannot express', () => {
    expect(() => serialize(single({ resolvedType: 'EASING' }))).toThrow(/unsupported type EASING/);
  });

  it('refuses a variable with a missing mode value', () => {
    const broken = variables.map((v) => (v.id === 'v:body' ? { ...v, valuesByMode: { 's:0': v.valuesByMode['s:0']! } } : v));
    expect(() => serialize(input({ variables: broken }))).toThrow(/no value in mode "Neon"/);
  });

  it('refuses names that collide', () => {
    const twice = single({}, { variableIds: ['v', 'v'] });
    expect(() => serialize(twice)).toThrow(/collides/);
    const nested = single({}, { variableIds: ['v', 'w'] });
    nested.variables.push({ ...nested.variables[0]!, id: 'w', name: 'x/y' });
    expect(() => serialize(nested)).toThrow(/nested under the token/);
  });
});

describe('colorToHex', () => {
  it('writes opaque colours as #rrggbb', () => {
    expect(colorToHex({ r: 1, g: 0.8235294117647058, b: 0.24705882352941178 })).toBe('#ffd23f');
    expect(colorToHex({ r: 0, g: 0, b: 0, a: 1 })).toBe('#000000');
  });

  it('appends alpha when the colour is translucent', () => {
    expect(colorToHex({ r: 1, g: 1, b: 1, a: 0.5 })).toBe('#ffffff80');
  });

  it('clamps out-of-range channels', () => {
    expect(colorToHex({ r: 1.2, g: -0.1, b: 0.5 })).toBe('#ff0080');
  });
});

describe('round trip with @paws/tokens', () => {
  const path = createRequire(import.meta.url).resolve('@paws/tokens/figma.tokens.json');
  const text = readFileSync(path, 'utf8');
  const seeded = JSON.parse(text);

  it('re-exports the committed figma.tokens.json byte for byte', () => {
    const exported = serialize({ ...toPlain(seeded), ...seeded.$metadata });
    expect(exported).toEqual(seeded);
    expect(stringify(exported)).toBe(text);
  });
});
