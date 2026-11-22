'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { INSTRUMENT_MAP } from '@/lib/preseeded-trades';
import {
  calculatePnl,
  calculateRoePct,
  type OpenPosition,
} from '@/lib/trading-math';
import { useTradingStore } from '@/store/useTradingStore';
import { SideBadge } from '@/components/ui/TerminalPrimitives';
import { TickFlashValue } from '@/components/ui/AnimatedMetrics';
import { ChevronDown } from 'lucide-react';

export function MobilePositionCard({
  position,
  onActionNotice,
}: {
  position: OpenPosition;
  onActionNotice: (msg: string, isError?: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tpInput, setTpInput] = useState(
    position.tpPrice !== null ? String(position.tpPrice) : ''
  );
  const [slInput, setSlInput] = useState(
    position.slPrice !== null ? String(position.slPrice) : ''
  );

  const markPrice =
    useTradingStore((s) => s.markPrices[position.symbolId]) ?? position.entryPrice;
  const dir = useTradingStore((s) => s.markDirections[position.symbolId]);
  const seq = useTradingStore((s) => s.markTickSeq[position.symbolId]);
  const closePosition = useTradingStore((s) => s.closePosition);
  const updateTpSl = useTradingStore((s) => s.updateTpSl);

  const meta = INSTRUMENT_MAP[position.symbolId];
  const pnlUsd = calculatePnl(
    position.side,
    position.entryPrice,
    markPrice,
    position.quantity
  );
  const roePct = calculateRoePct(pnlUsd, position.marginUsd);
  const isProfit = pnlUsd >= 0;

  const compactSymbol = position.symbol.replace(' · Gold', '');
  const fmtMetaPrice = (p: number | null) => {
    if (p === null) return '—';
    if (p >= 1000) return Math.round(p).toLocaleString('en-US');
    return p.toLocaleString('en-US', { maximumFractionDigits: meta.decimals });
  };
  const fmtCompactTp = (p: number | null) => {
    if (p === null) return '—';
    if (p >= 10000) return `${(p / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return fmtMetaPrice(p);
  };

  const handleSaveTpSl = () => {
    const tp = tpInput.trim() ? Number(tpInput) : null;
    const sl = slInput.trim() ? Number(slInput) : null;
    const res = updateTpSl(position.id, tp, sl);
    if (!res.ok) {
      onActionNotice(res.error ?? 'Invalid TP/SL values.', true);
    } else {
      onActionNotice(`Updated TP/SL for ${compactSymbol}.`);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-[var(--radius-panel)] border border-[var(--border-default)] bg-[var(--bg-raised)] p-3"
    >
      {/* Row 1: Unified 44px Expand Trigger (Identity + Live PnL) */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="whitespace-nowrap text-[13px] font-semibold text-[var(--text-primary)]">
            {compactSymbol}
          </span>
          <SideBadge side={position.side} leverage={position.leverage} />
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </div>

        <span
          className={`tabular-nums-strict shrink-0 whitespace-nowrap text-[12.5px] font-semibold ${
            isProfit ? 'text-[var(--long-bright)]' : 'text-[var(--short-bright)]'
          }`}
        >
          {isProfit ? '+' : '-'}${Math.abs(pnlUsd).toFixed(2)} (
          {isProfit ? '+' : ''}
          {roePct.toFixed(1)}%)
        </span>
      </button>

      {/* Row 2: Compact Meta (never clipped at 360px+) + 44px Touch Close Action */}
      <div className="mt-1 flex items-center justify-between gap-1.5">
        <div className="tabular-nums-strict flex min-w-0 flex-wrap items-center gap-x-1 text-[10.5px] font-medium text-[var(--text-secondary)] min-[380px]:text-[11px]">
          <span>Ent ${fmtMetaPrice(position.entryPrice)}</span>
          <span>·</span>
          <TickFlashValue
            text={`Mark $${fmtMetaPrice(markPrice)}`}
            direction={dir}
            tickSeq={seq}
            className="text-[var(--text-primary)]"
          />
          <span>· TP ${fmtCompactTp(position.tpPrice)}</span>
        </div>

        <button
          type="button"
          onClick={() => closePosition(position.id, 'MANUAL')}
          className="inline-flex min-h-[44px] min-w-[60px] shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-focus)] bg-[var(--bg-surface)] px-3 text-[12px] font-semibold text-[var(--text-primary)] active:scale-[0.97]"
        >
          Close
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2.5 border-t border-[var(--border-subtle)] pt-2.5 text-[11px]">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Margin</span>
              <span className="tabular-nums-strict text-[var(--text-primary)]">
                ${position.marginUsd.toLocaleString('en-US')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Notional</span>
              <span className="tabular-nums-strict text-[var(--text-primary)]">
                ${position.notionalUsd.toLocaleString('en-US')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Liq. Price</span>
              <span className="tabular-nums-strict text-[var(--accent)]">
                ${position.liqPrice.toLocaleString('en-US', {
                  minimumFractionDigits: meta.decimals,
                  maximumFractionDigits: meta.decimals,
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Qty</span>
              <span className="tabular-nums-strict text-[var(--text-primary)]">
                {position.quantity.toFixed(2)} {meta.unit}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <div>
              <label
                htmlFor={`m-tp-${position.id}`}
                className="mb-1 block text-[10px] text-[var(--text-muted)]"
              >
                Edit TP
              </label>
              <input
                id={`m-tp-${position.id}`}
                type="text"
                inputMode="decimal"
                value={tpInput}
                onChange={(e) => setTpInput(e.target.value)}
                className="tabular-nums-strict min-h-[44px] w-full rounded border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-base font-medium text-[var(--long-bright)]"
              />
            </div>
            <div>
              <label
                htmlFor={`m-sl-${position.id}`}
                className="mb-1 block text-[10px] text-[var(--text-muted)]"
              >
                Edit SL
              </label>
              <input
                id={`m-sl-${position.id}`}
                type="text"
                inputMode="decimal"
                value={slInput}
                onChange={(e) => setSlInput(e.target.value)}
                className="tabular-nums-strict min-h-[44px] w-full rounded border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-base font-medium text-[var(--short-bright)]"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveTpSl}
              className="min-h-[44px] min-w-[56px] rounded-[var(--radius-control)] border border-[var(--border-focus)] bg-[var(--bg-surface)] px-3 text-[11px] font-semibold text-[var(--text-primary)]"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
