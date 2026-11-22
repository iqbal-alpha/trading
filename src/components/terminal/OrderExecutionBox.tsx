'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { InstrumentMeta } from '@/lib/preseeded-trades';
import {
  CHALLENGE_BREACH_FLOOR,
  calculateFreeMargin,
  calculateLiquidationPrice,
  calculateNotional,
  calculateQuantity,
  calculateTotalEquity,
  type OrderMode,
  type PositionSide,
} from '@/lib/trading-math';
import { useTradingStore } from '@/store/useTradingStore';
import { QuickPctPill } from '@/components/ui/TerminalPrimitives';
import { AlertTriangle, Minus, Plus, RotateCcw, X } from 'lucide-react';

interface OrderExecutionBoxProps {
  instrument: InstrumentMeta;
  side: PositionSide;
  onChangeSide: (side: PositionSide) => void;
  onActionNotice: (summaryText: string, isError?: boolean) => void;
  onOrderPlaced?: () => void;
  onCloseSheet?: () => void;
  variant?: 'desktop' | 'sheet';
}

const PCT_PRESETS = [25, 50, 75, 100];
const LEVERAGES = [1, 5, 10, 20, 50];

export function OrderExecutionBox({
  instrument,
  side,
  onChangeSide,
  onActionNotice,
  onOrderPlaced,
  onCloseSheet,
  variant = 'desktop',
}: OrderExecutionBoxProps) {
  const markPrices = useTradingStore((s) => s.markPrices);
  const walletBalance = useTradingStore((s) => s.walletBalance);
  const openPositions = useTradingStore((s) => s.openPositions);
  const pendingLimitOrders = useTradingStore((s) => s.pendingLimitOrders);
  const accountStatus = useTradingStore((s) => s.accountStatus);
  const openOrder = useTradingStore((s) => s.openOrder);
  const resetDemoAccount = useTradingStore((s) => s.resetDemoAccount);
  const setOrderPreview = useTradingStore((s) => s.setOrderPreview);

  const liveMark = markPrices[instrument.id] ?? instrument.basePrice;
  const freeMargin = calculateFreeMargin(walletBalance, openPositions, pendingLimitOrders);
  const totalEquity = calculateTotalEquity(walletBalance, openPositions, markPrices);
  const ddRemaining = Math.max(0, totalEquity - CHALLENGE_BREACH_FLOOR);
  const isBreached =
    accountStatus === 'BREACHED' || accountStatus === 'DAILY_BREACHED';

  const [orderMode, setOrderMode] = useState<OrderMode>('Market');
  const [marginUsd, setMarginUsd] = useState<number>(2500);
  const [selectedPct, setSelectedPct] = useState<number | null>(null);
  const [leverage, setLeverage] = useState<number>(10);
  const [limitOverride, setLimitOverride] = useState<string | null>(null);
  const [tpOverride, setTpOverride] = useState<string | null>(null);
  const [slOverride, setSlOverride] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [rrPulseKey, setRrPulseKey] = useState(0);

  const isLong = side === 'LONG';
  const isSheet = variant === 'sheet';

  // Auto-track live mark price dynamically until the user customizes an input
  const limitPrice = limitOverride ?? liveMark.toFixed(instrument.decimals);
  const tpPrice =
    tpOverride ??
    (liveMark * (isLong ? 1.028 : 0.972)).toFixed(instrument.decimals);
  const slPrice =
    slOverride ??
    (liveMark * (isLong ? 0.9868 : 1.0132)).toFixed(instrument.decimals);

  const entryRef =
    orderMode === 'Limit' && Number(limitPrice) > 0 ? Number(limitPrice) : liveMark;
  const notional = calculateNotional(marginUsd, leverage);
  const qty = calculateQuantity(notional, entryRef);
  const liqPrice = calculateLiquidationPrice(side, entryRef, leverage);

  const tpParsed = Number(tpPrice);
  const slParsed = Number(slPrice);
  const tpValidNum = Number.isFinite(tpParsed) && tpParsed > 0 ? tpParsed : null;
  const slValidNum = Number.isFinite(slParsed) && slParsed > 0 ? slParsed : null;

  const projectedTp =
    tpValidNum !== null
      ? (isLong ? tpValidNum - entryRef : entryRef - tpValidNum) * qty
      : null;
  const projectedSl =
    slValidNum !== null
      ? (isLong ? slValidNum - entryRef : entryRef - slValidNum) * qty
      : null;

  const rrRatio =
    projectedTp !== null &&
      projectedTp > 0 &&
      projectedSl !== null &&
      projectedSl < 0
      ? (projectedTp / Math.abs(projectedSl)).toFixed(2)
      : '—';

  // Push live dashed TP/SL preview lines directly to chart (Anim #4)
  useEffect(() => {
    setOrderPreview({
      symbolId: instrument.id,
      side,
      tpPrice: tpValidNum,
      slPrice: slValidNum,
      projectedTpUsd: projectedTp,
      projectedSlUsd: projectedSl,
    });
  }, [
    instrument.id,
    side,
    tpValidNum,
    slValidNum,
    projectedTp,
    projectedSl,
    setOrderPreview,
  ]);

  const switchSide = (nextSide: PositionSide) => {
    setInlineError(null);
    onChangeSide(nextSide);
    setTpOverride(null);
    setSlOverride(null);
    setRrPulseKey((k) => k + 1);
  };

  const applyMarginPreset = (pct: number) => {
    setInlineError(null);
    setSelectedPct(pct);
    const nextMargin = Math.max(50, Math.floor((freeMargin * (pct / 100)) / 10) * 10);
    setMarginUsd(Math.min(freeMargin, nextMargin));
  };

  const applyTpRoe = (roePct: number) => {
    setInlineError(null);
    const movePct = roePct / 100 / leverage;
    const price = isLong ? entryRef * (1 + movePct) : entryRef * (1 - movePct);
    setTpOverride(price.toFixed(instrument.decimals));
    setRrPulseKey((k) => k + 1);
  };

  const applySlRoe = (roePct: number) => {
    setInlineError(null);
    const movePct = Math.abs(roePct) / 100 / leverage;
    const price = isLong ? entryRef * (1 - movePct) : entryRef * (1 + movePct);
    setSlOverride(price.toFixed(instrument.decimals));
    setRrPulseKey((k) => k + 1);
  };

  const handleSubmit = () => {
    setInlineError(null);
    const result = openOrder({
      symbolId: instrument.id,
      mode: orderMode,
      side,
      marginUsd,
      leverage,
      limitPrice: orderMode === 'Limit' ? Number(limitPrice) : undefined,
      tpPrice: tpValidNum,
      slPrice: slValidNum,
    });

    if (!result.ok) {
      setInlineError(result.error ?? 'Order rejected by risk engine.');
      return;
    }

    onActionNotice(
      result.kind === 'LIMIT'
        ? `Limit ${side} queued: ${instrument.symbol} @ $${entryRef.toLocaleString('en-US', {
          minimumFractionDigits: instrument.decimals,
        })}`
        : `Opened ${side} ${leverage}x ${instrument.symbol} · $${notional.toLocaleString('en-US')}`
    );
    onOrderPlaced?.();
  };

  return (
    <aside
      className={`flex min-w-0 flex-col justify-between bg-[var(--bg-surface)] transition-[border-color,box-shadow] duration-[240ms] ease-[var(--ease-out)] ${isLong ? 'border-t-2 border-t-[var(--long)]' : 'border-t-2 border-t-[var(--short)]'
        } ${isSheet ? 'w-full bg-[var(--bg-floating)] p-4 pt-2' : 'h-full p-3.5 xl:p-4'}`}
    >
      <div className="space-y-3.5">
        {isSheet && (
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                {instrument.symbol} Order Ticket
              </h2>
              <span className="tabular-nums-strict text-[12px] font-medium text-[var(--long-bright)]">
                Mark $
                {liveMark.toLocaleString('en-US', {
                  minimumFractionDigits: instrument.decimals,
                  maximumFractionDigits: instrument.decimals,
                })}
              </span>
            </div>
            {onCloseSheet && (
              <button
                type="button"
                onClick={onCloseSheet}
                aria-label="Close Order Sheet"
                className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Breached State Compact Banner (never covers Journal) */}
        {isBreached && (
          <div className="rounded-[var(--radius-control)] border border-[var(--short)]/50 bg-[var(--short-tint)] p-3 text-[12px]">
            <div className="flex items-center gap-2 font-semibold text-[var(--short-bright)]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                {accountStatus === 'DAILY_BREACHED'
                  ? 'Daily Loss Limit (-$5,000) Reached'
                  : 'Challenge Breached (< $90,000 Equity)'}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
              Trading is locked. Review your trades in Trading Journal or reset.
            </p>
            <button
              type="button"
              onClick={() => {
                resetDemoAccount();
                onActionNotice('Prop Firm Challenge reset to active $100k evaluation.');
              }}
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--short)] px-3 text-[11px] font-bold text-[var(--bg-ground)] hover:bg-[var(--short-bright)]"
            >
              <RotateCcw className="h-3 w-3" />
              Reset $100k Challenge
            </button>
          </div>
        )}

        {/* Polarity Switcher */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => switchSide('LONG')}
            className={`min-h-[44px] rounded-[var(--radius-control)] border text-[13px] font-bold transition-all duration-[240ms] md:min-h-[38px] ${isLong
              ? 'glow-long border-[var(--long)] bg-[var(--long)] text-[var(--bg-ground)]'
              : 'border-[var(--border-default)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
          >
            Buy / Long
          </button>
          <button
            type="button"
            onClick={() => switchSide('SHORT')}
            className={`min-h-[44px] rounded-[var(--radius-control)] border text-[13px] font-bold transition-all duration-[240ms] md:min-h-[38px] ${!isLong
              ? 'glow-short border-[var(--short)] bg-[var(--short)] text-[var(--bg-ground)]'
              : 'border-[var(--border-focus)] bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
          >
            Sell / Short
          </button>
        </div>

        {/* Mode & Available Free Margin */}
        <div className="flex items-center justify-between text-[12px]">
          <div className="flex items-center gap-2">
            {(['Market', 'Limit'] as OrderMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setOrderMode(m);
                  if (m === 'Limit') setLimitOverride(null);
                }}
                className={`min-h-[44px] px-1.5 font-semibold transition-colors md:min-h-0 md:px-0 ${orderMode === m
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="tabular-nums-strict text-[11px] font-medium text-[var(--text-muted)]">
            Avail: ${freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {orderMode === 'Limit' && (
          <div className="space-y-1">
            <label
              htmlFor={`limit-input-${variant}`}
              className="block text-[12px] font-medium text-[var(--text-secondary)]"
            >
              Limit Price (USD)
            </label>
            <input
              id={`limit-input-${variant}`}
              name={`limit-price-${variant}`}
              type="text"
              inputMode="decimal"
              value={limitPrice}
              onChange={(e) => setLimitOverride(e.target.value)}
              className="tabular-nums-strict h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-3 text-base font-bold text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] md:h-9 md:text-[13px]"
            />
          </div>
        )}

        {/* Margin Input (16px on mobile to prevent iOS Safari auto-zoom) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[12px]">
            <label
              htmlFor={`margin-input-${variant}`}
              className="font-medium text-[var(--text-secondary)]"
            >
              Margin Allocation (USD)
            </label>
          </div>

          <div className="flex items-center gap-2">
            {isSheet && (
              <button
                type="button"
                aria-label="Decrease margin by $250"
                onClick={() => {
                  setSelectedPct(null);
                  setMarginUsd((m) => Math.max(50, m - 250));
                }}
                className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] text-[var(--text-primary)] active:scale-95"
              >
                <Minus className="h-4 w-4" />
              </button>
            )}

            <div className="relative flex-1">
              <span className="tabular-nums-strict pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[var(--text-secondary)]">
                $
              </span>
              <input
                id={`margin-input-${variant}`}
                name={`margin-${variant}`}
                type="text"
                inputMode="decimal"
                value={marginUsd}
                onChange={(e) => {
                  setInlineError(null);
                  setSelectedPct(null);
                  const val = Number(e.target.value.replace(/[^0-9.]/g, ''));
                  setMarginUsd(Number.isFinite(val) ? val : 0);
                }}
                className="tabular-nums-strict h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-focus)] bg-[var(--bg-raised)] pl-7 pr-12 text-base font-bold text-[var(--text-primary)] outline-none focus:border-[var(--long)] md:h-10 md:text-[14px]"
              />
              <span className="tabular-nums-strict pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[var(--text-muted)]">
                USD
              </span>
            </div>

            {isSheet && (
              <button
                type="button"
                aria-label="Increase margin by $250"
                onClick={() => {
                  setSelectedPct(null);
                  setMarginUsd((m) => Math.min(freeMargin, m + 250));
                }}
                className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] text-[var(--text-primary)] active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {PCT_PRESETS.map((pct) => (
              <QuickPctPill
                key={pct}
                label={`${pct}%`}
                selected={selectedPct === pct}
                onClick={() => applyMarginPreset(pct)}
                mobileTall={isSheet}
              />
            ))}
          </div>
        </div>

        {/* Leverage Presets */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-medium text-[var(--text-secondary)]">Leverage</span>
            <span className="tabular-nums-strict font-bold text-[var(--long-bright)]">
              {leverage}x Isolated
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {LEVERAGES.map((lev) => (
              <button
                key={lev}
                type="button"
                onClick={() => {
                  setLeverage(lev);
                  setRrPulseKey((k) => k + 1);
                }}
                className={`tabular-nums-strict min-h-[44px] rounded-[var(--radius-control)] border text-[12px] font-medium transition-colors md:min-h-[32px] ${leverage === lev
                  ? 'border-[var(--long)] bg-[var(--long-tint)] text-[var(--long-bright)]'
                  : 'border-[var(--border-default)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
              >
                {lev}x
              </button>
            ))}
          </div>
        </div>

        {/* Take Profit & Stop Loss */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-1">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[12px]">
              <label
                htmlFor={`tp-input-${variant}`}
                className="font-medium text-[var(--text-secondary)]"
              >
                Take Profit (TP)
              </label>
              <span className="tabular-nums-strict text-[11px] font-medium text-[var(--long-bright)]">
                {projectedTp !== null
                  ? `${projectedTp >= 0 ? '+' : '-'}$${Math.abs(projectedTp).toFixed(2)}`
                  : '—'}
              </span>
            </div>
            <div className="flex items-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2.5">
              <input
                id={`tp-input-${variant}`}
                name={`tp-${variant}`}
                type="text"
                inputMode="decimal"
                placeholder="Optional"
                value={tpPrice}
                onChange={(e) => {
                  setInlineError(null);
                  setTpOverride(e.target.value);
                  setRrPulseKey((k) => k + 1);
                }}
                className="tabular-nums-strict min-h-[44px] min-w-0 w-full bg-transparent text-base font-bold text-[var(--text-primary)] outline-none md:h-9 md:min-h-0 md:text-[13px]"
              />
              <div className="flex shrink-0 items-center gap-0.5 text-[11px] text-[var(--long-bright)] md:gap-1">
                {[25, 50, 100].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => applyTpRoe(r)}
                    className="tabular-nums-strict inline-flex min-h-[44px] items-center rounded px-1.5 hover:bg-[var(--long-tint)] md:min-h-0 md:px-1 md:py-0.5"
                  >
                    +{r}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[12px]">
              <label
                htmlFor={`sl-input-${variant}`}
                className="font-medium text-[var(--text-secondary)]"
              >
                Stop Loss (SL)
              </label>
              <span className="tabular-nums-strict text-[11px] font-medium text-[var(--short-bright)]">
                {projectedSl !== null
                  ? `${projectedSl >= 0 ? '+' : '-'}$${Math.abs(projectedSl).toFixed(2)}`
                  : '—'}
              </span>
            </div>
            <div className="flex items-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2.5">
              <input
                id={`sl-input-${variant}`}
                name={`sl-${variant}`}
                type="text"
                inputMode="decimal"
                placeholder="Optional"
                value={slPrice}
                onChange={(e) => {
                  setInlineError(null);
                  setSlOverride(e.target.value);
                  setRrPulseKey((k) => k + 1);
                }}
                className="tabular-nums-strict min-h-[44px] min-w-0 w-full bg-transparent text-base font-bold text-[var(--text-primary)] outline-none md:h-9 md:min-h-0 md:text-[13px]"
              />
              <div className="flex shrink-0 items-center gap-0.5 text-[11px] text-[var(--short-bright)] md:gap-1">
                {[-15, -25, -50].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => applySlRoe(r)}
                    className="tabular-nums-strict inline-flex min-h-[44px] items-center rounded px-1.5 hover:bg-[var(--short-tint)] md:min-h-0 md:px-1 md:py-0.5"
                  >
                    {r}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {inlineError && (
          <p
            role="alert"
            className="rounded-[var(--radius-control)] border border-[var(--short)]/50 bg-[var(--short-tint)] px-2.5 py-2 text-[11px] font-medium text-[var(--short-bright)]"
          >
            {inlineError}
          </p>
        )}
      </div>

      {/* Risk Summary & Primary Execution CTA */}
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-3 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">Notional Position Size</span>
            <span className="tabular-nums-strict font-semibold text-[var(--text-primary)]">
              ${notional.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({qty.toFixed(2)}{' '}
              {instrument.unit})
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">Est. Liquidation Price</span>
            <span className="tabular-nums-strict font-semibold text-[var(--accent)]">
              ${liqPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">Risk-to-Reward Ratio</span>
            <motion.span
              key={rrPulseKey}
              initial={{ scale: 1.06 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="tabular-nums-strict font-bold text-[var(--long-bright)]"
            >
              {rrRatio === '—' ? '—' : `1 : ${rrRatio} R:R`}
            </motion.span>
          </div>
          {!isSheet && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Max Drawdown Buffer</span>
              <span className="tabular-nums-strict font-medium text-[var(--text-primary)]">
                ${ddRemaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} remaining
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={isBreached}
          onClick={handleSubmit}
          className={`min-h-[48px] w-full rounded-[var(--radius-control)] text-[14px] font-bold text-[var(--bg-ground)] transition-transform duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${isLong
            ? 'glow-long bg-[var(--long)] hover:bg-[var(--long-bright)]'
            : 'glow-short bg-[var(--short)] hover:bg-[var(--short-bright)]'
            }`}
        >
          {orderMode === 'Limit' ? 'PLACE LIMIT' : isSheet ? 'CONFIRM' : 'OPEN'} {side}{' '}
          {instrument.symbol.split(' ')[0]} · ${notional.toLocaleString('en-US')}
        </button>
      </div>
    </aside>
  );
}
