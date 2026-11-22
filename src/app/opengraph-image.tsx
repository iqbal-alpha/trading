import { ImageResponse } from "next/og";

export const alt = "AETHER — Live Paper Trading & Prop Firm Terminal";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

const METRIC_CARDS = [
  { label: "EVAL CAPITAL", value: "$100,000", color: "#F3F4F6" },
  { label: "PROFIT TARGET", value: "+8.00%", color: "#10B981" },
  { label: "MAX DRAWDOWN", value: "-10.00%", color: "#F43F5E" },
] as const;

const CANDLES = [
  { x: 24, openY: 148, closeY: 132, highY: 124, lowY: 156, bull: true },
  { x: 54, openY: 132, closeY: 140, highY: 126, lowY: 149, bull: false },
  { x: 84, openY: 140, closeY: 116, highY: 108, lowY: 144, bull: true },
  { x: 114, openY: 116, closeY: 104, highY: 96, lowY: 124, bull: true },
  { x: 144, openY: 104, closeY: 114, highY: 98, lowY: 122, bull: false },
  { x: 174, openY: 114, closeY: 86, highY: 78, lowY: 120, bull: true },
  { x: 204, openY: 86, closeY: 94, highY: 80, lowY: 102, bull: false },
  { x: 234, openY: 94, closeY: 68, highY: 60, lowY: 99, bull: true },
  { x: 264, openY: 68, closeY: 56, highY: 48, lowY: 74, bull: true },
  { x: 294, openY: 56, closeY: 40, highY: 30, lowY: 64, bull: true },
  { x: 324, openY: 40, closeY: 46, highY: 32, lowY: 56, bull: false },
  { x: 354, openY: 46, closeY: 24, highY: 14, lowY: 52, bull: true },
] as const;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          justifyContent: "space-between",
          backgroundColor: "#07080A",
          backgroundImage:
            "radial-gradient(circle at 82% 20%, rgba(16, 185, 129, 0.16) 0%, rgba(7, 8, 10, 0) 58%)",
          color: "#F3F4F6",
          padding: "54px 60px",
          fontFamily: "sans-serif",
          border: "1px solid #161B24",
        }}
      >
        {/* Left narrative column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "620px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Brand Pill Row */}
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                marginBottom: "28px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  backgroundColor: "#10B981",
                  color: "#04120C",
                  fontSize: "20px",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: "14px",
                }}
              >
                A
              </div>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  color: "#F9FAFB",
                  marginRight: "16px",
                  display: "flex",
                }}
              >
                AETHER
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 12px",
                  borderRadius: "999px",
                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                  border: "1px solid rgba(16, 185, 129, 0.35)",
                  color: "#34D399",
                  fontSize: "13px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                }}
              >
                LIVE PAPER TERMINAL
              </div>
            </div>

            {/* Main Headline */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: "52px",
                fontWeight: 800,
                lineHeight: 1.12,
                letterSpacing: "-0.025em",
                color: "#FFFFFF",
                marginBottom: "20px",
              }}
            >
              <span>Trade Crypto &amp; Gold.</span>
              <span style={{ color: "#10B981" }}>Pass the $100K Eval.</span>
            </div>

            {/* Subtitle */}
            <div
              style={{
                display: "flex",
                fontSize: "21px",
                lineHeight: 1.45,
                color: "#9CA3AF",
              }}
            >
              Real-time BTC/USDT &amp; XAU/USD feed, isolated 1x–50x execution,
              prop-firm risk guardrails, and shareable Supabase reports.
            </div>
          </div>

          {/* Bottom Metric Cards */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "16px",
            }}
          >
            {METRIC_CARDS.map((card) => (
              <div
                key={card.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  backgroundColor: "#0C0E12",
                  border: "1px solid #1E2430",
                  borderRadius: "12px",
                  padding: "16px 18px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: "#6B7280",
                    marginBottom: "6px",
                  }}
                >
                  {card.label}
                </span>
                <span
                  style={{
                    fontSize: "26px",
                    fontWeight: 800,
                    color: card.color,
                  }}
                >
                  {card.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Terminal Preview Card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "420px",
            backgroundColor: "#0C0E12",
            border: "1px solid #1F2937",
            borderRadius: "16px",
            padding: "24px 26px",
          }}
        >
          {/* Instrument Header */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: "#6B7280",
                }}
              >
                PERPETUAL PAPER
              </span>
              <span
                style={{
                  fontSize: "26px",
                  fontWeight: 800,
                  color: "#F9FAFB",
                }}
              >
                BTC/USDT
              </span>
            </div>
            <div
              style={{
                display: "flex",
                padding: "6px 12px",
                borderRadius: "8px",
                backgroundColor: "#141820",
                border: "1px solid #262D3B",
                color: "#D1D5DB",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              1x – 50x ISOLATED
            </div>
          </div>

          {/* Simulated Ticker Row */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginTop: "12px",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                fontSize: "34px",
                fontWeight: 800,
                color: "#FFFFFF",
              }}
            >
              $84,260.40
            </span>
            <span
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#10B981",
              }}
            >
              +2.84% 24H
            </span>
          </div>

          {/* Inline Candlestick Chart SVG */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#080A0D",
              border: "1px solid #181D27",
              borderRadius: "10px",
              padding: "12px 6px",
            }}
          >
            <svg width="368" height="175" viewBox="0 0 380 175">
              {/* Grid lines */}
              <line x1="0" y1="35" x2="380" y2="35" stroke="#141923" strokeWidth="1" />
              <line x1="0" y1="88" x2="380" y2="88" stroke="#141923" strokeWidth="1" />
              <line x1="0" y1="140" x2="380" y2="140" stroke="#141923" strokeWidth="1" />
              {/* Equity trend line */}
              <polyline
                fill="none"
                stroke="rgba(16, 185, 129, 0.35)"
                strokeWidth="2"
                points="24,142 84,122 144,110 204,90 264,62 354,28"
              />
              {/* Candlesticks */}
              {CANDLES.map((c) => {
                const top = Math.min(c.openY, c.closeY);
                const height = Math.max(Math.abs(c.closeY - c.openY), 6);
                const color = c.bull ? "#10B981" : "#F43F5E";
                return (
                  <g key={c.x}>
                    <line
                      x1={c.x}
                      y1={c.highY}
                      x2={c.x}
                      y2={c.lowY}
                      stroke={color}
                      strokeWidth="2"
                    />
                    <rect
                      x={c.x - 7}
                      y={top}
                      width="14"
                      height={height}
                      rx="2"
                      fill={color}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Card Footer */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: "14px",
              borderTop: "1px solid #181D27",
              marginTop: "12px",
            }}
          >
            <span style={{ fontSize: "14px", color: "#9CA3AF" }}>
              XAU/USD · ETH/USDT · SOL/USDT
            </span>
            <span style={{ fontSize: "15px", fontWeight: 700, color: "#10B981" }}>
              EVAL READY
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
