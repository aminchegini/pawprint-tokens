import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '../src/index.js';

describe('Badge', () => {
  it('renders a neutral badge by default', () => {
    render(<Badge>New</Badge>);
    const badge = screen.getByText('New');
    expect(badge).toHaveClass('paws-badge');
    expect(badge).toHaveAttribute('data-tone', 'neutral');
  });

  it.each(['accent', 'win', 'miss'] as const)('reflects the %s tone', (tone) => {
    render(<Badge tone={tone}>Result</Badge>);
    expect(screen.getByText('Result')).toHaveAttribute('data-tone', tone);
  });

  it('keeps a caller class and native attributes', () => {
    render(
      <Badge className="corner" title="Won 3 times">
        3
      </Badge>,
    );
    const badge = screen.getByText('3');
    expect(badge).toHaveClass('paws-badge', 'corner');
    expect(badge).toHaveAttribute('title', 'Won 3 times');
  });
});
