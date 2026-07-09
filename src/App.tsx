import { useEffect, useState, useCallback, useRef } from "react";
import {
  Candle,
  SymbolType,
  TimeframeType,
  MarketStats,
  ManualInputs,
  AnalysisResult,
  WeeklyPlaybookResult,
  ExecutionDecisionResult,
  QuantReportResult,
  PriceAlert,
  DemoAccount,
  OpenPosition,
  ClosedTrade
} from "./types";
import { Bell, X, Check, Trash2, ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";
import { StatsBar } from "./components/StatsBar";
import { ChartSection } from "./components/ChartSection";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { DemoPositionsPanel } from "./components/DemoPositionsPanel";
import {
  META,
  TIMEFRAMES,
  cleanCandles,
  generateDemoCandles,
  generatePairDemo,
  deriveTicker,
  buildAnalysis,
  buildWeeklyPlaybook,
  buildExecutionDecision,
  buildQuantReport,
  finite
} from "./utils/math";

export default function App() {
  const [symbol, setSymbol] = useState<SymbolType>("ETH");
  const [timeframe, setTimeframe] = useState<TimeframeType>("1h");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [dataSource, setDataSource] = useState<string>("Loading");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [activeReport, setActiveReport] = useState<"signal" | "weekly" | "execution" | "quant" | "demo">("signal");
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("Loading market data...");
  const [statusKind, setStatusKind] = useState<"ok" | "error" | "">("");

  // Manual inputs kept in parent state so switching tabs doesn't wipe them
  const [manualInputs, setManualInputs] = useState<ManualInputs>({
    btcDominance: null,
    fearGreed: null,
    macro: "",
    flows: "",
    liquidations: ""
  });

  // Cached analysis report structures
  const [signalReport, setSignalReport] = useState<AnalysisResult | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyPlaybookResult | null>(null);
  const [executionReport, setExecutionReport] = useState<ExecutionDecisionResult | null>(null);
  const [quantReport, setQuantReport] = useState<QuantReportResult | null>(null);

  // Price crossing alerts and notifications state
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState<boolean>(false);
  const [toasts, setToasts] = useState<PriceAlert[]>([]);

  // Demo Trading Account State & Persistence Layer
  const [demoAccount, setDemoAccount] = useState<DemoAccount | null>(() => {
    try {
      const saved = localStorage.getItem("cpd_demo_account");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  // Track both assets' live metrics for CONTINUOUS Mark-to-Market (Phase 4)
  const [prices, setPrices] = useState<Record<SymbolType, number>>({ ETH: 0, BTC: 0 });
  const [fundingRates, setFundingRates] = useState<Record<SymbolType, number>>({ ETH: 0.01, BTC: 0.01 });

  useEffect(() => {
    if (demoAccount) {
      localStorage.setItem("cpd_demo_account", JSON.stringify(demoAccount));
    } else {
      localStorage.removeItem("cpd_demo_account");
    }
  }, [demoAccount]);

  // Secure JSON Proxy fetching helper
  const fetchProxyJson = useCallback(async (url: string): Promise<any> => {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Proxy error fetching: ${url}`);
    return response.json();
  }, []);

  // Fetch candles with sequential public exchange queries
  const fetchCandlesData = useCallback(
    async (
      sym: SymbolType,
      tf: TimeframeType,
      limit = 180
    ): Promise<{ candles: Candle[]; source: string; demo: boolean }> => {
      const item = META[sym];
      const tfConfig = TIMEFRAMES[tf];

      const attempts = [
        {
          source: "Binance",
          url: `https://api.binance.com/api/v3/klines?symbol=${item.binance}&interval=${tfConfig.binance}&limit=${limit}`,
          parse: (data: any) => {
            if (!Array.isArray(data)) return [];
            return data.map((c: any) => ({
              t: Math.floor(Number(c[0]) / 1000),
              o: c[1],
              h: c[2],
              l: c[3],
              c: c[4],
              v: c[5]
            }));
          }
        },
        {
          source: "Bybit",
          url: `https://api.bybit.com/v5/market/kline?category=spot&symbol=${item.bybit}&interval=${tfConfig.bybit}&limit=${limit}`,
          parse: (data: any) => {
            if (!data || data.retCode !== 0 || !data.result || !Array.isArray(data.result.list)) return [];
            return data.result.list.map((c: any) => ({
              t: Math.floor(Number(c[0]) / 1000),
              o: c[1],
              h: c[2],
              l: c[3],
              c: c[4],
              v: c[5]
            }));
          }
        }
      ];

      if (tfConfig.coinbase) {
        attempts.push({
          source: "Coinbase",
          url: `https://api.exchange.coinbase.com/products/${item.product}/candles?granularity=${tfConfig.coinbase}`,
          parse: (data: any) => {
            if (!Array.isArray(data)) return [];
            return data.slice(0, limit).map((c: any) => ({
              t: c[0],
              l: c[1],
              h: c[2],
              o: c[3],
              c: c[4],
              v: c[5]
            }));
          }
        });
      }

      for (const attempt of attempts) {
        try {
          const raw = await fetchProxyJson(attempt.url);
          const parsed = cleanCandles(attempt.parse(raw));
          if (parsed.length >= 25) {
            return { candles: parsed.slice(-limit), source: attempt.source, demo: false };
          }
        } catch (error) {
          // Fallback to next exchange option
          continue;
        }
      }

      // Fallback to offline demo generator if public endpoints are blocked or rate limited
      return { candles: generateDemoCandles(sym, tf, limit), source: "Demo Engine", demo: true };
    },
    [fetchProxyJson]
  );

  // Fetch ETHBTC cross pair candles for relative strength ranking
  const fetchPairCandlesData = useCallback(
    async (
      pair: string,
      tf: TimeframeType,
      limit = 180
    ): Promise<{ candles: Candle[]; source: string; demo: boolean }> => {
      const tfConfig = TIMEFRAMES[tf];
      try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${tfConfig.binance}&limit=${limit}`;
        const raw = await fetchProxyJson(url);
        const candles = cleanCandles(
          raw.map((c: any) => ({
            t: Math.floor(Number(c[0]) / 1000),
            o: c[1],
            h: c[2],
            l: c[3],
            c: c[4],
            v: c[5]
          }))
        );
        if (candles.length >= 25) {
          return { candles: candles.slice(-limit), source: "Binance", demo: false };
        }
      } catch (error) {
        // Fallback
      }
      return { candles: generatePairDemo(tf, limit), source: "Demo Engine", demo: true };
    },
    [fetchProxyJson]
  );

  // Fetch 24-hour ticker statistics from exchange REST interfaces
  const fetchTickerData = useCallback(
    async (sym: SymbolType): Promise<Partial<MarketStats> | null> => {
      const item = META[sym];
      try {
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${item.binance}`;
        const data = await fetchProxyJson(url);
        return {
          price: Number(data.lastPrice),
          chg: Number(data.priceChangePercent),
          hi: Number(data.highPrice),
          lo: Number(data.lowPrice),
          vol: Number(data.quoteVolume),
          source: "Binance"
        };
      } catch (error) {
        try {
          const product = item.product;
          const tickerUrl = `https://api.exchange.coinbase.com/products/${product}/ticker`;
          const statsUrl = `https://api.exchange.coinbase.com/products/${product}/stats`;

          const [ticker, stats] = await Promise.all([
            fetchProxyJson(tickerUrl),
            fetchProxyJson(statsUrl)
          ]);

          const price = Number(ticker.price);
          const open = Number(stats.open);
          return {
            price,
            chg: open ? ((price - open) / open) * 100 : null,
            hi: Number(stats.high),
            lo: Number(stats.low),
            vol: Number(stats.volume) * price,
            source: "Coinbase"
          };
        } catch (secondError) {
          return null;
        }
      }
    },
    [fetchProxyJson]
  );

  // Fetch derivatives metrics (OI, funding rate) from Binance USD-M Futures
  const fetchFuturesData = useCallback(
    async (sym: SymbolType, price: number): Promise<Partial<MarketStats>> => {
      const item = META[sym];
      try {
        const oiUrl = `https://fapi.binance.com/fapi/v1/openInterest?symbol=${item.binance}`;
        const fundingUrl = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${item.binance}&limit=1`;

        const [oiRes, fundingRes] = await Promise.allSettled([
          fetchProxyJson(oiUrl),
          fetchProxyJson(fundingUrl)
        ]);

        const oiData = oiRes.status === "fulfilled" ? oiRes.value : null;
        const fundingData = fundingRes.status === "fulfilled" ? fundingRes.value : null;

        const oi = oiData && finite(oiData.openInterest) ? Number(oiData.openInterest) * price : null;
        const funding =
          Array.isArray(fundingData) && fundingData.length && finite(fundingData[0].fundingRate)
            ? Number(fundingData[0].fundingRate) * 100
            : null;

        return { oi, funding };
      } catch (error) {
        return { oi: null, funding: null };
      }
    },
    [fetchProxyJson]
  );

  // Fetch alternative sentiment stats
  const fetchSentimentData = useCallback(async () => {
    const out: { fearGreed: number | null; btcDominance: number | null } = {
      fearGreed: null,
      btcDominance: null
    };
    try {
      const fngData = await fetchProxyJson("https://api.alternative.me/fng/?limit=1");
      if (fngData && fngData.data && fngData.data[0]) {
        out.fearGreed = Number(fngData.data[0].value);
      }
    } catch (e) {
      // Ignored
    }
    try {
      const cgData = await fetchProxyJson("https://api.coingecko.com/api/v3/global");
      if (cgData && cgData.data && cgData.data.market_cap_percentage && cgData.data.market_cap_percentage.btc) {
        out.btcDominance = Number(cgData.data.market_cap_percentage.btc);
      }
    } catch (e) {
      // Ignored
    }
    return out;
  }, [fetchProxyJson]);

  // Aggregate multi-timeframe dataset for institutional math models
  const collectInstitutionalData = useCallback(async () => {
    const frameNames: TimeframeType[] = ["5m", "15m", "1h", "4h", "1D"];
    const limits = { "5m": 260, "15m": 260, "1h": 180, "4h": 180, "1D": 365 };

    const [ethFrames, btcFrames, ethbtcFrames, ethTickerRaw, btcTickerRaw, sentimentRaw] = await Promise.all([
      Promise.all(frameNames.map(async (tf) => [tf, (await fetchCandlesData("ETH", tf, limits[tf])).candles])),
      Promise.all(frameNames.map(async (tf) => [tf, (await fetchCandlesData("BTC", tf, limits[tf])).candles])),
      Promise.all(frameNames.map(async (tf) => [tf, (await fetchPairCandlesData("ETHBTC", tf, limits[tf])).candles])),
      fetchTickerData("ETH"),
      fetchTickerData("BTC"),
      fetchSentimentData()
    ]);

    const ethFramesMap = Object.fromEntries(ethFrames);
    const btcFramesMap = Object.fromEntries(btcFrames);
    const ethbtcFramesMap = Object.fromEntries(ethbtcFrames);

    const ethTicker = Object.assign({}, deriveTicker(ethFramesMap["1h"] || ethFramesMap["1D"]), ethTickerRaw || {});
    const btcTicker = Object.assign({}, deriveTicker(btcFramesMap["1h"] || btcFramesMap["1D"]), btcTickerRaw || {});

    const [ethFutures, btcFutures] = await Promise.all([
      fetchFuturesData("ETH", ethTicker.price || 0),
      fetchFuturesData("BTC", btcTicker.price || 0)
    ]);

    const sentiment = {
      btcDominance: manualInputs.btcDominance ?? sentimentRaw.btcDominance,
      fearGreed: manualInputs.fearGreed ?? sentimentRaw.fearGreed
    };

    return {
      eth: { frames: ethFramesMap, ticker: ethTicker, futures: ethFutures },
      btc: { frames: btcFramesMap, ticker: btcTicker, futures: btcFutures },
      ethbtc: { frames: ethbtcFramesMap },
      sentiment,
      manual: manualInputs,
      generatedAt: new Date()
    };
  }, [fetchCandlesData, fetchPairCandlesData, fetchTickerData, fetchFuturesData, fetchSentimentData, manualInputs]);

  // Trigger Calculations
  const runAnalysis = useCallback(
    async (reportType: "signal" | "weekly" | "execution" | "quant") => {
      if (!candles.length || isAnalyzing) return;
      setIsAnalyzing(true);

      try {
        if (reportType === "signal") {
          // Signal report reads multi-timeframe candles
          const frameNames: TimeframeType[] = ["15m", "1h", "4h", "1D"];
          const frameResults = await Promise.all(
            frameNames.map(async (tf) => {
              if (tf === timeframe) return [tf, candles];
              const pack = await fetchCandlesData(symbol, tf, 90);
              return [tf, pack.candles];
            })
          );
          const frames = Object.fromEntries(frameResults);
          const result = buildAnalysis(frames);
          setSignalReport(result);
        } else {
          // Institutional reports read full aggregated dataset
          const pack = await collectInstitutionalData();
          if (reportType === "weekly") {
            setWeeklyReport(buildWeeklyPlaybook(pack));
          } else if (reportType === "execution") {
            setExecutionReport(buildExecutionDecision(pack));
          } else if (reportType === "quant") {
            setQuantReport(buildQuantReport(pack));
          }
        }
      } catch (e: any) {
        setStatusMessage(`Analysis Failed: ${e.message || e}`);
        setStatusKind("error");
      } finally {
        setIsAnalyzing(false);
      }
    },
    [candles, timeframe, symbol, isAnalyzing, fetchCandlesData, collectInstitutionalData]
  );

  // Load Chart Candles and Core Stats
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setStatusKind("");
    setStatusMessage("Loading market data...");

    try {
      const otherSym: SymbolType = symbol === "ETH" ? "BTC" : "ETH";

      // Fetch active asset candles, plus parallel tickers & futures for both assets (Phase 4 MTM)
      const [candlePack, ticker, otherTicker, futures, otherFutures] = await Promise.all([
        fetchCandlesData(symbol, timeframe, 180),
        fetchTickerData(symbol),
        fetchTickerData(otherSym),
        fetchFuturesData(symbol, 0),
        fetchFuturesData(otherSym, 0)
      ]);

      const derived = deriveTicker(candlePack.candles);
      const mergedTicker = Object.assign({}, derived, ticker || {});

      const computedStats: MarketStats = {
        price: mergedTicker.price || null,
        chg: mergedTicker.chg !== undefined ? mergedTicker.chg : null,
        hi: mergedTicker.hi || null,
        lo: mergedTicker.lo || null,
        vol: mergedTicker.vol || null,
        oi: futures.oi !== undefined ? futures.oi : null,
        funding: futures.funding !== undefined ? futures.funding : null,
        source: candlePack.source,
        demo: candlePack.demo
      };

      setCandles(candlePack.candles);
      setDataSource(candlePack.source);
      setStats(computedStats);

      // Populate live feed for mark-to-market calculations of open positions
      const ethPrice = symbol === "ETH" ? mergedTicker.price : (otherTicker?.price || 3250);
      const btcPrice = symbol === "BTC" ? mergedTicker.price : (otherTicker?.price || 104000);
      const ethFunding = symbol === "ETH" ? futures.funding : (otherFutures?.funding || 0.01);
      const btcFunding = symbol === "BTC" ? futures.funding : (otherFutures?.funding || 0.01);

      setPrices({
        ETH: ethPrice || 3250,
        BTC: btcPrice || 104000
      });

      setFundingRates({
        ETH: ethFunding ?? 0.01,
        BTC: btcFunding ?? 0.01
      });

      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (candlePack.demo) {
        setStatusKind("error");
        setStatusMessage(`Demo data shown at ${timestamp}`);
      } else {
        setStatusKind("ok");
        setStatusMessage(`${candlePack.source} data updated at ${timestamp}`);
      }
    } catch (err: any) {
      setCandles([]);
      setStats(null);
      setStatusKind("error");
      setStatusMessage("Could not load market data");
    } finally {
      setIsLoading(false);
    }
  }, [symbol, timeframe, fetchCandlesData, fetchTickerData, fetchFuturesData]);

  // Initial load or on symbol/timeframe changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Run initial signal analysis immediately when candles load successfully
  useEffect(() => {
    if (candles.length > 0 && !isAnalyzing && activeReport === "signal" && !signalReport) {
      runAnalysis("signal");
    }
  }, [candles, isAnalyzing, activeReport, signalReport, runAnalysis]);

  // Handle active report tab changing
  const handleReportChange = (report: "signal" | "weekly" | "execution" | "quant" | "demo") => {
    setActiveReport(report);
  };

  // Setup background auto-refresh interval of 60 seconds (only if browser tab is focused)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isLoading && document.visibilityState === "visible") {
        loadData();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [loadData, isLoading]);

  // Setup previous price ref and monitoring effect
  const prevPriceRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset on symbol change to avoid false alerts
    prevPriceRef.current = null;
  }, [symbol]);

  useEffect(() => {
    if (!stats || stats.price === null || !signalReport) return;
    const currentPrice = stats.price;
    const prevPrice = prevPriceRef.current;

    // Only alert on subsequent real changes (prevPrice exists)
    if (prevPrice !== null && prevPrice !== currentPrice) {
      const newAlerts: PriceAlert[] = [];

      // Check supports
      signalReport.supports.forEach((s) => {
        const crossedDown = prevPrice > s.price && currentPrice <= s.price;
        const crossedUp = prevPrice < s.price && currentPrice >= s.price;
        if (crossedDown || crossedUp) {
          newAlerts.push({
            id: `alert-${Date.now()}-${Math.random()}`,
            symbol,
            type: "support",
            levelPrice: s.price,
            label: s.label,
            crossedPrice: currentPrice,
            direction: crossedDown ? "down" : "up",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            read: false
          });
        }
      });

      // Check resistances
      signalReport.resistances.forEach((r) => {
        const crossedDown = prevPrice > r.price && currentPrice <= r.price;
        const crossedUp = prevPrice < r.price && currentPrice >= r.price;
        if (crossedDown || crossedUp) {
          newAlerts.push({
            id: `alert-${Date.now()}-${Math.random()}`,
            symbol,
            type: "resistance",
            levelPrice: r.price,
            label: r.label,
            crossedPrice: currentPrice,
            direction: crossedDown ? "down" : "up",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            read: false
          });
        }
      });

      if (newAlerts.length > 0) {
        setAlerts((prev) => [...newAlerts, ...prev]);
        setToasts((prev) => [...newAlerts, ...prev]);
        
        // Auto-dismiss toasts after 6s
        newAlerts.forEach((alert) => {
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== alert.id));
          }, 6000);
        });
      }
    }

    // Set previous price ref
    prevPriceRef.current = currentPrice;
  }, [stats?.price, symbol, signalReport]);

  const simulatePriceCross = useCallback(() => {
    if (!stats || stats.price === null || !signalReport) {
      setStatusMessage("Simulation requires active price and signal calculation");
      setStatusKind("error");
      return;
    }

    const currentPrice = stats.price;
    const allLevels = [
      ...signalReport.supports.map((s) => ({ ...s, type: "support" as const })),
      ...signalReport.resistances.map((r) => ({ ...r, type: "resistance" as const }))
    ];

    if (!allLevels.length) {
      setStatusMessage("No levels found to cross");
      setStatusKind("error");
      return;
    }

    // Find level closest to current price
    allLevels.sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice));
    const targetLevel = allLevels[0];

    // Calculate a price on the other side of this level
    const offset = Math.max(currentPrice * 0.001, 1.0);
    let targetPrice: number;

    if (targetLevel.type === "support") {
      if (currentPrice > targetLevel.price) {
        targetPrice = targetLevel.price - offset;
      } else {
        targetPrice = targetLevel.price + offset;
      }
    } else {
      if (currentPrice < targetLevel.price) {
        targetPrice = targetLevel.price + offset;
      } else {
        targetPrice = targetLevel.price - offset;
      }
    }

    // Update stats to trigger crossing alert
    setStats((prev) => (prev ? { ...prev, price: targetPrice } : null));
    setStatusMessage(`Simulated price crossed ${targetLevel.label} at $${targetLevel.price.toLocaleString()}`);
    setStatusKind("ok");
  }, [stats, signalReport]);

  // Sync simulated price slider updates with Mark-to-Market engine (Phase 4)
  useEffect(() => {
    if (stats?.price) {
      setPrices((prev) => ({
        ...prev,
        [symbol]: stats.price || prev[symbol]
      }));
    }
  }, [stats?.price, symbol]);

  // Initialize Funded Demo Account (Phase 1)
  const handleInitializeDemo = useCallback((currency: "USDC" | "USDT", startingBalance: number) => {
    setDemoAccount({
      currency,
      startingBalance,
      balance: startingBalance,
      openPositions: [],
      closedTrades: [],
      createdAt: new Date().toISOString()
    });
  }, []);

  // Open Position handler (Phase 3)
  const handleOpenPositionDemo = useCallback((posData: Omit<OpenPosition, "id" | "openedAt" | "lastFundingAppliedAt" | "feePaid" | "fundingPaid" | "currentPrice">) => {
    if (!demoAccount) return "Demo account not initialized.";

    const openFee = posData.size * 0.0005; // 0.05% Taker Fee

    if (demoAccount.balance < posData.margin + openFee) {
      return `Insufficient balance. Margin allocation (${posData.margin.toFixed(2)}) plus taker fee (${openFee.toFixed(3)}) exceeds remaining wallet balance of ${demoAccount.balance.toFixed(2)} ${demoAccount.currency}.`;
    }

    const newPosition: OpenPosition = {
      ...posData,
      id: `pos-${Date.now()}-${Math.random()}`,
      currentPrice: posData.entryPrice,
      openedAt: new Date().toISOString(),
      lastFundingAppliedAt: new Date().toISOString(),
      feePaid: openFee,
      fundingPaid: 0
    };

    setDemoAccount((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        balance: prev.balance - posData.margin - openFee,
        openPositions: [newPosition, ...prev.openPositions]
      };
    });

    return null; // success
  }, [demoAccount]);

  // Manual Position Closing handler (Phase 7)
  const handleClosePositionDemo = useCallback((id: string, isManual = false) => {
    setDemoAccount((prev) => {
      if (!prev) return null;
      const pos = prev.openPositions.find((p) => p.id === id);
      if (!pos) return prev;

      const currentPriceVal = prices[pos.symbol] || pos.entryPrice;
      const directionMult = pos.direction === "LONG" ? 1 : -1;
      const priceRatio = (currentPriceVal - pos.entryPrice) / pos.entryPrice;
      const finalPnl = priceRatio * pos.size * directionMult;

      const closeFee = pos.size * 0.0005; // 0.05% closing taker fee
      const updatedBalance = Math.max(0, prev.balance + pos.margin + finalPnl - closeFee);

      const durationMs = Date.now() - new Date(pos.openedAt).getTime();
      const durSec = Math.floor(durationMs / 1000);
      const durMin = Math.floor(durSec / 60);
      const durHours = Math.floor(durMin / 60);
      const durationStr = durHours > 0
        ? `${durHours}h ${durMin % 60}m`
        : durMin > 0
        ? `${durMin}m ${durSec % 60}s`
        : `${durSec}s`;

      const closedTrade: ClosedTrade = {
        id: pos.id,
        symbol: pos.symbol,
        direction: pos.direction,
        entryPrice: pos.entryPrice,
        exitPrice: currentPriceVal,
        size: pos.size,
        leverage: pos.leverage,
        stopLoss: pos.stopLoss,
        takeProfit: pos.takeProfit,
        pnl: finalPnl,
        pnlPct: (finalPnl / pos.margin) * 100,
        duration: durationStr,
        closeReason: isManual ? "manual" : "stop",
        closedAt: new Date().toISOString(),
        feePaid: pos.feePaid + closeFee,
        fundingPaid: pos.fundingPaid
      };

      if (isManual) {
        setToasts((prevToasts) => [
          {
            id: `manual-close-${Date.now()}`,
            symbol: pos.symbol,
            type: finalPnl >= 0 ? "support" : "resistance",
            levelPrice: 0,
            label: `${pos.direction} Closed`,
            crossedPrice: 0,
            direction: finalPnl >= 0 ? "up" : "down",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            read: false,
            customMessage: `⚡ Manually closed ${pos.direction} position on ${pos.symbol} at $${currentPriceVal.toLocaleString()}. P&L: ${finalPnl >= 0 ? "+" : ""}$${finalPnl.toFixed(2)} ${prev.currency}`
          } as any,
          ...prevToasts
        ]);

        setTimeout(() => {
          setToasts((prevToasts) => prevToasts.filter((t) => !t.id.startsWith("manual-close-")));
        }, 8000);
      }

      return {
        ...prev,
        balance: updatedBalance,
        openPositions: prev.openPositions.filter((p) => p.id !== id),
        closedTrades: [closedTrade, ...prev.closedTrades]
      };
    });
  }, [prices]);

  // Apply Funding Fees handler (Phase 6)
  const handleForceFundingDemo = useCallback((id: string) => {
    setDemoAccount((prev) => {
      if (!prev) return null;
      const pos = prev.openPositions.find((p) => p.id === id);
      if (!pos) return prev;

      const rateVal = fundingRates[pos.symbol] || 0.01;
      const rateDec = rateVal / 100;
      const directionMult = pos.direction === "LONG" ? 1 : -1;
      const fundingFee = pos.size * rateDec * directionMult;

      const updatedBalance = Math.max(0, prev.balance - fundingFee);
      const updatedPositions = prev.openPositions.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            fundingPaid: p.fundingPaid + fundingFee,
            lastFundingAppliedAt: new Date().toISOString()
          };
        }
        return p;
      });

      setToasts((prevToasts) => [
        {
          id: `funding-apply-${Date.now()}`,
          symbol: pos.symbol,
          type: fundingFee > 0 ? "resistance" : "support",
          levelPrice: 0,
          label: "Funding Rate Applied",
          crossedPrice: 0,
          direction: fundingFee > 0 ? "down" : "up",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          read: false,
          customMessage: `ℹ️ Applied Bybit Funding of ${rateVal}% to ${pos.direction} ${pos.symbol}. ${fundingFee > 0 ? "Paid" : "Received"} ${Math.abs(fundingFee).toFixed(4)} ${prev.currency}`
        } as any,
        ...prevToasts
      ]);

      setTimeout(() => {
        setToasts((prevToasts) => prevToasts.filter((t) => !t.id.startsWith("funding-apply-")));
      }, 8000);

      return {
        ...prev,
        balance: updatedBalance,
        openPositions: updatedPositions
      };
    });
  }, [fundingRates]);

  // Purge / Reset Demo Trading Account (Phase 8)
  const handleResetDemo = useCallback(() => {
    setDemoAccount(null);
    localStorage.removeItem("cpd_demo_account");
  }, []);

  // Continuous Mark-to-Market Monitoring Engine (Phase 4 & 5)
  useEffect(() => {
    if (!demoAccount || demoAccount.openPositions.length === 0) return;

    let stateChanged = false;
    let updatedBalance = demoAccount.balance;
    const newClosedTrades = [...demoAccount.closedTrades];
    const newOpenPositions: OpenPosition[] = [];
    const closedAlerts: any[] = [];

    for (const pos of demoAccount.openPositions) {
      const currentPriceVal = prices[pos.symbol];
      if (!currentPriceVal || currentPriceVal <= 0) {
        newOpenPositions.push(pos);
        continue;
      }

      // Safe isolated liquidation threshold
      const liqPrice = pos.direction === "LONG"
        ? pos.entryPrice * (1 - 1 / pos.leverage)
        : pos.entryPrice * (1 + 1 / pos.leverage);

      let triggered = false;
      let exitPrice = 0;
      let reason: "stop" | "target" | "liquidation" | "manual" = "manual";

      // 1. LIQUIDATION check (Phase 5)
      if (pos.direction === "LONG" && currentPriceVal <= liqPrice) {
        triggered = true;
        exitPrice = liqPrice;
        reason = "liquidation";
      } else if (pos.direction === "SHORT" && currentPriceVal >= liqPrice) {
        triggered = true;
        exitPrice = liqPrice;
        reason = "liquidation";
      }
      // 2. STOP LOSS check (Phase 4)
      else if (pos.direction === "LONG" && currentPriceVal <= pos.stopLoss) {
        triggered = true;
        exitPrice = pos.stopLoss;
        reason = "stop";
      } else if (pos.direction === "SHORT" && currentPriceVal >= pos.stopLoss) {
        triggered = true;
        exitPrice = pos.stopLoss;
        reason = "stop";
      }
      // 3. TAKE PROFIT check (Phase 4)
      else if (pos.takeProfit !== null) {
        if (pos.direction === "LONG" && currentPriceVal >= pos.takeProfit) {
          triggered = true;
          exitPrice = pos.takeProfit;
          reason = "target";
        } else if (pos.direction === "SHORT" && currentPriceVal <= pos.takeProfit) {
          triggered = true;
          exitPrice = pos.takeProfit;
          reason = "target";
        }
      }

      if (triggered) {
        stateChanged = true;
        const directionMult = pos.direction === "LONG" ? 1 : -1;
        let finalPnl = ((exitPrice - pos.entryPrice) / pos.entryPrice) * pos.size * directionMult;

        if (reason === "liquidation") {
          finalPnl = -pos.margin; // cap losses strictly to allocated collateral
        }

        const closeFee = pos.size * 0.0005; // 0.05% Taker Fee
        updatedBalance = Math.max(0, updatedBalance + pos.margin + finalPnl - closeFee);

        const durationMs = Date.now() - new Date(pos.openedAt).getTime();
        const durSec = Math.floor(durationMs / 1000);
        const durMin = Math.floor(durSec / 60);
        const durHours = Math.floor(durMin / 60);
        const durationStr = durHours > 0
          ? `${durHours}h ${durMin % 60}m`
          : durMin > 0
          ? `${durMin}m ${durSec % 60}s`
          : `${durSec}s`;

        const closedTrade: ClosedTrade = {
          id: pos.id,
          symbol: pos.symbol,
          direction: pos.direction,
          entryPrice: pos.entryPrice,
          exitPrice,
          size: pos.size,
          leverage: pos.leverage,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          pnl: finalPnl,
          pnlPct: (finalPnl / pos.margin) * 100,
          duration: durationStr,
          closeReason: reason,
          closedAt: new Date().toISOString(),
          feePaid: pos.feePaid + closeFee,
          fundingPaid: pos.fundingPaid
        };

        newClosedTrades.unshift(closedTrade);

        closedAlerts.push({
          id: `demo-trigger-${Date.now()}-${Math.random()}`,
          symbol: pos.symbol,
          title: reason === "liquidation" ? "⚠️ Position Liquidated" : reason === "stop" ? "🛑 Stop Loss Triggered" : "🎯 Take Profit Hit",
          message: `${reason === "liquidation" ? "⚠️ Isolated Liquidation triggered" : reason === "stop" ? "🛑 Stop Loss hit" : "🎯 Take Profit hit"} on ${pos.symbol} at $${exitPrice.toLocaleString()}. Realized P&L: ${finalPnl >= 0 ? "+" : ""}$${finalPnl.toFixed(2)} ${demoAccount.currency}`,
          type: reason === "liquidation" || finalPnl < 0 ? "error" : "success"
        });
      } else {
        newOpenPositions.push(pos);
      }
    }

    if (stateChanged) {
      setDemoAccount((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          balance: updatedBalance,
          openPositions: newOpenPositions,
          closedTrades: newClosedTrades
        };
      });

      closedAlerts.forEach((alert) => {
        setToasts((prevToasts) => [
          {
            id: alert.id,
            symbol: alert.symbol,
            type: alert.type === "error" ? "resistance" : "support",
            levelPrice: 0,
            label: alert.title,
            crossedPrice: 0,
            direction: alert.type === "error" ? "down" : "up",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            read: false,
            customMessage: alert.message
          } as any,
          ...prevToasts
        ]);

        setTimeout(() => {
          setToasts((prevToasts) => prevToasts.filter((t) => t.id !== alert.id));
        }, 8000);
      });
    }
  }, [prices]);

  // Periodic Funding Rates checker loop (Phase 6)
  useEffect(() => {
    if (!demoAccount || demoAccount.openPositions.length === 0) return;

    const interval = setInterval(() => {
      const now = new Date();
      let stateChanged = false;
      let updatedAccount = { ...demoAccount };

      updatedAccount.openPositions = updatedAccount.openPositions.map((pos) => {
        const lastApplied = new Date(pos.lastFundingAppliedAt);
        const hoursPassed = (now.getTime() - lastApplied.getTime()) / (1000 * 60 * 60);

        if (hoursPassed >= 8) {
          stateChanged = true;
          const rateVal = fundingRates[pos.symbol] || 0.01;
          const rateDec = rateVal / 100;
          const directionMult = pos.direction === "LONG" ? 1 : -1;
          const fundingFee = pos.size * rateDec * directionMult;

          updatedAccount.balance = Math.max(0, updatedAccount.balance - fundingFee);

          return {
            ...pos,
            fundingPaid: pos.fundingPaid + fundingFee,
            lastFundingAppliedAt: now.toISOString()
          };
        }
        return pos;
      });

      if (stateChanged) {
        setDemoAccount(updatedAccount);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [demoAccount, fundingRates]);

  return (
    <main className={`app ${isFocusMode ? "focus-active" : ""}`}>
      {/* Header controls toolbar */}
      <header className="topbar">
        <div className="brand">
          <h1>Crypto Pulse Dashboard</h1>
          <p>
            Live BTC and ETH charting with a local signal engine, support zones, risk levels, and no API keys needed.
          </p>
        </div>

        <div className="toolbar" aria-label="Market controls">
          {/* Symbol Segmented control */}
          <div className="segmented" aria-label="Symbol">
            <button
              type="button"
              className={symbol === "ETH" ? "is-active" : ""}
              onClick={() => {
                setSymbol("ETH");
                setSignalReport(null);
                setWeeklyReport(null);
                setExecutionReport(null);
                setQuantReport(null);
              }}
            >
              ETH
            </button>
            <button
              type="button"
              className={symbol === "BTC" ? "is-active" : ""}
              onClick={() => {
                setSymbol("BTC");
                setSignalReport(null);
                setWeeklyReport(null);
                setExecutionReport(null);
                setQuantReport(null);
              }}
            >
              BTC
            </button>
          </div>

          {/* Timeframe Segmented control */}
          <div className="segmented" aria-label="Timeframe">
            {(["5m", "15m", "1h", "4h", "1D"] as TimeframeType[]).map((tf) => (
              <button
                key={tf}
                type="button"
                className={timeframe === tf ? "is-active" : ""}
                onClick={() => {
                  setTimeframe(tf);
                  setSignalReport(null);
                  setWeeklyReport(null);
                  setExecutionReport(null);
                  setQuantReport(null);
                }}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Network status connection line */}
          <div className="status" aria-live="polite">
            <span
              className={`status-dot ${statusKind === "ok" ? "ok bg-[var(--up)] shadow-[0_0_0_4px_rgba(65,217,154,0.12)]" : statusKind === "error" ? "error bg-[var(--down)] shadow-[0_0_0_4px_rgba(240,120,136,0.13)]" : "bg-[var(--gold)] shadow-[0_0_0_4px_rgba(245,196,81,0.12)]"}`}
            ></span>
            <span>{statusMessage}</span>
          </div>

          {/* Force reload query trigger */}
          <button
            type="button"
            className="icon-button"
            onClick={loadData}
            disabled={isLoading}
            aria-label="Refresh market data"
            title="Refresh market data"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" className="w-4 h-4">
              <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5" strokeWidth="2"></path>
              <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 5v-5h-5" strokeWidth="2"></path>
            </svg>
          </button>

          {/* Notification Alert Bell Badge */}
          <div className="relative inline-block text-left" id="notificationCenter">
            <button
              type="button"
              className={`icon-button relative ${showNotificationDropdown ? "bg-[rgba(255,255,255,0.1)] text-[var(--accent)]" : ""}`}
              onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
              aria-label="Toggle notifications"
              title="Price alerts & notifications"
            >
              <Bell className={`w-4 h-4 ${alerts.some(a => !a.read) ? "animate-bounce" : ""}`} />
              {alerts.filter(a => !a.read).length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--down)] text-[9px] font-bold text-white shadow-sm">
                  {alerts.filter(a => !a.read).length}
                </span>
              )}
            </button>

            {/* Dropdown menu */}
            {showNotificationDropdown && (
              <div className="absolute right-0 mt-2 w-80 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(15,23,42,0.98)] backdrop-blur-md p-3 shadow-2xl z-[999] text-xs font-sans text-[var(--text)]">
                <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] pb-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <strong className="text-xs font-bold text-white uppercase tracking-wider">Alerts History</strong>
                    {alerts.filter(a => !a.read).length > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-[var(--down-soft)] text-[9px] text-[var(--down)] font-bold">
                        {alerts.filter(a => !a.read).length} New
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {alerts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAlerts(prev => prev.map(a => ({ ...a, read: true })));
                        }}
                        className="text-[10px] text-[var(--accent)] hover:underline font-semibold"
                      >
                        Read All
                      </button>
                    )}
                    {alerts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setAlerts([])}
                        className="text-[10px] text-[var(--down)] hover:underline font-semibold"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto flex flex-col gap-1.5 scrollbar-thin">
                  {alerts.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[var(--muted)]">
                      No price crossing alerts yet.
                    </div>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-2 rounded border text-xs transition duration-150 text-left ${
                          alert.read
                            ? "bg-[rgba(255,255,255,0.01)] border-white/5 opacity-70"
                            : "bg-[rgba(99,102,241,0.06)] border-[var(--accent)]/30"
                        }`}
                        onClick={() => {
                          setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, read: true } : a));
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`font-bold uppercase tracking-wider px-1 py-0.2 rounded text-[8px] ${
                            alert.type === "support" 
                              ? "bg-[var(--up-soft)] text-[var(--up)]" 
                              : "bg-[var(--accent-soft)] text-[var(--accent)]"
                          }`}>
                            {alert.symbol} {alert.type}
                          </span>
                          <span className="text-[10px] text-[var(--muted)]">{alert.timestamp}</span>
                        </div>
                        <p className="text-[11px] text-white font-medium">
                          Crossed {alert.label} (${alert.levelPrice.toLocaleString()}){" "}
                          <span className={alert.direction === "up" ? "text-[var(--up)]" : "text-[var(--down)]"}>
                            {alert.direction === "up" ? "upwards" : "downwards"}
                          </span>
                        </p>
                        <div className="text-[9px] text-[var(--muted)] mt-1 flex justify-between items-center">
                          <span>Cross Price: ${alert.crossedPrice.toLocaleString()}</span>
                          {!alert.read && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"></span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-[rgba(255,255,255,0.08)] pt-2 mt-2 flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={simulatePriceCross}
                    className="w-full text-center px-2 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded hover:bg-opacity-80 transition duration-150 flex items-center justify-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Simulate Level Cross
                  </button>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-[10px] text-[var(--muted)] font-medium">Simulate price:</span>
                    <input
                      type="number"
                      placeholder="e.g. 3300"
                      className="px-2 py-1 text-[11px] rounded bg-[rgba(0,0,0,0.3)] border border-white/10 text-white w-28 text-right focus:border-[var(--accent)] focus:outline-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = parseFloat((e.target as HTMLInputElement).value);
                          if (!isNaN(val) && val > 0) {
                            setStats((prev) => (prev ? { ...prev, price: val } : null));
                            setStatusMessage(`Simulated price set to $${val.toLocaleString()}`);
                            setStatusKind("ok");
                            (e.target as HTMLInputElement).value = "";
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Fullscreen Focus Mode toggle */}
          <button
            type="button"
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={`px-3 py-1.5 border rounded-md text-xs font-bold transition duration-150 flex items-center gap-1.5 ${
              isFocusMode
                ? "bg-[var(--down-soft)] border-[var(--down)] text-[var(--down)]"
                : "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
            }`}
            title={isFocusMode ? "Exit Fullscreen Mode" : "Enter Fullscreen Mode"}
          >
            {isFocusMode ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="hidden sm:inline">Exit Fullscreen</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                </svg>
                <span className="hidden sm:inline">Fullscreen Report</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Horizontal key metrics stats ribbon */}
      {!isFocusMode && <StatsBar stats={stats} symbol={symbol} />}

      {/* Demo Account Summary Ribbon */}
      {!isFocusMode && demoAccount && (
        <section className="stats border-t border-b-0" style={{ gridTemplateColumns: "repeat(6, minmax(126px, 1fr))" }} aria-label="Demo trading statistics">
          <div className="stat">
            <div className="stat-label">Wallet Balance</div>
            <div className="stat-value text-white">
              {demoAccount.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] text-[var(--muted)]">{demoAccount.currency}</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Net Equity</div>
            <div className="stat-value text-white">
              {(() => {
                const totalUnrealizedPnl = demoAccount.openPositions.reduce((total, pos) => {
                  const p = prices[pos.symbol] || pos.entryPrice;
                  const dir = pos.direction === "LONG" ? 1 : -1;
                  return total + ((p - pos.entryPrice) / pos.entryPrice) * pos.size * dir;
                }, 0);
                return (demoAccount.balance + totalUnrealizedPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              })()}{" "}
              <span className="text-[10px] text-[var(--muted)]">{demoAccount.currency}</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Open Position P&L</div>
            {(() => {
              const totalUnrealizedPnl = demoAccount.openPositions.reduce((total, pos) => {
                const p = prices[pos.symbol] || pos.entryPrice;
                const dir = pos.direction === "LONG" ? 1 : -1;
                return total + ((p - pos.entryPrice) / pos.entryPrice) * pos.size * dir;
              }, 0);
              const marginUsedVal = demoAccount.openPositions.reduce((total, pos) => total + pos.margin, 0);
              const pnlPercent = marginUsedVal > 0 ? (totalUnrealizedPnl / marginUsedVal) * 100 : 0;
              const isProfit = totalUnrealizedPnl >= 0;

              return (
                <div className={`stat-value font-extrabold ${isProfit ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                  {isProfit ? "+" : ""}{totalUnrealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                  <span className="text-[10px]">({isProfit ? "▲" : "▼"}{pnlPercent.toFixed(1)}%)</span>
                </div>
              );
            })()}
          </div>
          <div className="stat">
            <div className="stat-label">Margin Used</div>
            <div className="stat-value text-white">
              {demoAccount.openPositions.reduce((total, pos) => total + pos.margin, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-[10px] text-[var(--muted)]">{demoAccount.currency}</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Free Margin</div>
            <div className="stat-value text-white">
              {(() => {
                const totalUnrealizedPnl = demoAccount.openPositions.reduce((total, pos) => {
                  const p = prices[pos.symbol] || pos.entryPrice;
                  const dir = pos.direction === "LONG" ? 1 : -1;
                  return total + ((p - pos.entryPrice) / pos.entryPrice) * pos.size * dir;
                }, 0);
                const marginUsedVal = demoAccount.openPositions.reduce((total, pos) => total + pos.margin, 0);
                const freeMarg = Math.max(0, demoAccount.balance + totalUnrealizedPnl - marginUsedVal);
                return freeMarg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              })()}{" "}
              <span className="text-[10px] text-[var(--muted)]">{demoAccount.currency}</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Open Positions</div>
            <div className="stat-value text-white">
              {demoAccount.openPositions.length}{" "}
              <span className="text-[10px] text-[var(--muted)]">Active</span>
            </div>
          </div>
        </section>
      )}

      {/* Main split workspace (Chart + Analysis) */}
      <section className="main">
        {/* Interactive canvas charting shell */}
        {!isFocusMode && (
          activeReport === "demo" && demoAccount ? (
            <div className="flex flex-col flex-1 h-full min-h-0 border-r border-white/5">
              <div className="flex-1 min-h-0" style={{ height: "460px" }}>
                <ChartSection
                  candles={candles}
                  stats={stats}
                  symbol={symbol}
                  timeframe={timeframe}
                  dataSource={dataSource}
                  isLoading={isLoading}
                />
              </div>
              <DemoPositionsPanel
                symbol={symbol}
                demoAccount={demoAccount}
                prices={prices}
                onClosePosition={handleClosePositionDemo}
                onForceFunding={handleForceFundingDemo}
              />
            </div>
          ) : (
            <ChartSection
              candles={candles}
              stats={stats}
              symbol={symbol}
              timeframe={timeframe}
              dataSource={dataSource}
              isLoading={isLoading}
            />
          )
        )}

        {/* Tabbed multi-timeframe analytics panel */}
        <AnalysisPanel
          symbol={symbol}
          timeframe={timeframe}
          manualInputs={manualInputs}
          onManualInputChange={setManualInputs}
          activeReport={activeReport}
          onReportChange={handleReportChange}
          onRunAnalysis={runAnalysis}
          isAnalyzing={isAnalyzing}
          signalReport={signalReport}
          weeklyReport={weeklyReport}
          executionReport={executionReport}
          quantReport={quantReport}
          isFocusMode={isFocusMode}
          onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
          alerts={alerts}
          demoAccount={demoAccount}
          onInitializeDemo={handleInitializeDemo}
          onOpenPositionDemo={handleOpenPositionDemo}
          onClosePositionDemo={handleClosePositionDemo}
          onForceFundingDemo={handleForceFundingDemo}
          onResetDemo={handleResetDemo}
          currentPrice={prices[symbol] || stats?.price || 0}
          currentFundingRate={fundingRates[symbol] || stats?.funding || null}
        />
      </section>

      {/* Floating real-time alert toasts */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none" id="alertToastsContainer">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 bg-[rgba(15,23,42,0.95)] border-l-4 rounded-lg shadow-2xl p-4 w-80 text-xs backdrop-blur-md animate-slide-in text-left text-[var(--text)] border border-white/5"
            style={{
              borderLeftColor: toast.type === "support" ? "var(--up)" : "var(--accent)"
            }}
          >
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <strong className={`font-extrabold uppercase tracking-wider text-[9px] ${
                  toast.type === "support" ? "text-[var(--up)]" : "text-[var(--accent)]"
                }`}>
                  {toast.symbol} {toast.type} Alert
                </strong>
                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  className="text-[var(--muted)] hover:text-white transition duration-150"
                  aria-label="Dismiss alert"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-white font-semibold leading-normal">
                Crossed {toast.label} (${toast.levelPrice.toLocaleString()}){" "}
                <span className={toast.direction === "up" ? "text-[var(--up)]" : "text-[var(--down)]"}>
                  {toast.direction === "up" ? "upwards" : "downwards"}
                </span>!
              </p>
              <div className="text-[10px] text-[var(--muted)] mt-1.5 flex justify-between">
                <span>Trigger Price: ${toast.crossedPrice.toLocaleString()}</span>
                <span>{toast.timestamp}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
