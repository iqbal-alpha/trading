'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AetherMark } from '@/components/ui/TerminalPrimitives';
import { ArrowLeft, Check, Copy, ShieldCheck } from 'lucide-react';

export function ShareReportToolbar({
  isPublicLeaderboard,
}: {
  isPublicLeaderboard: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard API may be unavailable on insecure contexts
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="mx-auto flex h-[56px] w-full max-w-[1440px] items-center justify-between gap-3 px-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 whitespace-nowrap text-left"
          >
            <AetherMark />
            <span className="text-[14px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">
              AETHER
            </span>
          </Link>

          <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--long-bright)]" />
            <span>
              Verified Read-Only Report ·{' '}
              {isPublicLeaderboard ? 'Public Leaderboard' : 'Private Share'}
            </span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-3 text-[12px] font-medium text-[var(--text-primary)] hover:border-[var(--border-focus)]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-[var(--long-bright)]" />
                <span>Link Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <span className="hidden sm:inline">Copy Report URL</span>
                <span className="sm:hidden">Copy</span>
              </>
            )}
          </button>

          <Link
            href="/"
            className="glow-long inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--long)] px-3.5 text-[12px] font-bold text-[var(--bg-ground)] hover:bg-[var(--long-bright)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Open Terminal</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
