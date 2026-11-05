import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Input } from '../src/index.js';

describe('Input', () => {
  it('associates the label with the field', () => {
    render(<Input label="Player name" />);
    expect(screen.getByLabelText('Player name')).toHaveClass('paws-input__field');
  });

  it('uses a caller id when given one', () => {
    render(<Input label="Player name" id="player" />);
    expect(screen.getByLabelText('Player name')).toHaveAttribute('id', 'player');
  });

  it('reports typed text through onChange', async () => {
    const onChange = vi.fn();
    render(<Input label="Player name" onChange={onChange} />);
    const field = screen.getByLabelText('Player name');
    await userEvent.type(field, 'Mo');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(field).toHaveValue('Mo');
  });

  it('describes the field with its hint', () => {
    render(<Input label="Player name" hint="Shown on the scoreboard" />);
    const field = screen.getByLabelText('Player name');
    expect(field).toHaveAccessibleDescription('Shown on the scoreboard');
    expect(field).not.toHaveAttribute('aria-invalid');
  });

  it('marks the field invalid and announces the error in place of the hint', () => {
    render(<Input label="Player name" hint="Shown on the scoreboard" error="Name is taken" />);
    const field = screen.getByLabelText('Player name');
    expect(field).toBeInvalid();
    expect(field).toHaveAccessibleDescription('Name is taken');
    expect(screen.getByRole('alert')).toHaveTextContent('Name is taken');
    expect(screen.queryByText('Shown on the scoreboard')).toBeNull();
  });
});
