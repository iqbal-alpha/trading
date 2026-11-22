export type InstrumentId = 'BTCUSDT' | 'ETHUSDT' | 'PAXGUSDT' | 'SOLUSDT';
export type PositionSide = 'LONG' | 'SHORT';
export type OrderMode = 'Market' | 'Limit';
export type Timeframe = '1m' | '15m' | '1H' | '1D';
export type ChallengeStatus = 'ACTIVE' | 'PASSED' | 'DAILY_BREACHED' | 'BREACHED';
export type CloseReason =
  | 'MANUAL'
  | 'TP_HIT'
  | 'SL_HIT'
  | 'LIQUIDATED'
  | 'CHALLENGE_BREACH';

export const INITIAL_CHALLENGE_BALANCE = 100_000;
export const PROFIT_TARGET_USD = 8_000;
export const MAX_DAILY_LOSS_USD = 5_000;
export const MAX_STATIC_DRAWDOWN_USD = 10_000;
export const CHALLENGE_BREACH_FLOOR = INITIAL_CHALLENGE_BALANCE - MAX_STATIC_DRAWDOWN_USD; // $90,000
export const CHALLENGE_PASS_EQUITY = INITIAL_CHALLENGE_BALANCE + PROFIT_TARGET_USD; // $108,000
export const MAINTENANCE_MARGIN_RATE = 0.005; // 0.5%
export const MIN_ORDER_MARGIN_USD = 50;

export interface OpenPosition {
  id: string;
  symbolId: InstrumentId;
  symbol: string;
  side: PositionSide;
  leverage: number;
  marginUsd: number;
  notionalUsd: number;
  quantity: number;
  entryPrice: number;
  liqPrice: number;
  tpPrice: number | null;
  slPrice: number | null;
  strategyTag: string;
  openedAt: number;
}

export interface PendingLimitOrder {
  id: string;
  symbolId: InstrumentId;
  symbol: string;
  side: PositionSide;
  leverage: number;
  marginUsd: number;
  limitPrice: number;
  tpPrice: number | null;
  slPrice: number | null;
  strategyTag: string;
  createdAt: number;
}

export interface TradeJournalEntry {
  id: string;
  symbolId: InstrumentId;
  symbol: string;
  side: PositionSide;
  leverage: number;
  marginUsd: number;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  roePct: number;
  closeReason: CloseReason;
  strategyTag: string;
  notes: string;
  openedAt: number;
  closedAt: number;
}

export interface JournalStats {
  totalTrades: number;
  winsCount: number;
  lossesCount: number;
  winRatePct: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null; // null => Infinity when grossLoss === 0 && grossProfit > 0
  expectancyUsd: number;
  avgRr: number;
  maxDrawdownPct: number;
  maxDrawdownUsd: number;
  netRealizedPnl: number;
  bestTrade: { symbol: string; pnl: number } | null;
  worstTrade: { symbol: string; pnl: number } | null;
  longWins: number;
  longTotal: number;
  shortWins: number;
  shortTotal: number;
  equityCurve: { index: number; equity: number; timestamp: number }[];
}

export function calculateNotional(marginUsd: number, leverage: number): number {
  return marginUsd * leverage;
}

export function calculateQuantity(notionalUsd: number, entryPrice: number): number {
  if (entryPrice <= 0) return 0;
  return notionalUsd / entryPrice;
}

export function calculatePnl(
  side: PositionSide,
  entryPrice: number,
  markPrice: number,
  quantity: number
): number {
  if (entryPrice <= 0 || markPrice <= 0 || quantity <= 0) return 0;
  return side === 'LONG'
    ? (markPrice - entryPrice) * quantity
    : (entryPrice - markPrice) * quantity;
}

export function calculateRoePct(pnlUsd: number, marginUsd: number): number {
  if (marginUsd <= 0) return 0;
  return (pnlUsd / marginUsd) * 100;
}

export function calculateLiquidationPrice(
  side: PositionSide,
  entryPrice: number,
  leverage: number,
  maintRate: number = MAINTENANCE_MARGIN_RATE
): number {
  if (entryPrice <= 0 || leverage <= 0) return 0;
  if (leverage === 1 && side === 'LONG') {
    return entryPrice * maintRate;
  }
  const price =
    side === 'LONG'
      ? entryPrice * (1 - 1 / leverage + maintRate)
      : entryPrice * (1 + 1 / leverage - maintRate);
  return Math.max(0, price);
}

export function calculateFreeMargin(
  walletBalance: number,
  openPositions: Pick<OpenPosition, 'marginUsd'>[],
  pendingOrders: Pick<PendingLimitOrder, 'marginUsd'>[] = []
): number {
  const lockedOpen = openPositions.reduce((acc, p) => acc + p.marginUsd, 0);
  const lockedPending = pendingOrders.reduce((acc, o) => acc + o.marginUsd, 0);
  return Math.max(0, walletBalance - lockedOpen - lockedPending);
}

export function calculateTotalEquity(
  walletBalance: number,
  openPositions: OpenPosition[],
  markPrices: Record<InstrumentId, number>
): number {
  const unrealized = openPositions.reduce((acc, pos) => {
    const mark = markPrices[pos.symbolId] ?? pos.entryPrice;
    return acc + calculatePnl(pos.side, pos.entryPrice, mark, pos.quantity);
  }, 0);
  return walletBalance + unrealized;
}

export interface OrderValidationInput {
  side: PositionSide;
  marginUsd: number;
  freeMargin: number;
  leverage: number;
  entryPrice: number;
  tpPrice: number | null;
  slPrice: number | null;
  accountStatus: ChallengeStatus;
}

export function validateOrderInput(input: OrderValidationInput): {
  valid: boolean;
  error?: string;
} {
  if (input.accountStatus === 'BREACHED') {
    return {
      valid: false,
      error: 'Account breached max static drawdown ($90,000). Reset challenge to continue.',
    };
  }
  if (input.accountStatus === 'DAILY_BREACHED') {
    return {
      valid: false,
      error: 'Daily loss limit (-$5,000) reached for current UTC day. Reset or wait for UTC rollover.',
    };
  }
  if (!Number.isFinite(input.marginUsd) || input.marginUsd < MIN_ORDER_MARGIN_USD) {
    return {
      valid: false,
      error: `Minimum margin allocation is $${MIN_ORDER_MARGIN_USD}.`,
    };
  }
  if (input.marginUsd > input.freeMargin + 1e-6) {
    return {
      valid: false,
      error: `Insufficient free margin ($${input.freeMargin.toFixed(2)} available).`,
    };
  }
  if (input.leverage < 1 || input.leverage > 50) {
    return { valid: false, error: 'Leverage must stay between 1x and 50x.' };
  }
  if (input.entryPrice <= 0) {
    return { valid: false, error: 'Waiting for valid market mark price.' };
  }
  if (input.tpPrice !== null) {
    if (input.side === 'LONG' && input.tpPrice <= input.entryPrice) {
      return { valid: false, error: 'For LONG orders, Take Profit must exceed entry price.' };
    }
    if (input.side === 'SHORT' && input.tpPrice >= input.entryPrice) {
      return { valid: false, error: 'For SHORT orders, Take Profit must be below entry price.' };
    }
  }
  if (input.slPrice !== null) {
    if (input.side === 'LONG' && input.slPrice >= input.entryPrice) {
      return { valid: false, error: 'For LONG orders, Stop Loss must be below entry price.' };
    }
    if (input.side === 'SHORT' && input.slPrice <= input.entryPrice) {
      return { valid: false, error: 'For SHORT orders, Stop Loss must exceed entry price.' };
    }
  }
  return { valid: true };
}

export function checkAutoCloseReason(
  position: Pick<OpenPosition, 'side' | 'liqPrice' | 'tpPrice' | 'slPrice'>,
  markPrice: number
): Exclude<CloseReason, 'MANUAL' | 'CHALLENGE_BREACH'> | null {
  if (markPrice <= 0) return null;

  if (position.side === 'LONG') {
    if (markPrice <= position.liqPrice) return 'LIQUIDATED';
    if (position.slPrice !== null && markPrice <= position.slPrice) return 'SL_HIT';
    if (position.tpPrice !== null && markPrice >= position.tpPrice) return 'TP_HIT';
  } else {
    if (markPrice >= position.liqPrice) return 'LIQUIDATED';
    if (position.slPrice !== null && markPrice >= position.slPrice) return 'SL_HIT';
    if (position.tpPrice !== null && markPrice <= position.tpPrice) return 'TP_HIT';
  }
  return null;
}

export function calculateJournalStats(
  history: TradeJournalEntry[],
  initialBalance: number = INITIAL_CHALLENGE_BALANCE
): JournalStats {
  const chronological = [...history].sort((a, b) => a.closedAt - b.closedAt);
  const totalTrades = chronological.length;

  let winsCount = 0;
  let lossesCount = 0;
  let grossProfit = 0;
  let grossLossAbs = 0;
  let longWins = 0;
  let longTotal = 0;
  let shortWins = 0;
  let shortTotal = 0;
  let bestTrade: { symbol: string; pnl: number } | null = null;
  let worstTrade: { symbol: string; pnl: number } | null = null;

  // Chronological peak-to-trough drawdown per PRD Section 5.2
  let runningEquity = initialBalance;
  let peakEquity = initialBalance;
  let maxDrawdownPct = 0;
  let maxDrawdownUsd = 0;

  const equityCurve: { index: number; equity: number; timestamp: number }[] = [
    {
      index: 0,
      equity: initialBalance,
      timestamp: chronological[0]?.openedAt ?? 0,
    },
  ];

  chronological.forEach((tr, idx) => {
    runningEquity += tr.realizedPnl;
    if (runningEquity > peakEquity) {
      peakEquity = runningEquity;
    }
    const ddUsd = peakEquity - runningEquity;
    const ddPct = peakEquity > 0 ? (ddUsd / peakEquity) * 100 : 0;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
    if (ddUsd > maxDrawdownUsd) maxDrawdownUsd = ddUsd;

    equityCurve.push({
      index: idx + 1,
      equity: runningEquity,
      timestamp: tr.closedAt,
    });

    if (tr.side === 'LONG') {
      longTotal += 1;
      if (tr.realizedPnl > 0) longWins += 1;
    } else {
      shortTotal += 1;
      if (tr.realizedPnl > 0) shortWins += 1;
    }

    if (tr.realizedPnl > 0) {
      winsCount += 1;
      grossProfit += tr.realizedPnl;
    } else if (tr.realizedPnl < 0) {
      lossesCount += 1;
      grossLossAbs += Math.abs(tr.realizedPnl);
    }

    if (!bestTrade || tr.realizedPnl > bestTrade.pnl) {
      bestTrade = { symbol: tr.symbol, pnl: tr.realizedPnl };
    }
    if (!worstTrade || tr.realizedPnl < worstTrade.pnl) {
      worstTrade = { symbol: tr.symbol, pnl: tr.realizedPnl };
    }
  });

  const winRatePct = totalTrades > 0 ? (winsCount / totalTrades) * 100 : 0;
  const profitFactor =
    grossLossAbs === 0 ? (grossProfit > 0 ? null : 0) : grossProfit / grossLossAbs;

  const avgWin = winsCount > 0 ? grossProfit / winsCount : 0;
  const avgLossAbs = lossesCount > 0 ? grossLossAbs / lossesCount : 0;
  const winProb = totalTrades > 0 ? winsCount / totalTrades : 0;
  const lossProb = totalTrades > 0 ? lossesCount / totalTrades : 0;
  const expectancyUsd = winProb * avgWin - lossProb * avgLossAbs;
  const avgRr = avgLossAbs > 0 ? avgWin / avgLossAbs : avgWin > 0 ? 1 : 0;
  const netRealizedPnl = grossProfit - grossLossAbs;

  return {
    totalTrades,
    winsCount,
    lossesCount,
    winRatePct,
    grossProfit,
    grossLoss: grossLossAbs,
    profitFactor,
    expectancyUsd,
    avgRr,
    maxDrawdownPct,
    maxDrawdownUsd,
    netRealizedPnl,
    bestTrade,
    worstTrade,
    longWins,
    longTotal,
    shortWins,
    shortTotal,
    equityCurve,
  };
}
