import React, { useState, useEffect, useRef } from "react";
import { SymbolType, DemoAccount, OpenPosition, ClosedTrade } from "../types";
import { formatPrice, formatPct } from "../utils/format";
import { Sparkles, ArrowUpRight, ArrowDownRight, RefreshCw, Layers, Check, ChevronDown, BookOpen } from "lucide-react";

interface DemoTradeTabProps {
  symbol: SymbolType;
  currentPrice: number;
  currentFundingRate: number | null;
  demoAccount: DemoAccount | null;
  onInitialize: (currency: "USDC" | "USDT", startingBalance: number) => void;
  onOpenPosition: (position: Omit<OpenPosition, "id" | "openedAt" | "lastFundingAppliedAt" | "feePaid" | "fundingPaid" | "currentPrice">) => string | null;
  onClosePosition: (id: string, isManual?: boolean) => void;
  onForceFunding: (id: string) => void;
  onReset: () => void;
  suggestedSetups: any;
}

export const DemoTradeTab: React.FC<DemoTradeTabProps> = ({
  symbol,
  currentPrice,
  currentFundingRate,
  demoAccount,
  onInitialize,
  onOpenPosition,
  onClosePosition,
  onForceFunding,
  onReset,
  suggestedSetups
}) => {
  // Initialization state
  const [setupCapital, setSetupCapital] = useState<number>(10000);
  const [setupCurrency, setSetupCurrency] = useState<"USDC" | "USDT">("USDT");

  // Pro Ticket State
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [leverage, setLeverage] = useState<number>(50);
  const [marginMode, setMarginMode] = useState<"Cross" | "Isolated">("Isolated");
  const [positionMode, setPositionMode] = useState<"One-Way" | "Hedge">("One-Way");
  const [orderType, setOrderType] = useState<"Market" | "Limit">("Market");

  // Inputs
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [sizeInput, setSizeInput] = useState<string>("1.5");
  const [sizeUnit, setSizeUnit] = useState<"CRYPTO" | "USD">("CRYPTO");
  const [reduceOnly, setReduceOnly] = useState<boolean>(false);
  const [tpslChecked, setTpslChecked] = useState<boolean>(true);
  const [stopLossInput, setStopLossInput] = useState<string>("");
  const [takeProfitInput, setTakeProfitInput] = useState<string>("");

  // Dropdown states
  const [showLeverageMenu, setShowLeverageMenu] = useState<boolean>(false);
  const [showMarginModeMenu, setShowMarginModeMenu] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  // Status and feedback
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketSuccess, setTicketSuccess] = useState<string | null>(null);

  // Order Book Dynamic Mock Data
  const [orderBook, setOrderBook] = useState<{
    asks: { price: number; size: number; total: number }[];
    bids: { price: number; size: number; total: number }[];
  }>({ asks: [], bids: [] });

  // Update limit price on currentPrice change if empty
  useEffect(() => {
    if (currentPrice && !limitPrice) {
      setLimitPrice(currentPrice.toString());
    }
  }, [currentPrice]);

  // Generate / update order book simulation
  useEffect(() => {
    if (!currentPrice || currentPrice <= 0) return;

    const generateBook = () => {
      const spread = currentPrice * 0.0004; // narrow spread
      const midPrice = currentPrice;

      const asksList = Array.from({ length: 5 }).map((_, i) => {
        const factor = 1 + (i + 1) * 0.0003;
        const priceVal = midPrice * factor;
        const sizeVal = Math.random() * (symbol === "ETH" ? 12 : 0.8) + 0.1;
        return { price: priceVal, size: sizeVal, total: 0 };
      }).reverse();

      const bidsList = Array.from({ length: 5 }).map((_, i) => {
        const factor = 1 - (i + 1) * 0.0003;
        const priceVal = midPrice * factor;
        const sizeVal = Math.random() * (symbol === "ETH" ? 14 : 0.9) + 0.1;
        return { price: priceVal, size: sizeVal, total: 0 };
      });

      // Calculate totals
      let askTotal = 0;
      const asks = asksList.map((item) => {
        askTotal += item.size;
        return { ...item, total: askTotal };
      });

      let bidTotal = 0;
      const bids = bidsList.map((item) => {
        bidTotal += item.size;
        return { ...item, total: bidTotal };
      });

      return { asks, bids };
    };

    setOrderBook(generateBook() || { asks: [], bids: [] });

    const interval = setInterval(() => {
      setOrderBook((prev) => {
        if (!prev || prev.asks.length === 0) return generateBook() || { asks: [], bids: [] };
        // Jitter prices and sizes slightly
        const jitter = (items: typeof prev.asks) => {
          let runningTotal = 0;
          return items.map((item) => {
            const sizeChange = (Math.random() - 0.5) * (item.size * 0.15);
            const newSize = Math.max(0.01, item.size + sizeChange);
            runningTotal += newSize;
            return {
              ...item,
              size: newSize,
              total: runningTotal
            };
          });
        };
        return {
          asks: jitter(prev.asks),
          bids: jitter(prev.bids)
        };
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [currentPrice, symbol]);

  // Pre-fills for TP/SL from analysis
  useEffect(() => {
    if (suggestedSetups && tpslChecked) {
      const activeSetup = direction === "LONG" ? suggestedSetups.long : suggestedSetups.short;
      if (activeSetup) {
        const parsedStop = parseFloat(activeSetup.stop?.replace(/,/g, ""));
        const parsedTp = parseFloat(activeSetup.tp1?.replace(/,/g, "") || activeSetup.tp2?.replace(/,/g, ""));
        if (!isNaN(parsedStop)) setStopLossInput(parsedStop.toString());
        if (!isNaN(parsedTp)) setTakeProfitInput(parsedTp.toString());
      }
    }
  }, [direction, suggestedSetups]);

  // Handle initialization
  if (!demoAccount) {
    return (
      <div className="flex flex-col gap-4">
        <article className="signal-card highlight border-[rgba(23,81,73,0.35)] bg-gradient-to-b from-[rgba(20,204,192,0.06)] to-transparent p-5">
          <div className="card-title text-sm font-extrabold text-[#14ccc0] border-b border-white/10 pb-2 mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Initialize Professional Paper Account
          </div>
          <p className="text-xs text-[var(--muted)] leading-relaxed mb-4">
            Provision a simulated institutional perpetual futures trading client loaded with virtual capital. Gain access to the custom **Bybit/Binance-fidelity order desk**, isolated margin leverage up to **100x**, stop loss triggers, and direct order-book routing.
          </p>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--muted)]">
                Display Collateral Asset
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(["USDT", "USDC"] as const).map((curr) => (
                  <button
                    key={curr}
                    type="button"
                    onClick={() => setSetupCurrency(curr)}
                    className={`py-2 text-xs font-bold rounded-md transition duration-150 border ${
                      setupCurrency === curr
                        ? "bg-[#14ccc0]/10 border-[#14ccc0] text-white"
                        : "bg-white/5 border-white/5 text-[var(--muted)] hover:bg-white/10"
                    }`}
                  >
                    {curr} (Stablecoin)
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-[var(--muted)]">
                <span>Initial Capital Allocation</span>
                <span className="text-[#14ccc0] text-xs font-extrabold">
                  ${setupCapital.toLocaleString()} {setupCurrency}
                </span>
              </div>
              <input
                type="range"
                min="1000"
                max="100000"
                step="1000"
                value={setupCapital}
                onChange={(e) => setSetupCapital(Number(e.target.value))}
                className="w-full accent-[#14ccc0] cursor-pointer"
              />
              <div className="flex justify-between text-[9px] font-bold text-[var(--muted)]">
                <span>$1,000</span>
                <span>$50,000</span>
                <span>$100,000</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onInitialize(setupCurrency, setupCapital)}
              className="mt-2 w-full py-2.5 bg-[#14ccc0] hover:bg-opacity-90 text-black font-extrabold text-xs rounded shadow-lg transition duration-150 uppercase tracking-widest"
            >
              Confirm Account Provision
            </button>
          </div>
        </article>
      </div>
    );
  }

  const { currency, balance, openPositions, closedTrades } = demoAccount;

  // Active position size in active symbol (e.g. ETH size or BTC size)
  const activePosition = openPositions.find((pos) => pos.symbol === symbol);
  const activePosSizeCrypto = activePosition ? activePosition.size / activePosition.entryPrice : 0;

  // Calculations for Order Valuation
  const orderPrice = orderType === "Limit" ? parseFloat(limitPrice) || currentPrice : currentPrice;
  const sizeValue = parseFloat(sizeInput) || 0;

  const orderValueUSD = sizeUnit === "USD"
    ? sizeValue
    : sizeValue * orderPrice;

  const orderSizeCrypto = sizeUnit === "CRYPTO"
    ? sizeValue
    : sizeValue / orderPrice;

  const marginRequired = orderValueUSD / leverage;
  const openFee = orderValueUSD * 0.0005; // 0.05% Taker Fee

  const getPositionPnl = (pos: OpenPosition) => {
    const price = pos.symbol === symbol ? currentPrice : pos.currentPrice;
    const directionMult = pos.direction === "LONG" ? 1 : -1;
    const priceRatio = (price - pos.entryPrice) / pos.entryPrice;
    return priceRatio * pos.size * directionMult;
  };

  const totalUnrealizedPnl = openPositions.reduce((total, pos) => total + getPositionPnl(pos), 0);
  const equity = balance + totalUnrealizedPnl;
  const marginUsed = openPositions.reduce((total, pos) => total + pos.margin, 0);
  const freeMargin = Math.max(0, equity - marginUsed);

  // Liquidation Price calculation
  const calculatedLiqPrice = direction === "LONG"
    ? orderPrice * (1 - 1 / leverage)
    : orderPrice * (1 + 1 / leverage);

  const handlePctClick = (pct: number) => {
    const maxAffordableOrderValue = freeMargin * leverage;
    const calculatedOrderValue = maxAffordableOrderValue * pct;
    
    if (sizeUnit === "USD") {
      setSizeInput(Math.floor(calculatedOrderValue).toString());
    } else {
      setSizeInput((calculatedOrderValue / orderPrice).toFixed(symbol === "ETH" ? 3 : 4));
    }
  };

  // Pre-fill setup trigger
  const handleUseSetup = (setupType: "long" | "short" | "breakout" | "reversal", setupObj: any) => {
    if (!setupObj) return;

    const parsedStop = parseFloat(setupObj.stop?.replace(/,/g, ""));
    const parsedTp = parseFloat(setupObj.tp1?.replace(/,/g, "") || setupObj.tp2?.replace(/,/g, ""));

    setDirection(setupType === "short" ? "SHORT" : "LONG");
    setTpslChecked(true);

    if (!isNaN(parsedStop)) setStopLossInput(parsedStop.toString());
    if (!isNaN(parsedTp)) setTakeProfitInput(parsedTp.toString());

    setTicketSuccess(`Pre-filled ${setupType.toUpperCase()} setup parameters for ${symbol}.`);
    setTimeout(() => setTicketSuccess(null), 3000);
  };

  // Submit Order Handle
  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setTicketError(null);
    setTicketSuccess(null);

    if (orderValueUSD <= 0) {
      setTicketError("Order size must be strictly greater than zero.");
      return;
    }

    if (marginRequired + openFee > freeMargin) {
      setTicketError(`Insufficient margin. Margin requirement ($${marginRequired.toFixed(2)}) plus trading fee ($${openFee.toFixed(2)}) exceeds available free margin ($${freeMargin.toFixed(2)}).`);
      return;
    }

    // TP/SL validation
    let stopLossVal = 0;
    let takeProfitVal: number | null = null;

    if (tpslChecked) {
      stopLossVal = parseFloat(stopLossInput);
      takeProfitVal = takeProfitInput ? parseFloat(takeProfitInput) : null;

      if (isNaN(stopLossVal) || stopLossVal <= 0) {
        setTicketError("A valid Stop Loss trigger price is strictly required when TP/SL is enabled.");
        return;
      }

      if (direction === "LONG" && stopLossVal >= orderPrice) {
        setTicketError("Long Stop Loss price must be strictly below your entry price.");
        return;
      }
      if (direction === "SHORT" && stopLossVal <= orderPrice) {
        setTicketError("Short Stop Loss price must be strictly above your entry price.");
        return;
      }

      if (takeProfitVal !== null) {
        if (direction === "LONG" && takeProfitVal <= orderPrice) {
          setTicketError("Long Take Profit price must be strictly above your entry price.");
          return;
        }
        if (direction === "SHORT" && takeProfitVal >= orderPrice) {
          setTicketError("Short Take Profit price must be strictly below your entry price.");
          return;
        }
      }
    } else {
      // Create defaults based on leverage / market structure if TP/SL unchecked
      stopLossVal = direction === "LONG"
        ? orderPrice * (1 - 0.7 / leverage) // 70% loss default stop
        : orderPrice * (1 + 0.7 / leverage);
    }

    // Submit position
    const error = onOpenPosition({
      symbol,
      direction,
      entryPrice: orderPrice,
      size: orderValueUSD,
      margin: marginRequired,
      leverage,
      stopLoss: stopLossVal,
      takeProfit: takeProfitVal
    });

    if (error) {
      setTicketError(error);
    } else {
      setTicketSuccess(`Simulated ${direction} perpetual contract successfully executed at $${orderPrice.toLocaleString()}.`);
      // Reset input size slightly
      setTimeout(() => setTicketSuccess(null), 4000);
    }
  };

  const handleOrderBookRowClick = (price: number) => {
    if (orderType === "Limit") {
      setLimitPrice(price.toFixed(2));
    }
  };

  return (
    <div className="flex flex-col gap-3 text-xs" id="proTradingTicket">
      
      {/* 1. Header Toolbar Settings Grid */}
      <div className="grid grid-cols-3 gap-1 mb-1">
        
        {/* Leverage Button Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowLeverageMenu(!showLeverageMenu);
              setShowMarginModeMenu(false);
            }}
            className="w-full py-1.5 px-2 bg-[#0d111a] hover:bg-white/5 border border-white/10 rounded flex items-center justify-between text-white font-mono text-[10px] font-bold"
          >
            <span>Leverage</span>
            <span className="text-[#14ccc0] font-black">{leverage}x</span>
          </button>
          {showLeverageMenu && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#121622] border border-white/15 rounded shadow-2xl z-50 p-2 text-center">
              <span className="text-[9px] uppercase font-bold text-[var(--muted)]">Adjust Margin Leverage</span>
              <div className="grid grid-cols-4 gap-1 my-2">
                {[5, 10, 25, 50, 75, 100].map((lev) => (
                  <button
                    key={lev}
                    type="button"
                    onClick={() => {
                      setLeverage(lev);
                      setShowLeverageMenu(false);
                    }}
                    className={`py-1 text-[9px] font-bold font-mono rounded ${
                      leverage === lev ? "bg-[#14ccc0] text-black" : "bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    {lev}x
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1 mt-1 border-t border-white/5 pt-1">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="w-full accent-[#14ccc0] cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Margin Mode Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowMarginModeMenu(!showMarginModeMenu);
              setShowLeverageMenu(false);
            }}
            className="w-full py-1.5 px-2 bg-[#0d111a] hover:bg-white/5 border border-white/10 rounded flex items-center justify-between text-white font-mono text-[10px] font-bold"
          >
            <span>Margin</span>
            <span className="text-white font-black">{marginMode}</span>
          </button>
          {showMarginModeMenu && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#121622] border border-white/15 rounded shadow-2xl z-50 p-1 flex flex-col gap-1">
              {["Isolated", "Cross"].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setMarginMode(mode as any);
                    setShowMarginModeMenu(false);
                  }}
                  className={`py-1 text-left px-2 rounded text-[10px] font-bold ${
                    marginMode === mode ? "bg-[#14ccc0]/10 text-[#14ccc0]" : "text-white hover:bg-white/5"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Position Mode Button */}
        <button
          type="button"
          onClick={() => setPositionMode((prev) => prev === "One-Way" ? "Hedge" : "One-Way")}
          className="w-full py-1.5 px-2 bg-[#0d111a] hover:bg-white/5 border border-white/10 rounded flex items-center justify-between text-white font-mono text-[10px] font-bold"
        >
          <span>Mode</span>
          <span className="text-[var(--muted)] font-black">{positionMode}</span>
        </button>
      </div>

      {/* 2. Order Type Tab bar & Buy/Sell Toggle Button Pair */}
      <div className="grid grid-cols-2 gap-2 bg-[#0b0e14] p-1 border border-white/5 rounded-md">
        
        {/* Market vs Limit tab */}
        <div className="grid grid-cols-2 gap-0.5 bg-black/40 p-0.5 rounded border border-white/5">
          <button
            type="button"
            onClick={() => setOrderType("Market")}
            className={`py-1 text-[10px] font-bold rounded transition-all ${
              orderType === "Market" ? "bg-white/10 text-white" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            Market
          </button>
          <button
            type="button"
            onClick={() => setOrderType("Limit")}
            className={`py-1 text-[10px] font-bold rounded transition-all ${
              orderType === "Limit" ? "bg-white/10 text-white" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            Limit
          </button>
        </div>

        {/* Buy (Long) / Sell (Short) */}
        <div className="grid grid-cols-2 gap-1 font-bold text-[10px]">
          <button
            type="button"
            onClick={() => setDirection("LONG")}
            className={`py-1.5 rounded transition-all tracking-wider ${
              direction === "LONG"
                ? "bg-[#14ccc0] text-black font-extrabold shadow-md"
                : "bg-white/5 text-[var(--muted)] hover:bg-white/10 hover:text-white"
            }`}
          >
            BUY
          </button>
          <button
            type="button"
            onClick={() => setDirection("SHORT")}
            className={`py-1.5 rounded transition-all tracking-wider ${
              direction === "SHORT"
                ? "bg-[var(--down)] text-white font-extrabold shadow-md"
                : "bg-white/5 text-[var(--muted)] hover:bg-white/10 hover:text-white"
            }`}
          >
            SELL
          </button>
        </div>
      </div>

      {/* 3. Available balance row */}
      <div className="flex justify-between items-center text-[10px] text-[var(--muted)] font-mono px-0.5">
        <span>Current Position: <strong className="text-white font-bold">{activePosSizeCrypto.toFixed(3)} {symbol}</strong></span>
        <span>Available: <strong className="text-white font-bold">${freeMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</strong></span>
      </div>

      {/* 4. Main inputs block */}
      <form onSubmit={handleSubmitOrder} className="flex flex-col gap-2.5">
        
        {/* Limit Price Input Field */}
        {orderType === "Limit" && (
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--muted)]">Order Entry Price</span>
            <div className="flex items-center bg-[#0d111a] border border-white/10 rounded px-2.5 py-1.5 focus-within:border-[#14ccc0]/50 transition">
              <span className="text-[10px] font-bold text-[var(--muted)] mr-2 font-mono">USD</span>
              <input
                type="number"
                step="any"
                required
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                className="w-full text-xs font-mono font-bold bg-transparent text-white outline-none"
                placeholder={currentPrice.toString()}
              />
            </div>
          </div>
        )}

        {/* Size Input Box with Segmented Units Picker */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[9px] uppercase font-bold tracking-wider text-[var(--muted)]">
            <span>Size</span>
            <div className="flex gap-1 bg-black/40 p-0.5 border border-white/5 rounded">
              <button
                type="button"
                onClick={() => setSizeUnit("CRYPTO")}
                className={`px-2 py-0.5 rounded text-[8px] font-bold transition-all ${
                  sizeUnit === "CRYPTO" ? "bg-[#14ccc0]/10 text-[#14ccc0] font-black" : "text-[var(--muted)] hover:text-white"
                }`}
              >
                {symbol}
              </button>
              <button
                type="button"
                onClick={() => setSizeUnit("USD")}
                className={`px-2 py-0.5 rounded text-[8px] font-bold transition-all ${
                  sizeUnit === "USD" ? "bg-[#14ccc0]/10 text-[#14ccc0] font-black" : "text-[var(--muted)] hover:text-white"
                }`}
              >
                USD
              </button>
            </div>
          </div>

          <div className="flex items-center bg-[#0d111a] border border-white/10 rounded px-2.5 py-1.5 focus-within:border-[#14ccc0]/50 transition">
            <input
              type="number"
              step="any"
              required
              value={sizeInput}
              onChange={(e) => setSizeInput(e.target.value)}
              className="w-full text-xs font-mono font-bold bg-transparent text-white outline-none"
              placeholder="0.00"
            />
            <span className="text-[10px] font-bold text-[#14ccc0] font-mono ml-2">
              {sizeUnit === "CRYPTO" ? symbol : "USD"}
            </span>
          </div>
        </div>

        {/* 5. Percentage Slider Bar with ticks */}
        <div className="flex flex-col gap-1 mt-1">
          <div className="flex justify-between text-[8px] font-black text-[var(--muted)] tracking-wider">
            {[0, 0.25, 0.5, 0.75, 1].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePctClick(p === 0 ? 0.05 : p)}
                className="hover:text-white transition duration-150 py-0.5 px-1 bg-white/[0.02] border border-white/5 rounded hover:bg-white/10 font-mono"
              >
                {p * 100}%
              </button>
            ))}
          </div>
        </div>

        {/* 6. Checkboxes (Reduce Only / TP SL) */}
        <div className="flex items-center justify-between text-[10px] text-[var(--muted)] mt-1.5 px-0.5 border-t border-white/5 pt-2">
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-white select-none transition">
            <input
              type="checkbox"
              checked={reduceOnly}
              onChange={(e) => setReduceOnly(e.target.checked)}
              className="rounded border-white/10 bg-black/40 text-[#14ccc0] focus:ring-0 w-3.5 h-3.5 cursor-pointer"
            />
            <span>Reduce Only</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer hover:text-white select-none transition">
            <input
              type="checkbox"
              checked={tpslChecked}
              onChange={(e) => setTpslChecked(e.target.checked)}
              className="rounded border-white/10 bg-black/40 text-[#14ccc0] focus:ring-0 w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-white font-bold flex items-center gap-1">
              TP/SL <ChevronDown className={`w-3.5 h-3.5 transition-transform ${tpslChecked ? "rotate-180" : ""}`} />
            </span>
          </label>
        </div>

        {/* 7. Collapsible TP/SL inputs */}
        {tpslChecked && (
          <div className="grid grid-cols-2 gap-2 p-2 rounded bg-black/35 border border-white/5 mt-1 animate-fade-in text-left">
            <div className="flex flex-col gap-1">
              <span className="text-[8px] uppercase font-bold text-[var(--muted)]">Take Profit Trigger Price</span>
              <input
                type="number"
                step="any"
                placeholder="Target TP Price"
                value={takeProfitInput}
                onChange={(e) => setTakeProfitInput(e.target.value)}
                className="text-xs font-mono border border-white/10 bg-black/40 text-white px-2 py-1 rounded outline-none focus:border-[#14ccc0]/40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] uppercase font-bold text-[var(--muted)]">Stop Loss (MANDATORY Price)</span>
              <input
                type="number"
                step="any"
                required
                placeholder="Exit SL Price"
                value={stopLossInput}
                onChange={(e) => setStopLossInput(e.target.value)}
                className="text-xs font-mono border border-white/10 bg-black/40 text-white px-2 py-1 rounded outline-none focus:border-[#14ccc0]/40"
              />
            </div>
          </div>
        )}

        {/* 8. Error and Success notifications */}
        {ticketError && (
          <div className="p-2 border border-[rgba(240,120,136,0.3)] bg-[var(--down-soft)] text-[var(--down)] font-bold text-[10px] rounded leading-normal text-left">
            {ticketError}
          </div>
        )}
        {ticketSuccess && (
          <div className="p-2 border border-[rgba(65,217,154,0.3)] bg-[var(--up-soft)] text-[var(--up)] font-bold text-[10px] rounded leading-normal text-left">
            {ticketSuccess}
          </div>
        )}

        {/* 9. Large Primary Confirm Button */}
        <button
          type="submit"
          className={`w-full py-2.5 text-black font-extrabold text-xs rounded shadow transition duration-150 uppercase tracking-widest ${
            direction === "LONG"
              ? "bg-[#14ccc0] hover:bg-opacity-90"
              : "bg-[var(--down)] hover:bg-opacity-90 text-white"
          }`}
        >
          Confirm {direction === "LONG" ? "Buy" : "Sell"}
        </button>
      </form>

      {/* 10. Live calculations checklist */}
      <div className="p-2 bg-[#090c12] rounded border border-white/5 text-[10px] flex flex-col gap-1 text-left font-mono leading-relaxed mt-1">
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Liquidation Price:</span>
          <strong className="text-[var(--gold)] font-bold">
            ${calculatedLiqPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Order Value (M):</span>
          <strong className="text-white font-bold">${orderValueUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Margin Req.:</span>
          <strong className="text-white font-bold">${marginRequired.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT</strong>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[var(--muted)] font-mono">Fees (Retail):</span>
          <span className="flex items-center gap-1 font-bold text-white">
            <span className="text-[8px] px-1 bg-[var(--up-soft)] text-[var(--up)] rounded">0% Fees Promo</span>
            <s>${openFee.toFixed(2)}</s>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Max Buy Price:</span>
          <strong className="text-white font-bold">${(orderPrice * 1.0002).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
        </div>
      </div>

      {/* 11. Custom live ticking Order Book Widget */}
      <div className="border border-white/5 rounded bg-[#090c12] p-2.5 flex flex-col gap-1.5 mt-2 text-[10px] text-left">
        <div className="flex items-center justify-between border-b border-white/5 pb-1 mb-1">
          <span className="font-bold text-white flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5 text-[#14ccc0]" />
            Binance Real-Time Order Book
          </span>
          <span className="text-[8px] text-[var(--muted)] font-mono">Unit: {symbol}</span>
        </div>

        {/* Orderbook headers */}
        <div className="grid grid-cols-3 text-[8px] font-bold text-[var(--muted)] tracking-wider uppercase font-mono pb-1">
          <span>Price (USD)</span>
          <span className="text-right">Size ({symbol})</span>
          <span className="text-right">Total ({symbol})</span>
        </div>

        {/* Asks (Sell Orders - descending red rows) */}
        <div className="flex flex-col gap-0.5">
          {orderBook.asks.map((ask, idx) => (
            <div
              key={`ask-${idx}`}
              onClick={() => handleOrderBookRowClick(ask.price)}
              className="grid grid-cols-3 font-mono cursor-pointer hover:bg-white/[0.03] py-0.5 text-right relative overflow-hidden"
            >
              {/* Size fill bar background */}
              <div
                className="absolute top-0 right-0 bottom-0 bg-[var(--down)]/5"
                style={{ width: `${Math.min(100, (ask.total / (symbol === "ETH" ? 60 : 4)) * 100)}%` }}
              ></div>
              <span className="text-[var(--down)] text-left relative z-10">${ask.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              <span className="text-white/80 relative z-10">{ask.size.toFixed(symbol === "ETH" ? 2 : 4)}</span>
              <span className="text-[var(--muted)] relative z-10">{ask.total.toFixed(symbol === "ETH" ? 2 : 4)}</span>
            </div>
          ))}
        </div>

        {/* Current Mid Price ticker */}
        <div className="py-1 border-t border-b border-white/5 bg-white/[0.01] my-0.5 flex justify-between px-1.5 items-center font-mono">
          <strong className="text-white text-xs font-black flex items-center gap-1">
            <span className="text-[#14ccc0] animate-pulse">●</span>
            ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </strong>
          {currentFundingRate !== null && (
            <span className="text-[8px] text-[var(--up)] font-bold">Funding: {currentFundingRate.toFixed(4)}%</span>
          )}
        </div>

        {/* Bids (Buy Orders - green rows) */}
        <div className="flex flex-col gap-0.5">
          {orderBook.bids.map((bid, idx) => (
            <div
              key={`bid-${idx}`}
              onClick={() => handleOrderBookRowClick(bid.price)}
              className="grid grid-cols-3 font-mono cursor-pointer hover:bg-white/[0.03] py-0.5 text-right relative overflow-hidden"
            >
              {/* Size fill bar background */}
              <div
                className="absolute top-0 right-0 bottom-0 bg-[var(--up)]/5"
                style={{ width: `${Math.min(100, (bid.total / (symbol === "ETH" ? 60 : 4)) * 100)}%` }}
              ></div>
              <span className="text-[var(--up)] text-left relative z-10">${bid.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              <span className="text-white/80 relative z-10">{bid.size.toFixed(symbol === "ETH" ? 2 : 4)}</span>
              <span className="text-[var(--muted)] relative z-10">{bid.total.toFixed(symbol === "ETH" ? 2 : 4)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Suggested setups prefill tabs */}
      {suggestedSetups && (
        <div className="border-t border-white/5 mt-2.5 pt-2.5 flex flex-col gap-2">
          <span className="text-[9px] uppercase font-extrabold tracking-wider text-[var(--muted)] text-left px-1">
            Apply Live Playbook Setups
          </span>
          <div className="grid grid-cols-2 gap-2 text-left">
            {suggestedSetups.long && (
              <button
                type="button"
                onClick={() => handleUseSetup("long", suggestedSetups.long)}
                className="p-1.5 bg-white/[0.015] hover:bg-white/[0.04] border border-white/5 hover:border-[#14ccc0]/30 rounded text-[9px] transition"
              >
                <strong className="text-[#14ccc0] block font-bold">Long Setup ({suggestedSetups.long.confidence}%)</strong>
                <span className="text-[var(--muted)] block">Range: {suggestedSetups.long.entry}</span>
                <span className="text-[var(--muted)] block">Stop: ${suggestedSetups.long.stop}</span>
              </button>
            )}
            {suggestedSetups.short && (
              <button
                type="button"
                onClick={() => handleUseSetup("short", suggestedSetups.short)}
                className="p-1.5 bg-white/[0.015] hover:bg-white/[0.04] border border-white/5 hover:border-[var(--down)]/30 rounded text-[9px] transition"
              >
                <strong className="text-[var(--down)] block font-bold">Short Setup ({suggestedSetups.short.confidence}%)</strong>
                <span className="text-[var(--muted)] block">Range: {suggestedSetups.short.entry}</span>
                <span className="text-[var(--muted)] block">Stop: ${suggestedSetups.short.stop}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Danger Zone / Reset */}
      <div className="border-t border-white/5 mt-3 pt-3 flex flex-col gap-2">
        {!showResetConfirm ? (
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="w-full py-1 text-[9px] font-bold text-[var(--muted)] hover:text-white border border-white/5 hover:border-white/10 rounded transition"
          >
            Reset Demo Trading Capital
          </button>
        ) : (
          <div className="flex flex-col gap-1.5 bg-red-950/20 border border-red-500/10 p-2 rounded">
            <span className="text-[9px] text-[var(--down)] font-bold">Wipe active positions & trade logs?</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setShowResetConfirm(false);
                }}
                className="py-1 bg-[var(--down)] text-white font-bold text-[10px] rounded hover:bg-opacity-90"
              >
                Purge Capital
              </button>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="py-1 bg-white/5 text-[var(--muted)] font-bold text-[10px] rounded hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
