import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../src/index.js';

describe('Button', () => {
  it('renders a primary, medium, non-submitting button by default', () => {
    render(<Button>Play</Button>);
    const button = screen.getByRole('button', { name: 'Play' });
    expect(button).toHaveClass('paws-button');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-size', 'md');
  });

  it('reflects variant and size, and keeps a caller class', () => {
    render(
      <Button variant="secondary" size="sm" className="wide">
        Open
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Open' });
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveAttribute('data-size', 'sm');
    expect(button).toHaveClass('paws-button', 'wide');
  });

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Drop</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Drop' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Drop
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Drop' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('passes a ref and native attributes through', () => {
    let node: HTMLButtonElement | null = null;
    render(
      <Button ref={(el) => void (node = el)} type="submit" aria-pressed="true">
        Save
      </Button>,
    );
    expect(node).toBe(screen.getByRole('button', { name: 'Save' }));
    expect(node).toHaveAttribute('type', 'submit');
    expect(node).toHaveAttribute('aria-pressed', 'true');
  });
});
