import { INSTRUMENT_MAP } from '@/lib/preseeded-trades';
import type { InstrumentId, Timeframe } from '@/lib/trading-math';

export type FeedConnectionMode = 'connecting' | 'live' | 'fallback';

export interface FeedCandle {
  time: number; // Unix timestamp in seconds (ascending unique UTCTimestamp)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerPayload {
  symbolId: InstrumentId;
  price: number;
  changePct24h?: number;
  high24h?: number;
  low24h?: number;
  latencyMs?: number;
}

export interface ChartFeedCallbacks {
  onSnapshot: (candles: FeedCandle[], mode: FeedConnectionMode) => void;
  onCandleTick: (candle: FeedCandle) => void;
  onTicker: (ticker: TickerPayload) => void;
  onModeChange: (mode: FeedConnectionMode, latencyMs?: number) => void;
}

const BINANCE_REST_BASE = 'https://data-api.binance.vision/api/v3';
const BINANCE_WS_BASE = 'wss://data-stream.binance.vision/stream';
const WATCHDOG_TIMEOUT_MS = 3000;
const LIVE_STALL_TIMEOUT_MS = 12000;

export function toBinanceInterval(tf: Timeframe): string {
  switch (tf) {
    case '1m':
      return '1m';
    case '15m':
      return '15m';
    case '1H':
      return '1h';
    case '1D':
      return '1d';
  }
}

export function intervalToSeconds(tf: Timeframe): number {
  switch (tf) {
    case '1m':
      return 60;
    case '15m':
      return 900;
    case '1H':
      return 3600;
    case '1D':
      return 86400;
  }
}

// Seeded PRNG (Mulberry32) so fallback chart starts deterministic without Math.random hydration risk
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateGbmHistory(
  symbolId: InstrumentId,
  timeframe: Timeframe,
  count: number = 500,
  anchorPrice?: number
): FeedCandle[] {
  const meta = INSTRUMENT_MAP[symbolId];
  const targetClose = anchorPrice ?? meta.basePrice;
  const stepSec = intervalToSeconds(timeframe);
  const nowSec = Math.floor(Date.now() / 1000);
  const currentBucket = nowSec - (nowSec % stepSec);
  const rng = createSeededRandom(symbolId.charCodeAt(0) * 997 + stepSec);

  const vol = symbolId === 'PAXGUSDT' ? 0.0014 : symbolId === 'BTCUSDT' ? 0.0022 : 0.0032;
  const rawCloses: number[] = [targetClose];

  // Walk backwards from targetClose so final seeded candle aligns cleanly near current mark
  for (let i = 1; i < count; i++) {
    const z = rng() + rng() + rng() - 1.5; // approximate zero-mean normal
    const prev = rawCloses[i - 1] * Math.exp(-z * vol);
    rawCloses.push(prev);
  }
  rawCloses.reverse();

  const candles: FeedCandle[] = [];
  for (let i = 0; i < count; i++) {
    const t = currentBucket - (count - 1 - i) * stepSec;
    const prevClose = i === 0 ? rawCloses[0] * (1 + (rng() - 0.5) * vol) : candles[i - 1].close;
    const close = Number(rawCloses[i].toFixed(meta.decimals));
    const wickSpread = Math.max(prevClose, close) * vol * (0.4 + rng() * 0.9);
    const high = Number((Math.max(prevClose, close) + wickSpread * rng()).toFixed(meta.decimals));
    const low = Number((Math.min(prevClose, close) - wickSpread * rng()).toFixed(meta.decimals));
    candles.push({
      time: t,
      open: Number(prevClose.toFixed(meta.decimals)),
      high,
      low,
      close,
      volume: Math.round(250 + rng() * 850),
    });
  }

  return candles;
}

export class MarketFeedController {
  private ws: WebSocket | null = null;
  private multiTickerTimer: number | null = null;
  private fallbackTickTimer: number | null = null;
  private watchdogTimer: number | null = null;
  private abortCtrl: AbortController | null = null;
  private destroyed = false;

  private lastCandle: FeedCandle | null = null;
  private currentSymbol: InstrumentId = 'BTCUSDT';
  private currentTimeframe: Timeframe = '15m';
  private mode: FeedConnectionMode = 'connecting';
  private callbacks: ChartFeedCallbacks;
  private getLatestPrices: () => Record<InstrumentId, number>;
  private simPrices: Record<InstrumentId, number>;

  constructor(
    callbacks: ChartFeedCallbacks,
    getLatestPrices: () => Record<InstrumentId, number>
  ) {
    this.callbacks = callbacks;
    this.getLatestPrices = getLatestPrices;
    this.simPrices = { ...getLatestPrices() };
  }

  public async connect(symbolId: InstrumentId, timeframe: Timeframe): Promise<void> {
    this.teardownStreams();
    this.destroyed = false;
    this.currentSymbol = symbolId;
    this.currentTimeframe = timeframe;
    this.setMode('connecting');

    const interval = toBinanceInterval(timeframe);
    const startTs = performance.now();

    this.abortCtrl = new AbortController();
    const restTimeout = window.setTimeout(() => this.abortCtrl?.abort(), WATCHDOG_TIMEOUT_MS);

    try {
      const res = await fetch(
        `${BINANCE_REST_BASE}/klines?symbol=${symbolId}&interval=${interval}&limit=500`,
        { signal: this.abortCtrl.signal }
      );
      window.clearTimeout(restTimeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const raw = (await res.json()) as [
        number,
        string,
        string,
        string,
        string,
        string,
      ][];
      if (this.destroyed) return;

      const candles: FeedCandle[] = raw.map((row) => ({
        time: Math.floor(row[0] / 1000),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }));

      this.lastCandle = candles[candles.length - 1] ?? null;
      if (this.lastCandle) {
        this.simPrices[symbolId] = this.lastCandle.close;
      }

      const latency = Math.max(8, Math.round(performance.now() - startTs));
      this.callbacks.onSnapshot(candles, 'live');
      this.connectWebSocket(symbolId, interval, latency);
      this.startMultiTickerPoll();
    } catch {
      window.clearTimeout(restTimeout);
      if (!this.destroyed) {
        this.activateFallback(symbolId, timeframe);
      }
    }
  }

  public retryLive(): void {
    void this.connect(this.currentSymbol, this.currentTimeframe);
  }

  public destroy(): void {
    this.destroyed = true;
    this.teardownStreams();
  }

  private setMode(mode: FeedConnectionMode, latencyMs?: number): void {
    this.mode = mode;
    this.callbacks.onModeChange(mode, latencyMs);
  }

  private connectWebSocket(
    symbolId: InstrumentId,
    interval: string,
    initialLatency: number
  ): void {
    const lower = symbolId.toLowerCase();
    const streams = `${lower}@kline_${interval}/${lower}@ticker`;

    try {
      const ws = new WebSocket(`${BINANCE_WS_BASE}?streams=${streams}`);
      this.ws = ws;

      // 3-second handshake / stall watchdog
      this.resetWatchdog(symbolId, this.currentTimeframe);

      ws.onopen = () => {
        if (this.destroyed) {
          try {
            ws.close();
          } catch {
            // Ignore close after teardown
          }
          return;
        }
        this.setMode('live', initialLatency);
        this.resetWatchdog(symbolId, this.currentTimeframe);
      };

      ws.onmessage = (event) => {
        if (this.destroyed) return;
        this.resetWatchdog(symbolId, this.currentTimeframe);

        try {
          const msg = JSON.parse(event.data as string) as {
            stream?: string;
            data?: {
              e?: string;
              k?: {
                t: number;
                o: string;
                h: string;
                l: string;
                c: string;
                v: string;
              };
              c?: string;
              P?: string;
              h?: string;
              l?: string;
            };
          };
          const d = msg.data;
          if (!d) return;

          if (d.k) {
            const bar: FeedCandle = {
              time: Math.floor(d.k.t / 1000),
              open: Number(d.k.o),
              high: Number(d.k.h),
              low: Number(d.k.l),
              close: Number(d.k.c),
              volume: Number(d.k.v),
            };
            this.lastCandle = bar;
            this.simPrices[symbolId] = bar.close;
            this.callbacks.onCandleTick(bar);
            this.callbacks.onTicker({
              symbolId,
              price: bar.close,
              latencyMs: initialLatency,
            });
          } else if (d.e === '24hrTicker' && d.c) {
            const price = Number(d.c);
            this.simPrices[symbolId] = price;
            this.callbacks.onTicker({
              symbolId,
              price,
              changePct24h: d.P ? Number(d.P) : undefined,
              high24h: d.h ? Number(d.h) : undefined,
              low24h: d.l ? Number(d.l) : undefined,
              latencyMs: initialLatency,
            });
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onerror = () => {
        if (!this.destroyed && this.mode !== 'fallback') {
          this.activateFallback(symbolId, this.currentTimeframe);
        }
      };

      ws.onclose = () => {
        if (!this.destroyed && this.mode !== 'fallback') {
          this.activateFallback(symbolId, this.currentTimeframe);
        }
      };
    } catch {
      this.activateFallback(symbolId, this.currentTimeframe);
    }
  }

  private resetWatchdog(symbolId: InstrumentId, timeframe: Timeframe): void {
    if (this.watchdogTimer !== null) {
      window.clearTimeout(this.watchdogTimer);
    }
    const timeoutMs =
      this.mode === 'live' ? LIVE_STALL_TIMEOUT_MS : WATCHDOG_TIMEOUT_MS;
    this.watchdogTimer = window.setTimeout(() => {
      if (!this.destroyed) {
        this.activateFallback(symbolId, timeframe);
      }
    }, timeoutMs);
  }

  private startMultiTickerPoll(): void {
    const fetchAllTickers = async () => {
      if (this.destroyed || this.mode === 'fallback') return;
      try {
        const symbols = encodeURIComponent(
          JSON.stringify(['BTCUSDT', 'PAXGUSDT', 'ETHUSDT', 'SOLUSDT'])
        );
        const res = await fetch(`${BINANCE_REST_BASE}/ticker/24hr?symbols=${symbols}`);
        if (!res.ok) return;
        const list = (await res.json()) as {
          symbol: InstrumentId;
          lastPrice: string;
          priceChangePercent: string;
          highPrice: string;
          lowPrice: string;
        }[];
        for (const item of list) {
          const price = Number(item.lastPrice);
          this.simPrices[item.symbol] = price;
          this.callbacks.onTicker({
            symbolId: item.symbol,
            price,
            changePct24h: Number(item.priceChangePercent),
            high24h: Number(item.highPrice),
            low24h: Number(item.lowPrice),
          });
        }
      } catch {
        // Silently keep WS active if 24h poll skips a beat
      }
    };

    void fetchAllTickers();
    this.multiTickerTimer = window.setInterval(fetchAllTickers, 5000);
  }

  private activateFallback(symbolId: InstrumentId, timeframe: Timeframe): void {
    if (this.destroyed) return;

    // Sync simulator baseline to latest known live/persisted prices so it never jumps backward
    this.simPrices = { ...this.getLatestPrices() };

    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      sock.onerror = null;
      sock.onclose = null;
      if (sock.readyState === WebSocket.OPEN) {
        try {
          sock.close();
        } catch {
          // Ignore close errors
        }
      } else if (sock.readyState === WebSocket.CONNECTING) {
        sock.onopen = () => {
          try {
            sock.close();
          } catch {
            // Ignore close errors
          }
        };
      }
    }
    if (this.watchdogTimer !== null) {
      window.clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.multiTickerTimer !== null) {
      window.clearInterval(this.multiTickerTimer);
      this.multiTickerTimer = null;
    }

    this.setMode('fallback');

    if (!this.lastCandle) {
      const candles = generateGbmHistory(symbolId, timeframe, 500, this.simPrices[symbolId]);
      this.lastCandle = candles[candles.length - 1];
      this.callbacks.onSnapshot(candles, 'fallback');
    }

    if (this.fallbackTickTimer !== null) {
      window.clearInterval(this.fallbackTickTimer);
    }

    const stepSec = intervalToSeconds(timeframe);
    const meta = INSTRUMENT_MAP[symbolId];

    // 650ms Geometric Brownian Motion Simulator ticks across watched assets
    this.fallbackTickTimer = window.setInterval(() => {
      if (this.destroyed || document.visibilityState === 'hidden') return;

      const allIds: InstrumentId[] = ['BTCUSDT', 'PAXGUSDT', 'ETHUSDT', 'SOLUSDT'];
      for (const id of allIds) {
        const m = INSTRUMENT_MAP[id];
        const sigma = id === 'PAXGUSDT' ? 0.00045 : id === 'BTCUSDT' ? 0.0007 : 0.0011;
        const u1 = Math.max(1e-6, Math.random());
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const nextPrice = Number(
          (this.simPrices[id] * Math.exp(z * sigma)).toFixed(m.decimals)
        );
        this.simPrices[id] = nextPrice;
        this.callbacks.onTicker({ symbolId: id, price: nextPrice });
      }

      if (this.lastCandle) {
        const nowSec = Math.floor(Date.now() / 1000);
        const bucket = nowSec - (nowSec % stepSec);
        const price = this.simPrices[symbolId];

        const nextBar: FeedCandle =
          bucket > this.lastCandle.time
            ? {
                time: bucket,
                open: this.lastCandle.close,
                high: Math.max(this.lastCandle.close, price),
                low: Math.min(this.lastCandle.close, price),
                close: price,
                volume: Math.round(80 + Math.random() * 140),
              }
            : {
                time: this.lastCandle.time,
                open: this.lastCandle.open,
                high: Number(Math.max(this.lastCandle.high, price).toFixed(meta.decimals)),
                low: Number(Math.min(this.lastCandle.low, price).toFixed(meta.decimals)),
                close: price,
                volume: this.lastCandle.volume + Math.round(5 + Math.random() * 25),
              };

        this.lastCandle = nextBar;
        this.callbacks.onCandleTick(nextBar);
      }
    }, 650);
  }

  private teardownStreams(): void {
    this.abortCtrl?.abort();
    this.abortCtrl = null;
    if (this.watchdogTimer !== null) {
      window.clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.multiTickerTimer !== null) {
      window.clearInterval(this.multiTickerTimer);
      this.multiTickerTimer = null;
    }
    if (this.fallbackTickTimer !== null) {
      window.clearInterval(this.fallbackTickTimer);
      this.fallbackTickTimer = null;
    }
    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      sock.onerror = null;
      sock.onclose = null;
      if (sock.readyState === WebSocket.OPEN) {
        try {
          sock.close();
        } catch {
          // Ignore teardown socket state
        }
      } else if (sock.readyState === WebSocket.CONNECTING) {
        // Defer closing until handshake opens to avoid Chromium "closed before connection established" warning
        sock.onopen = () => {
          try {
            sock.close();
          } catch {
            // Ignore teardown socket state
          }
        };
      }
    }
  }
}
