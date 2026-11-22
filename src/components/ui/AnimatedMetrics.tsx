'use client';

import { useEffect, useState } from 'react';
import type { PriceDirection } from '@/store/useTradingStore';

/**
 * Smooth rolling tabular number interpolation (Design System Animation #2).
 * Uses requestAnimationFrame so layout never jitters and respects reduced-motion.
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = 280,
  className = '',
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const [rendered, setRendered] = useState(value);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced || Math.abs(value - rendered) < 1e-6) {
      const id = window.requestAnimationFrame(() => setRendered(value));
      return () => window.cancelAnimationFrame(id);
    }

    const startVal = rendered;
    const delta = value - startVal;
    const startTs = performance.now();
    let rafId = 0;

    const step = (now: number) => {
      const elapsed = now - startTs;
      const t = Math.min(1, elapsed / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setRendered(startVal + delta * eased);
      if (t < 1) {
        rafId = window.requestAnimationFrame(step);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
    // Intentional target-driven interpolation from current rendered number to latest target value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return <span className={`tabular-nums-strict ${className}`}>{format(rendered)}</span>;
}

/**
 * Live tick highlight flash (Design System Animation #1).
 * Re-keys a subtle CSS background animation on uptick/downtick without DOM layout shift.
 */
export function TickFlashValue({
  text,
  direction,
  tickSeq,
  className = '',
}: {
  text: string;
  direction: PriceDirection;
  tickSeq: number;
  className?: string;
}) {
  const animClass =
    tickSeq > 0
      ? direction === 'up'
        ? 'tick-up'
        : direction === 'down'
          ? 'tick-down'
          : ''
      : '';

  return (
    <span
      key={`${tickSeq}-${direction}`}
      className={`tabular-nums-strict rounded-[3px] px-1 py-0.5 ${animClass} ${className}`}
    >
      {text}
    </span>
  );
}
