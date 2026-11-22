import { randomBytes } from 'node:crypto';
import { INSTRUMENT_MAP, createSeedTradeHistory } from '@/lib/preseeded-trades';
import {
  CHALLENGE_BREACH_FLOOR,
  CHALLENGE_PASS_EQUITY,
  INITIAL_CHALLENGE_BALANCE,
  MIN_ORDER_MARGIN_USD,
  calculateJournalStats,
  calculateLiquidationPrice,
  calculateNotional,
  calculateQuantity,
  calculatePnl,
  calculateRoePct,
  calculateTotalEquity,
  type ChallengeStatus,
  type CloseReason,
  type InstrumentId,
  type OpenPosition,
  type PositionSide,
  type TradeJournalEntry,
} from '@/lib/trading-math';

const VALID_INSTRUMENTS = new Set<InstrumentId>([
  'BTCUSDT',
  'ETHUSDT',
  'PAXGUSDT',
  'SOLUSDT',
]);
const VALID_SIDES = new Set<PositionSide>(['LONG', 'SHORT']);
const VALID_CLOSE_REASONS = new Set<CloseReason>([
  'MANUAL',
  'TP_HIT',
  'SL_HIT',
  'LIQUIDATED',
  'CHALLENGE_BREACH',
]);
const VALID_STATUSES = new Set<ChallengeStatus>([
  'ACTIVE',
  'PASSED',
  'DAILY_BREACHED',
  'BREACHED',
]);

const SESSION_TOKEN_RE = /^aeth_[a-f0-9]{16,48}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CANONICAL_SEED_TRADES = new Map(
  createSeedTradeHistory().map((trade) => [trade.id, trade])
);

export type ChallengeLookupTarget =
  | { kind: 'token'; value: string }
  | { kind: 'uuid'; value: string };

export function parseChallengeLookup(rawId: string): ChallengeLookupTarget | null {
  const id = rawId.trim();
  if (SESSION_TOKEN_RE.test(id)) return { kind: 'token', value: id };
  if (UUID_RE.test(id)) return { kind: 'uuid', value: id.toLowerCase() };
  return null;
}

export function generateSessionToken(): string {
  return `aeth_${randomBytes(12).toString('hex')}`;
}

function sanitizeText(raw: unknown, fallback: string, maxLen: number): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLen);
}

function isPositiveFinite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function resolveSymbolId(rawSymbolId: unknown, rawSymbol: unknown): InstrumentId | null {
  if (typeof rawSymbolId === 'string' && VALID_INSTRUMENTS.has(rawSymbolId as InstrumentId)) {
    return rawSymbolId as InstrumentId;
  }
  if (typeof rawSymbol === 'string') {
    const upper = rawSymbol.toUpperCase();
    if (upper.includes('BTC')) return 'BTCUSDT';
    if (upper.includes('ETH')) return 'ETHUSDT';
    if (upper.includes('XAU') || upper.includes('PAXG')) return 'PAXGUSDT';
    if (upper.includes('SOL')) return 'SOLUSDT';
  }
  return null;
}

export interface NormalizedSyncPayload {
  sessionToken: string;
  traderAlias: string;
  isPublicLeaderboard: boolean;
  walletBalance: number;
  currentBalance: number;
  peakEquity: number;
  status: ChallengeStatus;
  openPositions: OpenPosition[];
  tradeHistory: TradeJournalEntry[];
}

export type SyncValidationResult =
  | { ok: true; data: NormalizedSyncPayload }
  | { ok: false; error: string };

/**
 * Validates incoming local paper-trading state and recomputes every financial metric
 * (PnL, ROE%, liquidation prices, wallet balance, equity, peak equity, Prop Firm status)
 * on the server so clients cannot spoof balances or leaderboard returns.
 */
export function validateAndNormalizeChallengeSync(rawBody: unknown): SyncValidationResult {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const body = rawBody as Record<string, unknown>;

  let sessionToken: string;
  if (body.sessionToken === undefined || body.sessionToken === null || body.sessionToken === '') {
    sessionToken = generateSessionToken();
  } else if (typeof body.sessionToken === 'string' && SESSION_TOKEN_RE.test(body.sessionToken.trim())) {
    sessionToken = body.sessionToken.trim();
  } else {
    return { ok: false, error: 'Invalid sessionToken format.' };
  }

  const traderAlias = sanitizeText(body.traderAlias, 'Anon Quant', 32);
  const isPublicLeaderboard = Boolean(body.isPublicLeaderboard);

  const rawPositions = Array.isArray(body.openPositions) ? body.openPositions : [];
  const rawTrades = Array.isArray(body.tradeHistory) ? body.tradeHistory : [];

  if (rawPositions.length > 50) {
    return { ok: false, error: 'Maximum 50 open positions per challenge snapshot.' };
  }
  if (rawTrades.length > 500) {
    return { ok: false, error: 'Maximum 500 closed trades per challenge snapshot.' };
  }

  // Validate mark prices map (optional)
  const markPrices: Record<InstrumentId, number> = {
    BTCUSDT: INSTRUMENT_MAP.BTCUSDT.basePrice,
    ETHUSDT: INSTRUMENT_MAP.ETHUSDT.basePrice,
    PAXGUSDT: INSTRUMENT_MAP.PAXGUSDT.basePrice,
    SOLUSDT: INSTRUMENT_MAP.SOLUSDT.basePrice,
  };
  if (body.markPrices && typeof body.markPrices === 'object' && !Array.isArray(body.markPrices)) {
    const mp = body.markPrices as Record<string, unknown>;
    for (const id of VALID_INSTRUMENTS) {
      if (mp[id] !== undefined) {
        if (!isPositiveFinite(mp[id])) {
          return { ok: false, error: `Invalid mark price for ${id}.` };
        }
        markPrices[id] = mp[id];
      }
    }
  }

  // 1. Recompute closed trade history deterministically
  const normalizedTrades: TradeJournalEntry[] = [];
  for (let i = 0; i < rawTrades.length; i++) {
    const item = rawTrades[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: `Invalid trade entry at index ${i}.` };
    }
    const tr = item as Record<string, unknown>;
    const symbolId = resolveSymbolId(tr.symbolId, tr.symbol);
    if (!symbolId) {
      return { ok: false, error: `Unsupported instrument in trade at index ${i}.` };
    }
    if (typeof tr.side !== 'string' || !VALID_SIDES.has(tr.side as PositionSide)) {
      return { ok: false, error: `Invalid side in trade at index ${i}.` };
    }
    const side = tr.side as PositionSide;
    const leverage = Number(tr.leverage);
    if (!Number.isInteger(leverage) || leverage < 1 || leverage > 50) {
      return { ok: false, error: `Invalid leverage in trade at index ${i}.` };
    }
    const marginUsd = Number(tr.marginUsd);
    if (!Number.isFinite(marginUsd) || marginUsd < MIN_ORDER_MARGIN_USD || marginUsd > 250_000) {
      return { ok: false, error: `Invalid marginUsd in trade at index ${i}.` };
    }
    const entryPrice = Number(tr.entryPrice);
    const exitPrice = Number(tr.exitPrice);
    if (!isPositiveFinite(entryPrice) || !isPositiveFinite(exitPrice)) {
      return { ok: false, error: `Invalid entry/exit price in trade at index ${i}.` };
    }
    if (
      typeof tr.closeReason !== 'string' ||
      !VALID_CLOSE_REASONS.has(tr.closeReason as CloseReason)
    ) {
      return { ok: false, error: `Invalid closeReason in trade at index ${i}.` };
    }

    const openedAt = Number.isFinite(Number(tr.openedAt)) && Number(tr.openedAt) > 0
      ? Number(tr.openedAt)
      : Date.now() - 60_000;
    const closedAt = Number.isFinite(Number(tr.closedAt)) && Number(tr.closedAt) >= openedAt
      ? Number(tr.closedAt)
      : openedAt + 1_000;

    const rawId = sanitizeText(tr.id, `srv-tr-${i + 1}`, 64);
    const canonicalSeed = CANONICAL_SEED_TRADES.get(rawId);
    const matchesCanonicalSeed =
      canonicalSeed !== undefined &&
      canonicalSeed.symbolId === symbolId &&
      canonicalSeed.side === side &&
      canonicalSeed.leverage === leverage &&
      canonicalSeed.marginUsd === marginUsd &&
      canonicalSeed.entryPrice === entryPrice &&
      canonicalSeed.exitPrice === exitPrice &&
      canonicalSeed.closeReason === tr.closeReason;

    const quantity = matchesCanonicalSeed
      ? canonicalSeed.quantity
      : Number(calculateQuantity(calculateNotional(marginUsd, leverage), entryPrice).toFixed(8));

    const realizedPnl = matchesCanonicalSeed
      ? canonicalSeed.realizedPnl
      : Number(calculatePnl(side, entryPrice, exitPrice, quantity).toFixed(2));

    const roePct = matchesCanonicalSeed
      ? canonicalSeed.roePct
      : Number(calculateRoePct(realizedPnl, marginUsd).toFixed(2));

    normalizedTrades.push({
      id: rawId,
      symbolId,
      symbol: INSTRUMENT_MAP[symbolId].symbol,
      side,
      leverage,
      marginUsd: Number(marginUsd.toFixed(2)),
      quantity,
      entryPrice,
      exitPrice,
      realizedPnl,
      roePct,
      closeReason: tr.closeReason as CloseReason,
      strategyTag: sanitizeText(tr.strategyTag, 'Discretionary', 40),
      notes: sanitizeText(tr.notes, '', 400),
      openedAt,
      closedAt,
    });
  }

  // 2. Recompute open positions deterministically
  const normalizedPositions: OpenPosition[] = [];
  let lockedMargin = 0;

  for (let i = 0; i < rawPositions.length; i++) {
    const item = rawPositions[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: `Invalid open position at index ${i}.` };
    }
    const pos = item as Record<string, unknown>;
    const symbolId = resolveSymbolId(pos.symbolId, pos.symbol);
    if (!symbolId) {
      return { ok: false, error: `Unsupported instrument in position at index ${i}.` };
    }
    if (typeof pos.side !== 'string' || !VALID_SIDES.has(pos.side as PositionSide)) {
      return { ok: false, error: `Invalid side in position at index ${i}.` };
    }
    const side = pos.side as PositionSide;
    const leverage = Number(pos.leverage);
    if (!Number.isInteger(leverage) || leverage < 1 || leverage > 50) {
      return { ok: false, error: `Invalid leverage in position at index ${i}.` };
    }
    const marginUsd = Number(pos.marginUsd);
    if (!Number.isFinite(marginUsd) || marginUsd < MIN_ORDER_MARGIN_USD || marginUsd > 250_000) {
      return { ok: false, error: `Invalid marginUsd in position at index ${i}.` };
    }
    const entryPrice = Number(pos.entryPrice);
    if (!isPositiveFinite(entryPrice)) {
      return { ok: false, error: `Invalid entryPrice in position at index ${i}.` };
    }

    const tpPrice =
      pos.tpPrice === null || pos.tpPrice === undefined || pos.tpPrice === ''
        ? null
        : Number(pos.tpPrice);
    const slPrice =
      pos.slPrice === null || pos.slPrice === undefined || pos.slPrice === ''
        ? null
        : Number(pos.slPrice);

    if (tpPrice !== null) {
      if (!isPositiveFinite(tpPrice)) {
        return { ok: false, error: `Invalid tpPrice in position at index ${i}.` };
      }
      if ((side === 'LONG' && tpPrice <= entryPrice) || (side === 'SHORT' && tpPrice >= entryPrice)) {
        return { ok: false, error: `TP polarity mismatch for ${symbolId} at index ${i}.` };
      }
    }
    if (slPrice !== null) {
      if (!isPositiveFinite(slPrice)) {
        return { ok: false, error: `Invalid slPrice in position at index ${i}.` };
      }
      if ((side === 'LONG' && slPrice >= entryPrice) || (side === 'SHORT' && slPrice <= entryPrice)) {
        return { ok: false, error: `SL polarity mismatch for ${symbolId} at index ${i}.` };
      }
    }

    const notionalUsd = Number(calculateNotional(marginUsd, leverage).toFixed(2));
    const quantity = Number(calculateQuantity(notionalUsd, entryPrice).toFixed(8));
    const liqPrice = Number(calculateLiquidationPrice(side, entryPrice, leverage).toFixed(6));
    const openedAt =
      Number.isFinite(Number(pos.openedAt)) && Number(pos.openedAt) > 0
        ? Number(pos.openedAt)
        : Date.now();

    lockedMargin += marginUsd;
    normalizedPositions.push({
      id: sanitizeText(pos.id, `srv-pos-${i + 1}`, 64),
      symbolId,
      symbol: INSTRUMENT_MAP[symbolId].symbol,
      side,
      leverage,
      marginUsd: Number(marginUsd.toFixed(2)),
      notionalUsd,
      quantity,
      entryPrice,
      liqPrice,
      tpPrice,
      slPrice,
      strategyTag: sanitizeText(pos.strategyTag, 'Discretionary', 40),
      openedAt,
    });
  }

  // 3. Recompute Wallet Balance, Total Equity, Peak Equity & Authoritative Status
  const netRealizedPnl = normalizedTrades.reduce((sum, t) => sum + t.realizedPnl, 0);
  const walletBalance = Number((INITIAL_CHALLENGE_BALANCE + netRealizedPnl).toFixed(2));

  if (lockedMargin > walletBalance + 1e-2) {
    return {
      ok: false,
      error: `Allocated open margin ($${lockedMargin.toFixed(2)}) exceeds available wallet balance ($${walletBalance.toFixed(2)}).`,
    };
  }

  // Fallback mark to entryPrice if markPrices didn't include a real-time quote for a symbol
  const effectiveMarks: Record<InstrumentId, number> = { ...markPrices };
  for (const pos of normalizedPositions) {
    if (!(body.markPrices && typeof body.markPrices === 'object' && (body.markPrices as Record<string, unknown>)[pos.symbolId])) {
      effectiveMarks[pos.symbolId] = pos.entryPrice;
    }
  }

  const currentBalance = Number(
    calculateTotalEquity(walletBalance, normalizedPositions, effectiveMarks).toFixed(2)
  );

  const stats = calculateJournalStats(normalizedTrades, INITIAL_CHALLENGE_BALANCE);
  const maxHistoricalEquity = stats.equityCurve.reduce(
    (max, pt) => Math.max(max, pt.equity),
    INITIAL_CHALLENGE_BALANCE
  );
  const peakEquity = Number(
    Math.max(INITIAL_CHALLENGE_BALANCE, maxHistoricalEquity, walletBalance, currentBalance).toFixed(2)
  );

  const reportedStatus =
    typeof body.accountStatus === 'string' && VALID_STATUSES.has(body.accountStatus as ChallengeStatus)
      ? (body.accountStatus as ChallengeStatus)
      : 'ACTIVE';

  let status: ChallengeStatus;
  if (currentBalance <= CHALLENGE_BREACH_FLOOR) {
    status = 'BREACHED';
  } else if (reportedStatus === 'DAILY_BREACHED') {
    status = 'DAILY_BREACHED';
  } else if (currentBalance >= CHALLENGE_PASS_EQUITY) {
    status = 'PASSED';
  } else {
    status = 'ACTIVE';
  }

  return {
    ok: true,
    data: {
      sessionToken,
      traderAlias,
      isPublicLeaderboard,
      walletBalance,
      currentBalance,
      peakEquity,
      status,
      openPositions: normalizedPositions,
      tradeHistory: normalizedTrades,
    },
  };
}
