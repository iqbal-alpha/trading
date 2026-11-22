'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  INITIAL_CHALLENGE_BALANCE,
  calculateTotalEquity,
} from '@/lib/trading-math';
import { useTradingStore } from '@/store/useTradingStore';
import { JournalReportBody } from '@/components/terminal/JournalReportBody';
import { CloudUpload, ExternalLink, RotateCcw, Sparkles } from 'lucide-react';

export function TradingJournalView({
  onActionNotice,
  onOpenSyncModal,
}: {
  onActionNotice: (message: string, isError?: boolean) => void;
  onOpenSyncModal: () => void;
}) {
  const tradeHistory = useTradingStore((s) => s.tradeHistory);
  const openPositions = useTradingStore((s) => s.openPositions);
  const walletBalance = useTradingStore((s) => s.walletBalance);
  const startOfDayEquity = useTradingStore((s) => s.startOfDayEquity);
  const peakEquity = useTradingStore((s) => s.peakEquity);
  const markPrices = useTradingStore((s) => s.markPrices);
  const accountStatus = useTradingStore((s) => s.accountStatus);
  const lastSyncedShareUrl = useTradingStore((s) => s.lastSyncedShareUrl);
  const resetDemoAccount = useTradingStore((s) => s.resetDemoAccount);
  const startFreshAccount = useTradingStore((s) => s.startFreshAccount);
  const updateTradeNote = useTradingStore((s) => s.updateTradeNote);

  const totalEquity = calculateTotalEquity(walletBalance, openPositions, markPrices);
  const netReturnPct =
    ((totalEquity - INITIAL_CHALLENGE_BALANCE) / INITIAL_CHALLENGE_BALANCE) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-3 py-4 md:px-6 md:py-5"
    >
      {/* Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] md:text-[16px]">
            Prop Firm Evaluation Journal · Phase 1 ($100,000)
          </h1>
          <span
            className={`tabular-nums-strict inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[11px] font-bold ${
              accountStatus === 'BREACHED' || accountStatus === 'DAILY_BREACHED'
                ? 'bg-[var(--short-tint)] text-[var(--short-bright)]'
                : 'bg-[var(--long-tint)] text-[var(--long-bright)]'
            }`}
          >
            {accountStatus} · {netReturnPct >= 0 ? '+' : ''}
            {netReturnPct.toFixed(2)}%
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lastSyncedShareUrl && (
            <Link
              href={lastSyncedShareUrl}
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--long)]/40 bg-[var(--long-tint)] px-3 text-[12px] font-semibold text-[var(--long-bright)] hover:border-[var(--long)]"
            >
              <span>Shared Report</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              startFreshAccount();
              onActionNotice('Started fresh $100,000.00 clean challenge (0 trades).');
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-3 text-[12px] font-medium text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Start Fresh ($100k)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              resetDemoAccount();
              onActionNotice('Reset account back to pre-seeded 12-trade demo.');
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-3 text-[12px] font-medium text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Demo</span>
          </button>
          <button
            type="button"
            onClick={onOpenSyncModal}
            className="glow-long inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--long)] px-3.5 text-[12px] font-bold text-[var(--bg-ground)] hover:bg-[var(--long-bright)]"
          >
            <CloudUpload className="h-3.5 w-3.5" />
            <span>Sync &amp; Publish to Leaderboard</span>
          </button>
        </div>
      </div>

      <JournalReportBody
        totalEquity={totalEquity}
        startOfDayEquity={startOfDayEquity}
        peakEquity={peakEquity}
        tradeHistory={tradeHistory}
        readOnly={false}
        onSaveNote={(id, tag, notes) => {
          updateTradeNote(id, tag, notes);
          onActionNotice('Saved strategy tag & trade evaluation note.');
        }}
      />
    </motion.div>
  );
}
