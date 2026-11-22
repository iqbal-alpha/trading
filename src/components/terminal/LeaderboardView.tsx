'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  INITIAL_CHALLENGE_BALANCE,
  calculateJournalStats,
  calculateTotalEquity,
} from '@/lib/trading-math';
import {
  BENCHMARK_LEADERBOARD_ENTRIES,
  type PublicLeaderboardEntry,
} from '@/lib/leaderboard-benchmarks';
import { useTradingStore } from '@/store/useTradingStore';
import { CloudUpload, ExternalLink, RefreshCw, Trophy } from 'lucide-react';

export function LeaderboardView({
  onOpenSyncModal,
}: {
  onOpenSyncModal?: () => void;
}) {
  const walletBalance = useTradingStore((s) => s.walletBalance);
  const openPositions = useTradingStore((s) => s.openPositions);
  const markPrices = useTradingStore((s) => s.markPrices);
  const tradeHistory = useTradingStore((s) => s.tradeHistory);
  const accountStatus = useTradingStore((s) => s.accountStatus);
  const cloudTraderAlias = useTradingStore((s) => s.cloudTraderAlias);
  const lastSyncedShareUrl = useTradingStore((s) => s.lastSyncedShareUrl);
  const lastSyncedAt = useTradingStore((s) => s.lastSyncedAt);

  const [cloudEntries, setCloudEntries] = useState<PublicLeaderboardEntry[]>([]);
  const [feedSource, setFeedSource] = useState<'supabase' | 'fallback' | 'loading'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeaderboardData = useCallback(async (): Promise<{
    entries?: PublicLeaderboardEntry[];
    source?: 'supabase' | 'fallback';
  } | null> => {
    try {
      const res = await fetch('/api/leaderboard?limit=50', { cache: 'no-store' });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        ok: boolean;
        source?: 'supabase' | 'fallback';
        entries?: PublicLeaderboardEntry[];
      };
      if (json.ok && Array.isArray(json.entries)) {
        return { entries: json.entries, source: json.source ?? 'supabase' };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchLeaderboardData().then((result) => {
      if (!active || !result) return;
      if (result.entries) setCloudEntries(result.entries);
      if (result.source) setFeedSource(result.source);
    });
    return () => {
      active = false;
    };
  }, [fetchLeaderboardData, lastSyncedAt]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    const result = await fetchLeaderboardData();
    if (result?.entries) setCloudEntries(result.entries);
    if (result?.source) setFeedSource(result.source);
    setRefreshing(false);
  };

  const liveEquity = calculateTotalEquity(walletBalance, openPositions, markPrices);
  const liveReturnPct =
    ((liveEquity - INITIAL_CHALLENGE_BALANCE) / INITIAL_CHALLENGE_BALANCE) * 100;
  const stats = calculateJournalStats(tradeHistory, INITIAL_CHALLENGE_BALANCE);

  const hasCloudLeaderboardRows = cloudEntries.length > 0;
  const rows: PublicLeaderboardEntry[] = [
    ...(hasCloudLeaderboardRows ? cloudEntries : BENCHMARK_LEADERBOARD_ENTRIES),
    ...(lastSyncedShareUrl && hasCloudLeaderboardRows
      ? []
      : [
          {
            id: 'self-local',
            traderAlias: `${cloudTraderAlias || 'You'} (Local)`,
            equity: liveEquity,
            returnPct: liveReturnPct,
            winRatePct: stats.winRatePct,
            totalTrades: stats.totalTrades,
            status: accountStatus,
            isSelf: true,
          },
        ]),
  ].sort((a, b) => b.returnPct - a.returnPct);

  return (
    <div className="w-full space-y-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
            Prop Firm Live Standings ($100k Challenge)
          </h2>
          <span className="rounded-[var(--radius-pill)] bg-[var(--bg-raised)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
            {feedSource === 'loading'
              ? 'Loading...'
              : hasCloudLeaderboardRows
                ? `Live Supabase DB (${cloudEntries.length})`
                : 'Connected · Sync to Appear Live'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {onOpenSyncModal && (
            <button
              type="button"
              onClick={onOpenSyncModal}
              className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-control)] bg-[var(--long)] px-2.5 text-[11px] font-bold text-[var(--bg-ground)] hover:bg-[var(--long-bright)]"
            >
              <CloudUpload className="h-3 w-3" />
              <span>Sync &amp; Publish</span>
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-muted)]">
              <th className="px-3.5 py-2.5 font-medium">#</th>
              <th className="px-3.5 py-2.5 font-medium">Trader Alias</th>
              <th className="hidden px-3.5 py-2.5 text-right font-medium sm:table-cell">
                Trades
              </th>
              <th className="hidden px-3.5 py-2.5 text-right font-medium sm:table-cell">
                Win Rate
              </th>
              <th className="px-3.5 py-2.5 text-right font-medium">Equity</th>
              <th className="px-3.5 py-2.5 text-right font-medium">Return</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)] text-[13px]">
            {rows.map((row, idx) => {
              const isCloudLink = !row.id.startsWith('bench-') && row.id !== 'self-local';
              return (
                <tr
                  key={row.id}
                  className={
                    row.isSelf
                      ? 'bg-[var(--long-tint)]/35'
                      : 'hover:bg-[var(--bg-raised)]/40'
                  }
                >
                  <td className="tabular-nums-strict px-3.5 py-3 text-[12px] font-bold text-[var(--text-muted)]">
                    #{idx + 1}
                  </td>
                  <td className="px-3.5 py-3 font-semibold text-[var(--text-primary)]">
                    <div className="flex flex-wrap items-center gap-2">
                      {isCloudLink ? (
                        <Link
                          href={`/challenge/${row.id}`}
                          className="inline-flex items-center gap-1 hover:text-[var(--long-bright)] hover:underline"
                        >
                          <span>{row.traderAlias}</span>
                          <ExternalLink className="h-3 w-3 opacity-70" />
                        </Link>
                      ) : (
                        <span>{row.traderAlias}</span>
                      )}
                      <span
                        className={`rounded-[var(--radius-pill)] px-1.5 py-0.5 text-[10px] font-bold ${
                          row.status === 'PASSED'
                            ? 'bg-[var(--long-tint)] text-[var(--long-bright)]'
                            : row.status === 'BREACHED' || row.status === 'DAILY_BREACHED'
                              ? 'bg-[var(--short-tint)] text-[var(--short-bright)]'
                              : 'bg-[var(--accent-tint)] text-[var(--accent)]'
                        }`}
                      >
                        {row.status}
                      </span>
                    </div>
                  </td>
                  <td className="tabular-nums-strict hidden px-3.5 py-3 text-right text-[12px] text-[var(--text-secondary)] sm:table-cell">
                    {row.totalTrades}
                  </td>
                  <td className="tabular-nums-strict hidden px-3.5 py-3 text-right text-[12px] text-[var(--text-primary)] sm:table-cell">
                    {row.winRatePct.toFixed(1)}%
                  </td>
                  <td className="tabular-nums-strict px-3.5 py-3 text-right font-medium text-[var(--text-primary)]">
                    ${row.equity.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td
                    className={`tabular-nums-strict px-3.5 py-3 text-right font-semibold ${
                      row.returnPct >= 0
                        ? 'text-[var(--long-bright)]'
                        : 'text-[var(--short-bright)]'
                    }`}
                  >
                    {row.returnPct >= 0 ? '+' : ''}
                    {row.returnPct.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
