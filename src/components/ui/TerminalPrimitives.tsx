'use client';

import { motion } from 'framer-motion';
import type { PositionSide, Timeframe } from '@/lib/trading-math';
import { ChevronDown } from 'lucide-react';

export interface KpiItem {
  id: string;
  label: string;
  value: string;
  sublabel: string;
  tone: 'neutral' | 'long' | 'short' | 'accent';
}

export function AetherMark({ className = '' }: { className?: string }) {
  return (
    <svg
      width="22"
      height="26"
      viewBox="0 0 22 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M0 4C0 1.79086 1.79086 0 4 0H18C20.2091 0 22 1.79086 22 4V22C22 24.2091 20.2091 26 18 26H4C1.79086 26 0 24.2091 0 22V4Z"
        fill="#10B981"
      />
      <path
        d="M7 17L9.704 8.082H14.618L14.423 9.343H12.174V11.826H14.072V13.061H12.174V15.7H14.488L14.683 17H10.77V9.356H10.692L8.547 17H7ZM8.547 15.063V13.88H11.524V15.063H8.547Z"
        fill="#07080A"
      />
    </svg>
  );
}

export function SideBadge({
  side,
  leverage,
}: {
  side: PositionSide;
  leverage: number;
}) {
  const isLong = side === 'LONG';
  return (
    <span
      className={`tabular-nums-strict inline-flex shrink-0 items-center whitespace-nowrap rounded-[var(--radius-pill)] px-2 py-[3px] text-[11px] font-bold tracking-[0.01em] ${
        isLong
          ? 'bg-[var(--long-tint)] text-[var(--long-bright)]'
          : 'bg-[var(--short-tint)] text-[var(--short-bright)]'
      }`}
    >
      {side} {leverage}x
    </span>
  );
}

export function MarketPairPill({
  symbol,
  priceText,
  changePct,
  onClick,
  isOpen = false,
  flashClass = '',
}: {
  symbol: string;
  priceText: string;
  changePct: number;
  onClick?: () => void;
  isOpen?: boolean;
  flashClass?: string;
}) {
  const isUp = changePct >= 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2.5 text-left transition-colors hover:border-[var(--border-focus)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-focus)]"
    >
      <span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
      <span className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
        {symbol}
      </span>
      <span
        className={`tabular-nums-strict rounded-[3px] px-1 text-[13px] font-medium text-[var(--text-primary)] ${flashClass}`}
      >
        {priceText}
      </span>
      <span
        className={`tabular-nums-strict text-[12px] font-medium ${
          isUp ? 'text-[var(--long-bright)]' : 'text-[var(--short-bright)]'
        }`}
      >
        {isUp ? '+' : ''}
        {changePct.toFixed(2)}%
      </span>
      <ChevronDown className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
    </button>
  );
}

export function TimeframePill({
  label,
  active,
  onClick,
  layoutGroupId = 'tf-pill',
}: {
  label: Timeframe;
  active: boolean;
  onClick: () => void;
  layoutGroupId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tabular-nums-strict relative inline-flex min-h-[44px] min-w-[38px] items-center justify-center rounded-[var(--radius-control)] px-2 text-[12px] font-medium transition-colors md:min-h-[28px] md:min-w-0 md:px-2.5 ${
        active
          ? 'text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {active && (
        <motion.span
          layoutId={layoutGroupId}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 rounded-[var(--radius-control)] border border-[var(--border-focus)] bg-[var(--bg-raised)]"
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  );
}

export function QuickPctPill({
  label,
  selected,
  onClick,
  mobileTall = false,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  mobileTall?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tabular-nums-strict inline-flex flex-1 items-center justify-center rounded-[var(--radius-control)] border text-[12px] font-medium transition-colors ${
        mobileTall ? 'min-h-[44px]' : 'h-8'
      } ${
        selected
          ? 'border-[var(--long)] bg-[var(--long-tint)] text-[var(--long-bright)]'
          : 'border-[var(--border-default)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)]'
      }`}
    >
      {label}
    </button>
  );
}

export function JournalKpiCell({
  kpi,
  index = 0,
}: {
  kpi: KpiItem;
  index?: number;
}) {
  const toneClass =
    kpi.tone === 'long'
      ? 'text-[var(--long-bright)]'
      : kpi.tone === 'short'
        ? 'text-[var(--short-bright)]'
        : kpi.tone === 'accent'
          ? 'text-[var(--accent)]'
          : 'text-[var(--text-primary)]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.26,
        delay: index * 0.035,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="flex flex-col gap-1.5 bg-[var(--bg-raised)] px-4 py-3.5"
    >
      <span className="text-[12px] font-medium text-[var(--text-secondary)]">
        {kpi.label}
      </span>
      <span
        className={`tabular-nums-strict text-[20px] font-semibold leading-[1.15] tracking-[-0.02em] md:text-[22px] ${toneClass}`}
      >
        {kpi.value}
      </span>
      <span className="tabular-nums-strict text-[11px] font-medium text-[var(--text-muted)]">
        {kpi.sublabel}
      </span>
    </motion.div>
  );
}
