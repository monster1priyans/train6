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
  TradeSetup,
  DayPlan
} from "../types";

export const META = {
  ETH: { product: "ETH-USD", binance: "ETHUSDT", bybit: "ETHUSDT", precision: 2, demo: 3250 },
  BTC: { product: "BTC-USD", binance: "BTCUSDT", bybit: "BTCUSDT", precision: 0, demo: 104000 }
};

export const TIMEFRAMES = {
  "5m": { label: "5M", seconds: 300, binance: "5m", bybit: "5", coinbase: 300 },
  "15m": { label: "15M", seconds: 900, binance: "15m", bybit: "15", coinbase: 900 },
  "1h": { label: "1H", seconds: 3600, binance: "1h", bybit: "60", coinbase: 3600 },
  "4h": { label: "4H", seconds: 14400, binance: "4h", bybit: "240", coinbase: 14400 },
  "1D": { label: "1D", seconds: 86400, binance: "1d", bybit: "D", coinbase: 86400 }
};

export function finite(value: any): boolean {
  return Number.isFinite(Number(value));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function average(values: number[]): number {
  const filtered = values.filter(finite);
  if (!filtered.length) return 0;
  return filtered.reduce((sum, val) => sum + val, 0) / filtered.length;
}

export function median(values: number[]): number {
  const filtered = values.filter(finite).sort((a, b) => a - b);
  if (!filtered.length) return 0;
  const mid = Math.floor(filtered.length / 2);
  return filtered.length % 2 ? filtered[mid] : (filtered[mid - 1] + filtered[mid]) / 2;
}

export function quantile(values: number[], q: number): number {
  const filtered = values.filter(finite).sort((a, b) => a - b);
  if (!filtered.length) return 0;
  const pos = (filtered.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return filtered[base + 1] !== undefined ? filtered[base] + rest * (filtered[base + 1] - filtered[base]) : filtered[base];
}

export function percentile(values: number[], value: number): number {
  const filtered = values.filter(finite).sort((a, b) => a - b);
  if (!filtered.length || !finite(value)) return 50;
  const below = filtered.filter((n) => n <= value).length;
  return clamp((below / filtered.length) * 100, 1, 99);
}

export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 10) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const ax = average(x);
  const ay = average(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const xv = x[i] - ax;
    const yv = y[i] - ay;
    num += xv * yv;
    dx += xv * xv;
    dy += yv * yv;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

export function candleReturns(candles: Candle[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i - 1].c) {
      returns.push(((candles[i].c - candles[i - 1].c) / candles[i - 1].c) * 100);
    }
  }
  return returns;
}

export function cleanCandles(candles: any[]): Candle[] {
  const sorted = candles
    .filter((c) => c && finite(c.t) && finite(c.o) && finite(c.h) && finite(c.l) && finite(c.c) && finite(c.v))
    .map((c) => ({
      t: Number(c.t),
      o: Number(c.o),
      h: Math.max(Number(c.h), Number(c.o), Number(c.c)),
      l: Math.max(0.00000001, Math.min(Number(c.l), Number(c.o), Number(c.c))),
      c: Number(c.c),
      v: Number(c.v)
    }))
    .sort((a, b) => a.t - b.t);

  const medianClose = median(sorted.map((c) => c.c).filter((val) => finite(val) && val > 0)) || 0;
  const priceFiltered = medianClose ? sorted.filter((c) => c.c >= medianClose * 0.20 && c.c <= medianClose * 5) : sorted;
  const rangePcts = priceFiltered
    .map((c) => (c.c > 0 ? (c.h - c.l) / c.c : null))
    .filter((v): v is number => finite(v) && v !== null && v > 0 && v < 1);
  const typicalRangePct = median(rangePcts) || 0.012;
  const maxRangePct = clamp(typicalRangePct * 10, 0.08, 0.40);
  const typicalAbsRange = median(priceFiltered.map((c) => c.h - c.l).filter((v) => finite(v) && v > 0)) || 1;

  return priceFiltered.map((c) => {
    const bodyHigh = Math.max(c.o, c.c);
    const bodyLow = Math.min(c.o, c.c);
    const rangePct = c.c > 0 ? (c.h - c.l) / c.c : 0;
    if (rangePct <= maxRangePct) return c;

    const maxWick = Math.max(typicalAbsRange * 2.5, Math.abs(c.c - c.o) * 3, c.c * typicalRangePct * 2.5);
    return {
      ...c,
      h: Math.max(bodyHigh, Math.min(c.h, bodyHigh + maxWick)),
      l: Math.max(0.00000001, Math.min(bodyLow, Math.max(c.l, bodyLow - maxWick)))
    };
  });
}

export function generateDemoCandles(symbol: SymbolType, timeframe: TimeframeType, limit: number): Candle[] {
  const tf = TIMEFRAMES[timeframe];
  let seed = symbol === "BTC" ? 7331 : 4829;
  seed += Object.keys(TIMEFRAMES).indexOf(timeframe) * 997;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const candles: Candle[] = [];
  const start = Math.floor(Date.now() / 1000) - tf.seconds * (limit - 1);
  let close = META[symbol].demo;
  const volBase = symbol === "BTC" ? 160 : 2100;

  for (let i = 0; i < limit; i++) {
    const trend = Math.sin(i / 18) * 0.006 + Math.sin(i / 43) * 0.011;
    const noise = (random() - 0.5) * 0.014;
    const open = close;
    close = Math.max(open * (1 + trend * 0.12 + noise), open * 0.85);
    const spread = open * (0.0035 + random() * 0.012);
    const high = Math.max(open, close) + spread;
    const low = Math.max(1, Math.min(open, close) - spread);
    candles.push({
      t: start + i * tf.seconds,
      o: open,
      h: high,
      l: low,
      c: close,
      v: volBase * (0.6 + random() * 1.7)
    });
  }

  return candles;
}

export function generatePairDemo(timeframe: TimeframeType, limit: number): Candle[] {
  const tf = TIMEFRAMES[timeframe];
  let seed = 11903 + Object.keys(TIMEFRAMES).indexOf(timeframe) * 733;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const candles: Candle[] = [];
  const start = Math.floor(Date.now() / 1000) - tf.seconds * (limit - 1);
  let close = 0.032;

  for (let i = 0; i < limit; i++) {
    const trend = Math.sin(i / 25) * 0.004;
    const noise = (random() - 0.5) * 0.01;
    const open = close;
    close = Math.max(0.015, open * (1 + trend * 0.18 + noise));
    const spread = open * (0.002 + random() * 0.008);
    candles.push({
      t: start + i * tf.seconds,
      o: open,
      h: Math.max(open, close) + spread,
      l: Math.max(0.001, Math.min(open, close) - spread),
      c: close,
      v: 1000 * (0.6 + random() * 1.4)
    });
  }

  return candles;
}

export function calcSma(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  return candles.slice(-period).reduce((sum, c) => sum + c.c, 0) / period;
}

export function calcAtr(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c)));
  }
  return trs.reduce((sum, value) => sum + value, 0) / trs.length;
}

export function calcRsi(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const diff = candles[i].c - candles[i - 1].c;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function swingLevels(candles: Candle[], key: "h" | "l", current: number, atr: number | null): number[] {
  const levels: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const value = candles[i][key];
    const before = candles[i - 1][key];
    const before2 = candles[i - 2][key];
    const after = candles[i + 1][key];
    const after2 = candles[i + 2][key];
    const isHigh = key === "h" && value > before && value > before2 && value > after && value > after2;
    const isLow = key === "l" && value < before && value < before2 && value < after && value < after2;
    if (isHigh || isLow) levels.push(value);
  }

  const threshold = Math.max((atr || current * 0.01) * 0.55, current * 0.002);
  const sorted = levels.sort((a, b) => Math.abs(a - current) - Math.abs(b - current));
  const unique: number[] = [];
  sorted.forEach((level) => {
    if (!unique.some((existing) => Math.abs(existing - level) < threshold)) unique.push(level);
  });
  return unique.slice(0, 3);
}

export function structureFrom(candles: Candle[]): string {
  const recent = candles.slice(-34);
  if (recent.length < 10) return "range to transition";
  const first = recent.slice(0, Math.floor(recent.length / 2));
  const second = recent.slice(Math.floor(recent.length / 2));
  const firstHigh = Math.max(...first.map((c) => c.h));
  const secondHigh = Math.max(...second.map((c) => c.h));
  const firstLow = Math.min(...first.map((c) => c.l));
  const secondLow = Math.min(...second.map((c) => c.l));
  if (secondHigh > firstHigh && secondLow > firstLow) return "HH/HL uptrend";
  if (secondHigh < firstHigh && secondLow < firstLow) return "LH/LL downtrend";
  if (secondHigh > firstHigh && secondLow < firstLow) return "expanding range";
  return "range to transition";
}

export function volatilityLabel(atrPct: number): string {
  if (atrPct < 0.45) return "Low";
  if (atrPct < 1.1) return "Normal";
  if (atrPct < 2.0) return "High";
  return "Explosive";
}

export function ratio(entry: number, stop: number, target: number): string {
  if (!finite(entry) || !finite(stop) || !finite(target) || entry === stop) return "N/A";
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  return "1:" + Math.max(0.1, reward / risk).toFixed(1);
}

export function lvFromPoints(points: number): string {
  if (points < 20) return "LV1";
  if (points < 40) return "LV2";
  if (points < 60) return "LV3";
  if (points < 80) return "LV4";
  if (points < 120) return "LV5";
  return "LV6";
}

export function scoreClass(score: number): string {
  if (score >= 75) return "up";
  if (score >= 55) return "gold";
  return "down";
}

export function gradeFromScore(score: number): string {
  if (score >= 95) return "S+";
  if (score >= 90) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 62) return "C";
  return "D";
}

export function utcHourLabel(hour: number): string {
  return String(hour).padStart(2, "0") + ":00 UTC";
}

export function istHourLabel(hour: number): string {
  const date = new Date(Date.UTC(2026, 0, 1, hour, 0, 0));
  date.setUTCMinutes(date.getUTCMinutes() + 330);
  return String(date.getUTCHours()).padStart(2, "0") + ":" + String(date.getUTCMinutes()).padStart(2, "0") + " IST";
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function nextWeekDates(): Date[] {
  const today = new Date();
  const day = today.getDay();
  const daysUntilMonday = ((8 - day) % 7) || 7;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysUntilMonday);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

export function deriveTicker(candles: Candle[]): Partial<MarketStats> {
  const last = candles[candles.length - 1];
  const start = candles[Math.max(0, candles.length - 25)];
  const window = candles.slice(-25);
  const high = Math.max(...window.map((c) => c.h));
  const low = Math.min(...window.map((c) => c.l));
  const quoteVol = window.reduce((sum, c) => sum + c.v * c.c, 0);
  return {
    price: last ? last.c : null,
    chg: start && start.o ? ((last.c - start.o) / start.o) * 100 : null,
    hi: high,
    lo: low,
    vol: quoteVol,
    source: "Derived"
  };
}

export function buildAnalysis(frames: Record<string, Candle[]>): AnalysisResult {
  const candles = frames["1h"] || [];
  if (!candles.length) {
    throw new Error("No candles available");
  }
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] || last;
  const sma20 = calcSma(candles, 20);
  const sma50 = calcSma(candles, 50);
  const atr = calcAtr(candles, 14) || last.c * 0.012;
  const rsi = calcRsi(candles, 14) || 50;
  const atrPct = (atr / last.c) * 100;
  const change = ((last.c - prev.c) / prev.c) * 100;
  const structure = structureFrom(candles);
  const supports = swingLevels(candles, "l", last.c, atr).filter((level) => level < last.c);
  const resistances = swingLevels(candles, "h", last.c, atr).filter((level) => level > last.c);
  const support = supports[0] || Math.min(...candles.slice(-30).map((c) => c.l));
  const resistance = resistances[0] || Math.max(...candles.slice(-30).map((c) => c.h));
  const fourHour = frames["4h"] || candles;
  const daily = frames["1D"] || candles;
  const h4Sma20 = calcSma(fourHour, Math.min(20, Math.max(5, fourHour.length - 1)));
  const dSma20 = calcSma(daily, Math.min(20, Math.max(5, daily.length - 1)));

  let bull = 0;
  let bear = 0;
  if (sma20 && last.c > sma20) bull += 1.4; else bear += 1.1;
  if (sma50 && last.c > sma50) bull += 1.1; else bear += 0.9;
  if (sma20 && sma50 && sma20 > sma50) bull += 1.0; else if (sma20 && sma50) bear += 1.0;
  if (rsi > 55) bull += 0.8; else if (rsi < 45) bear += 0.8;
  if (structure.includes("uptrend")) bull += 1.1;
  if (structure.includes("downtrend")) bear += 1.1;
  if (h4Sma20 && last.c > h4Sma20) bull += 0.7; else if (h4Sma20) bear += 0.7;
  if (dSma20 && last.c > dSma20) bull += 0.6; else if (dSma20) bear += 0.6;

  const direction = Math.abs(bull - bear) < 1 ? "NO TRADE" : bull > bear ? "LONG" : "SHORT";
  const bias = direction === "LONG" ? "Bullish" : direction === "SHORT" ? "Bearish" : "Neutral";
  const scoreBase = 5 + Math.abs(bull - bear) * 0.8 + (atrPct > 0.35 && atrPct < 2.2 ? 0.7 : -0.3);
  const score = clamp(scoreBase, 3.5, 9.2);
  const verdict = direction === "NO TRADE" ? "MONITOR" : score >= 7 ? "TRADE" : "MONITOR";
  const biasClass = bias === "Bullish" ? "up" : bias === "Bearish" ? "down" : "gold";
  const verdictClass = verdict === "TRADE" ? "up" : "gold";
  const bos = direction === "LONG" && last.c > resistance ? "Bullish BOS" :
    direction === "SHORT" && last.c < support ? "Bearish BOS" :
    structure.includes("transition") ? "Possible CHoCH" : "None";

  let setup: AnalysisResult["setup"];
  if (direction === "LONG") {
    const entryLow = Math.max(support, last.c - atr * 0.75);
    const entryHigh = Math.min(last.c, support + atr * 0.75);
    const sl = Math.max(1, support - atr * 0.75);
    const tp1 = Math.max(resistance, last.c + atr * 1.2);
    const tp2 = last.c + atr * 2.1;
    const tp3 = last.c + atr * 3.2;
    setup = {
      direction,
      entry: entryLow.toFixed(2) + " to " + entryHigh.toFixed(2),
      trigger: "Hold above SMA 20 and reclaim prior candle high.",
      sl,
      tp1,
      tp2,
      tp3,
      rr: ratio(last.c, sl, tp2),
      invalidation: "A close below " + sl.toFixed(2) + " weakens long setup.",
      psychology: "Do not chase. Wait for pullbacks or clean reclaims."
    };
  } else if (direction === "SHORT") {
    const entryLow = Math.max(last.c, resistance - atr * 0.75);
    const entryHigh = resistance;
    const sl = resistance + atr * 0.75;
    const tp1 = Math.min(support, last.c - atr * 1.2);
    const tp2 = last.c - atr * 2.1;
    const tp3 = last.c - atr * 3.2;
    setup = {
      direction,
      entry: entryLow.toFixed(2) + " to " + entryHigh.toFixed(2),
      trigger: "Reject resistance and lose prior candle low.",
      sl,
      tp1,
      tp2,
      tp3,
      rr: ratio(last.c, sl, tp2),
      invalidation: "A close above " + sl.toFixed(2) + " weakens short setup.",
      psychology: "Avoid entry after long downside wick. Let rejection confirm."
    };
  } else {
    setup = {
      direction,
      entry: "Wait for range edge confirmation",
      trigger: "Break and close outside current range.",
      sl: null,
      tp1: null,
      tp2: null,
      tp3: null,
      rr: "N/A",
      invalidation: "No clean directional invalidation until price leaves range.",
      psychology: "Flat is a position. Let market show direction."
    };
  }

  return {
    bias,
    biasClass,
    verdict,
    verdictClass,
    score,
    structure,
    bos,
    rsi,
    atrPct,
    volatility: volatilityLabel(atrPct),
    change,
    supports: supports.slice(0, 3).map((s, idx) => ({ price: s, label: idx === 0 ? "Nearest Support" : "Swing Low" })),
    resistances: resistances.slice(0, 3).map((r, idx) => ({ price: r, label: idx === 0 ? "Nearest Resistance" : "Swing High" })),
    setup,
    context: `${bias} bias with ${structure}. Price is ${last.c >= (sma20 || 0) ? "above" : "below"} SMA 20, RSI is ${rsi.toFixed(1)}, ATR is ${atrPct.toFixed(2)}%.`
  };
}

export function summarizeFrames(frames: Record<string, Candle[]>, ticker: Partial<MarketStats> | null) {
  const oneH = frames["1h"] || [];
  const fourH = frames["4h"] || oneH;
  const daily = frames["1D"] || fourH;
  const weekly = frames["1W"] || daily;
  const source = oneH.length ? oneH : daily;
  const last = source[source.length - 1];
  const price = ticker && finite(ticker.price) ? (ticker.price as number) : last ? last.c : 0;
  const sma20 = calcSma(daily, Math.min(20, Math.max(5, daily.length - 1)));
  const sma50 = calcSma(daily, Math.min(50, Math.max(5, daily.length - 1)));
  const sma4h20 = calcSma(fourH, Math.min(20, Math.max(5, fourH.length - 1)));
  const atr1h = calcAtr(oneH, 14) || price * 0.006;
  const atr4h = calcAtr(fourH, 14) || price * 0.014;
  const atrDaily = calcAtr(daily, 14) || price * 0.035;
  const atrWeekly = calcAtr(weekly, 14) || atrDaily * 3;
  const ranges = daily.slice(-180).map((c) => c.h - c.l);
  const currentDailyRange = daily.length ? daily[daily.length - 1].h - daily[daily.length - 1].l : atrDaily;
  const atrPct = price ? (atrDaily / price) * 100 : 0;
  const change = ticker && finite(ticker.chg) ? (ticker.chg as number) : daily.length > 1 ? ((daily[daily.length - 1].c - daily[daily.length - 2].c) / daily[daily.length - 2].c) * 100 : 0;
  const rsiDaily = calcRsi(daily, 14) || 50;
  const rsi1h = calcRsi(oneH, 14) || rsiDaily;
  const structure = structureFrom(fourH.length >= 34 ? fourH : daily);
  const volatilityPercentile = percentile(ranges, currentDailyRange);
  const trendUp = price > (sma20 || price) && (!sma50 || (sma20 || 0) >= sma50);
  const trendDown = price < (sma20 || price) && (!sma50 || (sma20 || 0) <= sma50);
  return {
    price,
    change,
    sma20,
    sma50,
    sma4h20,
    atr1h,
    atr4h,
    atrDaily,
    atrWeekly,
    atrPct,
    rsiDaily,
    rsi1h,
    structure,
    volatilityPercentile,
    trend: trendUp ? "Bullish" : trendDown ? "Bearish" : "Neutral",
    daily,
    fourH,
    oneH,
    weekly
  };
}

export function classifyEnvironment(summary: any) {
  let environment = "Range";
  if (summary.volatilityPercentile >= 78 && summary.trend !== "Neutral") environment = "Expansion";
  else if (summary.volatilityPercentile <= 28) environment = "Compression";
  else if (summary.trend === "Bullish" && summary.rsiDaily >= 54) environment = "Bull Trend";
  else if (summary.trend === "Bearish" && summary.rsiDaily <= 46) environment = "Bear Trend";
  else if (summary.rsiDaily < 35) environment = "Capitulation";
  else if (summary.rsiDaily > 68) environment = "Distribution";

  const trendComponent = summary.trend === "Neutral" ? 45 : 65;
  const maDistance = summary.sma50 ? Math.abs((summary.price - summary.sma50) / summary.price) * 100 : 0;
  const strength = clamp(trendComponent + maDistance * 7 + Math.abs(summary.rsiDaily - 50), 20, 96);
  const confidence = clamp(45 + Math.abs(summary.rsiDaily - 50) + Math.min(summary.volatilityPercentile, 90) * 0.25, 20, 92);
  return { environment, strength, confidence };
}

export function btcConfirmation(ethSummary: any, btcSummary: any) {
  let score = 50;
  if (btcSummary.trend === ethSummary.trend && btcSummary.trend !== "Neutral") score += 25;
  if (btcSummary.trend === "Bullish") score += ethSummary.trend === "Bullish" ? 10 : -12;
  if (btcSummary.trend === "Bearish") score += ethSummary.trend === "Bearish" ? 10 : -12;
  if (btcSummary.rsiDaily > 55) score += 6;
  if (btcSummary.rsiDaily < 45) score -= 6;
  if (btcSummary.volatilityPercentile > 80) score -= 8;
  score = clamp(score, 5, 98);
  return {
    status: btcSummary.trend + " / " + btcSummary.structure,
    direction: btcSummary.trend,
    momentum: btcSummary.rsiDaily >= 55 ? "Positive" : btcSummary.rsiDaily <= 45 ? "Negative" : "Mixed",
    volatility: volatilityLabel(btcSummary.atrPct),
    score
  };
}

export function ethbtcStrength(ethbtcFrames: Record<string, Candle[]>) {
  const daily = ethbtcFrames["1D"] || [];
  const fourH = ethbtcFrames["4h"] || daily;
  const last = daily[daily.length - 1] || fourH[fourH.length - 1];
  const sma20 = calcSma(daily, Math.min(20, Math.max(5, daily.length - 1)));
  const sma50 = calcSma(daily, Math.min(50, Math.max(5, daily.length - 1)));
  const rsi = calcRsi(daily, 14) || 50;
  let score = 50;
  if (last && sma20 && last.c > sma20) score += 18;
  if (sma20 && sma50 && sma20 > sma50) score += 14;
  if (rsi > 55) score += 10;
  if (last && sma20 && last.c < sma20) score -= 18;
  if (sma20 && sma50 && sma20 < sma50) score -= 14;
  if (rsi < 45) score -= 10;
  score = clamp(score, 5, 95);
  return {
    ratio: last ? last.c : null,
    score,
    label: score >= 62 ? "Strong" : score <= 42 ? "Weak" : "Neutral",
    state: score >= 62 ? "ETH outperforming BTC" : score <= 42 ? "ETH underperforming BTC" : "Neutral"
  };
}

export function liquidityMap(summary: any, manual: ManualInputs) {
  const mapCandles = summary.fourH.length >= 80 ? summary.fourH : summary.daily;
  const above = swingLevels(mapCandles, "h", summary.price, summary.atr4h).filter((level) => level > summary.price);
  const below = swingLevels(mapCandles, "l", summary.price, summary.atr4h).filter((level) => level < summary.price);
  const fallbackHigh = Math.max(...mapCandles.slice(-60).map((c) => c.h));
  const fallbackLow = Math.min(...mapCandles.slice(-60).map((c) => c.l));
  const liquidityAbove = above.slice(0, 3).map((price, idx) => ({ price, label: idx === 0 ? "Nearest Sweep" : "Liquidity Above" }));
  const liquidityBelow = below.slice(0, 3).map((price, idx) => ({ price, label: idx === 0 ? "Nearest Sweep" : "Liquidity Below" }));
  if (!liquidityAbove.length) liquidityAbove.push({ price: fallbackHigh, label: "Range High" });
  if (!liquidityBelow.length) liquidityBelow.push({ price: fallbackLow, label: "Range Low" });

  const target = summary.trend === "Bearish" ? liquidityBelow[0].price : liquidityAbove[0].price;
  const sweep = summary.trend === "Bearish" ? "Downside sweep below " + liquidityBelow[0].price.toFixed(2) : "Upside sweep above " + liquidityAbove[0].price.toFixed(2);
  return {
    liquidityAbove,
    liquidityBelow,
    target,
    sweep,
    equalHighs: liquidityAbove.length > 1 ? liquidityAbove[0].price.toFixed(2) + " / " + liquidityAbove[1].price.toFixed(2) : "No clean equal highs",
    equalLows: liquidityBelow.length > 1 ? liquidityBelow[0].price.toFixed(2) + " / " + liquidityBelow[1].price.toFixed(2) : "No clean equal lows",
    manual: manual.liquidations || "No external liquidation heatmap supplied"
  };
}

export function empiricalProbabilities(candles: Candle[], points: number[], horizonBars: number) {
  const ranges: number[] = [];
  for (let i = 0; i <= candles.length - horizonBars; i++) {
    const slice = candles.slice(i, i + horizonBars);
    ranges.push(Math.max(...slice.map((c) => c.h)) - Math.min(...slice.map((c) => c.l)));
  }
  const fallback = average(candles.slice(-30).map((c) => c.h - c.l)) * Math.sqrt(horizonBars || 1);
  return points.map((point) => {
    const probability = ranges.length
      ? (ranges.filter((range) => range >= point).length / ranges.length) * 100
      : clamp(100 * Math.exp(-point / Math.max(1, fallback)), 1, 95);
    return { point, probability: clamp(probability, 1, 99) };
  });
}

export function weekdayModel(daily: Candle[], expectedWeeklyRange: number) {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const order = [1, 2, 3, 4, 5, 6, 0];
  const buckets = names.map(() => ({ ranges: [] as number[], trend: 0, total: 0 }));
  daily.forEach((c) => {
    const day = new Date(c.t * 1000).getUTCDay();
    const range = c.h - c.l;
    const body = Math.abs(c.c - c.o);
    buckets[day].ranges.push(range);
    buckets[day].total += 1;
    if (range && body / range > 0.45) buckets[day].trend += 1;
  });
  const nextDates = nextWeekDates();
  const allRange = average(daily.slice(-60).map((c) => c.h - c.l)) || expectedWeeklyRange / 4;
  return order.map((dayIndex, rowIndex) => {
    const bucket = buckets[dayIndex];
    const avgRange = average(bucket.ranges) || allRange;
    const trendProb = bucket.total ? (bucket.trend / bucket.total) * 100 : 45;
    const rangeProb = 100 - trendProb;
    const score = clamp((avgRange / Math.max(1, allRange)) * 45 + trendProb * 0.45, 10, 98);
    return {
      day: names[dayIndex],
      date: formatDate(nextDates[rowIndex]),
      historicalVolatilityRank: Math.round(clamp((avgRange / Math.max(1, allRange)) * 50, 1, 99)),
      expectedRange: avgRange,
      trendProbability: trendProb,
      rangeProbability: rangeProb,
      level: lvFromPoints(avgRange),
      grade: gradeFromScore(score)
    };
  });
}

export function sessionModel(hourly: Candle[]) {
  const sessions = [
    { name: "Asia", start: 0, end: 7 },
    { name: "London", start: 7, end: 13 },
    { name: "New York", start: 13, end: 20 },
    { name: "London-NY Overlap", start: 13, end: 16 }
  ];
  const baseline = average(hourly.slice(-240).map((c) => c.h - c.l)) || 1;
  return sessions
    .map((session) => {
      const rows = hourly.filter((c) => {
        const h = new Date(c.t * 1000).getUTCHours();
        return h >= session.start && h < session.end;
      });
      const ranges = rows.map((c) => c.h - c.l);
      const avgRange = average(ranges) || baseline;
      const breakout = rows.length
        ? (rows.filter((c) => Math.abs(c.c - c.o) / Math.max(1, c.h - c.l) > 0.55).length / rows.length) * 100
        : 45;
      const fakeout = rows.length
        ? (rows.filter((c) => ((c.h - Math.max(c.o, c.c)) + (Math.min(c.o, c.c) - c.l)) / Math.max(1, c.h - c.l) > 0.55).length / rows.length) * 100
        : 35;
      return {
        name: session.name,
        volatilityScore: clamp((avgRange / baseline) * 50, 5, 99),
        breakoutProbability: clamp(breakout, 1, 99),
        fakeoutProbability: clamp(fakeout, 1, 99),
        expectedRange: avgRange
      };
    })
    .sort((a, b) => b.volatilityScore - a.volatilityScore);
}

export function hourlyModel(hourly: Candle[]) {
  const buckets = Array.from({ length: 24 }, () => ({
    ranges: [] as number[],
    volumes: [] as number[],
    breakouts: 0,
    reversals: 0,
    total: 0
  }));
  hourly.forEach((c) => {
    const hour = new Date(c.t * 1000).getUTCHours();
    const range = c.h - c.l;
    const body = Math.abs(c.c - c.o);
    const wick = (c.h - Math.max(c.o, c.c)) + (Math.min(c.o, c.c) - c.l);
    buckets[hour].ranges.push(range);
    buckets[hour].volumes.push(c.v);
    buckets[hour].total += 1;
    if (range && body / range > 0.55) buckets[hour].breakouts += 1;
    if (range && wick / range > 0.58) buckets[hour].reversals += 1;
  });
  const baseline = average(hourly.slice(-240).map((c) => c.h - c.l)) || 1;
  return buckets.map((bucket, hour) => {
    const avgRange = average(bucket.ranges) || baseline * 0.7;
    const score = clamp((avgRange / baseline) * 50 + (bucket.total ? (bucket.breakouts / bucket.total) * 35 : 0), 1, 99);
    return {
      hour,
      utc: utcHourLabel(hour),
      ist: istHourLabel(hour),
      expectedRange: avgRange,
      level: lvFromPoints(avgRange),
      score,
      breakoutProbability: bucket.total ? (bucket.breakouts / bucket.total) * 100 : 35,
      reversalProbability: bucket.total ? (bucket.reversals / bucket.total) * 100 : 35,
      avoidScore: clamp(100 - score + (bucket.total ? (bucket.reversals / bucket.total) * 15 : 0), 1, 99)
    };
  });
}

export function macroModel(manual: ManualInputs) {
  const lines = manual.macro
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const risk = lines.some((line) => /extreme|fomc|cpi|nfp|rate/i.test(line)) ? "High" : lines.length ? "Medium" : "Unverified";
  const events = lines.length
    ? lines.map((line) => ({
        date: "Provided",
        day: "Provided",
        utc: "See note",
        ist: "See note",
        impact: /extreme/i.test(line) ? "Extreme" : /high|fomc|cpi|nfp|rate/i.test(line) ? "High" : "Medium",
        eth: line,
        btc: "Correlated risk-on/risk-off reaction",
        vol: "Elevated until event clears",
        avoid: "30 minutes before and after event"
      }))
    : [];
  return {
    risk,
    events,
    hasManualEvents: lines.length > 0,
    note: lines.length
      ? "Manual macro input supplied."
      : "Macro calendar is not connected. Add CPI, PCE, FOMC, NFP, Fed speeches, or major news times in Manual market inputs to include event-specific risk."
  };
}

export function derivativesModel(summary: any, futures: any, ticker: Partial<MarketStats> | null) {
  const funding = futures && finite(futures.funding) ? futures.funding : null;
  const oi = futures && finite(futures.oi) ? futures.oi : null;
  const priceMove = ticker && finite(ticker.chg) ? (ticker.chg as number) : summary.change;
  let bias = "Neutral";
  if (priceMove > 0 && oi) bias = "Long build-up or short covering";
  if (priceMove < 0 && oi) bias = "Short build-up or long liquidation";
  if (priceMove > 0 && funding !== null && funding < 0) bias = "Short covering risk";
  if (priceMove < 0 && funding !== null && funding > 0) bias = "Long liquidation risk";
  const crowding = clamp(50 + Math.abs(funding || 0) * 700 + Math.abs(priceMove) * 2, 5, 99);
  const risk = clamp(crowding + (summary.volatilityPercentile > 75 ? 12 : 0), 5, 99);
  return {
    bias,
    funding,
    oi,
    crowding,
    risk,
    liquidationRisk: risk,
    target: summary.trend === "Bearish" ? "Downside long liquidation cluster" : "Upside short liquidation cluster"
  };
}

export function volumeQuality(frames: Record<string, Candle[]>) {
  const hourly = frames["1h"] || [];
  const vols = hourly.slice(-120).map((c) => c.v);
  const latest = hourly.length ? hourly[hourly.length - 1].v : average(vols);
  const base = average(vols) || latest || 1;
  const score = clamp((latest / base) * 50, 5, 99);
  return {
    score,
    state: score >= 70 ? "Expansion" : score <= 35 ? "Contraction" : "Normal",
    latest,
    base
  };
}

export function momentumQuality(summary: any) {
  let score = 50;
  if (summary.trend === "Bullish") score += 18;
  if (summary.trend === "Bearish") score -= 18;
  score += (summary.rsi1h - 50) * 0.65;
  score += (summary.rsiDaily - 50) * 0.45;
  return clamp(score, 5, 98);
}

export function entryQuality(summary: any, liquidity: any) {
  const nearestSupport = liquidity.liquidityBelow[0].price;
  const nearestResistance = liquidity.liquidityAbove[0].price;
  const distSupport = Math.abs(summary.price - nearestSupport) / Math.max(1, summary.atr4h);
  const distResistance = Math.abs(nearestResistance - summary.price) / Math.max(1, summary.atr4h);
  const notMiddle = Math.min(distSupport, distResistance);
  return clamp(45 + Math.min(notMiddle, 2.5) * 16 - (summary.volatilityPercentile > 85 ? 12 : 0), 10, 95);
}

export function buildSetups(summary: any, liquidity: any, confidence: number): { long: TradeSetup; short: TradeSetup; breakout: TradeSetup; reversal: TradeSetup } {
  const price = summary.price;
  const atr = summary.atr4h || summary.atrDaily * 0.45;
  const support = liquidity.liquidityBelow[0].price;
  const resistance = liquidity.liquidityAbove[0].price;
  const longStop = Math.max(1, support - atr * 0.55);
  const shortStop = resistance + atr * 0.55;
  const symbol = "ETH";

  const fmtPrice = (val: number) => val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return {
    long: {
      entry: fmtPrice(Math.max(support, price - atr * 0.85)) + " to " + fmtPrice(Math.min(price, support + atr * 0.55)),
      stop: fmtPrice(longStop),
      tp1: fmtPrice(Math.max(resistance, price + atr * 1.2)),
      tp2: fmtPrice(price + atr * 2.1),
      tp3: fmtPrice(price + atr * 3.2),
      rr: ratio(price, longStop, price + atr * 2.1),
      hold: "1-4 sessions",
      confidence: Math.round(confidence)
    },
    short: {
      entry: fmtPrice(Math.max(price, resistance - atr * 0.65)) + " to " + fmtPrice(resistance),
      stop: fmtPrice(shortStop),
      tp1: fmtPrice(Math.min(support, price - atr * 1.2)),
      tp2: fmtPrice(price - atr * 2.1),
      tp3: fmtPrice(price - atr * 3.2),
      rr: ratio(price, shortStop, price - atr * 2.1),
      hold: "1-4 sessions",
      confidence: Math.round(100 - confidence)
    },
    breakout: {
      entry: "Close above " + fmtPrice(resistance) + " with expanding volume",
      stop: fmtPrice(resistance - atr * 0.65),
      tp1: fmtPrice(resistance + atr * 1.1),
      tp2: fmtPrice(resistance + atr * 2.0),
      tp3: fmtPrice(resistance + atr * 3.0),
      rr: "1:2.0+ if retest holds",
      hold: "6-36 hours",
      confidence: Math.round(clamp(confidence - 5, 20, 90))
    },
    reversal: {
      entry: "Sweep " + (summary.trend === "Bearish" ? fmtPrice(liquidity.liquidityBelow[0].price) : fmtPrice(liquidity.liquidityAbove[0].price)) + " and reclaim range",
      stop: "Outside sweep wick by 0.35 ATR",
      tp1: fmtPrice(price),
      tp2: fmtPrice(summary.trend === "Bearish" ? resistance : support),
      tp3: "Opposite liquidity pool",
      rr: "Requires live wick confirmation",
      hold: "Intraday",
      confidence: Math.round(clamp(62 + summary.volatilityPercentile * 0.18, 30, 86))
    }
  };
}

export function weightedScore(items: { score: number; weight: number }[]): number {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const total = items.reduce((sum, item) => sum + item.score * item.weight, 0);
  return totalWeight ? total / totalWeight : 0;
}

export function rollingRange(candles: Candle[], horizonBars: number): number {
  const ranges: number[] = [];
  for (let i = 0; i <= candles.length - horizonBars; i++) {
    const slice = candles.slice(i, i + horizonBars);
    ranges.push(Math.max(...slice.map((c) => c.h)) - Math.min(...slice.map((c) => c.l)));
  }
  return average(ranges);
}

export function buildWeeklyPlaybook(pack: any): WeeklyPlaybookResult {
  const eth = summarizeFrames(pack.eth.frames, pack.eth.ticker);
  const btc = summarizeFrames(pack.btc.frames, pack.btc.ticker);
  const env = classifyEnvironment(eth);
  const btcConfirm = btcConfirmation(eth, btc);
  const relative = ethbtcStrength(pack.ethbtc.frames);
  const liquidity = liquidityMap(eth, pack.manual);
  const weeklyRange = rollingRange(eth.daily, 7) || eth.atrDaily * Math.sqrt(7);
  const weeklyVolLevel = lvFromPoints(weeklyRange);
  const probabilities = empiricalProbabilities(eth.daily, [20, 40, 60, 80, 100, 120, 150], 7);
  const weekdays = weekdayModel(eth.daily, weeklyRange);
  const sessions = sessionModel(eth.oneH);
  const hours = hourlyModel(eth.oneH);
  const macro = macroModel(pack.manual);
  const deriv = derivativesModel(eth, pack.eth.futures, pack.eth.ticker);
  const volume = volumeQuality(pack.eth.frames);
  const momentum = momentumQuality(eth);
  const entry = entryQuality(eth, liquidity);

  const alignmentScore = weightedScore([
    { score: env.confidence, weight: 18 },
    { score: btcConfirm.score, weight: 16 },
    { score: relative.score, weight: 14 },
    { score: momentum, weight: 14 },
    { score: entry, weight: 12 },
    { score: volume.score, weight: 10 },
    { score: 100 - deriv.risk, weight: 8 },
    { score: macro.risk === "High" ? 45 : macro.risk === "Medium" ? 62 : 56, weight: 8 }
  ]);

  const bullishProb = clamp((eth.trend === "Bullish" ? 42 : 25) + relative.score * 0.25 + btcConfirm.score * 0.18 - deriv.risk * 0.08, 5, 75);
  const bearishProb = clamp((eth.trend === "Bearish" ? 42 : 24) + (100 - relative.score) * 0.20 + (100 - btcConfirm.score) * 0.15 + deriv.risk * 0.08, 5, 75);
  const rangeProb = clamp(100 - bullishProb - bearishProb, 10, 65);
  const setups = buildSetups(eth, liquidity, bullishProb);

  const bestDay = weekdays.slice().sort((a, b) => {
    const grades: Record<string, number> = { "S+": 7, "A+": 6, A: 5, "B+": 4, B: 3, C: 2, D: 1 };
    return (grades[b.grade] || 0) - (grades[a.grade] || 0);
  })[0] || { day: "Monday", date: "", grade: "B" };

  const topHours = hours.slice().sort((a, b) => b.score - a.score);
  const bestSession = sessions[0] || { name: "New York", volatilityScore: 80 };
  const worstSession = sessions[sessions.length - 1] || { name: "Asia", volatilityScore: 40 };

  const dayPlans = weekdays.map((day) => {
    const bias = eth.trend === "Bullish" && btcConfirm.score >= 55 ? "Bullish" : eth.trend === "Bearish" && btcConfirm.score >= 55 ? "Bearish" : "Neutral";
    const bestHours = topHours.slice(0, 2).map((h) => h.ist).join(", ");
    return {
      date: day.date,
      day: day.day,
      bias,
      expectedRange: day.expectedRange,
      expectedVolatility: day.level,
      expectedSession: bestSession.name,
      bestIst: bestHours,
      bestUtc: topHours.slice(0, 2).map((h) => h.utc).join(", "),
      avoid: hours.slice().sort((a, b) => b.avoidScore - a.avoidScore).slice(0, 2).map((h) => h.ist).join(", "),
      target: bias === "Bearish" ? liquidity.liquidityBelow[0].price.toFixed(2) : liquidity.liquidityAbove[0].price.toFixed(2),
      primary: bias === "Bullish" ? "Pullback into demand, then continuation toward upside liquidity." : bias === "Bearish" ? "Reject resistance, then rotate toward downside liquidity." : "Trade range edges only.",
      secondary: "If BTC disagrees, reduce size and wait for reclaim or rejection confirmation.",
      invalidation: "Daily close through opposite liquidity zone or macro volatility shock.",
      probability: Math.round(day.trendProbability)
    };
  });

  return {
    env,
    btcConfirm,
    relative,
    liquidity,
    weeklyRange,
    weeklyVolLevel,
    probabilities,
    weekdays,
    sessions,
    topHours,
    macro,
    deriv,
    volume,
    alignmentScore,
    bullishProb,
    bearishProb,
    rangeProb,
    blackSwanProb: macro.risk === "High" ? 9 : 4,
    setups,
    bestDay,
    bestSession,
    worstSession,
    dayPlans
  };
}

export function buildExecutionDecision(pack: any): ExecutionDecisionResult {
  const eth = summarizeFrames(pack.eth.frames, pack.eth.ticker);
  const btc = summarizeFrames(pack.btc.frames, pack.btc.ticker);
  const env = classifyEnvironment(eth);
  const btcConfirm = btcConfirmation(eth, btc);
  const relative = ethbtcStrength(pack.ethbtc.frames);
  const liquidity = liquidityMap(eth, pack.manual);
  const deriv = derivativesModel(eth, pack.eth.futures, pack.eth.ticker);
  const volume = volumeQuality(pack.eth.frames);
  const momentum = momentumQuality(eth);
  const entry = entryQuality(eth, liquidity);
  const macro = macroModel(pack.manual);
  const sessions = sessionModel(eth.oneH);

  const structureScore = clamp(eth.trend === "Neutral" ? 55 : 70 + Math.abs(eth.rsiDaily - 50) * 0.6, 10, 96);
  const liquidityScore = clamp(70 - (Math.min(Math.abs(eth.price - liquidity.liquidityAbove[0].price), Math.abs(eth.price - liquidity.liquidityBelow[0].price)) / Math.max(1, eth.atr4h)) * 6, 25, 95);
  const macroScore = macro.risk === "High" ? 35 : macro.risk === "Medium" ? 58 : 54;
  const sessionScore = sessions[0] ? sessions[0].volatilityScore : 55;
  const liquidationsScore = clamp(100 - deriv.liquidationRisk, 5, 95);
  const derivativesScore = clamp(100 - deriv.risk, 5, 95);

  const items = [
    { name: "Market Environment", score: env.confidence, weight: 10 },
    { name: "BTC Confirmation", score: btcConfirm.score, weight: 10 },
    { name: "ETHBTC Strength", score: relative.score, weight: 10 },
    { name: "Structure", score: structureScore, weight: 15 },
    { name: "Liquidity", score: liquidityScore, weight: 10 },
    { name: "Liquidations", score: liquidationsScore, weight: 10 },
    { name: "Derivatives", score: derivativesScore, weight: 10 },
    { name: "Volume", score: volume.score, weight: 10 },
    { name: "Momentum", score: momentum, weight: 5 },
    { name: "Entry Quality", score: entry, weight: 5 },
    { name: "Macro", score: macroScore, weight: 5 },
    { name: "Session", score: sessionScore, weight: 5 }
  ];

  let confidence = weightedScore(items);
  const ethDirection = eth.trend;
  const btcDisagrees = btc.trend !== "Neutral" && ethDirection !== "Neutral" && btc.trend !== ethDirection;
  if (btcDisagrees) confidence *= 0.70;

  const grade = confidence < 75 ? "NO TRADE" : gradeFromScore(confidence);
  const direction = confidence < 75 ? "NO TRADE" : eth.trend === "Bullish" && btcConfirm.score >= 55 ? (confidence >= 90 ? "STRONG LONG" : "LONG") : eth.trend === "Bearish" && btcConfirm.score >= 55 ? (confidence >= 90 ? "STRONG SHORT" : "SHORT") : "NO TRADE";
  const setups = buildSetups(eth, liquidity, confidence);
  const selected = direction.includes("SHORT") ? setups.short : setups.long;
  const finalVerdict = direction === "NO TRADE" ? "NO TRADE" : "EXECUTE";

  return {
    direction,
    finalVerdict,
    grade,
    confidence,
    btcDisagrees,
    env,
    btcConfirm,
    relative,
    liquidity,
    deriv,
    volume,
    momentum,
    entry,
    macro,
    sessions,
    structureScore,
    liquidityScore,
    liquidationsScore,
    derivativesScore,
    sessionScore,
    macroScore,
    items,
    setups,
    selected
  };
}

export function seasonalityModel(daily: Candle[]) {
  const months = Array.from({ length: 12 }, () => ({ returns: [] as number[], ranges: [] as number[], trend: 0, total: 0 }));
  const quarters = Array.from({ length: 4 }, () => ({ returns: [] as number[], ranges: [] as number[], trend: 0, total: 0 }));

  for (let i = 1; i < daily.length; i++) {
    const c = daily[i];
    const prev = daily[i - 1];
    const month = new Date(c.t * 1000).getUTCMonth();
    const quarter = Math.floor(month / 3);
    const ret = prev.c ? ((c.c - prev.c) / prev.c) * 100 : 0;
    const range = c.h - c.l;
    const body = Math.abs(c.c - c.o);
    months[month].returns.push(ret);
    months[month].ranges.push(range);
    months[month].total += 1;
    quarters[quarter].returns.push(ret);
    quarters[quarter].ranges.push(range);
    quarters[quarter].total += 1;
    if (range && body / range > 0.45) {
      months[month].trend += 1;
      quarters[quarter].trend += 1;
    }
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthRows = months.map((m, index) => ({
    name: monthNames[index],
    avgMove: average(m.returns),
    medianMove: median(m.returns),
    volatility: average(m.ranges),
    trendProbability: m.total ? (m.trend / m.total) * 100 : 0
  }));

  const quarterRows = quarters.map((q, index) => ({
    name: "Q" + (index + 1),
    avgMove: average(q.returns),
    volatility: average(q.ranges),
    expansionProbability: q.total ? (q.trend / q.total) * 100 : 0
  }));

  return { months: monthRows, quarters: quarterRows };
}

export function volatilityClusterModel(daily: Candle[]) {
  const thresholds = [50, 80, 120, 200];
  return thresholds.map((threshold) => {
    const outcomes: { nextRange: number; continuation: boolean; expanded: boolean; contracted: boolean }[] = [];
    for (let i = 1; i < daily.length - 1; i++) {
      const range = daily[i].h - daily[i].l;
      if (range >= threshold) {
        const nextRange = daily[i + 1].h - daily[i + 1].l;
        const continuation = Math.sign(daily[i].c - daily[i].o) === Math.sign(daily[i + 1].c - daily[i + 1].o);
        outcomes.push({
          nextRange,
          continuation,
          expanded: nextRange > range,
          contracted: nextRange < range * 0.75
        });
      }
    }
    const count = outcomes.length || 1;
    return {
      trigger: threshold + "+ point day",
      continuation: (outcomes.filter((o) => o.continuation).length / count) * 100,
      expansion: (outcomes.filter((o) => o.expanded).length / count) * 100,
      contraction: (outcomes.filter((o) => o.contracted).length / count) * 100,
      meanReversion: (outcomes.filter((o) => !o.continuation).length / count) * 100
    };
  });
}

export function expectancyModel(daily: Candle[], confidence: number) {
  const returns = candleReturns(daily).slice(-180);
  const wins = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r < 0);
  const avgWin = average(wins);
  const avgLoss = Math.abs(average(losses));
  const winRate = returns.length ? (wins.length / returns.length) * 100 : 50;
  const lossRate = 100 - winRate;
  const expectedValue = (winRate / 100) * avgWin - (lossRate / 100) * avgLoss;
  const profitFactor = avgLoss ? ((winRate / 100) * avgWin) / ((lossRate / 100) * avgLoss) : 0;
  const mean = average(returns);
  const variance = average(returns.map((r) => Math.pow(r - mean, 2)));
  const sharpe = variance ? mean / Math.sqrt(variance) : 0;
  return {
    expectedValue,
    avgWin,
    avgLoss,
    winRate,
    lossRate,
    profitFactor,
    sharpe,
    score: clamp(confidence + expectedValue * 5 + (profitFactor - 1) * 12, 1, 98)
  };
}

export function buildQuantReport(pack: any): QuantReportResult {
  const weekly = buildWeeklyPlaybook(pack);
  const eth = summarizeFrames(pack.eth.frames, pack.eth.ticker);
  const btc = summarizeFrames(pack.btc.frames, pack.btc.ticker);
  const env = weekly.env;

  const ranges = eth.daily.slice(-365).map((c: Candle) => c.h - c.l);
  const atr30 = average(ranges.slice(-30));
  const atr90 = average(ranges.slice(-90));
  const atr180 = average(ranges.slice(-180));
  const atr365 = average(ranges);
  const currentRange = eth.daily.length ? eth.daily[eth.daily.length - 1].h - eth.daily[eth.daily.length - 1].l : eth.atrDaily;
  const volPercentile = percentile(ranges, currentRange);

  const movement24 = empiricalProbabilities(eth.daily, [10, 20, 40, 60, 80, 100, 120, 150, 200, 300], 1);
  const movement48 = empiricalProbabilities(eth.daily, [10, 20, 40, 60, 80, 100, 120, 150, 200, 300], 2);
  const movement72 = empiricalProbabilities(eth.daily, [10, 20, 40, 60, 80, 100, 120, 150, 200, 300], 3);
  const movementWeek = empiricalProbabilities(eth.daily, [10, 20, 40, 60, 80, 100, 120, 150, 200, 300], 7);

  const ethRet = candleReturns(eth.daily);
  const btcRet = candleReturns(btc.daily);
  const corr30 = correlation(ethRet.slice(-30), btcRet.slice(-30));
  const corr90 = correlation(ethRet.slice(-90), btcRet.slice(-90));
  const corr180 = correlation(ethRet.slice(-180), btcRet.slice(-180));
  const corr365 = correlation(ethRet.slice(-365), btcRet.slice(-365));

  const seasonality = seasonalityModel(eth.daily);
  const clusters = volatilityClusterModel(eth.daily);
  const expectancy = expectancyModel(eth.daily, weekly.alignmentScore);
  const riskRegime = weekly.macro.risk === "High" || weekly.deriv.risk > 78 || volPercentile > 85 ? "High Risk" : volPercentile < 30 ? "Low Risk" : "Medium Risk";

  const decisionScore = weightedScore([
    { score: weekly.alignmentScore, weight: 24 },
    { score: expectancy.score, weight: 18 },
    { score: weekly.relative.score, weight: 14 },
    { score: weekly.btcConfirm.score, weight: 14 },
    { score: 100 - weekly.deriv.risk, weight: 12 },
    { score: 100 - Math.abs((corr30 || 0) * 35), weight: 6 },
    { score: riskRegime === "High Risk" ? 35 : riskRegime === "Low Risk" ? 75 : 62, weight: 12 }
  ]);

  const finalDecision = decisionScore < 80 ? "NO TRADE" : eth.trend === "Bullish" ? "LONG" : eth.trend === "Bearish" ? "SHORT" : "WEAK LONG/SHORT ONLY AT RANGE EDGE";

  return {
    weekly,
    env,
    eth,
    btc,
    atr30,
    atr90,
    atr180,
    atr365,
    volPercentile,
    movement24,
    movement48,
    movement72,
    movementWeek,
    corr30,
    corr90,
    corr180,
    corr365,
    seasonality,
    clusters,
    expectancy,
    riskRegime,
    decisionScore,
    finalDecision
  };
}
