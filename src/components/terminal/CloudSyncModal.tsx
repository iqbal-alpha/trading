'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  INITIAL_CHALLENGE_BALANCE,
  calculateTotalEquity,
} from '@/lib/trading-math';
import { useTradingStore } from '@/store/useTradingStore';
import {
  Check,
  CloudUpload,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  X,
} from 'lucide-react';

interface CloudSyncModalProps {
  open: boolean;
  onClose: () => void;
  onActionNotice: (message: string, isError?: boolean) => void;
}

export function CloudSyncModal({
  open,
  onClose,
  onActionNotice,
}: CloudSyncModalProps) {
  const walletBalance = useTradingStore((s) => s.walletBalance);
  const openPositions = useTradingStore((s) => s.openPositions);
  const tradeHistory = useTradingStore((s) => s.tradeHistory);
  const markPrices = useTradingStore((s) => s.markPrices);
  const accountStatus = useTradingStore((s) => s.accountStatus);
  const cloudSessionToken = useTradingStore((s) => s.cloudSessionToken);
  const cloudTraderAlias = useTradingStore((s) => s.cloudTraderAlias);
  const lastSyncedShareUrl = useTradingStore((s) => s.lastSyncedShareUrl);
  const setCloudSyncResult = useTradingStore((s) => s.setCloudSyncResult);

  const [aliasInput, setAliasInput] = useState(cloudTraderAlias);
  const [publishPublic, setPublishPublic] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeShareUrl, setActiveShareUrl] = useState<string | null>(lastSyncedShareUrl);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !syncing) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, syncing, onClose]);

  const currentEquity = calculateTotalEquity(walletBalance, openPositions, markPrices);
  const returnPct =
    ((currentEquity - INITIAL_CHALLENGE_BALANCE) / INITIAL_CHALLENGE_BALANCE) * 100;

  const copyShareUrl = async (sharePath: string) => {
    const fullUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${sharePath}`
        : sharePath;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
      return true;
    } catch {
      return false;
    }
  };

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (syncing) return;

    setSyncing(true);
    setErrorMsg(null);
    setCopied(false);

    const trimmedAlias = aliasInput.trim() || 'Anon Quant';

    try {
      const res = await fetch('/api/challenge/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken: cloudSessionToken,
          traderAlias: trimmedAlias,
          isPublicLeaderboard: publishPublic,
          accountStatus,
          markPrices,
          openPositions,
          tradeHistory,
        }),
      });

      const payload = (await res.json()) as {
        ok: boolean;
        error?: string;
        sessionToken?: string;
        shareUrl?: string;
      };

      if (!res.ok || !payload.ok || !payload.sessionToken || !payload.shareUrl) {
        const errText = payload.error ?? `Sync failed (HTTP ${res.status}).`;
        setErrorMsg(errText);
        onActionNotice(errText, true);
        return;
      }

      setCloudSyncResult({
        sessionToken: payload.sessionToken,
        traderAlias: trimmedAlias,
        shareUrl: payload.shareUrl,
      });
      setActiveShareUrl(payload.shareUrl);

      const didCopy = await copyShareUrl(payload.shareUrl);
      onActionNotice(
        didCopy
          ? `Synced "${trimmedAlias}" to Supabase Cloud — share link copied!`
          : `Synced "${trimmedAlias}" to Supabase Cloud cleanly.`
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Network error connecting to sync endpoint.';
      setErrorMsg(msg);
      onActionNotice(msg, true);
    } finally {
      setSyncing(false);
    }
  };

  const resolvedShareUrl = activeShareUrl ?? lastSyncedShareUrl;

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cloud-sync-modal-title"
        >
          <motion.button
            type="button"
            aria-label="Close Sync Modal"
            onClick={() => !syncing && onClose()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-[#07080A]/75 backdrop-blur-[4px]"
          />

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="elevation-floating relative z-10 w-full max-w-[460px] rounded-t-[12px] border border-[var(--border-default)] bg-[var(--bg-floating)] p-5 sm:rounded-[var(--radius-panel)]"
          >
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2.5">
                <CloudUpload className="h-4 w-4 text-[var(--long-bright)]" />
                <h2
                  id="cloud-sync-modal-title"
                  className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
                >
                  Sync &amp; Publish Prop Challenge
                </h2>
              </div>
              <button
                type="button"
                disabled={syncing}
                onClick={onClose}
                aria-label="Close modal"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Live Account Snapshot Preview */}
            <div className="mb-4 grid grid-cols-3 gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-[12px]">
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">Equity</div>
                <div className="tabular-nums-strict font-semibold text-[var(--text-primary)]">
                  ${currentEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">Return</div>
                <div
                  className={`tabular-nums-strict font-semibold ${
                    returnPct >= 0
                      ? 'text-[var(--long-bright)]'
                      : 'text-[var(--short-bright)]'
                  }`}
                >
                  {returnPct >= 0 ? '+' : ''}
                  {returnPct.toFixed(2)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-[var(--text-muted)]">Trades</div>
                <div className="tabular-nums-strict font-semibold text-[var(--text-primary)]">
                  {openPositions.length} open · {tradeHistory.length} closed
                </div>
              </div>
            </div>

            <form onSubmit={handleSync} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="trader-alias-input"
                  className="block text-[12px] font-medium text-[var(--text-secondary)]"
                >
                  Trader Alias (Optional)
                </label>
                <input
                  id="trader-alias-input"
                  name="traderAlias"
                  type="text"
                  maxLength={32}
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  placeholder="Anon Quant"
                  className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-3 text-base font-medium text-[var(--text-primary)] outline-none focus:border-[var(--long)] md:h-10 md:text-[13px]"
                />
                <p className="text-[11px] text-[var(--text-muted)]">
                  All PnL &amp; Prop Firm checks are recalculated on the server before saving.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={publishPublic}
                onClick={() => setPublishPublic((v) => !v)}
                className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--border-focus)]"
              >
                <div className="flex items-start gap-2.5">
                  {publishPublic ? (
                    <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[var(--long-bright)]" />
                  ) : (
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                  )}
                  <div>
                    <div className="text-[12px] font-semibold text-[var(--text-primary)]">
                      {publishPublic
                        ? 'Publish to Public Leaderboard'
                        : 'Private Shareable Link Only'}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {publishPublic
                        ? 'Lists your verified equity & win-rate in the global Top 50 standings.'
                        : 'Hidden from leaderboard; accessible only via your unique secret URL.'}
                    </div>
                  </div>
                </div>
                <span
                  className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                    publishPublic ? 'bg-[var(--long)]' : 'bg-[var(--border-default)]'
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded-full bg-[var(--bg-ground)] transition-transform ${
                      publishPublic ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>

              {errorMsg && (
                <p
                  role="alert"
                  className="rounded-[var(--radius-control)] border border-[var(--short)]/50 bg-[var(--short-tint)] px-3 py-2 text-[11px] font-medium text-[var(--short-bright)]"
                >
                  {errorMsg}
                </p>
              )}

              {resolvedShareUrl && (
                <div className="space-y-2 rounded-[var(--radius-control)] border border-[var(--long)]/40 bg-[var(--long-tint)]/40 p-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--long-bright)]">
                    <span>Verified Shareable Portfolio URL</span>
                    {copied && <span>Copied to clipboard!</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <code className="tabular-nums-strict flex-1 truncate rounded bg-[var(--bg-ground)] px-2.5 py-1.5 text-[11px] text-[var(--text-primary)]">
                      {resolvedShareUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyShareUrl(resolvedShareUrl)}
                      className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border-focus)] bg-[var(--bg-raised)] px-2.5 text-[11px] font-medium text-[var(--text-primary)] hover:text-[var(--long-bright)]"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-[var(--long-bright)]" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                    <Link
                      href={resolvedShareUrl}
                      onClick={onClose}
                      className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-control)] bg-[var(--long)] px-2.5 text-[11px] font-bold text-[var(--bg-ground)] hover:bg-[var(--long-bright)]"
                    >
                      <span>Open</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={syncing}
                  onClick={onClose}
                  className="min-h-[42px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-4 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={syncing}
                  className="glow-long inline-flex min-h-[42px] items-center gap-2 rounded-[var(--radius-control)] bg-[var(--long)] px-4 text-[13px] font-bold text-[var(--bg-ground)] transition-transform active:scale-[0.98] disabled:cursor-wait disabled:opacity-75"
                >
                  {syncing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Syncing...</span>
                    </>
                  ) : (
                    <>
                      <CloudUpload className="h-4 w-4" />
                      <span>{cloudSessionToken ? 'Update Cloud Sync' : 'Sync & Publish'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
