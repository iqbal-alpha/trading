import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_TABLES = {
  accounts: 'trading_challenge_accounts',
  positions: 'trading_open_positions',
  journal: 'trading_trade_journal',
  leaderboard: 'trading_public_leaderboard',
} as const;

export interface ChallengeAccountRow {
  id: string;
  session_token: string;
  trader_alias: string;
  initial_balance: number | string;
  wallet_balance: number | string;
  current_balance: number | string;
  peak_equity: number | string;
  profit_target_pct: number | string;
  max_drawdown_pct: number | string;
  status: 'ACTIVE' | 'PASSED' | 'DAILY_BREACHED' | 'BREACHED';
  is_public_leaderboard: boolean;
  created_at: string;
  updated_at: string;
}

export interface OpenPositionRow {
  id: string;
  account_id: string;
  symbol_id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  leverage: number;
  margin: number | string;
  notional_size: number | string;
  quantity: number | string;
  entry_price: number | string;
  tp_price: number | string | null;
  sl_price: number | string | null;
  liquidation_price: number | string;
  strategy_tag: string;
  opened_at: string;
}

export interface TradeJournalRow {
  id: string;
  account_id: string;
  symbol_id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  leverage: number;
  margin: number | string;
  quantity: number | string;
  entry_price: number | string;
  exit_price: number | string;
  realized_pnl: number | string;
  roe_percent: number | string;
  close_reason: 'MANUAL' | 'TP_HIT' | 'SL_HIT' | 'LIQUIDATED' | 'CHALLENGE_BREACH';
  strategy_tag: string;
  notes: string;
  opened_at: string;
  closed_at: string;
}

export interface PublicLeaderboardRow {
  id: string;
  trader_alias: string;
  current_balance: number | string;
  return_pct: number | string;
  status: string;
  total_trades: number;
  win_rate_pct: number | string;
  updated_at: string;
}

function readSupabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
}

function readSupabaseAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
}

function readSupabaseServiceKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
}

export function isSupabaseAnonConfigured(): boolean {
  return Boolean(readSupabaseUrl() && readSupabaseAnonKey());
}

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(readSupabaseUrl() && readSupabaseServiceKey());
}

const SERVER_AUTH_OPTS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
} as const;

/**
 * Server-side Supabase client using the public anon key (subject to Postgres RLS).
 */
export function getSupabaseAnonServerClient(): SupabaseClient | null {
  if (!isSupabaseAnonConfigured()) return null;
  return createClient(readSupabaseUrl(), readSupabaseAnonKey(), SERVER_AUTH_OPTS);
}

/**
 * Server-only Supabase client using the service_role key (never exposed to browser).
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!isSupabaseAdminConfigured()) return null;
  return createClient(readSupabaseUrl(), readSupabaseServiceKey(), SERVER_AUTH_OPTS);
}
