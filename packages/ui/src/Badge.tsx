import type { ComponentProps } from 'react';
import { classes } from './classes.js';

export type BadgeTone = 'neutral' | 'accent' | 'win' | 'miss';

export interface BadgeProps extends ComponentProps<'span'> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return <span className={classes('paws-badge', className)} data-tone={tone} {...rest} />;
}
