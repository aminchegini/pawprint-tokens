import type { Palette } from './card';

export type Skin = 'pink' | 'mint';

export const palette: Palette = {
  page: 'var(--color-surface-page)',
  outline: `1px solid var(--color-border-default)`,
};

export const cardClass: string = "bg-surface-card border border-border-default";
