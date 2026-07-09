import React, { useState } from "react";
import { SymbolType, DemoAccount, OpenPosition, ClosedTrade } from "../types";
import { Trash2, AlertCircle, TrendingUp, TrendingDown, Clock, Shield, Database } from "lucide-react";

interface DemoPositionsPanelProps {
  symbol: SymbolType;
  demoAccount: DemoAccount;
  prices: Record<SymbolType, number>;
  onClosePosition: (id: string, isManual?: boolean) => void;
  onForceFunding: (id: string) => void;
}

export const DemoPositionsPanel: React.FC<DemoPositionsPanelProps> = ({
  symbol,
  demoAccount,
  prices,
  onClosePosition,
  onForceFunding,
}) => {
  const [activeTab, setActiveTab] = useState<
    "positions" | "assets" | "risk" | "orders" | "twap" | "history" | "orderHistory"
  >("positions");
  const [marketFilter, setMarketFilter] = useState<"ALL" | "FUTURES" | "OPTIONS">("ALL");
  const [hideOtherMarkets, setHideOtherMarkets] = useState<boolean>(false);
  const [sideFilter, setSideFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");

  const { balance, currency, openPositions, closedTrades } = demoAccount;

  // Calculate lifetime statistics from closedTrades
  const totalTrades = closedTrades.length;
  const winningTrades = closedTrades.filter((t) => t.pnl > 0);
  const losingTrades = closedTrades.filter((t) => t.pnl < 0);
  const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

  const totalWinAmount = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const totalLossAmount = losingTrades.reduce((sum, t) => sum + t.pnl, 0);

  const avgWin = winningTrades.length > 0 ? totalWinAmount / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? totalLossAmount / losingTrades.length : 0;

  // Filter positions
  const filteredPositions = openPositions.filter((pos) => {
    if (hideOtherMarkets && pos.symbol !== symbol) return false;
    if (sideFilter !== "ALL" && pos.direction !== sideFilter) return false;
    return true;
  });

  // Filter closed trades
  const filteredClosedTrades = closedTrades.filter((t) => {
    if (hideOtherMarkets && t.symbol !== symbol) return false;
    if (sideFilter !== "ALL" && t.direction !== sideFilter) return false;
    return true;
  });

  // Get current P&L of a single position
  const getPositionPnl = (pos: OpenPosition) => {
    const currentPrice = prices[pos.symbol] || pos.entryPrice;
    const directionMult = pos.direction === "LONG" ? 1 : -1;
    const priceRatio = (currentPrice - pos.entryPrice) / pos.entryPrice;
    return priceRatio * pos.size * directionMult;
  };

  return (
    <div className="w-full bg-[#080a0f] border-t border-white/10 flex flex-col h-[280px] min-h-[280px]" id="demoPositionsPanel">
      {/* 1. Panel Tabs Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 bg-[#05060a]">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("positions")}
            className={`px-3 py-2 text-xs font-semibold tracking-wide border-b-2 transition-all ${
              activeTab === "positions"
                ? "border-[var(--up)] text-white font-bold"
                : "border-transparent text-[var(--muted)] hover:text-white"
            }`}
          >
            Positions ({openPositions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("assets")}
            className={`px-3 py-2 text-xs font-semibold tracking-wide border-b-2 transition-all ${
              activeTab === "assets"
                ? "border-[var(--up)] text-white font-bold"
                : "border-transparent text-[var(--muted)] hover:text-white"
            }`}
          >
            Assets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("risk")}
            className={`px-3 py-2 text-xs font-semibold tracking-wide border-b-2 transition-all ${
              activeTab === "risk"
                ? "border-[var(--up)] text-white font-bold"
                : "border-transparent text-[var(--muted)] hover:text-white"
            }`}
          >
            Risk
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`px-3 py-2 text-xs font-semibold tracking-wide border-b-2 transition-all ${
              activeTab === "orders"
                ? "border-[var(--up)] text-white font-bold"
                : "border-transparent text-[var(--muted)] hover:text-white"
            }`}
          >
            Open Orders (0)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("twap")}
            className={`px-3 py-2 text-xs font-semibold tracking-wide border-b-2 transition-all ${
              activeTab === "twap"
                ? "border-[var(--up)] text-white font-bold"
                : "border-transparent text-[var(--muted)] hover:text-white"
            }`}
          >
            TWAP
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`px-3 py-2 text-xs font-semibold tracking-wide border-b-2 transition-all ${
              activeTab === "history"
                ? "border-[var(--up)] text-white font-bold"
                : "border-transparent text-[var(--muted)] hover:text-white"
            }`}
          >
            Trade History ({closedTrades.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("orderHistory")}
            className={`px-3 py-2 text-xs font-semibold tracking-wide border-b-2 transition-all ${
              activeTab === "orderHistory"
                ? "border-[var(--up)] text-white font-bold"
                : "border-transparent text-[var(--muted)] hover:text-white"
            }`}
          >
            Order History
          </button>
        </div>
        <div className="text-[10px] text-[var(--muted)] flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--up)] animate-ping"></span>
          <span className="font-mono text-white">● Connected to Binance Engine</span>
        </div>
      </div>

      {/* 2. Sub-Toolbar Filters */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#080a0f] border-b border-white/5 text-[11px]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMarketFilter("ALL")}
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              marketFilter === "ALL" ? "bg-white/10 text-white" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setMarketFilter("FUTURES")}
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              marketFilter === "FUTURES" ? "bg-white/10 text-white" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            Futures
          </button>
          <button
            type="button"
            onClick={() => setMarketFilter("OPTIONS")}
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              marketFilter === "OPTIONS" ? "bg-white/10 text-white" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            Options
          </button>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-[var(--muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideOtherMarkets}
              onChange={(e) => setHideOtherMarkets(e.target.checked)}
              className="rounded border-white/15 bg-black/40 text-[var(--up)] focus:ring-0 w-3 h-3 cursor-pointer"
            />
            <span>Hide Other Markets</span>
          </label>

          <div className="flex items-center gap-1 text-[var(--muted)]">
            <span>Side</span>
            <select
              value={sideFilter}
              onChange={(e) => setSideFilter(e.target.value as any)}
              className="bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white outline-none cursor-pointer hover:border-white/20"
            >
              <option value="ALL">All</option>
              <option value="LONG">Long</option>
              <option value="SHORT">Short</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Main Display Area with Scroll */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0 bg-[#05060a]">
        {/* Lifetime Performance Summary Card */}
        <div className="mb-4 p-3 bg-gradient-to-r from-white/[0.01] to-white/[0.02] border border-white/5 rounded-lg flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4 select-none">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-[#14ccc0]/5 border border-[#14ccc0]/10">
              <TrendingUp className="w-4 h-4 text-[#14ccc0]" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--muted)] block">Performance Summary</span>
              <span className="text-[9px] text-white/50 block font-mono">Based on {closedTrades.length} closed perpetual logs</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:gap-6 font-mono text-right flex-1 md:flex-none justify-items-end">
            <div>
              <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--muted)] block">Total Trades</span>
              <span className="text-xs font-bold text-white block">{totalTrades}</span>
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--muted)] block">Win Rate</span>
              <span className={`text-xs font-bold block ${winRate >= 50 ? "text-[var(--up)]" : winRate > 0 ? "text-[var(--down)]" : "text-white"}`}>
                {winRate.toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--muted)] block">Avg Win</span>
              <span className="text-xs font-bold text-[var(--up)] block">
                ${avgWin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--muted)] block">Avg Loss</span>
              <span className="text-xs font-bold text-[var(--down)] block">
                {avgLoss !== 0 ? "-" : ""}${Math.abs(avgLoss).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {activeTab === "positions" && (
          <div className="w-full">
            {filteredPositions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-xs text-[var(--muted)]">
                <Database className="w-6 h-6 mb-2 text-white/10" />
                <span>No active open positions. Submit a ticket in the sidebar to open.</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] font-bold uppercase text-[var(--muted)]">
                    <th className="pb-2">Market</th>
                    <th className="pb-2">Side / Lev</th>
                    <th className="pb-2">Size</th>
                    <th className="pb-2">Entry Price</th>
                    <th className="pb-2">Mark Price</th>
                    <th className="pb-2">Liq. Price</th>
                    <th className="pb-2">Margin Allocated</th>
                    <th className="pb-2 text-right">Unrealized P&L</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPositions.map((pos) => {
                    const price = prices[pos.symbol] || pos.entryPrice;
                    const pnl = getPositionPnl(pos);
                    const pnlPercent = (pnl / pos.margin) * 100;
                    const isProfit = pnl >= 0;

                    // Liquidation Price calculation
                    const liqPrice = pos.direction === "LONG"
                      ? pos.entryPrice * (1 - 1 / pos.leverage)
                      : pos.entryPrice * (1 + 1 / pos.leverage);

                    return (
                      <tr key={pos.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="py-2.5 font-bold text-white flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${pos.direction === "LONG" ? "bg-[var(--up)]" : "bg-[var(--down)]"}`}></span>
                          {pos.symbol}-USD <span className="text-[9px] font-bold text-[var(--muted)] font-mono ml-0.5">PERP</span>
                        </td>
                        <td className="py-2.5">
                          <span className={`px-1.5 py-0.5 text-[9px] font-extrabold rounded ${
                            pos.direction === "LONG" ? "bg-[var(--up-soft)] text-[var(--up)]" : "bg-[var(--down-soft)] text-[var(--down)]"
                          }`}>
                            {pos.direction} {pos.leverage}x
                          </span>
                        </td>
                        <td className="py-2.5 font-mono">
                          {pos.symbol === "ETH"
                            ? (pos.size / price).toFixed(3)
                            : (pos.size / price).toFixed(4)}{" "}
                          <span className="text-[10px] text-[var(--muted)]">{pos.symbol}</span>
                        </td>
                        <td className="py-2.5 font-mono text-white/90">
                          ${pos.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 font-mono text-[var(--info)]">
                          ${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 font-mono text-[var(--gold)]">
                          ${liqPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 font-mono text-white/90">
                          ${pos.margin.toFixed(2)} <span className="text-[10px] text-[var(--muted)]">{currency}</span>
                        </td>
                        <td className={`py-2.5 font-mono font-extrabold text-right ${isProfit ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                          <div>{isProfit ? "+" : ""}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-[10px] font-normal">{isProfit ? "▲" : "▼"}{pnlPercent.toFixed(1)}%</div>
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex gap-1.5 justify-end">
                            <button
                              type="button"
                              onClick={() => onForceFunding(pos.id)}
                              className="px-2 py-0.5 text-[9px] font-bold bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded transition"
                              title="Simulate Bybit 8-Hour Funding rate execution"
                            >
                              Funding
                            </button>
                            <button
                              type="button"
                              onClick={() => onClosePosition(pos.id, true)}
                              className="px-2.5 py-0.5 text-[9px] font-bold bg-[var(--down)] hover:bg-opacity-80 text-white rounded shadow transition"
                            >
                              Market Close
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "assets" && (
          <div className="grid grid-cols-4 gap-4 p-2">
            <div className="p-3 border border-white/5 rounded-lg bg-white/[0.01]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] block">Wallet Balance</span>
              <span className="text-lg font-black text-white block mt-1">
                {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                <span className="text-xs text-[var(--muted)]">{currency}</span>
              </span>
            </div>
            <div className="p-3 border border-white/5 rounded-lg bg-white/[0.01]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] block">Net Equity (MTM)</span>
              <span className="text-lg font-black text-[var(--info)] block mt-1">
                {(() => {
                  const totalPnl = openPositions.reduce((total, pos) => total + getPositionPnl(pos), 0);
                  return (balance + totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                })()}{" "}
                <span className="text-xs text-[var(--muted)]">{currency}</span>
              </span>
            </div>
            <div className="p-3 border border-white/5 rounded-lg bg-white/[0.01]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] block">Margin Allocated</span>
              <span className="text-lg font-black text-white block mt-1">
                {openPositions.reduce((total, pos) => total + pos.margin, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                <span className="text-xs text-[var(--muted)]">{currency}</span>
              </span>
            </div>
            <div className="p-3 border border-white/5 rounded-lg bg-white/[0.01]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] block">Available Free Margin</span>
              <span className="text-lg font-black text-[var(--up)] block mt-1">
                {(() => {
                  const totalPnl = openPositions.reduce((total, pos) => total + getPositionPnl(pos), 0);
                  const marginUsed = openPositions.reduce((total, pos) => total + pos.margin, 0);
                  return Math.max(0, balance + totalPnl - marginUsed).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                })()}{" "}
                <span className="text-xs text-[var(--muted)]">{currency}</span>
              </span>
            </div>
          </div>
        )}

        {activeTab === "risk" && (
          <div className="text-xs text-[var(--text)] leading-relaxed flex flex-col gap-3 max-w-4xl">
            <h3 className="text-white font-bold text-sm flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[var(--up)]" />
              Isolated Margin Risk Mitigation System
            </h3>
            <p>
              Under our simulated demo parameters, we execute positions using strict **Isolated Margin**, meaning that the loss of any single position is strictly limited to the allocated margin collateral assigned when the ticket was opened.
            </p>
            <p className="text-[var(--gold)]">
              **Liquidation Rules:** Perpetual futures contracts carry leveraged risk. A liquidation is automatically triggered if the live asset price crosses your liquidation price. Your liquidation threshold is defined as when position losses equal **100% of your allocated margin**.
            </p>
            <div className="grid grid-cols-2 gap-4 mt-1 border-t border-white/5 pt-3">
              <div>
                <strong className="text-white block mb-1">LONG Perpetual Equation:</strong>
                <code className="text-white font-mono bg-white/5 p-1 rounded text-[10px]">Liq Price = Entry Price * (1 - 1 / Leverage)</code>
              </div>
              <div>
                <strong className="text-white block mb-1">SHORT Perpetual Equation:</strong>
                <code className="text-white font-mono bg-white/5 p-1 rounded text-[10px]">Liq Price = Entry Price * (1 + 1 / Leverage)</code>
              </div>
            </div>
          </div>
        )}

        {activeTab === "orders" && (
          <div className="flex flex-col items-center justify-center py-10 text-xs text-[var(--muted)]">
            <Clock className="w-6 h-6 mb-2 text-white/10" />
            <span>All limits and triggers are executed instantly as **Market Orders** in paper mode. No active offline orders found.</span>
          </div>
        )}

        {activeTab === "twap" && (
          <div className="text-xs text-[var(--muted)] leading-relaxed flex flex-col gap-2 max-w-xl">
            <h4 className="text-white font-bold text-sm">Institutional Time-Weighted Average Price (TWAP) Execution</h4>
            <p>
              Simulate high-volume institutional execution blocks. Instead of triggering market impact, TWAP executes orders in sliced increments over a custom time span (e.g., 5 mins, 1 hour).
            </p>
            <div className="mt-2 p-3 bg-white/[0.01] border border-white/5 rounded flex items-center justify-between">
              <span>Dynamic TWAP Algorithm:</span>
              <button
                type="button"
                className="px-3 py-1 bg-white/5 border border-white/10 text-white rounded text-xs font-bold hover:bg-white/10"
                onClick={() => alert("TWAP active simulation is configured automatically during high volatility playbooks.")}
              >
                Configure TWAP Slices
              </button>
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="w-full">
            {filteredClosedTrades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-xs text-[var(--muted)]">
                <Clock className="w-6 h-6 mb-2 text-white/10" />
                <span>No historical trades in this session.</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] font-bold uppercase text-[var(--muted)]">
                    <th className="pb-2">Market</th>
                    <th className="pb-2">Side / Lev</th>
                    <th className="pb-2">Entry Price</th>
                    <th className="pb-2">Exit Price</th>
                    <th className="pb-2">Closed Reason</th>
                    <th className="pb-2">Duration</th>
                    <th className="pb-2">Fees Paid</th>
                    <th className="pb-2 text-right">Realized P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClosedTrades.map((t) => {
                    const isProfit = t.pnl >= 0;
                    const closeReasonLabel = {
                      stop: "🛑 STOP LOSS",
                      target: "🎯 TAKE PROFIT",
                      manual: "⚡ MANUAL",
                      liquidation: "⚠️ LIQUIDATED"
                    }[t.closeReason];

                    return (
                      <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="py-2.5 font-bold text-white flex items-center gap-1">
                          {t.symbol}-USD <span className="text-[9px] font-bold text-[var(--muted)] ml-0.5">PERP</span>
                        </td>
                        <td className="py-2.5">
                          <span className={`px-1.5 py-0.5 text-[9px] font-extrabold rounded ${
                            t.direction === "LONG" ? "bg-[var(--up-soft)] text-[var(--up)]" : "bg-[var(--down-soft)] text-[var(--down)]"
                          }`}>
                            {t.direction} {t.leverage}x
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-white/70">${t.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 font-mono text-white/90">${t.exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5">
                          <span className={`px-1.5 py-0.5 text-[9px] font-extrabold rounded uppercase ${
                            t.closeReason === "liquidation"
                              ? "bg-[var(--down-soft)] text-[var(--down)]"
                              : t.closeReason === "stop"
                              ? "bg-white/5 text-white/80"
                              : "bg-[var(--up-soft)] text-[var(--up)]"
                          }`}>
                            {closeReasonLabel}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-white/70">{t.duration}</td>
                        <td className="py-2.5 font-mono text-[var(--muted)]">${t.feePaid.toFixed(3)}</td>
                        <td className={`py-2.5 font-mono font-extrabold text-right ${isProfit ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                          <div>{isProfit ? "+" : ""}${t.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-[10px] font-normal">{isProfit ? "▲" : "▼"}{t.pnlPct.toFixed(1)}%</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "orderHistory" && (
          <div className="w-full">
            {filteredClosedTrades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-xs text-[var(--muted)]">
                <Clock className="w-6 h-6 mb-2 text-white/10" />
                <span>No historical order events recorded.</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] font-bold uppercase text-[var(--muted)]">
                    <th className="pb-2">Time</th>
                    <th className="pb-2">Market</th>
                    <th className="pb-2">Action</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Execution Price</th>
                    <th className="pb-2">Total Size</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClosedTrades.flatMap((t, idx) => {
                    const openTime = new Date(Date.now() - 600000).toLocaleTimeString();
                    const closeTime = new Date(t.closedAt || Date.now()).toLocaleTimeString();
                    return [
                      <tr key={`open-${t.id}-${idx}`} className="border-b border-white/5 text-[11px]">
                        <td className="py-2 text-[var(--muted)] font-mono">{openTime}</td>
                        <td className="py-2 font-bold text-white">{t.symbol}-PERP</td>
                        <td className="py-2">
                          <span className={t.direction === "LONG" ? "text-[var(--up)] font-bold" : "text-[var(--down)] font-bold"}>
                            OPEN {t.direction}
                          </span>
                        </td>
                        <td className="py-2 text-[var(--muted)]">Market</td>
                        <td className="py-2 font-mono">${t.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 font-mono">${t.size.toLocaleString()}</td>
                        <td className="py-2 text-[var(--up)] font-bold">Filled</td>
                      </tr>,
                      <tr key={`close-${t.id}-${idx}`} className="border-b border-white/5 text-[11px]">
                        <td className="py-2 text-[var(--muted)] font-mono">{closeTime}</td>
                        <td className="py-2 font-bold text-white">{t.symbol}-PERP</td>
                        <td className="py-2">
                          <span className={t.direction === "LONG" ? "text-[var(--down)] font-bold" : "text-[var(--up)] font-bold"}>
                            CLOSE {t.direction === "LONG" ? "SHORT" : "LONG"}
                          </span>
                        </td>
                        <td className="py-2 text-[var(--muted)]">{t.closeReason === "manual" ? "Market" : "Trigger"}</td>
                        <td className="py-2 font-mono">${t.exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 font-mono">${t.size.toLocaleString()}</td>
                        <td className="py-2 text-[var(--up)] font-bold">Filled</td>
                      </tr>
                    ];
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
