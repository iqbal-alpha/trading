import { parseChallengeLookup } from '@/lib/challenge-validation';
import { INSTRUMENT_MAP } from '@/lib/preseeded-trades';
import {
  SUPABASE_TABLES,
  getSupabaseAdminClient,
  getSupabaseAnonServerClient,
  type ChallengeAccountRow,
  type OpenPositionRow,
  type TradeJournalRow,
} from '@/lib/supabase/server';
import {
  calculateJournalStats,
  type ChallengeStatus,
  type InstrumentId,
  type JournalStats,
  type OpenPosition,
  type TradeJournalEntry,
} from '@/lib/trading-math';

function toInstrumentId(raw: string): InstrumentId {
  if (raw === 'BTCUSDT' || raw === 'ETHUSDT' || raw === 'PAXGUSDT' || raw === 'SOLUSDT') {
    return raw;
  }
  return 'BTCUSDT';
}

export interface SharedChallengeReportData {
  account: {
    id: string;
    traderAlias: string;
    initialBalance: number;
    walletBalance: number;
    currentBalance: number;
    peakEquity: number;
    profitTargetPct: number;
    maxDrawdownPct: number;
    status: ChallengeStatus;
    isPublicLeaderboard: boolean;
    createdAt: string;
    updatedAt: string;
  };
  openPositions: OpenPosition[];
  tradeHistory: TradeJournalEntry[];
  stats: JournalStats;
}

export type FetchChallengeReportResult =
  | { status: 'invalid'; error: string }
  | { status: 'unconfigured'; error: string }
  | { status: 'not_found'; error: string }
  | { status: 'error'; error: string }
  | { status: 'ok'; data: SharedChallengeReportData };

/**
 * Fetches a shared Prop Firm challenge report either by secret session_token (admin)
 * or public account UUID (anon client strictly enforcing is_public_leaderboard = TRUE).
 */
export async function fetchChallengeReportById(
  rawId: string
): Promise<FetchChallengeReportResult> {
  const lookup = parseChallengeLookup(rawId);
  if (!lookup) {
    return {
      status: 'invalid',
      error: 'Invalid challenge account UUID or session token format.',
    };
  }

  const client =
    lookup.kind === 'token' ? getSupabaseAdminClient() : getSupabaseAnonServerClient();

  if (!client) {
    return {
      status: 'unconfigured',
      error:
        'Supabase environment variables are not configured yet. Check .env.local.',
    };
  }

  try {
    let accountQuery = client
      .from(SUPABASE_TABLES.accounts)
      .select(
        'id, trader_alias, initial_balance, wallet_balance, current_balance, peak_equity, profit_target_pct, max_drawdown_pct, status, is_public_leaderboard, created_at, updated_at'
      );

    accountQuery =
      lookup.kind === 'token'
        ? accountQuery.eq('session_token', lookup.value)
        : accountQuery.eq('id', lookup.value).eq('is_public_leaderboard', true);

    const { data: accountRow, error: accountError } =
      await accountQuery.maybeSingle<Omit<ChallengeAccountRow, 'session_token'>>();

    if (accountError) {
      return { status: 'error', error: accountError.message };
    }

    if (!accountRow) {
      return {
        status: 'not_found',
        error: 'Shared challenge report not found or not published publicly.',
      };
    }

    const [positionsRes, tradesRes] = await Promise.all([
      client
        .from(SUPABASE_TABLES.positions)
        .select('*')
        .eq('account_id', accountRow.id)
        .order('opened_at', { ascending: false }),
      client
        .from(SUPABASE_TABLES.journal)
        .select('*')
        .eq('account_id', accountRow.id)
        .order('closed_at', { ascending: false }),
    ]);

    if (positionsRes.error || tradesRes.error) {
      return {
        status: 'error',
        error:
          positionsRes.error?.message ??
          tradesRes.error?.message ??
          'Failed to load challenge details.',
      };
    }

    const openPositions: OpenPosition[] = ((positionsRes.data ?? []) as OpenPositionRow[]).map(
      (p) => {
        const symbolId = toInstrumentId(p.symbol_id);
        return {
          id: p.id,
          symbolId,
          symbol: p.symbol || INSTRUMENT_MAP[symbolId].symbol,
          side: p.side,
          leverage: p.leverage,
          marginUsd: Number(p.margin),
          notionalUsd: Number(p.notional_size),
          quantity: Number(p.quantity),
          entryPrice: Number(p.entry_price),
          liqPrice: Number(p.liquidation_price),
          tpPrice: p.tp_price !== null ? Number(p.tp_price) : null,
          slPrice: p.sl_price !== null ? Number(p.sl_price) : null,
          strategyTag: p.strategy_tag,
          openedAt: new Date(p.opened_at).getTime(),
        };
      }
    );

    const tradeHistory: TradeJournalEntry[] = ((tradesRes.data ?? []) as TradeJournalRow[]).map(
      (t) => {
        const symbolId = toInstrumentId(t.symbol_id);
        return {
          id: t.id,
          symbolId,
          symbol: t.symbol || INSTRUMENT_MAP[symbolId].symbol,
          side: t.side,
          leverage: t.leverage,
          marginUsd: Number(t.margin),
          quantity: Number(t.quantity),
          entryPrice: Number(t.entry_price),
          exitPrice: Number(t.exit_price),
          realizedPnl: Number(t.realized_pnl),
          roePct: Number(t.roe_percent),
          closeReason: t.close_reason,
          strategyTag: t.strategy_tag,
          notes: t.notes,
          openedAt: new Date(t.opened_at).getTime(),
          closedAt: new Date(t.closed_at).getTime(),
        };
      }
    );

    const initialBalance = Number(accountRow.initial_balance);
    const stats = calculateJournalStats(tradeHistory, initialBalance);

    return {
      status: 'ok',
      data: {
        account: {
          id: accountRow.id,
          traderAlias: accountRow.trader_alias,
          initialBalance,
          walletBalance: Number(accountRow.wallet_balance),
          currentBalance: Number(accountRow.current_balance),
          peakEquity: Number(accountRow.peak_equity),
          profitTargetPct: Number(accountRow.profit_target_pct),
          maxDrawdownPct: Number(accountRow.max_drawdown_pct),
          status: accountRow.status,
          isPublicLeaderboard: accountRow.is_public_leaderboard,
          createdAt: accountRow.created_at,
          updatedAt: accountRow.updated_at,
        },
        openPositions,
        tradeHistory,
        stats,
      },
    };
  } catch (err) {
    return {
      status: 'error',
      error:
        err instanceof Error
          ? err.message
          : 'Unexpected server error loading challenge report.',
    };
  }
}
