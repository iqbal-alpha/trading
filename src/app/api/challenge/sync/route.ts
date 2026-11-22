import { NextResponse } from 'next/server';
import { validateAndNormalizeChallengeSync } from '@/lib/challenge-validation';
import {
  SUPABASE_TABLES,
  getSupabaseAdminClient,
  type ChallengeAccountRow,
} from '@/lib/supabase/server';

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON request body.' },
      { status: 400 }
    );
  }

  const validated = validateAndNormalizeChallengeSync(rawBody);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error },
      { status: 400 }
    );
  }

  const data = validated.data;
  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error:
          'Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY) are not configured yet.',
        validatedPreview: {
          sessionToken: data.sessionToken,
          traderAlias: data.traderAlias,
          walletBalance: data.walletBalance,
          currentBalance: data.currentBalance,
          peakEquity: data.peakEquity,
          status: data.status,
          openPositionsCount: data.openPositions.length,
          tradeHistoryCount: data.tradeHistory.length,
        },
      },
      { status: 503 }
    );
  }

  try {
    // 1. Upsert account identified by anonymous session_token
    const { data: upsertedAccount, error: accountError } = await admin
      .from(SUPABASE_TABLES.accounts)
      .upsert(
        {
          session_token: data.sessionToken,
          trader_alias: data.traderAlias,
          initial_balance: 100000,
          wallet_balance: data.walletBalance,
          current_balance: data.currentBalance,
          peak_equity: data.peakEquity,
          profit_target_pct: 8,
          max_drawdown_pct: 10,
          status: data.status,
          is_public_leaderboard: data.isPublicLeaderboard,
        },
        { onConflict: 'session_token' }
      )
      .select('*')
      .single<ChallengeAccountRow>();

    if (accountError || !upsertedAccount) {
      return NextResponse.json(
        {
          ok: false,
          error: accountError?.message ?? 'Failed to upsert challenge account.',
        },
        { status: 500 }
      );
    }

    const accountId = upsertedAccount.id;

    // 2. Replace open positions snapshot cleanly for this account
    const { error: delPosError } = await admin
      .from(SUPABASE_TABLES.positions)
      .delete()
      .eq('account_id', accountId);

    if (delPosError) {
      return NextResponse.json(
        { ok: false, error: `Failed to refresh open positions: ${delPosError.message}` },
        { status: 500 }
      );
    }

    if (data.openPositions.length > 0) {
      const posPayload = data.openPositions.map((pos) => ({
        account_id: accountId,
        symbol_id: pos.symbolId,
        symbol: pos.symbol,
        side: pos.side,
        leverage: pos.leverage,
        margin: pos.marginUsd,
        notional_size: pos.notionalUsd,
        quantity: pos.quantity,
        entry_price: pos.entryPrice,
        tp_price: pos.tpPrice,
        sl_price: pos.slPrice,
        liquidation_price: pos.liqPrice,
        strategy_tag: pos.strategyTag,
        opened_at: new Date(pos.openedAt).toISOString(),
      }));

      const { error: insPosError } = await admin.from(SUPABASE_TABLES.positions).insert(posPayload);
      if (insPosError) {
        return NextResponse.json(
          { ok: false, error: `Failed to insert open positions: ${insPosError.message}` },
          { status: 500 }
        );
      }
    }

    // 3. Replace trade journal snapshot cleanly for this account
    const { error: delTradeError } = await admin
      .from(SUPABASE_TABLES.journal)
      .delete()
      .eq('account_id', accountId);

    if (delTradeError) {
      return NextResponse.json(
        { ok: false, error: `Failed to refresh trade journal: ${delTradeError.message}` },
        { status: 500 }
      );
    }

    if (data.tradeHistory.length > 0) {
      const tradePayload = data.tradeHistory.map((tr) => ({
        account_id: accountId,
        symbol_id: tr.symbolId,
        symbol: tr.symbol,
        side: tr.side,
        leverage: tr.leverage,
        margin: tr.marginUsd,
        quantity: tr.quantity,
        entry_price: tr.entryPrice,
        exit_price: tr.exitPrice,
        realized_pnl: tr.realizedPnl,
        roe_percent: tr.roePct,
        close_reason: tr.closeReason,
        strategy_tag: tr.strategyTag,
        notes: tr.notes,
        opened_at: new Date(tr.openedAt).toISOString(),
        closed_at: new Date(tr.closedAt).toISOString(),
      }));

      const { error: insTradeError } = await admin.from(SUPABASE_TABLES.journal).insert(tradePayload);
      if (insTradeError) {
        return NextResponse.json(
          { ok: false, error: `Failed to insert trade journal: ${insTradeError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      sessionToken: upsertedAccount.session_token,
      accountId,
      shareUrl: `/challenge/${upsertedAccount.session_token}`,
      account: {
        id: accountId,
        traderAlias: upsertedAccount.trader_alias,
        initialBalance: Number(upsertedAccount.initial_balance),
        walletBalance: Number(upsertedAccount.wallet_balance),
        currentBalance: Number(upsertedAccount.current_balance),
        peakEquity: Number(upsertedAccount.peak_equity),
        status: upsertedAccount.status,
        isPublicLeaderboard: upsertedAccount.is_public_leaderboard,
        updatedAt: upsertedAccount.updated_at,
      },
      openPositionsCount: data.openPositions.length,
      tradeHistoryCount: data.tradeHistory.length,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Unexpected server error during sync.',
      },
      { status: 500 }
    );
  }
}
