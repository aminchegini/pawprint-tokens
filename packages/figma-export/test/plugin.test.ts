import { describe, expect, it, vi } from 'vitest';
import { MODES_KEY } from '../src/serialize.js';

// The main thread only needs a handful of the figma global. Faking those
// exercises the message flow end to end without Figma.
function fakeFigma() {
  const storage = new Map<string, unknown>();
  const posted: any[] = [];
  const figma = {
    fileKey: undefined as string | undefined,
    root: { name: 'Paws tokens' },
    showUI: vi.fn(),
    closePlugin: vi.fn(),
    clientStorage: {
      getAsync: async (key: string) => storage.get(key),
      setAsync: async (key: string, value: unknown) => void storage.set(key, value),
    },
    variables: {
      getLocalVariableCollectionsAsync: async () => [
        {
          id: 'c',
          name: 'Semantic',
          modes: [
            { modeId: 'm0', name: 'Candy' },
            { modeId: 'm1', name: 'Neon' },
          ],
          defaultModeId: 'm0',
          variableIds: ['v'],
        },
      ],
      getLocalVariablesAsync: async () => [
        {
          id: 'v',
          name: 'color/cabinet/body',
          description: '',
          resolvedType: 'COLOR',
          scopes: ['ALL_FILLS'],
          variableCollectionId: 'c',
          valuesByMode: { m0: { r: 1, g: 63 / 255, b: 148 / 255, a: 1 }, m1: { r: 36 / 255, g: 29 / 255, b: 56 / 255, a: 1 } },
        },
      ],
    },
    ui: {
      postMessage: (message: unknown) => void posted.push(message),
      onmessage: undefined as undefined | ((message: unknown) => Promise<void>),
    },
  };
  return { figma, posted, storage };
}

describe('plugin main thread', () => {
  it('opens the UI, exports on request and remembers the file key', async () => {
    const { figma, posted, storage } = fakeFigma();
    vi.stubGlobal('figma', figma);
    vi.stubGlobal('__html__', '<p>ui</p>');
    // A computed path keeps code.ts (typed against the Figma API) out of this program.
    const entry = '../src/code.ts';
    await import(/* @vite-ignore */ entry);

    expect(figma.showUI).toHaveBeenCalledWith('<p>ui</p>', expect.objectContaining({ themeColors: true }));
    await vi.waitFor(() => expect(posted).toEqual([{ type: 'init', figmaFileKey: '' }]));

    const before = Date.now();
    await figma.ui.onmessage!({ type: 'export', figmaFileKey: '  AbC123  ' });
    const result = posted.at(-1);
    expect(result.type).toBe('result');
    expect(result.json.endsWith('}\n')).toBe(true);

    const file = JSON.parse(result.json);
    expect(file.$metadata.figmaFileKey).toBe('AbC123');
    expect(Date.parse(file.$metadata.exportedAt)).toBeGreaterThanOrEqual(before);
    expect(file.semantic.color.cabinet.body).toEqual({
      $type: 'color',
      $value: '#ff3f94',
      $extensions: { [MODES_KEY]: { candy: '#ff3f94', neon: '#241d38' } },
    });
    expect(storage.get('figmaFileKeys')).toEqual({ 'Paws tokens': 'AbC123' });

    figma.variables.getLocalVariablesAsync = async () => {
      throw new Error('Variables are unavailable');
    };
    await figma.ui.onmessage!({ type: 'export', figmaFileKey: '' });
    expect(posted.at(-1)).toEqual({ type: 'error', message: 'Variables are unavailable' });

    await figma.ui.onmessage!({ type: 'close' });
    expect(figma.closePlugin).toHaveBeenCalled();
  });
});
