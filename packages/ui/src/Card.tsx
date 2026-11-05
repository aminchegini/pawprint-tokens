import type { ComponentProps, ReactNode } from 'react';
import { classes } from './classes.js';

export interface CardProps extends Omit<ComponentProps<'section'>, 'title'> {
  /** Optional heading shown above the content. */
  title?: ReactNode;
}

export function Card({ title, className, children, ...rest }: CardProps) {
  return (
    <section className={classes('paws-card', className)} {...rest}>
      {title != null && <h3 className="paws-card__title">{title}</h3>}
      {children}
    </section>
  );
}
