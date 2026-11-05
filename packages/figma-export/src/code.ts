// Plugin main thread: reads the local variable collections, hands them to the
// pure serialiser as plain data and posts the JSON to the UI.
import { serialize, stringify } from './serialize.js';
import type { PlainCollection, PlainValue, PlainVariable } from './serialize.js';

type UiMessage = { type: 'export'; figmaFileKey: string } | { type: 'close' };

// figma.fileKey is only set for private plugins, so the key typed in the UI is
// remembered per document name. clientStorage is local to the user: writing to
// the document instead would bump lastModified and trip the freshness check.
const STORAGE_KEY = 'figmaFileKeys';

async function rememberedKey(): Promise<string> {
  if (figma.fileKey) return figma.fileKey;
  const keys: Record<string, string> = (await figma.clientStorage.getAsync(STORAGE_KEY)) ?? {};
  return keys[figma.root.name] ?? '';
}

async function rememberKey(figmaFileKey: string): Promise<void> {
  const keys: Record<string, string> = (await figma.clientStorage.getAsync(STORAGE_KEY)) ?? {};
  keys[figma.root.name] = figmaFileKey;
  await figma.clientStorage.setAsync(STORAGE_KEY, keys);
}

async function exportTokens(figmaFileKey: string): Promise<string> {
  const [localCollections, localVariables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);

  const collections: PlainCollection[] = localCollections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    modes: collection.modes.map(({ modeId, name }) => ({ modeId, name })),
    defaultModeId: collection.defaultModeId,
    variableIds: [...collection.variableIds],
  }));
  const variables: PlainVariable[] = localVariables.map((variable) => ({
    id: variable.id,
    name: variable.name,
    description: variable.description,
    resolvedType: variable.resolvedType,
    scopes: [...variable.scopes],
    variableCollectionId: variable.variableCollectionId,
    valuesByMode: { ...variable.valuesByMode } as Record<string, PlainValue>,
  }));

  return stringify(
    serialize({ collections, variables, exportedAt: new Date().toISOString(), figmaFileKey }),
  );
}

figma.showUI(__html__, { width: 440, height: 560, themeColors: true });

rememberedKey().then((figmaFileKey) => figma.ui.postMessage({ type: 'init', figmaFileKey }));

figma.ui.onmessage = async (message: UiMessage) => {
  if (message.type === 'close') {
    figma.closePlugin();
    return;
  }
  try {
    const figmaFileKey = message.figmaFileKey.trim();
    const json = await exportTokens(figmaFileKey);
    await rememberKey(figmaFileKey);
    figma.ui.postMessage({ type: 'result', json });
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
