import { useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import './pink.css';

const trim = 'trim'; // a bare word is not a token usage

export function App({ active }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.style.setProperty('--pink', '#ff3f94');
    console.log(getComputedStyle(ref.current).getPropertyValue("--line"), trim);
  }, []);
  return (
    <main
      ref={ref}
      className="bg-bg text-muted md:hover:bg-card/80"
      style={{ borderColor: 'var(--line)', '--trim': 'gold' }}
    >
      <button
        className={clsx(
          'rounded-full bg-btn-red px-4',
          active && '!border-trim-deep',
          `ring-mint ${active ? 'text-pink' : 'text-muted'} shadow-lg`,
        )}
      >
        Play
      </button>
      <p className="text-pinkish bg-[var(--pink)] border-(--trim)">pink trim</p>
    </main>
  );
}
