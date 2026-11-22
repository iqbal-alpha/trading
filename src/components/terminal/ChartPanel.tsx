'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import type { InstrumentMeta } from '@/lib/preseeded-trades';
import type { Timeframe } from '@/lib/trading-math';
import { useTradingStore } from '@/store/useTradingStore';
import { TimeframePill } from '@/components/ui/TerminalPrimitives';
import type { OhlcSnapshot } from '@/components/terminal/CandlestickCanvas';
import { Lock, Maximize2, Minimize2, RotateCcw, Unlock } from 'lucide-react';

const DynamicCandlestickCanvas = dynamic(
  () =>
    import('@/components/terminal/CandlestickCanvas').then(
      (mod) => mod.CandlestickCanvas
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse bg-[var(--bg-raised)]/40" />
    ),
  }
);

const TIMEFRAMES: Timeframe[] = ['1m', '15m', '1H', '1D'];

interface ChartPanelProps {
  instrument: InstrumentMeta;
  timeframe: Timeframe;
  onChangeTimeframe: (tf: Timeframe) => void;
  compactMobile?: boolean;
}

export function ChartPanel({
  instrument,
  timeframe,
  onChangeTimeframe,
  compactMobile = false,
}: ChartPanelProps) {
  const [fitSignal, setFitSignal] = useState(0);
  const [panLocked, setPanLocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hoverOhlc, setHoverOhlc] = useState<OhlcSnapshot | null>(null);
  const [liveOhlc, setLiveOhlc] = useState<OhlcSnapshot | null>(null);

  const openPositions = useTradingStore((s) => s.openPositions);
  const orderPreview = useTradingStore((s) => s.orderPreview);
  const markPrice = useTradingStore((s) => s.markPrices[instrument.id]);

  const handleCrosshair = useCallback((snap: OhlcSnapshot | null) => {
    setHoverOhlc(snap);
  }, []);

  const handleLiveBar = useCallback((snap: OhlcSnapshot) => {
    setLiveOhlc(snap);
  }, []);

  const ohlc: OhlcSnapshot = hoverOhlc ??
    liveOhlc ?? {
      open: markPrice ?? instrument.basePrice,
      high: markPrice ?? instrument.basePrice,
      low: markPrice ?? instrument.basePrice,
      close: markPrice ?? instrument.basePrice,
      changePct: 0,
    };

  const fmt = (val: number) =>
    val.toLocaleString('en-US', {
      minimumFractionDigits: instrument.decimals,
      maximumFractionDigits: instrument.decimals,
    });

  return (
    <section
      className={
        fullscreen
          ? 'fixed inset-0 z-50 flex flex-col bg-[var(--bg-surface)]'
          : 'flex h-full w-full min-w-0 flex-col bg-[var(--bg-surface)]'
      }
    >
      {/* Timeframe & Controls Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-1.5 md:px-4">
        <div className="flex min-w-0 items-center gap-1">
          {TIMEFRAMES.map((tf) => (
            <TimeframePill
              key={tf}
              label={tf}
              active={timeframe === tf}
              onClick={() => onChangeTimeframe(tf)}
              layoutGroupId={compactMobile ? 'tf-mobile' : 'tf-desktop'}
            />
          ))}

          <span className="tabular-nums-strict ml-2 hidden truncate text-[11px] font-medium text-[var(--text-secondary)] xl:inline">
            | O {fmt(ohlc.open)} H {fmt(ohlc.high)} L {fmt(ohlc.low)} C{' '}
            <span
              className={
                ohlc.changePct >= 0
                  ? 'text-[var(--long-bright)]'
                  : 'text-[var(--short-bright)]'
              }
            >
              {fmt(ohlc.close)} ({ohlc.changePct >= 0 ? '+' : ''}
              {ohlc.changePct.toFixed(2)}%)
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {compactMobile || fullscreen ? (
            <>
              <button
                type="button"
                onClick={() => setPanLocked((v) => !v)}
                className={`tabular-nums-strict inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-control)] border px-2 text-[11px] font-medium transition-colors md:min-h-[28px] md:px-2.5 ${
                  panLocked
                    ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent)]'
                    : 'border-[var(--border-default)] bg-[var(--bg-raised)] text-[var(--text-secondary)]'
                }`}
              >
                {panLocked ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  <Unlock className="h-3 w-3" />
                )}
                <span>{panLocked ? 'Pan Locked' : 'Scroll-Safe'}</span>
              </button>
              <button
                type="button"
                aria-label={fullscreen ? 'Exit Fullscreen Chart' : 'Fullscreen Chart'}
                onClick={() => setFullscreen((f) => !f)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] md:min-h-[28px] md:px-2.5"
              >
                {fullscreen ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
                <span>{fullscreen ? 'Exit' : 'FS'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setFitSignal((s) => s + 1)}
              className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)]"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Auto-Fit</span>
            </button>
          )}
        </div>
      </div>

      {/* Candlestick Canvas (Flat dark skeleton while 500 historical candles stream) */}
      <div
        className={`relative w-full min-w-0 overflow-hidden ${
          fullscreen
            ? 'flex-1'
            : compactMobile
              ? 'h-[285px]'
              : 'min-h-[300px] flex-1 xl:min-h-[360px]'
        }`}
      >
        {loading && (
          <div
            aria-label="Loading candlestick market data"
            className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between bg-[var(--bg-surface)] p-4"
          >
            <div className="h-3 w-44 rounded bg-[var(--bg-raised)]" />
            <div className="grid grid-cols-12 items-end gap-2 opacity-60">
              {[42, 64, 52, 78, 60, 88, 72, 95, 68, 82, 75, 90].map((h, i) => (
                <div
                  key={i}
                  className="rounded-sm bg-[var(--bg-raised)]"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
            <div className="h-3 w-full rounded bg-[var(--bg-raised)]" />
          </div>
        )}

        <DynamicCandlestickCanvas
          instrument={instrument}
          timeframe={timeframe}
          compactMobile={compactMobile}
          panLocked={panLocked}
          fitSignal={fitSignal}
          openPositions={openPositions}
          orderPreview={orderPreview}
          onCrosshairOhlc={handleCrosshair}
          onLiveBarOhlc={handleLiveBar}
          onLoadingChange={setLoading}
        />
      </div>
    </section>
  );
}
