import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { fetchChallengeReportById } from '@/lib/challenge-report';
import { formatRelativeTime } from '@/lib/preseeded-trades';
import { JournalReportBody } from '@/components/terminal/JournalReportBody';
import { ShareReportToolbar } from '@/components/terminal/ShareReportToolbar';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Shared Prop Firm Report',
  description:
    'Verified read-only Prop Firm paper trading challenge evaluation report powered by Supabase & AETHER.',
  openGraph: {
    type: 'article',
    title: 'Shared Prop Firm Report — AETHER Terminal',
    description:
      'Inspect a verified read-only $100,000 Prop Firm evaluation curve, drawdown compliance, and quantitative trade journal.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'AETHER — Live Paper Trading & Prop Firm Terminal',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Shared Prop Firm Report — AETHER Terminal',
    description:
      'Verified read-only $100,000 Prop Firm evaluation report powered by Supabase & AETHER.',
    images: ['/opengraph-image'],
  },
};

function ChallengeReportSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-[var(--bg-ground)] text-[var(--text-primary)]">
      <div className="h-[56px] border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
      <div className="mx-auto max-w-[1440px] space-y-4 px-3 py-6 md:px-6">
        <div className="h-14 animate-pulse rounded-[var(--radius-panel)] bg-[var(--bg-raised)]" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-[var(--radius-panel)] bg-[var(--bg-raised)]"
            />
          ))}
        </div>
        <div className="h-56 animate-pulse rounded-[var(--radius-panel)] bg-[var(--bg-raised)]" />
      </div>
    </div>
  );
}

async function ChallengeReportLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const result = await fetchChallengeReportById(id);

  if (result.status !== 'ok') {
    return (
      <div className="min-h-[100dvh] bg-[var(--bg-ground)] text-[var(--text-primary)]">
        <ShareReportToolbar isPublicLeaderboard={false} />
        <main className="mx-auto flex max-w-[560px] flex-col items-center px-4 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--short)]/40 bg-[var(--short-tint)] text-[var(--short-bright)]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">
            Challenge Report Unavailable
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            {result.error}
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-focus)] bg-[var(--bg-raised)] px-4 text-[13px] font-semibold text-[var(--text-primary)] hover:border-[var(--long)]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Live Trading Terminal</span>
          </Link>
        </main>
      </div>
    );
  }

  const { account, openPositions, tradeHistory } = result.data;
  const returnPct =
    ((account.currentBalance - account.initialBalance) / account.initialBalance) * 100;
  const isBreached =
    account.status === 'BREACHED' || account.status === 'DAILY_BREACHED';

  return (
    <div className="min-h-[100dvh] bg-[var(--bg-ground)] text-[var(--text-primary)]">
      <ShareReportToolbar isPublicLeaderboard={account.isPublicLeaderboard} />

      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-3 py-5 md:px-6 md:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-4 py-3.5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] md:text-[18px]">
                {account.traderAlias} · $100,000 Evaluation
              </h1>
              <span
                className={`tabular-nums-strict inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[11px] font-bold ${
                  isBreached
                    ? 'bg-[var(--short-tint)] text-[var(--short-bright)]'
                    : 'bg-[var(--long-tint)] text-[var(--long-bright)]'
                }`}
              >
                {account.status} · {returnPct >= 0 ? '+' : ''}
                {returnPct.toFixed(2)}%
              </span>
            </div>
            <p className="tabular-nums-strict text-[12px] text-[var(--text-muted)]">
              Synced {formatRelativeTime(new Date(account.updatedAt).getTime())} · Wallet Balance{' '}
              ${account.walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
              · Snapshot Equity $
              {account.currentBalance.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>

          <div className="tabular-nums-strict text-right">
            <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Evaluated Equity
            </div>
            <div
              className={`text-[20px] font-bold tracking-[-0.02em] ${
                returnPct >= 0
                  ? 'text-[var(--long-bright)]'
                  : 'text-[var(--short-bright)]'
              }`}
            >
              ${account.currentBalance.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>

        <JournalReportBody
          totalEquity={account.currentBalance}
          startOfDayEquity={account.initialBalance}
          peakEquity={account.peakEquity}
          initialBalance={account.initialBalance}
          openPositions={openPositions}
          tradeHistory={tradeHistory}
          readOnly
        />
      </main>
    </div>
  );
}

export default function SharedChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<ChallengeReportSkeleton />}>
      <ChallengeReportLoader params={params} />
    </Suspense>
  );
}
