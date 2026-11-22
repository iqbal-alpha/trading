'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatRelativeTime } from '@/lib/preseeded-trades';
import {
  CHALLENGE_BREACH_FLOOR,
  CHALLENGE_PASS_EQUITY,
  INITIAL_CHALLENGE_BALANCE,
  MAX_DAILY_LOSS_USD,
  MAX_STATIC_DRAWDOWN_USD,
  PROFIT_TARGET_USD,
  calculateJournalStats,
  type OpenPosition,
  type TradeJournalEntry,
} from '@/lib/trading-math';
import { JournalKpiCell, SideBadge, type KpiItem } from '@/components/ui/TerminalPrimitives';
import { ChevronDown, Pencil } from 'lucide-react';

type HistoryFilter = 'ALL' | 'WINS' | 'LOSSES' | 'BTC/USDT' | 'XAU/USD';

const STRATEGY_TAGS = [
  'Breakout',
  'Trend',
  'London Sweep',
  'EMA Pullback',
  'Range Fade',
  'Scalp Fade',
  'Reversal',
  'NY Open',
  'Discretionary',
];

interface JournalReportBodyProps {
  totalEquity: number;
  startOfDayEquity: number;
  peakEquity: number;
  initialBalance?: number;
  openPositions?: OpenPosition[];
  tradeHistory: TradeJournalEntry[];
  readOnly?: boolean;
  onSaveNote?: (id: string, strategyTag: string, notes: string) => void;
}

export function JournalReportBody({
  totalEquity,
  startOfDayEquity,
  peakEquity,
  initialBalance = INITIAL_CHALLENGE_BALANCE,
  openPositions,
  tradeHistory,
  readOnly = false,
  onSaveNote,
}: JournalReportBodyProps) {
  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const [expandedId, setExpandedId] = useState<string>(tradeHistory[0]?.id ?? '');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('Discretionary');

  const stats = calculateJournalStats(tradeHistory, initialBalance);

  const targetDelta = totalEquity - initialBalance;
  const targetProgressPct = Math.max(0, Math.min(100, (targetDelta / PROFIT_TARGET_USD) * 100));
  const dailyLossUsed = Math.max(0, startOfDayEquity - totalEquity);
  const dailyLossPctOfLimit = Math.min(100, (dailyLossUsed / MAX_DAILY_LOSS_USD) * 100);
  const staticDdUsed = Math.max(0, initialBalance - Math.min(totalEquity, peakEquity));
  const staticDdPctOfLimit = Math.min(100, (staticDdUsed / MAX_STATIC_DRAWDOWN_USD) * 100);

  const dailyNearLimit = dailyLossPctOfLimit >= 80;
  const overallNearLimit = staticDdPctOfLimit >= 80;

  const svgW = 854;
  const svgH = 115;
  const values = stats.equityCurve.map((p) => p.equity);
  const minVal = Math.min(CHALLENGE_BREACH_FLOOR, ...values);
  const maxVal = Math.max(CHALLENGE_PASS_EQUITY, ...values);
  const span = Math.max(1000, maxVal - minVal);

  const coords = stats.equityCurve.map((pt, idx) => {
    const x =
      stats.equityCurve.length === 1
        ? svgW
        : (idx / (stats.equityCurve.length - 1)) * svgW;
    const normY = (pt.equity - minVal) / span;
    const y = Number((svgH - normY * (svgH - 12) - 6).toFixed(2));
    return { x: Number(x.toFixed(2)), y };
  });

  const linePath =
    coords.length >= 2
      ? `M ${coords.map((c) => `${c.x} ${c.y}`).join(' L ')}`
      : `M 0 ${coords[0]?.y ?? 58} L ${svgW} ${coords[0]?.y ?? 58}`;
  const areaPath = `${linePath} L ${svgW} ${svgH} L 0 ${svgH} Z`;
  const lastDot = coords[coords.length - 1] ?? { x: svgW, y: 58 };
  const dotTopPct = Math.max(2, Math.min(96, (lastDot.y / svgH) * 100));

  const formatMoneySigned = (v: number) =>
    `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const kpiItems: KpiItem[] = [
    {
      id: 'win-rate',
      label: 'Win rate',
      value: `${stats.winRatePct.toFixed(1)}%`,
      sublabel: `${stats.winsCount} wins · ${stats.lossesCount} losses`,
      tone: stats.winRatePct >= 50 ? 'long' : 'neutral',
    },
    {
      id: 'profit-factor',
      label: 'Profit factor',
      value: stats.profitFactor === null ? '∞' : stats.profitFactor.toFixed(2),
      sublabel: `Gross +$${(stats.grossProfit / 1000).toFixed(1)}k / -$${(stats.grossLoss / 1000).toFixed(1)}k`,
      tone: 'neutral',
    },
    {
      id: 'max-dd',
      label: 'Max drawdown',
      value: `-${stats.maxDrawdownPct.toFixed(2)}%`,
      sublabel: `-$${Math.round(stats.maxDrawdownUsd).toLocaleString('en-US')} vs -$10k limit`,
      tone: stats.maxDrawdownUsd > 5000 ? 'short' : 'accent',
    },
    {
      id: 'net-pnl',
      label: 'Net realized PnL',
      value: formatMoneySigned(stats.netRealizedPnl),
      sublabel: `${Math.max(0, (stats.netRealizedPnl / PROFIT_TARGET_USD) * 100).toFixed(1)}% of +$8k target`,
      tone: stats.netRealizedPnl >= 0 ? 'long' : 'short',
    },
    {
      id: 'expectancy',
      label: 'Trade expectancy',
      value: formatMoneySigned(stats.expectancyUsd),
      sublabel: `Avg R:R 1 : ${stats.avgRr.toFixed(2)}`,
      tone: 'neutral',
    },
    {
      id: 'best-worst',
      label: 'Best / Worst',
      value: stats.bestTrade ? formatMoneySigned(stats.bestTrade.pnl) : '$0.00',
      sublabel: stats.worstTrade
        ? `Worst: ${formatMoneySigned(stats.worstTrade.pnl)}`
        : 'No closed trades yet',
      tone: 'neutral',
    },
  ];

  const filteredTrades = tradeHistory.filter((t) => {
    if (filter === 'WINS') return t.realizedPnl > 0;
    if (filter === 'LOSSES') return t.realizedPnl < 0;
    if (filter === 'BTC/USDT') return t.symbol === 'BTC/USDT';
    if (filter === 'XAU/USD') return t.symbol.includes('XAU');
    return true;
  });

  const filters: { id: HistoryFilter; label: string }[] = [
    { id: 'ALL', label: `All (${tradeHistory.length})` },
    { id: 'WINS', label: `Wins (${stats.winsCount})` },
    { id: 'LOSSES', label: `Losses (${stats.lossesCount})` },
    { id: 'BTC/USDT', label: 'BTC/USDT' },
    { id: 'XAU/USD', label: 'XAU/USD' },
  ];

  const beginEditNote = (tr: TradeJournalEntry) => {
    if (readOnly) return;
    setEditingNoteId(tr.id);
    setTagDraft(tr.strategyTag);
    setNoteDraft(tr.notes);
  };

  const handleSaveNote = (id: string) => {
    onSaveNote?.(id, tagDraft, noteDraft.trim());
    setEditingNoteId(null);
  };

  return (
    <>
      {/* 6-Cell Divided Hairline KPI Strip */}
      <div className="grid grid-cols-2 gap-[1px] overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--border-subtle)] md:grid-cols-3 xl:grid-cols-6">
        {kpiItems.map((kpi, idx) => (
          <JournalKpiCell key={kpi.id} kpi={kpi} index={idx} />
        ))}
      </div>

      {/* Middle Row: Equity Curve + Prop Firm Challenge Rules */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2.05fr)_minmax(340px,1fr)]">
        <section className="flex flex-col justify-between rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
              Cumulative Equity Curve ({tradeHistory.length} Closed Trades)
            </h2>
            <span className="tabular-nums-strict text-[12px] font-medium text-[var(--text-secondary)]">
              Target $108,000 · Max DD $90,000
            </span>
          </div>

          <div className="relative flex min-h-[168px] flex-col justify-between rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5">
            <div className="flex items-center justify-between border-b border-dashed border-[var(--long)]/60 pb-1">
              <span className="tabular-nums-strict text-[10px] font-medium text-[var(--long-bright)]">
                PROFIT TARGET +8% ($108,000)
              </span>
            </div>

            <div className="relative my-2 h-[105px] w-full">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                preserveAspectRatio="none"
                className="h-full w-full overflow-visible"
                role="img"
                aria-label="Cumulative Equity Curve from $100,000 initial capital"
              >
                <defs>
                  <linearGradient id="aetherEquityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <motion.path
                  d={areaPath}
                  fill="url(#aetherEquityGrad)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.25 }}
                />
                <motion.path
                  key={tradeHistory.length}
                  d={linePath}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                />
              </svg>
              <span
                aria-hidden="true"
                style={{ top: `${dotTopPct}%` }}
                className="absolute right-[-4px] h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--long-bright)] ring-4 ring-[var(--long)]/25"
              />
            </div>

            <div className="flex items-center justify-between border-t border-dashed border-[var(--short)]/60 pt-1">
              <span className="tabular-nums-strict text-[10px] font-medium text-[var(--short-bright)]">
                MAX DRAWDOWN LIMIT -10% ($90,000)
              </span>
            </div>
          </div>
        </section>

        <section className="flex flex-col justify-between gap-3 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
            Prop Firm Challenge Rules
          </h2>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-[var(--text-secondary)]">Phase 1 Target (+$8,000)</span>
                <span className="tabular-nums-strict font-medium text-[var(--long)]">
                  {formatMoneySigned(targetDelta)} ({targetProgressPct.toFixed(1)}%)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-ground)]">
                <div
                  className="h-full origin-left rounded-full bg-[var(--long)] transition-transform duration-300"
                  style={{ transform: `scaleX(${Math.max(0.02, targetProgressPct / 100)})` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-[var(--text-secondary)]">Max Daily Loss (-$5,000)</span>
                <span
                  className={`tabular-nums-strict font-medium ${
                    dailyNearLimit ? 'text-[var(--short-bright)]' : 'text-[var(--accent)]'
                  }`}
                >
                  ${dailyLossUsed.toFixed(2)} used ({dailyNearLimit ? 'Danger' : 'Safe'})
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-ground)]">
                <div
                  className={`h-full origin-left rounded-full transition-transform duration-300 ${
                    dailyNearLimit
                      ? 'animate-pulse bg-[var(--short)]'
                      : 'bg-[var(--accent)]'
                  }`}
                  style={{ transform: `scaleX(${Math.max(0.03, dailyLossPctOfLimit / 100)})` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-[var(--text-secondary)]">Max Overall DD (-$10k)</span>
                <span
                  className={`tabular-nums-strict font-medium ${
                    overallNearLimit ? 'text-[var(--short-bright)]' : 'text-[var(--info)]'
                  }`}
                >
                  -${Math.round(staticDdUsed).toLocaleString('en-US')} (
                  {staticDdPctOfLimit.toFixed(1)}%)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-ground)]">
                <div
                  className={`h-full origin-left rounded-full transition-transform duration-300 ${
                    overallNearLimit
                      ? 'animate-pulse bg-[var(--short)]'
                      : 'bg-[var(--info)]'
                  }`}
                  style={{ transform: `scaleX(${Math.max(0.03, staticDdPctOfLimit / 100)})` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-[var(--bg-surface)] px-3 py-2 text-[12px]">
            <span className="tabular-nums-strict font-semibold text-[var(--long-bright)]">
              Long Win:{' '}
              {stats.longTotal > 0
                ? `${Math.round((stats.longWins / stats.longTotal) * 100)}%`
                : '0%'}{' '}
              ({stats.longWins}/{stats.longTotal})
            </span>
            <span className="tabular-nums-strict font-medium text-[var(--text-secondary)]">
              Short Win:{' '}
              {stats.shortTotal > 0
                ? `${Math.round((stats.shortWins / stats.shortTotal) * 100)}%`
                : '0%'}{' '}
              ({stats.shortWins}/{stats.shortTotal})
            </span>
          </div>
        </section>
      </div>

      {/* Optional Read-Only Open Positions Snapshot (on shared /challenge/[id] route) */}
      {readOnly && openPositions && openPositions.length > 0 && (
        <section className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
              Active Open Positions Snapshot ({openPositions.length})
            </h2>
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              Captured at sync time
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-muted)]">
                  <th className="px-4 py-2.5 font-medium">Instrument / Side</th>
                  <th className="px-4 py-2.5 font-medium">Notional / Margin</th>
                  <th className="px-4 py-2.5 text-right font-medium">Entry Price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Liq. Price</th>
                  <th className="px-4 py-2.5 text-right font-medium">TP / SL</th>
                  <th className="px-4 py-2.5 text-right font-medium">Strategy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-[13px]">
                {openPositions.map((pos) => (
                  <tr key={pos.id} className="hover:bg-[var(--bg-raised)]/40">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {pos.symbol}
                        </span>
                        <SideBadge side={pos.side} leverage={pos.leverage} />
                      </div>
                    </td>
                    <td className="tabular-nums-strict whitespace-nowrap px-4 py-3 text-[12px] text-[var(--text-secondary)]">
                      ${pos.notionalUsd.toLocaleString('en-US')} · Margin $
                      {pos.marginUsd.toLocaleString('en-US')}
                    </td>
                    <td className="tabular-nums-strict whitespace-nowrap px-4 py-3 text-right font-medium text-[var(--text-primary)]">
                      ${pos.entryPrice.toLocaleString('en-US')}
                    </td>
                    <td className="tabular-nums-strict whitespace-nowrap px-4 py-3 text-right font-medium text-[var(--accent)]">
                      ${pos.liqPrice.toLocaleString('en-US')}
                    </td>
                    <td className="tabular-nums-strict whitespace-nowrap px-4 py-3 text-right text-[12px] text-[var(--text-secondary)]">
                      {pos.tpPrice ? `$${pos.tpPrice.toLocaleString('en-US')}` : '—'} /{' '}
                      {pos.slPrice ? `$${pos.slPrice.toLocaleString('en-US')}` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-[12px] text-[var(--text-muted)]">
                      {pos.strategyTag}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Trade History Log */}
      <section className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
            Trade History Log ({tradeHistory.length} Closed Trades)
          </h2>

          <div className="flex flex-wrap items-center gap-1.5">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`tabular-nums-strict inline-flex min-h-[44px] shrink-0 items-center rounded-[var(--radius-pill)] px-3 text-[12px] font-medium transition-colors md:min-h-[28px] md:px-2.5 md:py-1 ${
                  filter === f.id
                    ? 'bg-[var(--bg-raised)] text-[var(--text-primary)] ring-1 ring-[var(--border-focus)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTrades.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[var(--text-secondary)]">
            No closed trades match this filter yet.
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-muted)]">
                    <th className="px-4 py-2.5 font-medium">Closed</th>
                    <th className="px-4 py-2.5 font-medium">Instrument / Side</th>
                    <th className="px-4 py-2.5 font-medium">Entry to Exit</th>
                    <th className="px-4 py-2.5 font-medium">Outcome</th>
                    <th className="px-4 py-2.5 font-medium">Strategy</th>
                    <th className="px-4 py-2.5 font-medium">Trade Notes</th>
                    <th className="px-4 py-2.5 text-right font-medium">Realized PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] text-[13px]">
                  {filteredTrades.map((trade) => {
                    const isWin = trade.realizedPnl >= 0;
                    const isEditing = !readOnly && editingNoteId === trade.id;
                    return (
                      <tr
                        key={trade.id}
                        className="transition-colors hover:bg-[var(--bg-raised)]/50"
                      >
                        <td className="tabular-nums-strict whitespace-nowrap px-4 py-3.5 text-[12px] text-[var(--text-muted)]">
                          {formatRelativeTime(trade.closedAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--text-primary)]">
                              {trade.symbol}
                            </span>
                            <SideBadge side={trade.side} leverage={trade.leverage} />
                          </div>
                        </td>
                        <td className="tabular-nums-strict whitespace-nowrap px-4 py-3.5 text-[12px] text-[var(--text-secondary)]">
                          ${trade.entryPrice.toLocaleString('en-US')} to $
                          {trade.exitPrice.toLocaleString('en-US')}
                        </td>
                        <td className="tabular-nums-strict whitespace-nowrap px-4 py-3.5 text-[11px] font-bold">
                          <span
                            className={
                              trade.closeReason === 'SL_HIT' ||
                              trade.closeReason === 'LIQUIDATED' ||
                              trade.closeReason === 'CHALLENGE_BREACH'
                                ? 'text-[var(--short-bright)]'
                                : 'text-[var(--long-bright)]'
                            }
                          >
                            {trade.closeReason}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-[12px] text-[var(--text-secondary)]">
                          {isEditing ? (
                            <select
                              aria-label="Strategy Tag"
                              value={tagDraft}
                              onChange={(e) => setTagDraft(e.target.value)}
                              className="h-7 rounded border border-[var(--border-focus)] bg-[var(--bg-raised)] px-1.5 text-[11px] text-[var(--text-primary)]"
                            >
                              {STRATEGY_TAGS.map((tag) => (
                                <option key={tag} value={tag}>
                                  {tag}
                                </option>
                              ))}
                            </select>
                          ) : (
                            trade.strategyTag
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-[12px] text-[var(--text-muted)]">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                aria-label="Trade Evaluation Note"
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                className="h-7 flex-1 rounded border border-[var(--border-focus)] bg-[var(--bg-raised)] px-2 text-[12px] text-[var(--text-primary)]"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveNote(trade.id)}
                                className="rounded bg-[var(--long)] px-2 py-1 text-[11px] font-bold text-[var(--bg-ground)]"
                              >
                                Save
                              </button>
                            </div>
                          ) : readOnly ? (
                            <span>{trade.notes || '—'}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => beginEditNote(trade)}
                              className="group inline-flex items-center gap-1.5 text-left hover:text-[var(--text-primary)]"
                            >
                              <span>{trade.notes || 'Add evaluation note...'}</span>
                              <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-75" />
                            </button>
                          )}
                        </td>
                        <td
                          className={`tabular-nums-strict whitespace-nowrap px-4 py-3.5 text-right font-semibold ${
                            isWin
                              ? 'text-[var(--long-bright)]'
                              : 'text-[var(--short-bright)]'
                          }`}
                        >
                          {formatMoneySigned(trade.realizedPnl)} (
                          {trade.roePct >= 0 ? '+' : ''}
                          {trade.roePct.toFixed(1)}%)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Expandable History Cards */}
            <div className="divide-y divide-[var(--border-subtle)] md:hidden">
              {filteredTrades.map((trade) => {
                const isOpen = expandedId === trade.id;
                const isWin = trade.realizedPnl >= 0;
                return (
                  <button
                    key={trade.id}
                    type="button"
                    onClick={() => setExpandedId(isOpen ? '' : trade.id)}
                    className="flex w-full flex-col gap-2 px-4 py-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                        {trade.symbol} · {trade.side} {trade.leverage}x
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`tabular-nums-strict text-[13px] font-semibold ${
                            isWin
                              ? 'text-[var(--long-bright)]'
                              : 'text-[var(--short-bright)]'
                          }`}
                        >
                          {formatMoneySigned(trade.realizedPnl)}
                        </span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </div>

                    <div className="tabular-nums-strict text-[11px] text-[var(--text-secondary)]">
                      {trade.closeReason} · Strategy: {trade.strategyTag} · $
                      {trade.entryPrice.toLocaleString('en-US')} to $
                      {trade.exitPrice.toLocaleString('en-US')}
                    </div>

                    {isOpen && trade.notes && (
                      <p className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
                        Note: {trade.notes}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>
    </>
  );
}
