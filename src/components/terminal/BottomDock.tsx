'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { INSTRUMENT_MAP, formatRelativeTime } from '@/lib/preseeded-trades';
import {
  INITIAL_CHALLENGE_BALANCE,
  calculatePnl,
  calculateRoePct,
  type OpenPosition,
} from '@/lib/trading-math';
import { useTradingStore } from '@/store/useTradingStore';
import { SideBadge } from '@/components/ui/TerminalPrimitives';
import { AnimatedNumber, TickFlashValue } from '@/components/ui/AnimatedMetrics';
import { LeaderboardView } from '@/components/terminal/LeaderboardView';
import { Pencil, Zap } from 'lucide-react';

export type TerminalDockTab = 'positions' | 'journal' | 'leaderboard' | 'history';

interface BottomDockProps {
  activeTab: TerminalDockTab;
  onSelectTab: (tab: TerminalDockTab) => void;
  onOpenFullJournal: () => void;
  onActionNotice: (msg: string, isError?: boolean) => void;
  onOpenSyncModal: () => void;
}

export function BottomDock({
  activeTab,
  onSelectTab,
  onOpenFullJournal,
  onActionNotice,
  onOpenSyncModal,
}: BottomDockProps) {
  const openPositions = useTradingStore((s) => s.openPositions);
  const pendingLimitOrders = useTradingStore((s) => s.pendingLimitOrders);
  const tradeHistory = useTradingStore((s) => s.tradeHistory);
  const markPrices = useTradingStore((s) => s.markPrices);
  const markDirections = useTradingStore((s) => s.markDirections);
  const markTickSeq = useTradingStore((s) => s.markTickSeq);
  const feedMode = useTradingStore((s) => s.feedMode);
  const closePosition = useTradingStore((s) => s.closePosition);
  const closeAllPositions = useTradingStore((s) => s.closeAllPositions);
  const cancelPendingOrder = useTradingStore((s) => s.cancelPendingOrder);
  const updateTpSl = useTradingStore((s) => s.updateTpSl);
  const openOrder = useTradingStore((s) => s.openOrder);

  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [tpEditVal, setTpEditVal] = useState('');
  const [slEditVal, setSlEditVal] = useState('');

  const totalUnrealized = openPositions.reduce((acc, pos) => {
    const mark = markPrices[pos.symbolId] ?? pos.entryPrice;
    return acc + calculatePnl(pos.side, pos.entryPrice, mark, pos.quantity);
  }, 0);
  const totalUnrealizedPct = (totalUnrealized / INITIAL_CHALLENGE_BALANCE) * 100;

  const tabs: { id: TerminalDockTab; label: string }[] = [
    { id: 'positions', label: `Open Positions (${openPositions.length})` },
    { id: 'journal', label: 'Trading Journal & Win-Rate' },
    { id: 'leaderboard', label: 'Prop Firm Leaderboard' },
    { id: 'history', label: `Order History (${tradeHistory.length})` },
  ];

  const startEditingTpSl = (pos: OpenPosition) => {
    setEditingPosId(pos.id);
    setTpEditVal(pos.tpPrice !== null ? String(pos.tpPrice) : '');
    setSlEditVal(pos.slPrice !== null ? String(pos.slPrice) : '');
  };

  const saveTpSlEdit = (posId: string) => {
    const tp = tpEditVal.trim() ? Number(tpEditVal) : null;
    const sl = slEditVal.trim() ? Number(slEditVal) : null;
    const res = updateTpSl(posId, tp, sl);
    if (!res.ok) {
      onActionNotice(res.error ?? 'Invalid TP/SL prices.', true);
      return;
    }
    setEditingPosId(null);
    onActionNotice('Updated TP / SL price targets.');
  };

  const handleQuickDemo = () => {
    const btcMark = markPrices.BTCUSDT ?? 92415.8;
    const res = openOrder({
      symbolId: 'BTCUSDT',
      mode: 'Market',
      side: 'LONG',
      marginUsd: 1000,
      leverage: 10,
      tpPrice: Number((btcMark * 1.025).toFixed(2)),
      slPrice: Number((btcMark * 0.988).toFixed(2)),
      strategyTag: 'Breakout',
    });
    if (!res.ok) {
      onActionNotice(res.error ?? 'Cannot open demo position.', true);
    } else {
      onActionNotice('Opened Quick BTC/USDT LONG 10x ($10,000 notional).');
    }
  };

  return (
    <section className="flex h-full min-h-[240px] w-full min-w-0 flex-col justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] xl:min-h-[260px]">
      <div className="min-w-0">
        {/* Dock Tab Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-2">
          <div className="flex items-center gap-4">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id === 'journal') {
                      onOpenFullJournal();
                    } else {
                      onSelectTab(tab.id);
                    }
                  }}
                  className={`relative pb-1.5 text-[13px] font-medium transition-colors ${isActive
                    ? 'font-semibold text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                >
                  <span>{tab.label}</span>
                  {isActive && (
                    <motion.span
                      layoutId="dock-tab-underline"
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--long)]"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`tabular-nums-strict text-[12px] font-semibold ${totalUnrealized >= 0
                ? 'text-[var(--long-bright)]'
                : 'text-[var(--short-bright)]'
                }`}
            >
              Total Unrealized PnL:{' '}
              <AnimatedNumber
                value={totalUnrealized}
                format={(n) =>
                  `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`
                }
              />{' '}
              ({totalUnrealizedPct >= 0 ? '+' : ''}
              {totalUnrealizedPct.toFixed(2)}%)
            </span>
            {openPositions.length > 0 && (
              <button
                type="button"
                onClick={() => closeAllPositions('MANUAL')}
                className="rounded-[var(--radius-control)] bg-[var(--short-tint)] px-2.5 py-1 text-[11px] font-semibold text-[var(--short-bright)] transition-colors hover:bg-[var(--short)] hover:text-[var(--bg-ground)]"
              >
                Close All
              </button>
            )}
          </div>
        </div>

        {/* Open Positions Table */}
        {activeTab === 'positions' && (
          <div className="overflow-x-auto">
            {openPositions.length === 0 ? (
              <div>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-muted)]">
                      <th className="py-2 pl-4 pr-2.5 font-medium">Instrument / Side</th>
                      <th className="px-2.5 py-2 font-medium">Size / Margin</th>
                      <th className="px-2.5 py-2 text-right font-medium">Entry Price</th>
                      <th className="px-2.5 py-2 text-right font-medium">Mark Price</th>
                      <th className="px-2.5 py-2 text-right font-medium">Liq. Price</th>
                      <th className="px-2.5 py-2 text-right font-medium">TP / SL</th>
                      <th className="px-2.5 py-2 text-right font-medium">Unrealized PnL</th>
                      <th className="py-2 pl-2.5 pr-4 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                </table>
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    No active positions. Configure margin &amp; TP/SL on the right ticket to open a simulated trade.
                  </p>
                  <button
                    type="button"
                    onClick={handleQuickDemo}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--long)] bg-[var(--long-tint)] px-3 text-[12px] font-semibold text-[var(--long-bright)] hover:bg-[var(--long)] hover:text-[var(--bg-ground)]"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Open Quick BTC Long Demo
                  </button>
                </div>
              </div>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-muted)]">
                    <th className="py-2 pl-4 pr-2.5 font-medium">Instrument / Side</th>
                    <th className="px-2.5 py-2 font-medium">Size / Margin</th>
                    <th className="px-2.5 py-2 text-right font-medium">Entry Price</th>
                    <th className="px-2.5 py-2 text-right font-medium">Mark Price</th>
                    <th className="px-2.5 py-2 text-right font-medium">Liq. Price</th>
                    <th className="px-2.5 py-2 text-right font-medium">TP / SL</th>
                    <th className="px-2.5 py-2 text-right font-medium">Unrealized PnL</th>
                    <th className="py-2 pl-2.5 pr-4 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] text-[12.5px]">
                  <AnimatePresence initial={false}>
                    {openPositions.map((pos) => {
                      const meta = INSTRUMENT_MAP[pos.symbolId];
                      const mark = markPrices[pos.symbolId] ?? pos.entryPrice;
                      const dir = markDirections[pos.symbolId];
                      const seq = markTickSeq[pos.symbolId];
                      const pnlUsd = calculatePnl(
                        pos.side,
                        pos.entryPrice,
                        mark,
                        pos.quantity
                      );
                      const roePct = calculateRoePct(pnlUsd, pos.marginUsd);
                      const isProfit = pnlUsd >= 0;
                      const isEditing = editingPosId === pos.id;

                      return (
                        <motion.tr
                          key={pos.id}
                          layout
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 16 }}
                          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                          className="hover:bg-[var(--bg-raised)]/50"
                        >
                          <td className="whitespace-nowrap py-2.5 pl-4 pr-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[var(--text-primary)]">
                                {pos.symbol}
                              </span>
                              <SideBadge side={pos.side} leverage={pos.leverage} />
                            </div>
                          </td>
                          <td className="tabular-nums-strict whitespace-nowrap px-2.5 py-2.5 text-[var(--text-secondary)]">
                            ${pos.notionalUsd.toLocaleString('en-US')} (
                            {pos.quantity.toFixed(2)} {meta.unit})
                          </td>
                          <td className="tabular-nums-strict whitespace-nowrap px-2.5 py-2.5 text-right text-[var(--text-primary)]">
                            $
                            {pos.entryPrice.toLocaleString('en-US', {
                              minimumFractionDigits: meta.decimals,
                              maximumFractionDigits: meta.decimals,
                            })}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-medium">
                            <TickFlashValue
                              text={`$${mark.toLocaleString('en-US', {
                                minimumFractionDigits: meta.decimals,
                                maximumFractionDigits: meta.decimals,
                              })}`}
                              direction={dir}
                              tickSeq={seq}
                              className={
                                isProfit
                                  ? 'text-[var(--long-bright)]'
                                  : 'text-[var(--short-bright)]'
                              }
                            />
                          </td>
                          <td className="tabular-nums-strict whitespace-nowrap px-2.5 py-2.5 text-right text-[var(--accent)]">
                            $
                            {pos.liqPrice.toLocaleString('en-US', {
                              minimumFractionDigits: meta.decimals,
                              maximumFractionDigits: meta.decimals,
                            })}
                          </td>
                          <td className="tabular-nums-strict whitespace-nowrap px-2.5 py-2.5 text-right">
                            {isEditing ? (
                              <div className="inline-flex items-center gap-1">
                                <input
                                  id={`dock-tp-${pos.id}`}
                                  name={`dock-tp-${pos.id}`}
                                  aria-label="Edit TP"
                                  value={tpEditVal}
                                  onChange={(e) => setTpEditVal(e.target.value)}
                                  className="tabular-nums-strict h-6 w-20 rounded border border-[var(--border-focus)] bg-[var(--bg-raised)] px-1.5 text-[11px] text-[var(--long-bright)]"
                                />
                                <input
                                  id={`dock-sl-${pos.id}`}
                                  name={`dock-sl-${pos.id}`}
                                  aria-label="Edit SL"
                                  value={slEditVal}
                                  onChange={(e) => setSlEditVal(e.target.value)}
                                  className="tabular-nums-strict h-6 w-20 rounded border border-[var(--border-focus)] bg-[var(--bg-raised)] px-1.5 text-[11px] text-[var(--short-bright)]"
                                />
                                <button
                                  type="button"
                                  onClick={() => saveTpSlEdit(pos.id)}
                                  className="rounded bg-[var(--long)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--bg-ground)]"
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingPosId(null)}
                                  className="rounded border border-[var(--border-default)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                                >
                                  Esc
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditingTpSl(pos)}
                                title="Click to edit TP / SL"
                                className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)]"
                              >
                                <span>
                                  {pos.tpPrice !== null ? `$${pos.tpPrice.toLocaleString('en-US')}` : '—'}{' '}
                                  /{' '}
                                  {pos.slPrice !== null ? `$${pos.slPrice.toLocaleString('en-US')}` : '—'}
                                </span>
                                <Pencil className="h-2.5 w-2.5 opacity-70" />
                              </button>
                            )}
                          </td>
                          <td
                            className={`tabular-nums-strict whitespace-nowrap px-2.5 py-2.5 text-right font-semibold ${isProfit
                              ? 'text-[var(--long-bright)]'
                              : 'text-[var(--short-bright)]'
                              }`}
                          >
                            {isProfit ? '+' : '-'}${Math.abs(pnlUsd).toFixed(2)} (
                            {isProfit ? '+' : ''}
                            {roePct.toFixed(2)}%)
                          </td>
                          <td className="whitespace-nowrap py-2 pl-2.5 pr-4 text-right">
                            <button
                              type="button"
                              onClick={() => closePosition(pos.id, 'MANUAL')}
                              className="rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--border-focus)]"
                            >
                              Close
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            )}

            {pendingLimitOrders.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-raised)]/40 px-4 py-2 text-[11px]">
                <span className="font-semibold text-[var(--accent)]">
                  Pending Limit ({pendingLimitOrders.length}):
                </span>
                {pendingLimitOrders.map((ord) => (
                  <span
                    key={ord.id}
                    className="tabular-nums-strict inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-0.5 text-[var(--text-secondary)]"
                  >
                    {ord.symbol} {ord.side} {ord.leverage}x @ $
                    {ord.limitPrice.toLocaleString('en-US')}
                    <button
                      type="button"
                      onClick={() => cancelPendingOrder(ord.id)}
                      className="text-[var(--short-bright)] hover:underline"
                    >
                      Cancel
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'leaderboard' && <LeaderboardView onOpenSyncModal={onOpenSyncModal} />}

        {activeTab === 'history' && (
          <div className="max-h-[240px] overflow-x-auto overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-muted)]">
                  <th className="py-2 pl-4 pr-2.5 font-medium">Closed</th>
                  <th className="px-2.5 py-2 font-medium">Instrument</th>
                  <th className="px-2.5 py-2 font-medium">Execution</th>
                  <th className="px-2.5 py-2 font-medium">Reason</th>
                  <th className="py-2 pl-2.5 pr-4 text-right font-medium">Realized PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-[12.5px]">
                {tradeHistory.map((tr) => {
                  const isWin = tr.realizedPnl >= 0;
                  return (
                    <tr key={tr.id} className="hover:bg-[var(--bg-raised)]/40">
                      <td className="tabular-nums-strict px-4 py-2 text-[12px] text-[var(--text-muted)]">
                        {formatRelativeTime(tr.closedAt)}
                      </td>
                      <td className="px-2.5 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {tr.symbol}
                          </span>
                          <SideBadge side={tr.side} leverage={tr.leverage} />
                        </div>
                      </td>
                      <td className="tabular-nums-strict px-2.5 py-2 text-[12px] text-[var(--text-secondary)]">
                        ${tr.entryPrice.toLocaleString('en-US')} to $
                        {tr.exitPrice.toLocaleString('en-US')}
                      </td>
                      <td
                        className={`tabular-nums-strict px-2.5 py-2 text-[11px] font-bold ${tr.closeReason === 'SL_HIT' ||
                          tr.closeReason === 'LIQUIDATED' ||
                          tr.closeReason === 'CHALLENGE_BREACH'
                          ? 'text-[var(--short-bright)]'
                          : 'text-[var(--long-bright)]'
                          }`}
                      >
                        {tr.closeReason}
                      </td>
                      <td
                        className={`tabular-nums-strict py-2 pl-2.5 pr-4 text-right font-semibold ${isWin ? 'text-[var(--long-bright)]' : 'text-[var(--short-bright)]'
                          }`}
                      >
                        {isWin ? '+' : '-'}${Math.abs(tr.realizedPnl).toFixed(2)} (
                        {isWin ? '+' : ''}
                        {tr.roePct.toFixed(1)}%)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer Status Line */}
      <div className="border-t border-[var(--border-subtle)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
        <span className={feedMode === 'fallback' ? 'text-[var(--accent)]' : 'text-[var(--long)]'}>
          ●
        </span>{' '}
        Client-Side Tick Matching Engine active (
        {feedMode === 'fallback'
          ? 'GBM Offline Simulator · 650ms ticks'
          : 'Binance Vision Stream'}
        ) · Checks TP_HIT, SL_HIT, LIQUIDATED &amp; Prop Firm Drawdown on every tick
      </div>
    </section>
  );
}
