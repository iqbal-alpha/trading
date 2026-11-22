import { connection, NextResponse, type NextRequest } from 'next/server';
import {
  BENCHMARK_LEADERBOARD_ENTRIES,
  type PublicLeaderboardEntry,
} from '@/lib/leaderboard-benchmarks';
import {
  SUPABASE_TABLES,
  getSupabaseAnonServerClient,
  type PublicLeaderboardRow,
} from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  await connection();

  const rawLimit = Number(request.nextUrl.searchParams.get('limit') ?? '50');
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(50, Math.floor(rawLimit)))
    : 50;

  const supabase = getSupabaseAnonServerClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: true,
        configured: false,
        source: 'fallback',
        entries: BENCHMARK_LEADERBOARD_ENTRIES.slice(0, limit),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLES.leaderboard)
      .select(
        'id, trader_alias, current_balance, return_pct, status, total_trades, win_rate_pct, updated_at'
      )
      .order('return_pct', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          error: error.message,
        },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const rows = (data ?? []) as PublicLeaderboardRow[];
    const entries: PublicLeaderboardEntry[] = rows.map((row) => ({
      id: row.id,
      traderAlias: row.trader_alias,
      equity: Number(row.current_balance),
      returnPct: Number(row.return_pct),
      winRatePct: Number(row.win_rate_pct),
      totalTrades: Number(row.total_trades),
      status: row.status,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json(
      {
        ok: true,
        configured: true,
        source: 'supabase',
        entries,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: err instanceof Error ? err.message : 'Failed to fetch public leaderboard.',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
