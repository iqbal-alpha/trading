'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  INSTRUMENT_MAP,
  SEED_MARK_PRICES,
  SEED_POSITION_SYMBOLS,
  createAnchoredSeedPosition,
  createSeedTradeHistory,
} from '@/lib/preseeded-trades';
import {
  CHALLENGE_BREACH_FLOOR,
  CHALLENGE_PASS_EQUITY,
  INITIAL_CHALLENGE_BALANCE,
  MAX_DAILY_LOSS_USD,
  calculateFreeMargin,
  calculateLiquidationPrice,
  calculateNotional,
  calculatePnl,
  calculateQuantity,
  calculateRoePct,
  calculateTotalEquity,
  checkAutoCloseReason,
  validateOrderInput,
  type ChallengeStatus,
  type CloseReason,
  type InstrumentId,
  type OpenPosition,
  type OrderMode,
  type PendingLimitOrder,
  type PositionSide,
  type Timeframe,
  type TradeJournalEntry,
} from '@/lib/trading-math';
import type { FeedConnectionMode, TickerPayload } from '@/services/market-feed';

export type PriceDirection = 'up' | 'down' | 'flat';

export interface Ticker24hStats {
  changePct24h: number;
  high24h: number;
  low24h: number;
}

export interface OrderPreviewOverlay {
  symbolId: InstrumentId;
  side: PositionSide;
  tpPrice: number | null;
  slPrice: number | null;
  projectedTpUsd: number | null;
  projectedSlUsd: number | null;
}

export interface ClosedTradeNotice {
  id: string;
  symbol: string;
  side: PositionSide;
  reason: CloseReason;
  pnlUsd: number;
  roePct: number;
  timestamp: number;
}

export interface OpenOrderInput {
  symbolId: InstrumentId;
  mode: OrderMode;
  side: PositionSide;
  marginUsd: number;
  leverage: number;
  limitPrice?: number | null;
  tpPrice?: number | null;
  slPrice?: number | null;
  strategyTag?: string;
}

interface PersistedStateSlice {
  accountStatus: ChallengeStatus;
  walletBalance: number;
  startOfDayEquity: number;
  startOfDayUtcDate: string;
  peakEquity: number;
  openPositions: OpenPosition[];
  pendingLimitOrders: PendingLimitOrder[];
  tradeHistory: TradeJournalEntry[];
  pendingSeedSymbols: InstrumentId[];
  activeInstrument: InstrumentId;
  activeTimeframe: Timeframe;
  cloudSessionToken: string | null;
  cloudTraderAlias: string;
  lastSyncedShareUrl: string | null;
  lastSyncedAt: number | null;
}

interface TradingStoreState extends PersistedStateSlice {
  // Volatile real-time market state (hydratedSymbols guards Prop Firm rules after reload)
  markPrices: Record<InstrumentId, number>;
  hydratedSymbols: Record<InstrumentId, boolean>;
  markDirections: Record<InstrumentId, PriceDirection>;
  markTickSeq: Record<InstrumentId, number>;
  ticker24h: Record<InstrumentId, Ticker24hStats>;
  feedMode: FeedConnectionMode;
  feedLatencyMs: number;
  feedRetrySeq: number;
  orderPreview: OrderPreviewOverlay | null;
  lastClosedNotice: ClosedTradeNotice | null;

  // Navigation / Market Actions
  setActiveInstrument: (id: InstrumentId) => void;
  setActiveTimeframe: (tf: Timeframe) => void;
  setFeedStatus: (mode: FeedConnectionMode, latencyMs?: number) => void;
  triggerFeedRetry: () => void;
  setOrderPreview: (preview: OrderPreviewOverlay | null) => void;
  clearClosedNotice: () => void;

  // Trading Engine Actions
  openOrder: (
    input: OpenOrderInput
  ) => { ok: boolean; error?: string; kind?: 'MARKET' | 'LIMIT' };
  closePosition: (
    positionId: string,
    reason?: CloseReason,
    overrideExitPrice?: number
  ) => void;
  closeAllPositions: (reason?: CloseReason) => void;
  cancelPendingOrder: (orderId: string) => void;
  updateTpSl: (
    positionId: string,
    tpPrice: number | null,
    slPrice: number | null
  ) => { ok: boolean; error?: string };
  updateTradeNote: (tradeId: string, strategyTag: string, notes: string) => void;
  processPriceTick: (payload: TickerPayload) => void;
  resetDemoAccount: () => void;
  startFreshAccount: () => void;
  setCloudSyncResult: (info: {
    sessionToken: string;
    traderAlias: string;
    shareUrl: string;
  }) => void;
}

function getUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function createInitialSeedPersisted(): PersistedStateSlice {
  const history = createSeedTradeHistory();
  const netRealized = history.reduce((acc, t) => acc + t.realizedPnl, 0);
  const wallet = Number((INITIAL_CHALLENGE_BALANCE + netRealized).toFixed(2));
  return {
    accountStatus: 'ACTIVE',
    walletBalance: wallet,
    startOfDayEquity: wallet,
    startOfDayUtcDate: getUtcDateKey(),
    peakEquity: Math.max(INITIAL_CHALLENGE_BALANCE, wallet),
    openPositions: [],
    pendingLimitOrders: [],
    tradeHistory: history,
    pendingSeedSymbols: [...SEED_POSITION_SYMBOLS],
    activeInstrument: 'BTCUSDT',
    activeTimeframe: '15m',
    cloudSessionToken: null,
    cloudTraderAlias: 'Anon Quant',
    lastSyncedShareUrl: null,
    lastSyncedAt: null,
  };
}

function createInitialTicker24h(): Record<InstrumentId, Ticker24hStats> {
  return {
    BTCUSDT: {
      changePct24h: INSTRUMENT_MAP.BTCUSDT.defaultChangePct,
      high24h: INSTRUMENT_MAP.BTCUSDT.defaultHigh24h,
      low24h: INSTRUMENT_MAP.BTCUSDT.defaultLow24h,
    },
    PAXGUSDT: {
      changePct24h: INSTRUMENT_MAP.PAXGUSDT.defaultChangePct,
      high24h: INSTRUMENT_MAP.PAXGUSDT.defaultHigh24h,
      low24h: INSTRUMENT_MAP.PAXGUSDT.defaultLow24h,
    },
    ETHUSDT: {
      changePct24h: INSTRUMENT_MAP.ETHUSDT.defaultChangePct,
      high24h: INSTRUMENT_MAP.ETHUSDT.defaultHigh24h,
      low24h: INSTRUMENT_MAP.ETHUSDT.defaultLow24h,
    },
    SOLUSDT: {
      changePct24h: INSTRUMENT_MAP.SOLUSDT.defaultChangePct,
      high24h: INSTRUMENT_MAP.SOLUSDT.defaultHigh24h,
      low24h: INSTRUMENT_MAP.SOLUSDT.defaultLow24h,
    },
  };
}

function makeUid(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const DEFAULT_PERSISTED = createInitialSeedPersisted();

export const useTradingStore = create<TradingStoreState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PERSISTED,
      markPrices: { ...SEED_MARK_PRICES },
      hydratedSymbols: {
        BTCUSDT: false,
        PAXGUSDT: false,
        ETHUSDT: false,
        SOLUSDT: false,
      },
      markDirections: {
        BTCUSDT: 'flat',
        PAXGUSDT: 'flat',
        ETHUSDT: 'flat',
        SOLUSDT: 'flat',
      },
      markTickSeq: {
        BTCUSDT: 0,
        PAXGUSDT: 0,
        ETHUSDT: 0,
        SOLUSDT: 0,
      },
      ticker24h: createInitialTicker24h(),
      feedMode: 'connecting',
      feedLatencyMs: 24,
      feedRetrySeq: 0,
      orderPreview: null,
      lastClosedNotice: null,

      setActiveInstrument: (id) => set({ activeInstrument: id }),
      setActiveTimeframe: (tf) => set({ activeTimeframe: tf }),
      setFeedStatus: (mode, latencyMs) =>
        set((state) => ({
          feedMode: mode,
          feedLatencyMs: latencyMs ?? state.feedLatencyMs,
        })),
      triggerFeedRetry: () =>
        set((state) => ({
          feedMode: 'connecting',
          feedRetrySeq: state.feedRetrySeq + 1,
        })),
      setOrderPreview: (orderPreview) => set({ orderPreview }),
      clearClosedNotice: () => set({ lastClosedNotice: null }),

      openOrder: (input) => {
        const state = get();
        const meta = INSTRUMENT_MAP[input.symbolId];
        const liveMark = state.markPrices[input.symbolId] ?? meta.basePrice;
        const freeMargin = calculateFreeMargin(
          state.walletBalance,
          state.openPositions,
          state.pendingLimitOrders
        );
        const targetEntry =
          input.mode === 'Limit' && input.limitPrice && input.limitPrice > 0
            ? input.limitPrice
            : liveMark;

        const tpPrice =
          input.tpPrice && Number.isFinite(input.tpPrice) && input.tpPrice > 0
            ? input.tpPrice
            : null;
        const slPrice =
          input.slPrice && Number.isFinite(input.slPrice) && input.slPrice > 0
            ? input.slPrice
            : null;

        const check = validateOrderInput({
          side: input.side,
          marginUsd: input.marginUsd,
          freeMargin,
          leverage: input.leverage,
          entryPrice: targetEntry,
          tpPrice,
          slPrice,
          accountStatus: state.accountStatus,
        });

        if (!check.valid) {
          return { ok: false, error: check.error };
        }

        if (input.mode === 'Limit') {
          const order: PendingLimitOrder = {
            id: makeUid('lim'),
            symbolId: input.symbolId,
            symbol: meta.symbol,
            side: input.side,
            leverage: input.leverage,
            marginUsd: input.marginUsd,
            limitPrice: targetEntry,
            tpPrice,
            slPrice,
            strategyTag: input.strategyTag ?? 'Discretionary',
            createdAt: Date.now(),
          };
          set((s) => ({
            pendingLimitOrders: [order, ...s.pendingLimitOrders],
          }));
          return { ok: true, kind: 'LIMIT' };
        }

        const notionalUsd = calculateNotional(input.marginUsd, input.leverage);
        const quantity = calculateQuantity(notionalUsd, targetEntry);
        const liqPrice = calculateLiquidationPrice(
          input.side,
          targetEntry,
          input.leverage
        );

        const pos: OpenPosition = {
          id: makeUid('pos'),
          symbolId: input.symbolId,
          symbol: meta.symbol,
          side: input.side,
          leverage: input.leverage,
          marginUsd: input.marginUsd,
          notionalUsd,
          quantity,
          entryPrice: targetEntry,
          liqPrice,
          tpPrice,
          slPrice,
          strategyTag: input.strategyTag ?? 'Discretionary',
          openedAt: Date.now(),
        };

        set((s) => ({
          openPositions: [pos, ...s.openPositions],
          pendingSeedSymbols: s.pendingSeedSymbols.filter(
            (id) => id !== input.symbolId
          ),
        }));
        return { ok: true, kind: 'MARKET' };
      },

      closePosition: (positionId, reason = 'MANUAL', overrideExitPrice) => {
        const state = get();
        const pos = state.openPositions.find((p) => p.id === positionId);
        if (!pos) return;

        const exitPrice =
          overrideExitPrice ?? state.markPrices[pos.symbolId] ?? pos.entryPrice;
        const rawPnl =
          reason === 'LIQUIDATED'
            ? -pos.marginUsd
            : calculatePnl(pos.side, pos.entryPrice, exitPrice, pos.quantity);
        const realizedPnl = Number(rawPnl.toFixed(2));
        const roePct = Number(calculateRoePct(realizedPnl, pos.marginUsd).toFixed(2));
        const closedAt = Date.now();

        const journalItem: TradeJournalEntry = {
          id: makeUid('tr'),
          symbolId: pos.symbolId,
          symbol: pos.symbol,
          side: pos.side,
          leverage: pos.leverage,
          marginUsd: pos.marginUsd,
          quantity: pos.quantity,
          entryPrice: pos.entryPrice,
          exitPrice,
          realizedPnl,
          roePct,
          closeReason: reason,
          strategyTag: pos.strategyTag,
          notes:
            reason === 'TP_HIT'
              ? 'Take Profit target triggered automatically by tick engine.'
              : reason === 'SL_HIT'
                ? 'Stop Loss triggered automatically; risk capped cleanly.'
                : reason === 'LIQUIDATED'
                  ? 'Position liquidated at maintenance margin threshold.'
                  : reason === 'CHALLENGE_BREACH'
                    ? 'Force closed due to Prop Firm drawdown limit breach.'
                    : 'Closed manually at live mark price.',
          openedAt: pos.openedAt,
          closedAt,
        };

        const remaining = state.openPositions.filter((p) => p.id !== positionId);
        const nextWallet = Number((state.walletBalance + realizedPnl).toFixed(2));
        const nextEquity = calculateTotalEquity(nextWallet, remaining, state.markPrices);
        const nextPeak = Math.max(state.peakEquity, nextEquity);

        let nextStatus = state.accountStatus;
        if (nextEquity <= CHALLENGE_BREACH_FLOOR) {
          nextStatus = 'BREACHED';
        } else if (nextEquity >= CHALLENGE_PASS_EQUITY && nextStatus === 'ACTIVE') {
          nextStatus = 'PASSED';
        }

        set({
          openPositions: remaining,
          walletBalance: nextWallet,
          peakEquity: nextPeak,
          accountStatus: nextStatus,
          tradeHistory: [journalItem, ...state.tradeHistory],
          lastClosedNotice: {
            id: journalItem.id,
            symbol: pos.symbol,
            side: pos.side,
            reason,
            pnlUsd: realizedPnl,
            roePct,
            timestamp: closedAt,
          },
        });
      },

      closeAllPositions: (reason = 'MANUAL') => {
        const ids = get().openPositions.map((p) => p.id);
        for (const id of ids) {
          get().closePosition(id, reason);
        }
        set({ pendingSeedSymbols: [] });
      },

      cancelPendingOrder: (orderId) =>
        set((s) => ({
          pendingLimitOrders: s.pendingLimitOrders.filter((o) => o.id !== orderId),
        })),

      updateTpSl: (positionId, tpPrice, slPrice) => {
        const pos = get().openPositions.find((p) => p.id === positionId);
        if (!pos) return { ok: false, error: 'Position not found.' };

        const mark = get().markPrices[pos.symbolId] ?? pos.entryPrice;
        if (tpPrice !== null) {
          if (pos.side === 'LONG' && tpPrice <= mark) {
            return { ok: false, error: 'TP must stay above current mark price for LONG.' };
          }
          if (pos.side === 'SHORT' && tpPrice >= mark) {
            return { ok: false, error: 'TP must stay below current mark price for SHORT.' };
          }
        }
        if (slPrice !== null) {
          if (pos.side === 'LONG' && slPrice >= mark) {
            return { ok: false, error: 'SL must stay below current mark price for LONG.' };
          }
          if (pos.side === 'SHORT' && slPrice <= mark) {
            return { ok: false, error: 'SL must stay above current mark price for SHORT.' };
          }
        }

        set((s) => ({
          openPositions: s.openPositions.map((p) =>
            p.id === positionId ? { ...p, tpPrice, slPrice } : p
          ),
        }));
        return { ok: true };
      },

      updateTradeNote: (tradeId, strategyTag, notes) =>
        set((s) => ({
          tradeHistory: s.tradeHistory.map((tr) =>
            tr.id === tradeId ? { ...tr, strategyTag, notes } : tr
          ),
        })),

      processPriceTick: (payload) => {
        const state = get();
        const prev = state.markPrices[payload.symbolId] ?? payload.price;
        const dir: PriceDirection =
          payload.price > prev ? 'up' : payload.price < prev ? 'down' : 'flat';

        const utcToday = getUtcDateKey();
        const nextMarkPrices = {
          ...state.markPrices,
          [payload.symbolId]: payload.price,
        };

        // Anchor unseeded demo positions dynamically onto the first true live price for that symbol
        let seededPosition: OpenPosition | null = null;
        let nextPendingSeedSymbols = state.pendingSeedSymbols;
        if (
          state.accountStatus === 'ACTIVE' &&
          state.pendingSeedSymbols.includes(payload.symbolId)
        ) {
          seededPosition = createAnchoredSeedPosition(payload.symbolId, payload.price);
          nextPendingSeedSymbols = state.pendingSeedSymbols.filter(
            (id) => id !== payload.symbolId
          );
        }

        // Update volatile price & 24h metrics
        set((s) => {
          const prevStats = s.ticker24h[payload.symbolId];
          const dayRollover = s.startOfDayUtcDate !== utcToday;
          const nextPositions =
            seededPosition && !s.openPositions.some((p) => p.id === seededPosition.id)
              ? [...s.openPositions, seededPosition]
              : s.openPositions;
          const currentEq = calculateTotalEquity(
            s.walletBalance,
            nextPositions,
            nextMarkPrices
          );

          return {
            openPositions: nextPositions,
            pendingSeedSymbols: nextPendingSeedSymbols,
            markPrices: nextMarkPrices,
            hydratedSymbols: s.hydratedSymbols[payload.symbolId]
              ? s.hydratedSymbols
              : { ...s.hydratedSymbols, [payload.symbolId]: true },
            markDirections:
              dir === 'flat'
                ? s.markDirections
                : { ...s.markDirections, [payload.symbolId]: dir },
            markTickSeq:
              dir === 'flat'
                ? s.markTickSeq
                : {
                    ...s.markTickSeq,
                    [payload.symbolId]: (s.markTickSeq[payload.symbolId] ?? 0) + 1,
                  },
            feedLatencyMs: payload.latencyMs ?? s.feedLatencyMs,
            startOfDayUtcDate: dayRollover ? utcToday : s.startOfDayUtcDate,
            startOfDayEquity: dayRollover ? currentEq : s.startOfDayEquity,
            peakEquity: Math.max(s.peakEquity, currentEq),
            ticker24h:
              payload.changePct24h !== undefined ||
              payload.high24h !== undefined ||
              payload.low24h !== undefined
                ? {
                    ...s.ticker24h,
                    [payload.symbolId]: {
                      changePct24h: payload.changePct24h ?? prevStats.changePct24h,
                      high24h: payload.high24h ?? prevStats.high24h,
                      low24h: payload.low24h ?? prevStats.low24h,
                    },
                  }
                : s.ticker24h,
          };
        });

        // 1. Check Pending Limit Orders for fills on symbolId
        const afterPriceState = get();
        if (afterPriceState.accountStatus === 'ACTIVE') {
          const triggeredLimits = afterPriceState.pendingLimitOrders.filter((ord) => {
            if (ord.symbolId !== payload.symbolId) return false;
            return ord.side === 'LONG'
              ? payload.price <= ord.limitPrice
              : payload.price >= ord.limitPrice;
          });

          if (triggeredLimits.length > 0) {
            set((s) => {
              const filledIds = new Set(triggeredLimits.map((x) => x.id));
              const newPositions: OpenPosition[] = triggeredLimits.map((ord) => {
                const notionalUsd = calculateNotional(ord.marginUsd, ord.leverage);
                const quantity = calculateQuantity(notionalUsd, ord.limitPrice);
                return {
                  id: makeUid('pos'),
                  symbolId: ord.symbolId,
                  symbol: ord.symbol,
                  side: ord.side,
                  leverage: ord.leverage,
                  marginUsd: ord.marginUsd,
                  notionalUsd,
                  quantity,
                  entryPrice: ord.limitPrice,
                  liqPrice: calculateLiquidationPrice(
                    ord.side,
                    ord.limitPrice,
                    ord.leverage
                  ),
                  tpPrice: ord.tpPrice,
                  slPrice: ord.slPrice,
                  strategyTag: ord.strategyTag,
                  openedAt: Date.now(),
                };
              });
              return {
                pendingLimitOrders: s.pendingLimitOrders.filter(
                  (o) => !filledIds.has(o.id)
                ),
                openPositions: [...newPositions, ...s.openPositions],
              };
            });
          }
        }

        // 2. Background Watcher: Check TP_HIT / SL_HIT / LIQUIDATED on matching open positions
        const currentPositions = get().openPositions;
        for (const pos of currentPositions) {
          if (pos.symbolId !== payload.symbolId) continue;
          const autoReason = checkAutoCloseReason(pos, payload.price);
          if (autoReason) {
            const triggerPrice =
              autoReason === 'TP_HIT' && pos.tpPrice !== null
                ? pos.tpPrice
                : autoReason === 'SL_HIT' && pos.slPrice !== null
                  ? pos.slPrice
                  : payload.price;
            get().closePosition(pos.id, autoReason, triggerPrice);
          }
        }

        // 3. Enforce Prop Firm Evaluation Limits ($90k Hard Drawdown / $5k Daily / $108k Pass)
        // Wait until every open-position symbol has received at least one fresh live tick this session
        const postTickState = get();
        const allOpenHydrated = postTickState.openPositions.every(
          (pos) => postTickState.hydratedSymbols[pos.symbolId]
        );
        if (allOpenHydrated) {
          const equity = calculateTotalEquity(
            postTickState.walletBalance,
            postTickState.openPositions,
            postTickState.markPrices
          );

          if (
            equity <= CHALLENGE_BREACH_FLOOR &&
            postTickState.accountStatus !== 'BREACHED'
          ) {
            postTickState.closeAllPositions('CHALLENGE_BREACH');
            set({ accountStatus: 'BREACHED', pendingLimitOrders: [] });
          } else if (
            postTickState.startOfDayEquity - equity >= MAX_DAILY_LOSS_USD &&
            postTickState.accountStatus === 'ACTIVE'
          ) {
            postTickState.closeAllPositions('CHALLENGE_BREACH');
            set({ accountStatus: 'DAILY_BREACHED', pendingLimitOrders: [] });
          } else if (
            equity >= CHALLENGE_PASS_EQUITY &&
            postTickState.accountStatus === 'ACTIVE'
          ) {
            set({ accountStatus: 'PASSED' });
          }
        }
      },

      resetDemoAccount: () => {
        const fresh = createInitialSeedPersisted();
        const currentMarks = get().markPrices;
        const immediateSeeded: OpenPosition[] = [];
        const remainingPending: InstrumentId[] = [];
        for (const sym of fresh.pendingSeedSymbols) {
          const liveP = currentMarks[sym];
          if (liveP && liveP !== SEED_MARK_PRICES[sym]) {
            const p = createAnchoredSeedPosition(sym, liveP);
            if (p) immediateSeeded.push(p);
          } else {
            remainingPending.push(sym);
          }
        }
        set({
          ...fresh,
          cloudTraderAlias: get().cloudTraderAlias,
          openPositions: immediateSeeded,
          pendingSeedSymbols: remainingPending,
          lastClosedNotice: null,
        });
      },

      startFreshAccount: () => {
        set({
          accountStatus: 'ACTIVE',
          walletBalance: INITIAL_CHALLENGE_BALANCE,
          startOfDayEquity: INITIAL_CHALLENGE_BALANCE,
          startOfDayUtcDate: getUtcDateKey(),
          peakEquity: INITIAL_CHALLENGE_BALANCE,
          openPositions: [],
          pendingLimitOrders: [],
          tradeHistory: [],
          pendingSeedSymbols: [],
          cloudSessionToken: null,
          lastSyncedShareUrl: null,
          lastSyncedAt: null,
          lastClosedNotice: null,
        });
      },

      setCloudSyncResult: ({ sessionToken, traderAlias, shareUrl }) =>
        set({
          cloudSessionToken: sessionToken,
          cloudTraderAlias: traderAlias,
          lastSyncedShareUrl: shareUrl,
          lastSyncedAt: Date.now(),
        }),
    }),
    {
      name: 'aether-paper-trading-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accountStatus: state.accountStatus,
        walletBalance: state.walletBalance,
        startOfDayEquity: state.startOfDayEquity,
        startOfDayUtcDate: state.startOfDayUtcDate,
        peakEquity: state.peakEquity,
        openPositions: state.openPositions,
        pendingLimitOrders: state.pendingLimitOrders,
        tradeHistory: state.tradeHistory,
        pendingSeedSymbols: state.pendingSeedSymbols,
        activeInstrument: state.activeInstrument,
        activeTimeframe: state.activeTimeframe,
        markPrices: state.markPrices,
        ticker24h: state.ticker24h,
        cloudSessionToken: state.cloudSessionToken,
        cloudTraderAlias: state.cloudTraderAlias,
        lastSyncedShareUrl: state.lastSyncedShareUrl,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
);
