import React from "react";
import { MarketStats, SymbolType } from "../types";
import { formatPrice, formatPct, formatCompactUsd } from "../utils/format";

interface StatsBarProps {
  stats: MarketStats | null;
  symbol: SymbolType;
}

export const StatsBar: React.FC<StatsBarProps> = ({ stats, symbol }) => {
  const isUp = stats && stats.chg !== null && stats.chg >= 0;
  const isFundingUp = stats && stats.funding !== null && stats.funding >= 0;

  return (
    <section className="stats" aria-label="Market statistics" id="statsBar">
      <div className="stat" id="stat-price">
        <div className="stat-label">Price</div>
        <div className="stat-value">{stats ? formatPrice(stats.price, symbol) : "..."}</div>
      </div>
      <div className="stat" id="stat-change">
        <div className="stat-label">24h Move</div>
        <div
          className={`stat-value ${
            stats && stats.chg !== null ? (isUp ? "text-[var(--up)]" : "text-[var(--down)]") : ""
          }`}
        >
          {stats ? formatPct(stats.chg) : "..."}
        </div>
      </div>
      <div className="stat" id="stat-high">
        <div className="stat-label">24h High</div>
        <div className="stat-value">{stats ? formatPrice(stats.hi, symbol) : "..."}</div>
      </div>
      <div className="stat" id="stat-low">
        <div className="stat-label">24h Low</div>
        <div className="stat-value">{stats ? formatPrice(stats.lo, symbol) : "..."}</div>
      </div>
      <div className="stat" id="stat-volume">
        <div className="stat-label">Volume</div>
        <div className="stat-value">{stats ? formatCompactUsd(stats.vol) : "..."}</div>
      </div>
      <div className="stat" id="stat-oi">
        <div className="stat-label">Open Interest</div>
        <div className="stat-value">
          {stats && stats.oi !== null ? formatCompactUsd(stats.oi) : "N/A"}
        </div>
      </div>
      <div className="stat" id="stat-funding">
        <div className="stat-label">Funding 8H</div>
        <div
          className={`stat-value ${
            stats && stats.funding !== null ? (isFundingUp ? "text-[var(--up)]" : "text-[var(--down)]") : ""
          }`}
        >
          {stats && stats.funding !== null ? formatPct(stats.funding, 4) : "N/A"}
        </div>
      </div>
    </section>
  );
};
