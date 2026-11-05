// Test helper: the inverse of the serialiser. Rebuilds the collections and
// variables Figma would hold for a tokens file, so a file can be round-tripped.
import { MODES_KEY } from '../src/serialize.js';
import type { PlainCollection, PlainValue, PlainVariable } from '../src/serialize.js';

type Json = { [key: string]: any };

const titleCase = (name: string) => name[0]!.toUpperCase() + name.slice(1);

function toPlainValue(value: string, idOf: (path: string) => string): PlainValue {
  const reference = /^\{(.+)\}$/.exec(value)?.[1];
  if (reference) return { type: 'VARIABLE_ALIAS', id: idOf(reference) };
  if (value.startsWith('#')) {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255);
    return { r: r!, g: g!, b: b!, a: 1 };
  }
  return Number.parseFloat(value);
}

export function toPlain(file: Json): { collections: PlainCollection[]; variables: PlainVariable[] } {
  const collections: PlainCollection[] = [];
  const variables: PlainVariable[] = [];
  const idOf = (path: string) => `VariableID:${path}`;

  for (const [groupName, group] of Object.entries(file)) {
    if (groupName.startsWith('$')) continue;
    const tokens: Array<{ path: string[]; token: Json }> = [];
    const walk = (node: Json, path: string[]) => {
      for (const [name, child] of Object.entries(node)) {
        if ('$value' in child) tokens.push({ path: [...path, name], token: child });
        else walk(child, [...path, name]);
      }
    };
    walk(group, []);

    const moded = tokens.find(({ token }) => token.$extensions?.[MODES_KEY]);
    const modeNames = moded ? Object.keys(moded.token.$extensions[MODES_KEY]) : ['value'];
    const modes = modeNames.map((name, i) => ({ modeId: `${groupName}:${i}`, name: titleCase(name) }));
    const collection: PlainCollection = {
      id: `VariableCollectionId:${groupName}`,
      name: titleCase(groupName),
      modes,
      defaultModeId: modes[0]!.modeId,
      variableIds: [],
    };
    collections.push(collection);

    for (const { path, token } of tokens) {
      const id = idOf([groupName, ...path].join('.'));
      collection.variableIds.push(id);
      variables.push({
        id,
        name: path.join('/'),
        description: token.$description ?? '',
        resolvedType: token.$type === 'color' ? 'COLOR' : 'FLOAT',
        scopes: token.$type === 'color' ? ['ALL_FILLS'] : ['GAP'],
        variableCollectionId: collection.id,
        valuesByMode: Object.fromEntries(
          modes.map((mode, i) => [
            mode.modeId,
            toPlainValue(token.$extensions?.[MODES_KEY]?.[modeNames[i]!] ?? token.$value, idOf),
          ]),
        ),
      });
    }
  }
  return { collections, variables };
}
