import type { Palette } from './card';

export type Skin = 'pink' | 'mint';

export const palette: Palette = {
  page: 'var(--bg)',
  outline: `1px solid var(--line)`,
};

export const cardClass: string = "bg-card border border-line";
