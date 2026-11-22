-- ============================================================================
-- AETHER Terminal — Prop Firm Paper Trading Schema (PostgreSQL / Supabase)
-- Execute this script in Supabase SQL Editor (Project -> SQL Editor -> Run).
-- Tables/views use the `trading_` prefix for safe isolation inside shared DBs.
-- ============================================================================

-- 1. Prop Firm Challenge Accounts Table
CREATE TABLE IF NOT EXISTS public.trading_challenge_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT UNIQUE NOT NULL,
  trader_alias TEXT NOT NULL DEFAULT 'Anon Quant',
  initial_balance NUMERIC(14, 2) NOT NULL DEFAULT 100000.00,
  wallet_balance NUMERIC(14, 2) NOT NULL DEFAULT 100000.00,
  current_balance NUMERIC(14, 2) NOT NULL DEFAULT 100000.00,
  peak_equity NUMERIC(14, 2) NOT NULL DEFAULT 100000.00,
  profit_target_pct NUMERIC(5, 2) NOT NULL DEFAULT 8.00,
  max_drawdown_pct NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (
    status IN ('ACTIVE', 'PASSED', 'DAILY_BREACHED', 'BREACHED')
  ),
  is_public_leaderboard BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Open Positions Snapshot Table (for shareable live session cards)
CREATE TABLE IF NOT EXISTS public.trading_open_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.trading_challenge_accounts(id) ON DELETE CASCADE,
  symbol_id TEXT NOT NULL DEFAULT 'BTCUSDT',
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  leverage INTEGER NOT NULL CHECK (leverage BETWEEN 1 AND 50),
  margin NUMERIC(14, 2) NOT NULL CHECK (margin >= 50),
  notional_size NUMERIC(14, 2) NOT NULL CHECK (notional_size > 0),
  quantity NUMERIC(18, 8) NOT NULL CHECK (quantity > 0),
  entry_price NUMERIC(18, 6) NOT NULL CHECK (entry_price > 0),
  tp_price NUMERIC(18, 6),
  sl_price NUMERIC(18, 6),
  liquidation_price NUMERIC(18, 6) NOT NULL CHECK (liquidation_price >= 0),
  strategy_tag TEXT NOT NULL DEFAULT 'Discretionary',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Closed Trade Journal History Table
CREATE TABLE IF NOT EXISTS public.trading_trade_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.trading_challenge_accounts(id) ON DELETE CASCADE,
  symbol_id TEXT NOT NULL DEFAULT 'BTCUSDT',
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  leverage INTEGER NOT NULL CHECK (leverage BETWEEN 1 AND 50),
  margin NUMERIC(14, 2) NOT NULL CHECK (margin >= 50),
  quantity NUMERIC(18, 8) NOT NULL CHECK (quantity > 0),
  entry_price NUMERIC(18, 6) NOT NULL CHECK (entry_price > 0),
  exit_price NUMERIC(18, 6) NOT NULL CHECK (exit_price > 0),
  realized_pnl NUMERIC(14, 2) NOT NULL,
  roe_percent NUMERIC(8, 2) NOT NULL,
  close_reason TEXT NOT NULL CHECK (
    close_reason IN ('MANUAL', 'TP_HIT', 'SL_HIT', 'LIQUIDATED', 'CHALLENGE_BREACH')
  ),
  strategy_tag TEXT NOT NULL DEFAULT 'Discretionary',
  notes TEXT NOT NULL DEFAULT '',
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast Leaderboard, Token lookup & Journal queries
CREATE INDEX IF NOT EXISTS idx_trading_challenge_leaderboard
  ON public.trading_challenge_accounts (is_public_leaderboard, current_balance DESC);

CREATE INDEX IF NOT EXISTS idx_trading_challenge_session_token
  ON public.trading_challenge_accounts (session_token);

CREATE INDEX IF NOT EXISTS idx_trading_open_positions_account
  ON public.trading_open_positions (account_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_trading_journal_account_closed
  ON public.trading_trade_journal (account_id, closed_at DESC);

-- Automatic updated_at trigger with locked search_path
CREATE OR REPLACE FUNCTION public.trading_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trading_challenge_accounts_updated_at ON public.trading_challenge_accounts;
CREATE TRIGGER trg_trading_challenge_accounts_updated_at
  BEFORE UPDATE ON public.trading_challenge_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.trading_touch_updated_at();

-- Read-only Public Leaderboard View (respects RLS via security_invoker; never exposes session_token)
CREATE OR REPLACE VIEW public.trading_public_leaderboard
WITH (security_invoker = true) AS
SELECT
  ca.id,
  ca.trader_alias,
  ca.current_balance,
  ROUND(((ca.current_balance - ca.initial_balance) / NULLIF(ca.initial_balance, 0)) * 100, 2) AS return_pct,
  ca.status,
  COUNT(tj.id)::INTEGER AS total_trades,
  ROUND(
    CASE
      WHEN COUNT(tj.id) > 0
        THEN (COUNT(tj.id) FILTER (WHERE tj.realized_pnl > 0)::NUMERIC / COUNT(tj.id)) * 100
      ELSE 0
    END,
    1
  ) AS win_rate_pct,
  ca.updated_at
FROM public.trading_challenge_accounts ca
LEFT JOIN public.trading_trade_journal tj ON tj.account_id = ca.id
WHERE ca.is_public_leaderboard = TRUE
GROUP BY ca.id
ORDER BY return_pct DESC
LIMIT 50;

-- ============================================================================
-- Row Level Security (RLS)
-- Public read ONLY on opted-in leaderboard rows and their child records.
-- All INSERT / UPDATE / DELETE writes happen exclusively server-side via
-- Next.js Route Handlers using SUPABASE_SERVICE_ROLE_KEY after validation.
-- ============================================================================

ALTER TABLE public.trading_challenge_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_open_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_trade_journal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select opted-in trading challenge accounts" ON public.trading_challenge_accounts;
CREATE POLICY "Public select opted-in trading challenge accounts"
  ON public.trading_challenge_accounts
  FOR SELECT
  TO anon, authenticated
  USING (is_public_leaderboard = TRUE);

DROP POLICY IF EXISTS "Public select opted-in trading open positions" ON public.trading_open_positions;
CREATE POLICY "Public select opted-in trading open positions"
  ON public.trading_open_positions
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trading_challenge_accounts ca
      WHERE ca.id = trading_open_positions.account_id
        AND ca.is_public_leaderboard = TRUE
    )
  );

DROP POLICY IF EXISTS "Public select opted-in trading trade journal" ON public.trading_trade_journal;
CREATE POLICY "Public select opted-in trading trade journal"
  ON public.trading_trade_journal
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trading_challenge_accounts ca
      WHERE ca.id = trading_trade_journal.account_id
        AND ca.is_public_leaderboard = TRUE
    )
  );

-- Protect session_token from direct anon/authenticated REST queries via column-level grants
REVOKE ALL ON public.trading_challenge_accounts FROM anon, authenticated;
GRANT SELECT (
  id,
  trader_alias,
  initial_balance,
  wallet_balance,
  current_balance,
  peak_equity,
  profit_target_pct,
  max_drawdown_pct,
  status,
  is_public_leaderboard,
  created_at,
  updated_at
) ON public.trading_challenge_accounts TO anon, authenticated;

GRANT SELECT ON public.trading_public_leaderboard TO anon, authenticated;
GRANT SELECT ON public.trading_open_positions TO anon, authenticated;
GRANT SELECT ON public.trading_trade_journal TO anon, authenticated;
