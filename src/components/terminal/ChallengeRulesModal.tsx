'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  INITIAL_CHALLENGE_BALANCE,
  PROFIT_TARGET_USD,
  calculateTotalEquity,
} from '@/lib/trading-math';
import { useTradingStore } from '@/store/useTradingStore';
import { RefreshCw, RotateCcw, ShieldCheck, Sparkles, Wifi, X } from 'lucide-react';

interface ChallengeRulesModalProps {
  open: boolean;
  onClose: () => void;
  onActionNotice: (msg: string) => void;
}

const RULES = [
  {
    label: 'Initial Virtual Balance',
    value: '$100,000.00',
    detail: 'Instant localStorage account with pre-seeded 12-trade history.',
    tone: 'text-[var(--text-primary)]',
  },
  {
    label: 'Phase 1 Profit Target (+8.0%)',
    value: '$108,000.00',
    detail: 'Reach +$8,000 net equity growth to mark evaluation PASSED.',
    tone: 'text-[var(--long-bright)]',
  },
  {
    label: 'Max Daily Loss (-5.0%)',
    value: '-$5,000.00',
    detail: 'Calculated from UTC start-of-day equity; locks new orders on breach.',
    tone: 'text-[var(--accent)]',
  },
  {
    label: 'Max Static Drawdown (-10.0%)',
    value: '$90,000.00',
    detail: 'Hard equity floor relative to $100,000 initial balance.',
    tone: 'text-[var(--short-bright)]',
  },
];

export function ChallengeRulesModal({
  open,
  onClose,
  onActionNotice,
}: ChallengeRulesModalProps) {
  const walletBalance = useTradingStore((s) => s.walletBalance);
  const openPositions = useTradingStore((s) => s.openPositions);
  const markPrices = useTradingStore((s) => s.markPrices);
  const feedMode = useTradingStore((s) => s.feedMode);
  const feedLatencyMs = useTradingStore((s) => s.feedLatencyMs);
  const triggerFeedRetry = useTradingStore((s) => s.triggerFeedRetry);
  const resetDemoAccount = useTradingStore((s) => s.resetDemoAccount);
  const startFreshAccount = useTradingStore((s) => s.startFreshAccount);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const currentEquity = calculateTotalEquity(walletBalance, openPositions, markPrices);
  const progressPct = Math.max(
    0,
    Math.min(100, ((currentEquity - INITIAL_CHALLENGE_BALANCE) / PROFIT_TARGET_USD) * 100)
  );

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="challenge-rules-title"
        >
          <motion.button
            type="button"
            aria-label="Close Challenge Rules"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 bg-[#07080A]/75 backdrop-blur-[4px]"
          />

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="elevation-floating relative z-10 w-full max-w-[460px] rounded-t-[12px] border border-[var(--border-default)] bg-[var(--bg-floating)] p-5 sm:rounded-[var(--radius-panel)]"
          >
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
                <h2
                  id="challenge-rules-title"
                  className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
                >
                  Prop Firm Challenge Rules
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              <div className="mb-1.5 flex items-center justify-between text-[12px]">
                <span className="font-medium text-[var(--text-secondary)]">
                  Phase 1 Progress
                </span>
                <span className="tabular-nums-strict font-semibold text-[var(--long-bright)]">
                  ${currentEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({progressPct.toFixed(1)}% of target)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-ground)]">
                <div
                  className="h-full rounded-full bg-[var(--long)] transition-all duration-300"
                  style={{ width: `${Math.max(2, progressPct)}%` }}
                />
              </div>
            </div>

            <div className="space-y-2.5">
              {RULES.map((rule) => (
                <div
                  key={rule.label}
                  className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-3.5 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                      {rule.label}
                    </span>
                    <span className={`tabular-nums-strict text-[13px] font-semibold ${rule.tone}`}>
                      {rule.value}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-[1.4] text-[var(--text-muted)]">
                    {rule.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3.5">
              {feedMode === 'fallback' ? (
                <button
                  type="button"
                  onClick={triggerFeedRetry}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--accent-tint)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:text-[var(--text-primary)]"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Simulated Feed · Retry Live</span>
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--long-tint)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--long-bright)]">
                  <Wifi className="h-3.5 w-3.5" />
                  <span className="tabular-nums-strict">
                    Binance Vision · {feedLatencyMs}ms
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    startFreshAccount();
                    onClose();
                    onActionNotice('Started fresh $100,000 clean evaluation.');
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <Sparkles className="h-3 w-3" />
                  Start Fresh
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetDemoAccount();
                    onClose();
                    onActionNotice('Reset account to 12-trade $100k demo state.');
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-focus)] bg-[var(--bg-raised)] px-3 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset Demo
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
