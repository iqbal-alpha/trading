'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { INSTRUMENT_MAP } from '@/lib/preseeded-trades';
import { calculatePnl, type PositionSide } from '@/lib/trading-math';
import { useTradingStore } from '@/store/useTradingStore';
import { TopMarketBar } from '@/components/terminal/TopMarketBar';
import { ChartPanel } from '@/components/terminal/ChartPanel';
import { OrderExecutionBox } from '@/components/terminal/OrderExecutionBox';
import { BottomDock, type TerminalDockTab } from '@/components/terminal/BottomDock';
import { TradingJournalView } from '@/components/terminal/TradingJournalView';
import { LeaderboardView } from '@/components/terminal/LeaderboardView';
import { MobilePositionCard } from '@/components/terminal/MobilePositionCard';
import { SlideUpOrderSheet } from '@/components/terminal/SlideUpOrderSheet';
import { ChallengeRulesModal } from '@/components/terminal/ChallengeRulesModal';
import { CloudSyncModal } from '@/components/terminal/CloudSyncModal';
import { AlertCircle, BarChart2, BookOpen, CheckCircle2, Trophy } from 'lucide-react';

function subscribeViewport(cb: () => void): () => void {
  const mql = window.matchMedia('(max-width: 767px)');
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

function getIsMobileSnapshot(): boolean {
  return window.matchMedia('(max-width: 767px)').matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function AetherTerminalShell() {
  const isMobileViewport = useSyncExternalStore(
    subscribeViewport,
    getIsMobileSnapshot,
    getServerSnapshot
  );
  const instrumentId = useTradingStore((s) => s.activeInstrument);
  const timeframe = useTradingStore((s) => s.activeTimeframe);
  const setActiveInstrument = useTradingStore((s) => s.setActiveInstrument);
  const setActiveTimeframe = useTradingStore((s) => s.setActiveTimeframe);
  const openPositions = useTradingStore((s) => s.openPositions);
  const markPrices = useTradingStore((s) => s.markPrices);
  const lastClosedNotice = useTradingStore((s) => s.lastClosedNotice);
  const clearClosedNotice = useTradingStore((s) => s.clearClosedNotice);

  const [orderSide, setOrderSide] = useState<PositionSide>('LONG');
  const [desktopView, setDesktopView] = useState<'terminal' | 'journal'>('terminal');
  const [desktopDockTab, setDesktopDockTab] = useState<TerminalDockTab>('positions');
  const [mobileTab, setMobileTab] = useState<'trade' | 'journal' | 'leaderboard'>('trade');
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  const activeInstrument = INSTRUMENT_MAP[instrumentId] ?? INSTRUMENT_MAP.BTCUSDT;

  // Auto-dismiss manual action toast
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Trigger celebration / warning toast automatically whenever a trade closes via TP_HIT / SL_HIT / LIQUIDATED
  useEffect(() => {
    if (!lastClosedNotice) return;
    const id = window.setTimeout(() => clearClosedNotice(), 3600);
    return () => window.clearTimeout(id);
  }, [lastClosedNotice, clearClosedNotice]);

  const showNotice = (text: string, isError = false) => setToast({ text, isError });

  const mobileTotalUnrealized = openPositions.reduce((acc, pos) => {
    const mark = markPrices[pos.symbolId] ?? pos.entryPrice;
    return acc + calculatePnl(pos.side, pos.entryPrice, mark, pos.quantity);
  }, 0);

  const mobileTabs: {
    id: 'trade' | 'journal' | 'leaderboard';
    label: string;
    Icon: typeof BarChart2;
  }[] = [
      { id: 'trade', label: 'Trade & Chart', Icon: BarChart2 },
      { id: 'journal', label: 'Journal & Stats', Icon: BookOpen },
      { id: 'leaderboard', label: 'Leaderboard', Icon: Trophy },
    ];

  const activeBannerText = lastClosedNotice
    ? `${lastClosedNotice.reason}: ${lastClosedNotice.symbol} ${lastClosedNotice.side} ${lastClosedNotice.pnlUsd >= 0 ? '+' : '-'
    }$${Math.abs(lastClosedNotice.pnlUsd).toFixed(2)} (${lastClosedNotice.roePct >= 0 ? '+' : ''
    }${lastClosedNotice.roePct.toFixed(1)}%)`
    : toast?.text ?? null;

  const activeBannerError = lastClosedNotice
    ? lastClosedNotice.pnlUsd < 0
    : Boolean(toast?.isError);

  return (
    <div className="flex min-h-[100dvh] w-full max-w-full flex-col overflow-x-clip bg-[var(--bg-ground)] text-[var(--text-primary)]">
      <TopMarketBar
        activeInstrument={activeInstrument}
        onSelectInstrument={setActiveInstrument}
        desktopView={desktopView}
        onChangeDesktopView={setDesktopView}
        onOpenRules={() => setRulesModalOpen(true)}
        onOpenSyncModal={() => setSyncModalOpen(true)}
      />

      {/* Desktop Workspace (mounts chart only when not mobile to avoid dual WebSockets) */}
      {!isMobileViewport && (
        <main className="hidden w-full min-w-0 flex-1 flex-col md:flex">
          {desktopView === 'terminal' ? (
            <div className="grid w-full min-w-0 flex-1 grid-cols-[minmax(0,1fr)_316px] gap-[1px] bg-[var(--border-subtle)] lg:grid-cols-[minmax(0,1fr)_336px] xl:grid-cols-[minmax(0,1fr)_352px]">
              <div className="flex min-w-0 flex-col gap-[1px] bg-[var(--border-subtle)]">
                <div className="min-h-[340px] min-w-0 flex-1 bg-[var(--bg-surface)] xl:min-h-[400px]">
                  <ChartPanel
                    instrument={activeInstrument}
                    timeframe={timeframe}
                    onChangeTimeframe={setActiveTimeframe}
                  />
                </div>
                <div className="min-h-[240px] min-w-0 bg-[var(--bg-surface)] xl:min-h-[270px]">
                  <BottomDock
                    activeTab={desktopDockTab}
                    onSelectTab={setDesktopDockTab}
                    onOpenFullJournal={() => setDesktopView('journal')}
                    onActionNotice={showNotice}
                    onOpenSyncModal={() => setSyncModalOpen(true)}
                  />
                </div>
              </div>

              <div className="h-full min-w-0 bg-[var(--bg-surface)]">
                <OrderExecutionBox
                  key={activeInstrument.id}
                  instrument={activeInstrument}
                  side={orderSide}
                  onChangeSide={setOrderSide}
                  onActionNotice={showNotice}
                  variant="desktop"
                />
              </div>
            </div>
          ) : (
            <div className="min-w-0 flex-1 bg-[var(--bg-ground)]">
              <TradingJournalView
                onActionNotice={showNotice}
                onOpenSyncModal={() => setSyncModalOpen(true)}
              />
            </div>
          )}
        </main>
      )}

      {/* Mobile Pro Terminal (< 768px) */}
      {isMobileViewport && (
        <main
          className={`flex flex-1 flex-col md:hidden ${mobileTab === 'trade' ? 'pb-[132px]' : 'pb-[68px]'
            }`}
        >
          {mobileTab === 'trade' && (
            <div className="flex flex-1 flex-col">
              <ChartPanel
                instrument={activeInstrument}
                timeframe={timeframe}
                onChangeTimeframe={setActiveTimeframe}
                compactMobile
              />

              {/* Live Open Positions Cards */}
              <section className="flex-1 space-y-2.5 bg-[var(--bg-surface)] px-3 py-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
                    Open Positions ({openPositions.length})
                  </h2>
                  <span
                    className={`tabular-nums-strict text-[12px] font-semibold ${mobileTotalUnrealized >= 0
                      ? 'text-[var(--long-bright)]'
                      : 'text-[var(--short-bright)]'
                      }`}
                  >
                    {mobileTotalUnrealized >= 0 ? '+' : '-'}$
                    {Math.abs(mobileTotalUnrealized).toFixed(2)} Live
                  </span>
                </div>

                {openPositions.length === 0 ? (
                  <p className="rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-3 py-4 text-center text-[12px] text-[var(--text-secondary)]">
                    No active positions. Tap Buy / Long or Sell / Short below to open a trade.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    <AnimatePresence initial={false}>
                      {openPositions.map((pos) => (
                        <MobilePositionCard
                          key={pos.id}
                          position={pos}
                          onActionNotice={showNotice}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </section>
            </div>
          )}

          {mobileTab === 'journal' && (
            <div className="flex-1 bg-[var(--bg-ground)]">
              <TradingJournalView
                onActionNotice={showNotice}
                onOpenSyncModal={() => setSyncModalOpen(true)}
              />
            </div>
          )}

          {mobileTab === 'leaderboard' && (
            <div className="flex-1 bg-[var(--bg-ground)]">
              <LeaderboardView onOpenSyncModal={() => setSyncModalOpen(true)} />
            </div>
          )}

          {/* Pinned Thumb-Zone CTA + Safe-Area Bottom Navigation */}
          <footer
            style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
            className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]"
          >
            {mobileTab === 'trade' && (
              <div className="grid grid-cols-2 gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setOrderSide('LONG');
                    setMobileSheetOpen(true);
                  }}
                  className="glow-long min-h-[48px] rounded-[var(--radius-control)] bg-[var(--long)] text-[14px] font-bold text-[var(--bg-ground)] active:scale-[0.98]"
                >
                  Buy / Long
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOrderSide('SHORT');
                    setMobileSheetOpen(true);
                  }}
                  className="glow-short min-h-[48px] rounded-[var(--radius-control)] bg-[var(--short)] text-[14px] font-bold text-[var(--bg-ground)] active:scale-[0.98]"
                >
                  Sell / Short
                </button>
              </div>
            )}

            <nav aria-label="Mobile Terminal Sections" className="grid grid-cols-3 pt-1">
              {mobileTabs.map(({ id, label, Icon }) => {
                const active = mobileTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMobileTab(id)}
                    className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${active ? 'text-[var(--long-bright)]' : 'text-[var(--text-secondary)]'
                      }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          </footer>
        </main>
      )}

      <SlideUpOrderSheet
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        instrument={activeInstrument}
        side={orderSide}
        onChangeSide={setOrderSide}
        onActionNotice={showNotice}
      />

      <ChallengeRulesModal
        open={rulesModalOpen}
        onClose={() => setRulesModalOpen(false)}
        onActionNotice={showNotice}
      />

      <CloudSyncModal
        open={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        onActionNotice={showNotice}
      />

      {/* Non-blocking Confirmation / Auto-Trigger Toast */}
      <AnimatePresence>
        {activeBannerText && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="status"
            className={`elevation-floating fixed bottom-36 right-4 z-50 flex max-w-[360px] items-start gap-2.5 rounded-[var(--radius-panel)] border bg-[var(--bg-floating)] px-3.5 py-2.5 text-[12px] text-[var(--text-primary)] md:bottom-5 ${activeBannerError ? 'border-[var(--short)]' : 'border-[var(--long)]'
              }`}
          >
            {activeBannerError ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--short-bright)]" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--long-bright)]" />
            )}
            <span>{activeBannerText}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
