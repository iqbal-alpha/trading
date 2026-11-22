import {
  calculateLiquidationPrice,
  calculateQuantity,
  type InstrumentId,
  type OpenPosition,
  type TradeJournalEntry,
} from '@/lib/trading-math';

export interface InstrumentMeta {
  id: InstrumentId;
  symbol: string;
  shortLabel: string;
  unit: string;
  decimals: number;
  basePrice: number;
  defaultHigh24h: number;
  defaultLow24h: number;
  defaultChangePct: number;
  badgeNote?: string;
}

export const INSTRUMENT_LIST: InstrumentMeta[] = [
  {
    id: 'BTCUSDT',
    symbol: 'BTC/USDT',
    shortLabel: 'BTC',
    unit: 'BTC',
    decimals: 2,
    basePrice: 92415.8,
    defaultHigh24h: 93120,
    defaultLow24h: 90480,
    defaultChangePct: 2.41,
  },
  {
    id: 'PAXGUSDT',
    symbol: 'XAU/USD · Gold',
    shortLabel: 'XAU',
    unit: 'PAXG',
    decimals: 2,
    basePrice: 2645.1,
    defaultHigh24h: 2658.4,
    defaultLow24h: 2619.0,
    defaultChangePct: 0.84,
    badgeNote: '24/7 PAXG Feed',
  },
  {
    id: 'ETHUSDT',
    symbol: 'ETH/USDT',
    shortLabel: 'ETH',
    unit: 'ETH',
    decimals: 2,
    basePrice: 3240.25,
    defaultHigh24h: 3278.0,
    defaultLow24h: 3142.5,
    defaultChangePct: 1.92,
  },
  {
    id: 'SOLUSDT',
    symbol: 'SOL/USDT',
    shortLabel: 'SOL',
    unit: 'SOL',
    decimals: 2,
    basePrice: 214.85,
    defaultHigh24h: 221.4,
    defaultLow24h: 209.3,
    defaultChangePct: -1.14,
  },
];

export const INSTRUMENT_MAP: Record<InstrumentId, InstrumentMeta> = {
  BTCUSDT: INSTRUMENT_LIST[0],
  PAXGUSDT: INSTRUMENT_LIST[1],
  ETHUSDT: INSTRUMENT_LIST[2],
  SOLUSDT: INSTRUMENT_LIST[3],
};

export const SEED_MARK_PRICES: Record<InstrumentId, number> = {
  BTCUSDT: 92415.8,
  PAXGUSDT: 2645.1,
  ETHUSDT: 3240.25,
  SOLUSDT: 214.85,
};

export const SEED_POSITION_SYMBOLS: InstrumentId[] = ['BTCUSDT', 'PAXGUSDT', 'ETHUSDT'];

/**
 * Generates an initial demo open position dynamically anchored around the real-time
 * mark price so pre-seeded positions remain realistic at any historical market level.
 */
export function createAnchoredSeedPosition(
  symbolId: InstrumentId,
  livePrice: number
): OpenPosition | null {
  const decimals = INSTRUMENT_MAP[symbolId]?.decimals ?? 2;
  const round = (v: number) => Number(v.toFixed(decimals));
  const now = Date.now();

  if (symbolId === 'BTCUSDT') {
    const entry = round(livePrice * 0.994);
    const notional = 2500 * 10;
    return {
      id: 'seed-pos-btc',
      symbolId,
      symbol: 'BTC/USDT',
      side: 'LONG',
      leverage: 10,
      marginUsd: 2500,
      notionalUsd: notional,
      quantity: calculateQuantity(notional, entry),
      entryPrice: entry,
      liqPrice: calculateLiquidationPrice('LONG', entry, 10),
      tpPrice: round(livePrice * 1.032),
      slPrice: round(livePrice * 0.98),
      strategyTag: 'Breakout',
      openedAt: now - 3_600_000,
    };
  }

  if (symbolId === 'PAXGUSDT') {
    const entry = round(livePrice * 0.996);
    const notional = 1000 * 20;
    return {
      id: 'seed-pos-xau',
      symbolId,
      symbol: 'XAU/USD · Gold',
      side: 'LONG',
      leverage: 20,
      marginUsd: 1000,
      notionalUsd: notional,
      quantity: calculateQuantity(notional, entry),
      entryPrice: entry,
      liqPrice: calculateLiquidationPrice('LONG', entry, 20),
      tpPrice: round(livePrice * 1.018),
      slPrice: round(livePrice * 0.988),
      strategyTag: 'Trend',
      openedAt: now - 7_200_000,
    };
  }

  if (symbolId === 'ETHUSDT') {
    const entry = round(livePrice * 0.996);
    const notional = 2000 * 5;
    return {
      id: 'seed-pos-eth',
      symbolId,
      symbol: 'ETH/USDT',
      side: 'SHORT',
      leverage: 5,
      marginUsd: 2000,
      notionalUsd: notional,
      quantity: calculateQuantity(notional, entry),
      entryPrice: entry,
      liqPrice: calculateLiquidationPrice('SHORT', entry, 5),
      tpPrice: round(livePrice * 0.945),
      slPrice: round(livePrice * 1.028),
      strategyTag: 'Reversal',
      openedAt: now - 10_800_000,
    };
  }

  return null;
}

// 12 realistic closed trades (8 wins = +$8,400.00, 4 losses = -$3,579.50 => net +$4,820.50)
export function createSeedTradeHistory(): TradeJournalEntry[] {
  const baseTs = 1763615700000;
  const day = 86_400_000;

  return [
    {
      id: 'seed-tr-12',
      symbolId: 'BTCUSDT',
      symbol: 'BTC/USDT',
      side: 'LONG',
      leverage: 10,
      marginUsd: 2500,
      quantity: 0.2796,
      entryPrice: 89400,
      exitPrice: 91920,
      realizedPnl: 1420.0,
      roePct: 56.8,
      closeReason: 'TP_HIT',
      strategyTag: 'Breakout',
      notes: 'Clean 15m liquidity sweep & reclaim above $91.8k support.',
      openedAt: baseTs - 7_200_000,
      closedAt: baseTs - 3_600_000,
    },
    {
      id: 'seed-tr-11',
      symbolId: 'PAXGUSDT',
      symbol: 'XAU/USD · Gold',
      side: 'LONG',
      leverage: 20,
      marginUsd: 2500,
      quantity: 19.246,
      entryPrice: 2598.0,
      exitPrice: 2621.5,
      realizedPnl: 1180.0,
      roePct: 47.2,
      closeReason: 'TP_HIT',
      strategyTag: 'London Sweep',
      notes: 'PAXG session expansion with tight invalidation below Asian low.',
      openedAt: baseTs - day - 7_200_000,
      closedAt: baseTs - day,
    },
    {
      id: 'seed-tr-10',
      symbolId: 'SOLUSDT',
      symbol: 'SOL/USDT',
      side: 'SHORT',
      leverage: 10,
      marginUsd: 2000,
      quantity: 96.0,
      entryPrice: 208.4,
      exitPrice: 212.9,
      realizedPnl: -874.5,
      roePct: -43.73,
      closeReason: 'SL_HIT',
      strategyTag: 'Scalp Fade',
      notes: 'Stopped above range high; honored hard stop-loss.',
      openedAt: baseTs - 2 * day - 5_000_000,
      closedAt: baseTs - 2 * day,
    },
    {
      id: 'seed-tr-09',
      symbolId: 'ETHUSDT',
      symbol: 'ETH/USDT',
      side: 'LONG',
      leverage: 10,
      marginUsd: 2500,
      quantity: 8.117,
      entryPrice: 3080.0,
      exitPrice: 3215.0,
      realizedPnl: 1090.0,
      roePct: 43.6,
      closeReason: 'MANUAL',
      strategyTag: 'EMA Pullback',
      notes: 'Scaled out at HTF supply before US macro volatility.',
      openedAt: baseTs - 2.5 * day - 8_000_000,
      closedAt: baseTs - 2.5 * day,
    },
    {
      id: 'seed-tr-08',
      symbolId: 'BTCUSDT',
      symbol: 'BTC/USDT',
      side: 'SHORT',
      leverage: 10,
      marginUsd: 2500,
      quantity: 0.277,
      entryPrice: 90150,
      exitPrice: 88420,
      realizedPnl: 990.0,
      roePct: 39.6,
      closeReason: 'TP_HIT',
      strategyTag: 'Range Fade',
      notes: 'Disciplined short off premium VWAP deviation band.',
      openedAt: baseTs - 3 * day - 10_000_000,
      closedAt: baseTs - 3 * day,
    },
    {
      id: 'seed-tr-07',
      symbolId: 'PAXGUSDT',
      symbol: 'XAU/USD · Gold',
      side: 'LONG',
      leverage: 10,
      marginUsd: 2500,
      quantity: 9.705,
      entryPrice: 2576.0,
      exitPrice: 2594.8,
      realizedPnl: 958.4,
      roePct: 38.34,
      closeReason: 'MANUAL',
      strategyTag: 'NY Open',
      notes: 'Strong gold impulse through NY equities open.',
      openedAt: baseTs - 3.5 * day - 6_000_000,
      closedAt: baseTs - 3.5 * day,
    },
    {
      id: 'seed-tr-06',
      symbolId: 'BTCUSDT',
      symbol: 'BTC/USDT',
      side: 'SHORT',
      leverage: 10,
      marginUsd: 2000,
      quantity: 0.225,
      entryPrice: 88900,
      exitPrice: 91100,
      realizedPnl: -980.0,
      roePct: -49.0,
      closeReason: 'SL_HIT',
      strategyTag: 'Reversal',
      notes: 'Early short squeezed cleanly into liquidation shelf.',
      openedAt: baseTs - 4 * day - 9_000_000,
      closedAt: baseTs - 4 * day,
    },
    {
      id: 'seed-tr-05',
      symbolId: 'ETHUSDT',
      symbol: 'ETH/USDT',
      side: 'LONG',
      leverage: 10,
      marginUsd: 2500,
      quantity: 8.278,
      entryPrice: 3020,
      exitPrice: 3129.2,
      realizedPnl: 904.5,
      roePct: 36.18,
      closeReason: 'TP_HIT',
      strategyTag: 'Breakout',
      notes: 'Clean consolidation break after ETF inflow print.',
      openedAt: baseTs - 4.5 * day - 7_000_000,
      closedAt: baseTs - 4.5 * day,
    },
    {
      id: 'seed-tr-04',
      symbolId: 'SOLUSDT',
      symbol: 'SOL/USDT',
      side: 'LONG',
      leverage: 10,
      marginUsd: 2000,
      quantity: 98.0,
      entryPrice: 204.0,
      exitPrice: 212.94,
      realizedPnl: 876.6,
      roePct: 43.83,
      closeReason: 'TP_HIT',
      strategyTag: 'Trend',
      notes: 'Held 15m higher-low trendline cleanly to TP.',
      openedAt: baseTs - 5 * day - 6_000_000,
      closedAt: baseTs - 5 * day,
    },
    {
      id: 'seed-tr-03',
      symbolId: 'ETHUSDT',
      symbol: 'ETH/USDT',
      side: 'SHORT',
      leverage: 10,
      marginUsd: 2000,
      quantity: 6.557,
      entryPrice: 3050,
      exitPrice: 3139.5,
      realizedPnl: -915.0,
      roePct: -45.75,
      closeReason: 'SL_HIT',
      strategyTag: 'Range Fade',
      notes: 'Invalidated immediately; avoided revenge sizing.',
      openedAt: baseTs - 5.5 * day - 5_000_000,
      closedAt: baseTs - 5.5 * day,
    },
    {
      id: 'seed-tr-02',
      symbolId: 'PAXGUSDT',
      symbol: 'XAU/USD · Gold',
      side: 'SHORT',
      leverage: 10,
      marginUsd: 2000,
      quantity: 7.8,
      entryPrice: 2564.0,
      exitPrice: 2592.4,
      realizedPnl: -810.0,
      roePct: -40.5,
      closeReason: 'SL_HIT',
      strategyTag: 'Discretionary',
      notes: 'Safe-haven bid pushed Gold above supply pocket.',
      openedAt: baseTs - 6 * day - 4_000_000,
      closedAt: baseTs - 6 * day,
    },
    {
      id: 'seed-tr-01',
      symbolId: 'BTCUSDT',
      symbol: 'BTC/USDT',
      side: 'LONG',
      leverage: 10,
      marginUsd: 2500,
      quantity: 0.285,
      entryPrice: 87600,
      exitPrice: 91040,
      realizedPnl: 980.5,
      roePct: 39.22,
      closeReason: 'TP_HIT',
      strategyTag: 'Breakout',
      notes: 'Opening Phase 1 momentum capture on volume surge.',
      openedAt: baseTs - 7 * day - 8_000_000,
      closedAt: baseTs - 7 * day,
    },
  ];
}

export function formatRelativeTime(timestampMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}
