import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from '../src/index.js';

describe('Card', () => {
  it('renders its children inside a card', () => {
    render(<Card data-testid="card">Three plays left</Card>);
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('paws-card');
    expect(card).toHaveTextContent('Three plays left');
  });

  it('shows a heading when given a title', () => {
    render(<Card title="Prizes">Bear</Card>);
    expect(screen.getByRole('heading', { name: 'Prizes' })).toHaveClass('paws-card__title');
  });

  it('renders no heading without a title', () => {
    render(<Card>Bear</Card>);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('keeps a caller class and native attributes', () => {
    render(
      <Card className="wide" aria-label="Stats" data-testid="card">
        0
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('paws-card', 'wide');
    expect(card).toHaveAttribute('aria-label', 'Stats');
  });
});
