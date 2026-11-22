'use client';

import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { InstrumentMeta } from '@/lib/preseeded-trades';
import type { InstrumentId, OpenPosition, Timeframe } from '@/lib/trading-math';
import {
  MarketFeedController,
  type FeedCandle,
} from '@/services/market-feed';
import {
  useTradingStore,
  type OrderPreviewOverlay,
} from '@/store/useTradingStore';

export interface OhlcSnapshot {
  open: number;
  high: number;
  low: number;
  close: number;
  changePct: number;
}

interface CandlestickCanvasProps {
  instrument: InstrumentMeta;
  timeframe: Timeframe;
  compactMobile: boolean;
  panLocked: boolean;
  fitSignal: number;
  openPositions: OpenPosition[];
  orderPreview: OrderPreviewOverlay | null;
  onCrosshairOhlc: (snap: OhlcSnapshot | null) => void;
  onLiveBarOhlc: (snap: OhlcSnapshot) => void;
  onLoadingChange: (loading: boolean) => void;
}

export function CandlestickCanvas({
  instrument,
  timeframe,
  compactMobile,
  panLocked,
  fitSignal,
  openPositions,
  orderPreview,
  onCrosshairOhlc,
  onLiveBarOhlc,
  onLoadingChange,
}: CandlestickCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const feedRef = useRef<MarketFeedController | null>(null);

  const feedRetrySeq = useTradingStore((s) => s.feedRetrySeq);
  const processPriceTick = useTradingStore((s) => s.processPriceTick);
  const setFeedStatus = useTradingStore((s) => s.setFeedStatus);

  // Create chart instance + bind live MarketFeed via useRef (zero React state candle arrays!)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    onLoadingChange(true);

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0C0E12' },
        textColor: '#9CA3AF',
        fontFamily: 'Chivo Mono, ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: '#363E52',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#181C26',
        },
        horzLine: {
          color: '#363E52',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#181C26',
        },
      },
      rightPriceScale: {
        borderColor: '#191D26',
        minimumWidth: compactMobile ? 58 : 74,
        scaleMargins: compactMobile
          ? { top: 0.1, bottom: 0.22 }
          : { top: 0.12, bottom: 0.24 },
      },
      timeScale: {
        borderColor: '#191D26',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: !compactMobile,
      },
      handleScale: {
        axisPressedMouseMove: true,
        pinch: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#F43F5E',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#F43F5E',
      priceFormat: {
        type: 'price',
        precision: instrument.decimals,
        minMove: 1 / Math.pow(10, instrument.decimals),
      },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        onCrosshairOhlc(null);
        return;
      }
      const point = param.seriesData.get(candleSeries) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      if (!point) {
        onCrosshairOhlc(null);
        return;
      }
      const pct = point.open > 0 ? ((point.close - point.open) / point.open) * 100 : 0;
      onCrosshairOhlc({
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        changePct: pct,
      });
    });

    const lastUiThrottle: Partial<Record<InstrumentId, number>> = {};
    const minThrottleMs = compactMobile ? 200 : 120;

    const toBarOhlc = (c: FeedCandle): OhlcSnapshot => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      changePct: c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0,
    });

    const controller = new MarketFeedController(
      {
        onSnapshot: (candles, mode) => {
          if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
          candleSeriesRef.current.setData(
            candles.map((c) => ({
              time: c.time as UTCTimestamp,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }))
          );
          volumeSeriesRef.current.setData(
            candles.map((c) => ({
              time: c.time as UTCTimestamp,
              value: c.volume,
              color:
                c.close >= c.open
                  ? 'rgba(16, 185, 129, 0.28)'
                  : 'rgba(244, 63, 94, 0.28)',
            }))
          );
          chart.timeScale().fitContent();
          const last = candles[candles.length - 1];
          if (last) {
            onLiveBarOhlc(toBarOhlc(last));
            processPriceTick({ symbolId: instrument.id, price: last.close });
          }
          setFeedStatus(mode);
          onLoadingChange(false);
        },
        onCandleTick: (candle) => {
          // Direct canvas draw via useRef (60fps, zero React array re-render)
          candleSeriesRef.current?.update({
            time: candle.time as UTCTimestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          });
          volumeSeriesRef.current?.update({
            time: candle.time as UTCTimestamp,
            value: candle.volume,
            color:
              candle.close >= candle.open
                ? 'rgba(16, 185, 129, 0.28)'
                : 'rgba(244, 63, 94, 0.28)',
          });

          const now = performance.now();
          if (now - (lastUiThrottle[instrument.id] ?? 0) >= minThrottleMs) {
            onLiveBarOhlc(toBarOhlc(candle));
          }
        },
        onTicker: (ticker) => {
          const now = performance.now();
          const prevTs = lastUiThrottle[ticker.symbolId] ?? 0;
          if (ticker.changePct24h === undefined && now - prevTs < minThrottleMs) {
            return;
          }
          lastUiThrottle[ticker.symbolId] = now;
          processPriceTick(ticker);
        },
        onModeChange: (mode, latency) => {
          setFeedStatus(mode, latency);
        },
      },
      () => useTradingStore.getState().markPrices
    );

    feedRef.current = controller;
    void controller.connect(instrument.id, timeframe);

    // Resync candlestick snapshot when mobile/desktop browser tab becomes visible again
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void controller.connect(instrument.id, timeframe);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      controller.destroy();
      feedRef.current = null;
      priceLinesRef.current = [];
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
    // Keep chart mounted across panLocked/fitSignal changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument.id, instrument.decimals, timeframe, compactMobile, feedRetrySeq]);

  // Synchronize Scroll-Safe / Pan-Lock without tearing down chart
  useEffect(() => {
    chartRef.current?.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: compactMobile ? panLocked : true,
      },
    });
  }, [compactMobile, panLocked]);

  // Trigger Auto-Fit cleanly
  useEffect(() => {
    if (fitSignal > 0) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [fitSignal]);

  // Render live Open Position lines + Order Execution TP/SL preview lines dynamically
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    for (const line of priceLinesRef.current) {
      series.removePriceLine(line);
    }
    priceLinesRef.current = [];

    const matchingPositions = openPositions.filter(
      (p) => p.symbolId === instrument.id
    );

    for (const pos of matchingPositions) {
      priceLinesRef.current.push(
        series.createPriceLine({
          price: pos.entryPrice,
          color: '#06B6D4',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: compactMobile
            ? `${pos.side} ${pos.leverage}x`
            : `${pos.side} ${pos.leverage}x ENTRY`,
        })
      );

      if (pos.tpPrice !== null) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: pos.tpPrice,
            color: '#10B981',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'POS TP',
          })
        );
      }

      if (pos.slPrice !== null) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: pos.slPrice,
            color: '#F43F5E',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'POS SL',
          })
        );
      }
    }

    if (orderPreview && orderPreview.symbolId === instrument.id) {
      if (orderPreview.tpPrice !== null && orderPreview.tpPrice > 0) {
        const tpUsd =
          orderPreview.projectedTpUsd !== null
            ? ` (+$${Math.abs(orderPreview.projectedTpUsd).toFixed(0)})`
            : '';
        priceLinesRef.current.push(
          series.createPriceLine({
            price: orderPreview.tpPrice,
            color: '#34D399',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: compactMobile ? `TP${tpUsd}` : `TP PREVIEW${tpUsd}`,
          })
        );
      }
      if (orderPreview.slPrice !== null && orderPreview.slPrice > 0) {
        const slUsd =
          orderPreview.projectedSlUsd !== null
            ? ` (-$${Math.abs(orderPreview.projectedSlUsd).toFixed(0)})`
            : '';
        priceLinesRef.current.push(
          series.createPriceLine({
            price: orderPreview.slPrice,
            color: '#FB7185',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: compactMobile ? `SL${slUsd}` : `SL PREVIEW${slUsd}`,
          })
        );
      }
    }
  }, [compactMobile, instrument.id, openPositions, orderPreview]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      aria-label={`${instrument.symbol} Live Candlestick Chart`}
    />
  );
}
