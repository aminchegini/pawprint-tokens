import { useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import './pink.css';

const trim = 'trim'; // a bare word is not a token usage

export function App({ active }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.style.setProperty('--color-cabinet-body', '#ff3f94');
    console.log(getComputedStyle(ref.current).getPropertyValue("--color-border-default"), trim);
  }, []);
  return (
    <main
      ref={ref}
      className="bg-surface-page text-text-muted md:hover:bg-surface-card/80"
      style={{ borderColor: 'var(--color-border-default)', '--color-accent-trim': 'gold' }}
    >
      <button
        className={clsx(
          'rounded-full bg-action-primary px-4',
          active && '!border-accent-trim-pressed',
          `ring-accent-highlight ${active ? 'text-cabinet-body' : 'text-text-muted'} shadow-lg`,
        )}
      >
        Play
      </button>
      <p className="text-pinkish bg-[var(--color-cabinet-body)] border-(--color-accent-trim)">pink trim</p>
    </main>
  );
}
