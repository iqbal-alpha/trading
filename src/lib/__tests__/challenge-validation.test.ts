import { describe, expect, it } from 'vitest';
import { createSeedTradeHistory } from '@/lib/preseeded-trades';
import {
  parseChallengeLookup,
  validateAndNormalizeChallengeSync,
} from '@/lib/challenge-validation';

describe('server-side anti-cheat challenge validation', () => {
  it('recomputes spoofed PnL and balances strictly from server math', () => {
    const res = validateAndNormalizeChallengeSync({
      traderAlias: '  AntiCheatQuant  ',
      isPublicLeaderboard: true,
      markPrices: { BTCUSDT: 62_000 },
      tradeHistory: [
        {
          id: 'custom-1',
          symbolId: 'BTCUSDT',
          side: 'LONG',
          leverage: 10,
          marginUsd: 2500,
          entryPrice: 60_000,
          exitPrice: 62_000,
          realizedPnl: 9_999_999,
          roePct: 50_000,
          closeReason: 'TP_HIT',
        },
      ],
      openPositions: [
        {
          id: 'open-1',
          symbolId: 'BTCUSDT',
          side: 'LONG',
          leverage: 10,
          marginUsd: 2500,
          entryPrice: 60_000,
          tpPrice: 66_000,
          slPrice: 58_000,
          liqPrice: 1, // spoofed
        },
      ],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Closed PnL = (62000 - 60000) * (25000 / 60000) = 833.33
    // Open PnL = +833.33 => Equity = 100000 + 833.33 + 833.33 = 101666.67
    expect(res.data.traderAlias).toBe('AntiCheatQuant');
    expect(res.data.tradeHistory[0].realizedPnl).toBe(833.33);
    expect(res.data.walletBalance).toBe(100_833.33);
    expect(res.data.openPositions[0].liqPrice).toBeCloseTo(54_300, 2);
    expect(res.data.currentBalance).toBeCloseTo(101_666.66, 1);
    expect(res.data.status).toBe('ACTIVE');
  });

  it('preserves immutable canonical seed demo PnL while allowing note/tag edits, and blocks tampered seed numbers', () => {
    const seed = createSeedTradeHistory();
    seed[0] = { ...seed[0], notes: 'Updated reflection note', strategyTag: 'Trend' };

    const validRes = validateAndNormalizeChallengeSync({
      tradeHistory: seed,
      openPositions: [],
    });
    expect(validRes.ok).toBe(true);
    if (validRes.ok) {
      expect(validRes.data.walletBalance).toBe(104_820.5);
      expect(validRes.data.tradeHistory[0].notes).toBe('Updated reflection note');
      expect(validRes.data.tradeHistory[0].strategyTag).toBe('Trend');
    }

    // Tamper entryPrice on canonical seed-tr-12 -> server refuses seed shortcut and recomputes!
    const tampered = [...seed];
    tampered[0] = { ...tampered[0], exitPrice: 91920, realizedPnl: 500_000, entryPrice: 89401 };
    const tamperedRes = validateAndNormalizeChallengeSync({
      tradeHistory: tampered,
      openPositions: [],
    });
    expect(tamperedRes.ok).toBe(true);
    if (tamperedRes.ok) {
      expect(tamperedRes.data.walletBalance).not.toBe(104_820.5);
      expect(tamperedRes.data.tradeHistory[0].realizedPnl).toBeLessThan(1000);
    }
  });

  it('rejects malformed session tokens, unsupported pairs, and identifies BREACHED equity <= $90k', () => {
    expect(
      validateAndNormalizeChallengeSync({ sessionToken: 'bad-token' }).ok
    ).toBe(false);

    expect(
      validateAndNormalizeChallengeSync({
        tradeHistory: [{ symbolId: 'DOGEUSDT' }],
      }).ok
    ).toBe(false);

    const breachRes = validateAndNormalizeChallengeSync({
      tradeHistory: [
        {
          symbolId: 'BTCUSDT',
          side: 'LONG',
          leverage: 10,
          marginUsd: 25_000,
          entryPrice: 60_000,
          exitPrice: 57_000, // -$12,500 loss -> equity = $87,500 <= $90,000
          closeReason: 'SL_HIT',
        },
      ],
    });
    expect(breachRes.ok).toBe(true);
    if (breachRes.ok) {
      expect(breachRes.data.walletBalance).toBe(87_500);
      expect(breachRes.data.status).toBe('BREACHED');
    }
  });

  it('parses secret session tokens vs public UUIDs strictly', () => {
    expect(parseChallengeLookup('aeth_0123456789abcdef01234567')).toEqual({
      kind: 'token',
      value: 'aeth_0123456789abcdef01234567',
    });
    expect(parseChallengeLookup('85196328-D131-4374-AC26-BCE366517265')).toEqual({
      kind: 'uuid',
      value: '85196328-d131-4374-ac26-bce366517265',
    });
    expect(parseChallengeLookup('not-a-valid-id')).toBeNull();
  });
});
