// Turns Figma variable collections into the figma.tokens.json shape.
//
// Pure: it takes plain data and returns plain data, with no access to the
// figma global, so it runs in the plugin, in tests and in Node. The input
// mirrors what the Plugin API and the REST API (GET /v1/files/:key/variables/local)
// both return for collections and variables.

export const MODES_KEY = 'paws.modes';

export interface PlainColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface PlainAlias {
  type: 'VARIABLE_ALIAS';
  id: string;
}

export type PlainValue = string | number | boolean | PlainColor | PlainAlias;

export interface PlainMode {
  modeId: string;
  name: string;
}

export interface PlainCollection {
  id: string;
  name: string;
  modes: PlainMode[];
  defaultModeId: string;
  variableIds: string[];
}

export interface PlainVariable {
  id: string;
  name: string;
  description?: string;
  /** COLOR, FLOAT, STRING or BOOLEAN. Any other type is refused. */
  resolvedType: string;
  scopes?: string[];
  variableCollectionId: string;
  valuesByMode: Record<string, PlainValue>;
}

export interface SerializeInput {
  collections: PlainCollection[];
  variables: PlainVariable[];
  /** ISO time of the export. Passed in so the function stays deterministic. */
  exportedAt: string;
  figmaFileKey?: string;
  /** Collections whose tokens are all deprecated aliases. Default: ["legacy"]. */
  deprecatedCollections?: string[];
}

export type TokenType = 'color' | 'dimension' | 'number' | 'string' | 'boolean';
export type TokenValue = string | number | boolean;

export interface Token {
  $type: TokenType;
  $value: TokenValue;
  $description?: string;
  $deprecated?: string | boolean;
  $extensions?: { [MODES_KEY]: Record<string, TokenValue> };
}

export interface TokenGroup {
  [name: string]: Token | TokenGroup;
}

export interface TokensFile {
  $metadata: { exportedAt: string; figmaFileKey: string };
  [group: string]: TokenGroup | TokensFile['$metadata'];
}

// Number variables used only for these are unitless; every other one is a length in px.
const UNITLESS_SCOPES = ['OPACITY', 'FONT_WEIGHT', 'LINE_HEIGHT', 'LETTER_SPACING', 'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT'];
const DEPRECATED_NOTE = /^deprecated\b[\s:.-]*/i;

/** A name usable as a DTCG key: no dots, braces or leading "$", no spaces. */
function key(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[.{}]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^\$+/, '');
  if (!cleaned) throw new Error(`Cannot turn "${name}" into a token name`);
  return cleaned;
}

const slug = (name: string) => key(name).toLowerCase();

const isAlias = (value: PlainValue): value is PlainAlias =>
  typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS';

const channel = (value: number) =>
  Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, '0');

/** #rrggbb, or #rrggbbaa when the colour is not opaque. */
export function colorToHex({ r, g, b, a = 1 }: PlainColor): string {
  const alpha = channel(a);
  return `#${channel(r)}${channel(g)}${channel(b)}${alpha === 'ff' ? '' : alpha}`;
}

function tokenType(variable: PlainVariable): TokenType {
  switch (variable.resolvedType) {
    case 'COLOR':
      return 'color';
    case 'STRING':
      return 'string';
    case 'BOOLEAN':
      return 'boolean';
    case 'FLOAT': {
      const scopes = variable.scopes ?? [];
      const unitless = scopes.length > 0 && scopes.every((scope) => UNITLESS_SCOPES.includes(scope));
      return unitless ? 'number' : 'dimension';
    }
    default:
      throw new Error(`"${variable.name}" has the unsupported type ${variable.resolvedType}`);
  }
}

export function serialize(input: SerializeInput): TokensFile {
  const { collections, variables, exportedAt, figmaFileKey = '', deprecatedCollections = ['legacy'] } = input;
  const variableById = new Map(variables.map((variable) => [variable.id, variable]));
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));

  /** Token path of a variable: collection, then the "/"-separated name. */
  const pathOf = (variable: PlainVariable): string[] => {
    const collection = collectionById.get(variable.variableCollectionId);
    if (!collection) throw new Error(`Variable "${variable.name}" belongs to an unknown collection`);
    return [slug(collection.name), ...variable.name.split('/').map(key)];
  };

  const convert = (variable: PlainVariable, value: PlainValue, type: TokenType): TokenValue => {
    if (isAlias(value)) {
      const target = variableById.get(value.id);
      if (!target) {
        throw new Error(`"${variable.name}" aliases a variable that is not local to this file (${value.id})`);
      }
      return `{${pathOf(target).join('.')}}`;
    }
    if (type === 'color') {
      if (typeof value !== 'object') throw new Error(`"${variable.name}" is a colour without a colour value`);
      return colorToHex(value);
    }
    if (typeof value === 'object') throw new Error(`"${variable.name}" has an unexpected colour value`);
    if (type === 'dimension') return `${Number((value as number).toFixed(3))}px`;
    return value;
  };

  const file: TokensFile = { $metadata: { exportedAt, figmaFileKey } };

  for (const collection of collections) {
    const groupName = slug(collection.name);
    if (groupName in file) throw new Error(`Two collections are named "${groupName}"`);
    const group: TokenGroup = {};
    file[groupName] = group;
    const deprecatedGroup = deprecatedCollections.includes(groupName);

    for (const id of collection.variableIds) {
      const variable = variableById.get(id);
      if (!variable) throw new Error(`Collection "${collection.name}" lists an unknown variable (${id})`);
      const type = tokenType(variable);

      const byMode: Record<string, TokenValue> = {};
      for (const mode of collection.modes) {
        const value = variable.valuesByMode[mode.modeId];
        if (value === undefined) throw new Error(`"${variable.name}" has no value in mode "${mode.name}"`);
        byMode[slug(mode.name)] = convert(variable, value, type);
      }
      const defaultMode = collection.modes.find((mode) => mode.modeId === collection.defaultModeId) ?? collection.modes[0];
      if (!defaultMode) throw new Error(`Collection "${collection.name}" has no modes`);
      const defaultValue = byMode[slug(defaultMode.name)]!;

      const token: Token = { $type: type, $value: defaultValue };

      const description = variable.description?.trim() ?? '';
      if (DEPRECATED_NOTE.test(description)) {
        token.$deprecated = description.replace(DEPRECATED_NOTE, '') || true;
      } else {
        if (description) token.$description = description;
        if (deprecatedGroup) {
          const target = /^\{[^.]+\.(.+)\}$/.exec(String(defaultValue))?.[1];
          token.$deprecated = target ? `Use ${target}` : true;
        }
      }

      // Modes are written out only when they disagree; otherwise $value says it all.
      if (Object.values(byMode).some((value) => value !== defaultValue)) {
        token.$extensions = { [MODES_KEY]: byMode };
      }

      const path = pathOf(variable).slice(1);
      const leaf = path.pop()!;
      let node = group;
      for (const segment of path) {
        const next = (node[segment] ??= {});
        if ('$value' in next) throw new Error(`"${variable.name}" is nested under the token "${segment}"`);
        node = next as TokenGroup;
      }
      if (leaf in node) throw new Error(`"${variable.name}" collides with another variable in "${collection.name}"`);
      node[leaf] = token;
    }
  }

  return file;
}

/** The file contents as written to disk. */
export function stringify(file: TokensFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
