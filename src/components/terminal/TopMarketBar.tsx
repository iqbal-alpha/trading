'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { INSTRUMENT_LIST, type InstrumentMeta } from '@/lib/preseeded-trades';
import {
  INITIAL_CHALLENGE_BALANCE,
  PROFIT_TARGET_USD,
  calculateTotalEquity,
  type InstrumentId,
} from '@/lib/trading-math';
import { useTradingStore } from '@/store/useTradingStore';
import { AetherMark, MarketPairPill } from '@/components/ui/TerminalPrimitives';
import { AnimatedNumber } from '@/components/ui/AnimatedMetrics';
import { ChevronDown, CloudUpload, RefreshCw, ShieldCheck } from 'lucide-react';

interface TopMarketBarProps {
  activeInstrument: InstrumentMeta;
  onSelectInstrument: (id: InstrumentId) => void;
  desktopView: 'terminal' | 'journal';
  onChangeDesktopView: (view: 'terminal' | 'journal') => void;
  onOpenRules: () => void;
  onOpenSyncModal: () => void;
}

export function TopMarketBar({
  activeInstrument,
  onSelectInstrument,
  desktopView,
  onChangeDesktopView,
  onOpenRules,
  onOpenSyncModal,
}: TopMarketBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const markPrices = useTradingStore((s) => s.markPrices);
  const markDirections = useTradingStore((s) => s.markDirections);
  const ticker24h = useTradingStore((s) => s.ticker24h);
  const walletBalance = useTradingStore((s) => s.walletBalance);
  const openPositions = useTradingStore((s) => s.openPositions);
  const accountStatus = useTradingStore((s) => s.accountStatus);
  const feedMode = useTradingStore((s) => s.feedMode);
  const feedLatencyMs = useTradingStore((s) => s.feedLatencyMs);
  const triggerFeedRetry = useTradingStore((s) => s.triggerFeedRetry);
  const cloudSessionToken = useTradingStore((s) => s.cloudSessionToken);

  const equity = calculateTotalEquity(walletBalance, openPositions, markPrices);
  const returnUsd = equity - INITIAL_CHALLENGE_BALANCE;
  const returnPct = (returnUsd / INITIAL_CHALLENGE_BALANCE) * 100;
  const targetPctFill = Math.max(0, Math.min(100, (returnUsd / PROFIT_TARGET_USD) * 100));

  const livePrice = markPrices[activeInstrument.id] ?? activeInstrument.basePrice;
  const activeStats = ticker24h[activeInstrument.id];
  const activeDir = markDirections[activeInstrument.id];
  const flashClass =
    activeDir === 'up' ? 'tick-up' : activeDir === 'down' ? 'tick-down' : '';

  const goldStats = ticker24h.PAXGUSDT;
  const goldPrice = markPrices.PAXGUSDT ?? 2645.1;

  const formatPrice = (val: number, decimals: number) =>
    `$${val.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;

  return (
    <>
      {/* Desktop Top Bar (56px fixed, single line, zero overflow across 768px-1920px+) */}
      <header className="relative z-30 hidden h-[56px] w-full max-w-full shrink-0 items-center justify-between gap-2 overflow-x-clip border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 md:flex xl:px-4">
        <div className="flex min-w-0 items-center gap-2 xl:gap-2.5">
          <button
            type="button"
            onClick={() => onChangeDesktopView('terminal')}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap text-left focus-visible:outline-none"
          >
            <AetherMark />
            <span className="hidden text-[14px] font-bold tracking-[-0.01em] text-[var(--text-primary)] lg:inline">
              AETHER
            </span>
          </button>

          <div className="relative">
            <MarketPairPill
              symbol={activeInstrument.symbol}
              priceText={formatPrice(livePrice, activeInstrument.decimals)}
              changePct={activeStats.changePct24h}
              isOpen={dropdownOpen}
              flashClass={flashClass}
              onClick={() => setDropdownOpen((o) => !o)}
            />

            {dropdownOpen && (
              <div className="elevation-floating absolute left-0 top-11 z-40 w-[300px] rounded-[var(--radius-panel)] border border-[var(--border-default)] bg-[var(--bg-floating)] p-1.5">
                {INSTRUMENT_LIST.map((inst) => {
                  const p = markPrices[inst.id] ?? inst.basePrice;
                  const chg = ticker24h[inst.id]?.changePct24h ?? inst.defaultChangePct;
                  const isUp = chg >= 0;
                  const active = inst.id === activeInstrument.id;
                  return (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => {
                        onSelectInstrument(inst.id);
                        setDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-[var(--radius-control)] px-2.5 py-2 text-left text-[12px] transition-colors ${active
                          ? 'bg-[var(--bg-raised)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-raised)]/60 hover:text-[var(--text-primary)]'
                        }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {inst.symbol}
                        </span>
                        {inst.badgeNote && (
                          <span className="text-[10px] text-[var(--accent)]">
                            {inst.badgeNote}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="tabular-nums-strict font-medium text-[var(--text-primary)]">
                          {formatPrice(p, inst.decimals)}
                        </div>
                        <div
                          className={`tabular-nums-strict text-[11px] ${isUp ? 'text-[var(--long-bright)]' : 'text-[var(--short-bright)]'
                            }`}
                        >
                          {isUp ? '+' : ''}
                          {chg.toFixed(2)}%
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <span className="tabular-nums-strict hidden shrink-0 whitespace-nowrap text-[11px] font-medium text-[var(--text-muted)] 2xl:inline">
            24h H ${activeStats.high24h.toLocaleString('en-US')} · L $
            {activeStats.low24h.toLocaleString('en-US')}
          </span>

          {activeInstrument.id !== 'PAXGUSDT' && (
            <button
              type="button"
              onClick={() => onSelectInstrument('PAXGUSDT')}
              className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-2.5 py-1 text-[11px] transition-colors hover:border-[var(--border-focus)] 2xl:inline-flex"
            >
              <span className="font-medium text-[var(--accent)]">XAU/USD · Gold</span>
              <span className="tabular-nums-strict text-[var(--text-primary)]">
                {formatPrice(goldPrice, 2)} {goldStats.changePct24h >= 0 ? '+' : ''}
                {goldStats.changePct24h.toFixed(2)}%
              </span>
            </button>
          )}

          {/* Shared-Layout Sliding Desktop View Switcher */}
          <div
            role="tablist"
            aria-label="Desktop Workspace View"
            className="hidden shrink-0 items-center whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-0.5 lg:inline-flex"
          >
            {(['terminal', 'journal'] as const).map((tab) => {
              const selected = desktopView === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onChangeDesktopView(tab)}
                  className={`relative whitespace-nowrap rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-medium transition-colors ${selected
                      ? tab === 'journal'
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                >
                  {selected && (
                    <motion.span
                      layoutId="desktop-view-pill"
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-0 rounded-[var(--radius-pill)] bg-[var(--bg-floating)]"
                    />
                  )}
                  <span className="relative z-10">
                    {tab === 'terminal' ? (
                      <>
                        <span className="hidden xl:inline">Live </span>Terminal
                      </>
                    ) : (
                      <>
                        <span className="hidden xl:inline">Trading </span>Journal
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap xl:gap-2">
          {/* Animation #11: Live Connection Heartbeat or Fallback Retry Pill */}
          {feedMode === 'fallback' ? (
            <div className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--accent-tint)] px-2 py-1 xl:px-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              <span className="text-[11px] font-medium text-[var(--accent)]">
                <span className="hidden xl:inline">Simulated Feed</span>
                <span className="xl:hidden">Sim</span>
              </span>
              <button
                type="button"
                onClick={triggerFeedRetry}
                className="ml-0.5 inline-flex items-center gap-1 rounded bg-[var(--bg-surface)]/80 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-primary)] hover:text-[var(--long-bright)]"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                Retry
              </button>
            </div>
          ) : (
            <div className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--long-tint)] px-2 py-1 xl:gap-2 xl:px-2.5">
              <span className="relative flex h-2 w-2 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--long)] opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--long)]" />
              </span>
              <span className="tabular-nums-strict text-[11px] font-medium text-[var(--long-bright)]">
                {feedMode === 'connecting' ? (
                  'Connecting...'
                ) : (
                  <>
                    <span className="hidden xl:inline">Binance </span>
                    {`Live · ${feedLatencyMs}ms`}
                  </>
                )}
              </span>
            </div>
          )}

          {/* Equity Rolling Pill */}
          <button
            type="button"
            onClick={() =>
              onChangeDesktopView(desktopView === 'journal' ? 'terminal' : 'journal')
            }
            className="inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-2.5 transition-colors hover:border-[var(--border-focus)]"
          >
            <span className="tabular-nums-strict text-[12px] font-semibold text-[var(--text-primary)]">
              Equity{' '}
              <AnimatedNumber
                value={equity}
                format={(n) => formatPrice(n, 2)}
              />
            </span>
            <span className="hidden h-1.5 w-10 overflow-hidden rounded-full bg-[var(--bg-ground)] xl:block">
              <span
                className={`block h-full origin-left rounded-full transition-transform duration-300 ${accountStatus === 'BREACHED' || accountStatus === 'DAILY_BREACHED'
                    ? 'bg-[var(--short)]'
                    : 'bg-[var(--long)]'
                  }`}
                style={{ width: `${Math.max(4, targetPctFill)}%` }}
              />
            </span>
            <span
              className={`tabular-nums-strict text-[11px] font-medium ${returnPct >= 0 ? 'text-[var(--long-bright)]' : 'text-[var(--short-bright)]'
                }`}
            >
              {returnPct >= 0 ? '+' : ''}
              {returnPct.toFixed(1)}% / 8%
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenSyncModal}
            title="Sync & Publish to Leaderboard"
            className="hidden h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--long)]/45 bg-[var(--long-tint)] px-2.5 text-[12px] font-semibold text-[var(--long-bright)] transition-colors hover:border-[var(--long)] lg:inline-flex"
          >
            <CloudUpload className="h-3.5 w-3.5 shrink-0" />
            <span>
              Sync
              <span className="hidden min-[1440px]:inline"> &amp; Publish</span>
            </span>
            {cloudSessionToken && (
              <span
                aria-label="Synced to cloud"
                className="h-1.5 w-1.5 rounded-full bg-[var(--long-bright)]"
              />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenRules}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--border-focus)] bg-[var(--bg-floating)] px-2.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--text-secondary)]"
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            <span>
              <span className="hidden xl:inline">Challenge </span>Rules
            </span>
          </button>
        </div>
      </header>

      {/* Mobile Sticky Header (56px) + Prop Firm Strip (34px) */}
      <div className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] md:hidden">
        <div className="flex h-[56px] items-center justify-between gap-1.5 px-2.5 sm:px-3">
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex min-h-[44px] items-center gap-2 text-left"
            >
              <AetherMark className="shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[12px] font-bold text-[var(--text-primary)] sm:text-[13px]">
                  <span className="truncate">{activeInstrument.symbol}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
                </div>
                <div className="tabular-nums-strict flex items-center gap-2 text-[12px]">
                  <span className={`rounded px-0.5 font-semibold text-[var(--long-bright)] ${flashClass}`}>
                    {formatPrice(livePrice, activeInstrument.decimals)}
                  </span>
                  <span
                    className={
                      activeStats.changePct24h >= 0
                        ? 'text-[var(--long-bright)]'
                        : 'text-[var(--short-bright)]'
                    }
                  >
                    {activeStats.changePct24h >= 0 ? '+' : ''}
                    {activeStats.changePct24h.toFixed(2)}%
                  </span>
                </div>
              </div>
            </button>

            {dropdownOpen && (
              <div className="elevation-floating absolute left-0 top-12 z-40 w-[260px] rounded-[var(--radius-panel)] border border-[var(--border-default)] bg-[var(--bg-floating)] p-1.5">
                {INSTRUMENT_LIST.map((inst) => (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => {
                      onSelectInstrument(inst.id);
                      setDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-[var(--radius-control)] px-2.5 py-2.5 text-left text-[12px] hover:bg-[var(--bg-raised)]"
                  >
                    <span className="font-semibold text-[var(--text-primary)]">
                      {inst.symbol}
                    </span>
                    <span className="tabular-nums-strict font-medium text-[var(--text-secondary)]">
                      {formatPrice(markPrices[inst.id] ?? inst.basePrice, inst.decimals)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {feedMode === 'fallback' ? (
              <button
                type="button"
                onClick={triggerFeedRetry}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-control)] bg-[var(--accent-tint)] px-2 text-[10px] font-medium text-[var(--accent)]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                Sim
              </button>
            ) : (
              <span className="tabular-nums-strict inline-flex items-center gap-1 text-[10px] font-medium text-[var(--long-bright)]">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[var(--long)]" />
                {feedLatencyMs}ms
              </span>
            )}
            <button
              type="button"
              onClick={onOpenSyncModal}
              aria-label="Sync & Publish to Leaderboard"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-control)] border border-[var(--long)]/45 bg-[var(--long-tint)] text-[var(--long-bright)]"
            >
              <CloudUpload className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onOpenRules}
              className="inline-flex min-h-[44px] min-w-[52px] items-center justify-center rounded-[var(--radius-control)] border-[1.5px] border-[var(--border-focus)] bg-transparent px-2.5 text-[12px] font-medium text-[var(--text-primary)]"
            >
              Rules
            </button>
          </div>
        </div>

        {/* 34px Prop Firm Bar */}
        <div className="flex h-[34px] items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-raised)]/60 px-3 text-[11px]">
          <span className="tabular-nums-strict font-medium text-[var(--text-primary)]">
            Eq {formatPrice(equity, 2)}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-ground)]">
            <div
              className={`h-full rounded-full transition-all duration-300 ${accountStatus === 'BREACHED' || accountStatus === 'DAILY_BREACHED'
                  ? 'bg-[var(--short)]'
                  : 'bg-[var(--long)]'
                }`}
              style={{ width: `${Math.max(4, targetPctFill)}%` }}
            />
          </div>
          <span
            className={`tabular-nums-strict font-medium ${returnPct >= 0 ? 'text-[var(--long-bright)]' : 'text-[var(--short-bright)]'
              }`}
          >
            {returnPct >= 0 ? '+' : ''}
            {returnPct.toFixed(1)}% / 8%
          </span>
        </div>
      </div>
    </>
  );
}
