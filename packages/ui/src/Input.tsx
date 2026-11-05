import { useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { classes } from './classes.js';

export interface InputProps extends ComponentProps<'input'> {
  label: ReactNode;
  /** Helper text under the field. */
  hint?: ReactNode;
  /** Error text under the field. Marks the field invalid and replaces the hint. */
  error?: ReactNode;
}

export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const note = error ?? hint;
  const noteId = note != null ? `${inputId}-note` : undefined;
  const invalid = error != null;
  return (
    <div className={classes('paws-input', className)} data-invalid={invalid || undefined}>
      <label className="paws-input__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="paws-input__field"
        aria-invalid={invalid || undefined}
        aria-describedby={noteId}
        {...rest}
      />
      {note != null && (
        <p id={noteId} className="paws-input__note" role={invalid ? 'alert' : undefined}>
          {note}
        </p>
      )}
    </div>
  );
}
