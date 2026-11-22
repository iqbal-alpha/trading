export interface PublicLeaderboardEntry {
  id: string;
  traderAlias: string;
  equity: number;
  returnPct: number;
  winRatePct: number;
  totalTrades: number;
  status: string;
  updatedAt?: string;
  isSelf?: boolean;
}

export const BENCHMARK_LEADERBOARD_ENTRIES: PublicLeaderboardEntry[] = [
  {
    id: 'bench-kestrel',
    traderAlias: 'KestrelQuant',
    equity: 109420.0,
    returnPct: 9.42,
    winRatePct: 71.4,
    totalTrades: 14,
    status: 'PASSED',
  },
  {
    id: 'bench-obsidian',
    traderAlias: 'ObsidianTape',
    equity: 108310.5,
    returnPct: 8.31,
    winRatePct: 68.8,
    totalTrades: 16,
    status: 'PASSED',
  },
  {
    id: 'bench-vektor',
    traderAlias: 'VektorMacro',
    equity: 103190.2,
    returnPct: 3.19,
    winRatePct: 55.6,
    totalTrades: 18,
    status: 'ACTIVE',
  },
  {
    id: 'bench-paxos',
    traderAlias: 'PaxosScalper',
    equity: 101420.0,
    returnPct: 1.42,
    winRatePct: 58.3,
    totalTrades: 12,
    status: 'ACTIVE',
  },
];
