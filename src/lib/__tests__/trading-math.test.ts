import { describe, expect, it } from 'vitest';
import { createSeedTradeHistory } from '@/lib/preseeded-trades';
import {
  CHALLENGE_BREACH_FLOOR,
  CHALLENGE_PASS_EQUITY,
  INITIAL_CHALLENGE_BALANCE,
  MAINTENANCE_MARGIN_RATE,
  calculateFreeMargin,
  calculateJournalStats,
  calculateLiquidationPrice,
  calculateNotional,
  calculatePnl,
  calculateQuantity,
  calculateRoePct,
  calculateTotalEquity,
  checkAutoCloseReason,
  validateOrderInput,
  type OpenPosition,
  type TradeJournalEntry,
} from '@/lib/trading-math';

function makeTrade(overrides: Partial<TradeJournalEntry> & { id: string }): TradeJournalEntry {
  return {
    symbolId: 'BTCUSDT',
    symbol: 'BTC/USDT',
    side: 'LONG',
    leverage: 10,
    marginUsd: 2500,
    quantity: 0.4,
    entryPrice: 60000,
    exitPrice: 62500,
    realizedPnl: 1000,
    roePct: 40,
    closeReason: 'TP_HIT',
    strategyTag: 'Breakout',
    notes: '',
    openedAt: 1_700_000_000_000,
    closedAt: 1_700_000_060_000,
    ...overrides,
  };
}

describe('trading-math core position calculations', () => {
  it('computes notional size, quantity, LONG/SHORT PnL on price up & down, and ROE%', () => {
    const notional = calculateNotional(2500, 10);
    expect(notional).toBe(25_000);

    const qty = calculateQuantity(notional, 50_000);
    expect(qty).toBeCloseTo(0.5, 8);
    expect(calculateQuantity(notional, 0)).toBe(0);

    // LONG profits when mark > entry, loses when mark < entry
    const longUpPnl = calculatePnl('LONG', 50_000, 52_000, qty);
    expect(longUpPnl).toBeCloseTo(1000, 6);
    expect(calculateRoePct(longUpPnl, 2500)).toBeCloseTo(40, 6);

    const longDownPnl = calculatePnl('LONG', 50_000, 48_000, qty);
    expect(longDownPnl).toBeCloseTo(-1000, 6);
    expect(calculateRoePct(longDownPnl, 2500)).toBeCloseTo(-40, 6);

    // SHORT profits when mark < entry, loses when mark > entry
    const shortDownPnl = calculatePnl('SHORT', 50_000, 48_000, qty);
    expect(shortDownPnl).toBeCloseTo(1000, 6);

    const shortUpPnl = calculatePnl('SHORT', 50_000, 52_000, qty);
    expect(shortUpPnl).toBeCloseTo(-1000, 6);

    // Edge guards
    expect(calculatePnl('LONG', 0, 50_000, 1)).toBe(0);
    expect(calculatePnl('LONG', 50_000, -10, 1)).toBe(0);
    expect(calculateRoePct(500, 0)).toBe(0);
  });

  it('computes Liquidation Price accurately at 1x, 10x, and 50x for LONG & SHORT', () => {
    const entry = 60_000;

    // 1x leverage: LONG keeps only maintenance buffer, SHORT = entry * (2 - 0.005)
    expect(calculateLiquidationPrice('LONG', entry, 1)).toBeCloseTo(
      entry * MAINTENANCE_MARGIN_RATE,
      4
    );
    expect(calculateLiquidationPrice('SHORT', entry, 1)).toBeCloseTo(
      entry * (1 + 1 - MAINTENANCE_MARGIN_RATE),
      4
    );

    // 10x leverage: LONG = 60000 * (1 - 0.1 + 0.005) = 54300; SHORT = 60000 * (1 + 0.1 - 0.005) = 65700
    expect(calculateLiquidationPrice('LONG', entry, 10)).toBeCloseTo(54_300, 4);
    expect(calculateLiquidationPrice('SHORT', entry, 10)).toBeCloseTo(65_700, 4);

    // 50x leverage: LONG = 60000 * (1 - 0.02 + 0.005) = 59100; SHORT = 60000 * (1 + 0.02 - 0.005) = 60900
    expect(calculateLiquidationPrice('LONG', entry, 50)).toBeCloseTo(59_100, 4);
    expect(calculateLiquidationPrice('SHORT', entry, 50)).toBeCloseTo(60_900, 4);

    // Invalid inputs never produce negative values
    expect(calculateLiquidationPrice('LONG', 0, 10)).toBe(0);
    expect(calculateLiquidationPrice('SHORT', 60_000, 0)).toBe(0);
  });

  it('calculates free margin and total equity across open positions & pending limits', () => {
    const openPositions: OpenPosition[] = [
      {
        id: 'p1',
        symbolId: 'BTCUSDT',
        symbol: 'BTC/USDT',
        side: 'LONG',
        leverage: 10,
        marginUsd: 2500,
        notionalUsd: 25_000,
        quantity: 0.5,
        entryPrice: 50_000,
        liqPrice: 45_250,
        tpPrice: 55_000,
        slPrice: 48_000,
        strategyTag: 'Breakout',
        openedAt: 1,
      },
      {
        id: 'p2',
        symbolId: 'ETHUSDT',
        symbol: 'ETH/USDT',
        side: 'SHORT',
        leverage: 5,
        marginUsd: 2000,
        notionalUsd: 10_000,
        quantity: 5,
        entryPrice: 2000,
        liqPrice: 2390,
        tpPrice: 1800,
        slPrice: 2100,
        strategyTag: 'Reversal',
        openedAt: 2,
      },
    ];

    const free = calculateFreeMargin(100_000, openPositions, [{ marginUsd: 1500 }]);
    expect(free).toBe(94_000);

    // BTC +$1,000, ETH +$500 -> Equity = 101,500
    const eq = calculateTotalEquity(100_000, openPositions, {
      BTCUSDT: 52_000,
      ETHUSDT: 1900,
      PAXGUSDT: 3000,
      SOLUSDT: 150,
    });
    expect(eq).toBeCloseTo(101_500, 6);
  });
});

describe('order validation and background tick auto-close triggers', () => {
  it('validates account status, margin bounds, leverage [1..50], and TP/SL direction polarity', () => {
    const base = {
      side: 'LONG' as const,
      marginUsd: 2500,
      freeMargin: 50_000,
      leverage: 10,
      entryPrice: 60_000,
      tpPrice: 63_000,
      slPrice: 58_500,
      accountStatus: 'ACTIVE' as const,
    };

    expect(validateOrderInput(base).valid).toBe(true);
    expect(validateOrderInput({ ...base, accountStatus: 'BREACHED' }).valid).toBe(false);
    expect(validateOrderInput({ ...base, accountStatus: 'DAILY_BREACHED' }).valid).toBe(false);
    expect(validateOrderInput({ ...base, marginUsd: 49 }).valid).toBe(false);
    expect(validateOrderInput({ ...base, marginUsd: 50_001 }).valid).toBe(false);
    expect(validateOrderInput({ ...base, leverage: 51 }).valid).toBe(false);
    expect(validateOrderInput({ ...base, tpPrice: 59_000 }).valid).toBe(false);
    expect(validateOrderInput({ ...base, slPrice: 61_000 }).valid).toBe(false);

    // SHORT polarity check
    expect(
      validateOrderInput({
        ...base,
        side: 'SHORT',
        tpPrice: 57_000,
        slPrice: 61_500,
      }).valid
    ).toBe(true);
    expect(
      validateOrderInput({
        ...base,
        side: 'SHORT',
        tpPrice: 61_000,
        slPrice: 61_500,
      }).valid
    ).toBe(false);
  });

  it('triggers LIQUIDATED, SL_HIT, and TP_HIT in deterministic priority order', () => {
    const longPos = { side: 'LONG' as const, liqPrice: 54_300, slPrice: 58_500, tpPrice: 63_000 };
    expect(checkAutoCloseReason(longPos, 60_000)).toBeNull();
    expect(checkAutoCloseReason(longPos, 63_000)).toBe('TP_HIT');
    expect(checkAutoCloseReason(longPos, 58_500)).toBe('SL_HIT');
    expect(checkAutoCloseReason(longPos, 54_300)).toBe('LIQUIDATED');
    expect(checkAutoCloseReason(longPos, 50_000)).toBe('LIQUIDATED');

    const shortPos = { side: 'SHORT' as const, liqPrice: 65_700, slPrice: 61_500, tpPrice: 57_000 };
    expect(checkAutoCloseReason(shortPos, 60_000)).toBeNull();
    expect(checkAutoCloseReason(shortPos, 57_000)).toBe('TP_HIT');
    expect(checkAutoCloseReason(shortPos, 61_500)).toBe('SL_HIT');
    expect(checkAutoCloseReason(shortPos, 65_700)).toBe('LIQUIDATED');
  });
});

describe('calculateJournalStats & Prop Firm edge cases', () => {
  it('handles 0 trades gracefully without NaN or Infinity', () => {
    const stats = calculateJournalStats([], INITIAL_CHALLENGE_BALANCE);
    expect(stats.totalTrades).toBe(0);
    expect(stats.winsCount).toBe(0);
    expect(stats.lossesCount).toBe(0);
    expect(stats.winRatePct).toBe(0);
    expect(stats.profitFactor).toBe(0);
    expect(stats.expectancyUsd).toBe(0);
    expect(stats.maxDrawdownPct).toBe(0);
    expect(stats.maxDrawdownUsd).toBe(0);
    expect(stats.netRealizedPnl).toBe(0);
    expect(stats.equityCurve).toHaveLength(1);
    expect(stats.equityCurve[0].equity).toBe(100_000);
  });

  it('returns profitFactor = null (rendered as ∞) on 100% winning sessions', () => {
    const trades: TradeJournalEntry[] = [
      makeTrade({ id: 'w1', realizedPnl: 2200, roePct: 88, closedAt: 1000 }),
      makeTrade({ id: 'w2', realizedPnl: 1800, roePct: 72, side: 'SHORT', closedAt: 2000 }),
    ];
    const stats = calculateJournalStats(trades, 100_000);
    expect(stats.winRatePct).toBe(100);
    expect(stats.lossesCount).toBe(0);
    expect(stats.profitFactor).toBeNull();
    expect(stats.expectancyUsd).toBe(2000);
    expect(stats.maxDrawdownPct).toBe(0);
    expect(stats.longWins).toBe(1);
    expect(stats.shortWins).toBe(1);
  });

  it('computes exact Peak-to-Trough Max Drawdown % across chronological ups and downs', () => {
    // Sequence sorted by closedAt (submitted out of order intentionally):
    // Initial: 100,000
    // +5,000 => 105,000 (Peak 105,000)
    // -3,150 => 101,850 (DD = 3,150 / 105,000 = 3.00%)
    // +6,150 => 108,000 (New Peak 108,000 -> Pass Equity)
    // -6,480 => 101,520 (DD = 6,480 / 108,000 = 6.00% -> Max DD!)
    const trades: TradeJournalEntry[] = [
      makeTrade({ id: 't4', realizedPnl: -6480, closedAt: 4000 }),
      makeTrade({ id: 't2', realizedPnl: -3150, closedAt: 2000 }),
      makeTrade({ id: 't1', realizedPnl: 5000, closedAt: 1000 }),
      makeTrade({ id: 't3', realizedPnl: 6150, closedAt: 3000 }),
    ];

    const stats = calculateJournalStats(trades, 100_000);
    expect(stats.netRealizedPnl).toBe(1520);
    expect(stats.maxDrawdownUsd).toBe(6480);
    expect(stats.maxDrawdownPct).toBeCloseTo(6.0, 6);
    expect(stats.equityCurve.map((pt) => pt.equity)).toEqual([
      100_000, 105_000, 101_850, 108_000, 101_520,
    ]);
    expect(stats.bestTrade).toEqual({ symbol: 'BTC/USDT', pnl: 6150 });
    expect(stats.worstTrade).toEqual({ symbol: 'BTC/USDT', pnl: -6480 });
  });

  it('matches canonical pre-seeded 12-trade demo portfolio KPIs & constants', () => {
    expect(CHALLENGE_PASS_EQUITY).toBe(108_000);
    expect(CHALLENGE_BREACH_FLOOR).toBe(90_000);

    const demoHistory = createSeedTradeHistory();
    const stats = calculateJournalStats(demoHistory, INITIAL_CHALLENGE_BALANCE);
    expect(stats.totalTrades).toBe(12);
    expect(stats.winsCount).toBe(8);
    expect(stats.lossesCount).toBe(4);
    expect(stats.winRatePct).toBeCloseTo(66.6667, 2);
    expect(stats.netRealizedPnl).toBeCloseTo(4820.5, 2);
    expect(stats.profitFactor).toBeCloseTo(8400 / 3579.5, 4);
  });
});
