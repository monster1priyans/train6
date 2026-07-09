export interface Candle {
  t: number; // Unix timestamp in seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type SymbolType = "ETH" | "BTC";
export type TimeframeType = "5m" | "15m" | "1h" | "4h" | "1D";

export interface SymbolMetadata {
  product: string;
  binance: string;
  bybit: string;
  precision: number;
  demo: number;
}

export interface TimeframeMetadata {
  label: string;
  seconds: number;
  binance: string;
  bybit: string;
  coinbase: number | null;
}

export interface MarketStats {
  price: number | null;
  chg: number | null;
  hi: number | null;
  lo: number | null;
  vol: number | null;
  oi: number | null;
  funding: number | null;
  source: string;
  demo: boolean;
}

export interface ManualInputs {
  btcDominance: number | null;
  fearGreed: number | null;
  macro: string;
  flows: string;
  liquidations: string;
}

export interface AnalysisResult {
  bias: string;
  biasClass: string;
  verdict: string;
  verdictClass: string;
  score: number;
  structure: string;
  bos: string;
  rsi: number;
  atrPct: number;
  volatility: string;
  change: number;
  supports: { price: number; label: string }[];
  resistances: { price: number; label: string }[];
  setup: {
    direction: string;
    entry: string;
    trigger: string;
    sl: number | null;
    tp1: number | null;
    tp2: number | null;
    tp3: number | null;
    rr: string;
    invalidation: string;
    psychology: string;
  };
  context: string;
}

export interface WeeklyPlaybookResult {
  env: { environment: string; strength: number; confidence: number };
  btcConfirm: { direction: string; momentum: string; status: string; volatility: string; score: number };
  relative: { ratio: number | null; score: number; label: string; state: string };
  liquidity: {
    liquidityAbove: { price: number; label: string }[];
    liquidityBelow: { price: number; label: string }[];
    target: number;
    sweep: string;
    equalHighs: string;
    equalLows: string;
    manual: string;
  };
  weeklyRange: number;
  weeklyVolLevel: string;
  probabilities: { point: number; probability: number }[];
  weekdays: {
    day: string;
    date: string;
    historicalVolatilityRank: number;
    expectedRange: number;
    trendProbability: number;
    rangeProbability: number;
    level: string;
    grade: string;
  }[];
  sessions: {
    name: string;
    volatilityScore: number;
    breakoutProbability: number;
    fakeoutProbability: number;
    expectedRange: number;
  }[];
  topHours: {
    hour: number;
    utc: string;
    ist: string;
    expectedRange: number;
    level: string;
    score: number;
    breakoutProbability: number;
    reversalProbability: number;
    avoidScore: number;
  }[];
  macro: { risk: string; events: any[]; hasManualEvents: boolean; note: string };
  deriv: { bias: string; funding: number | null; oi: number | null; crowding: number; risk: number; liquidationRisk: number; target: string };
  volume: { score: number; state: string; latest: number; base: number };
  alignmentScore: number;
  bullishProb: number;
  bearishProb: number;
  rangeProb: number;
  blackSwanProb: number;
  setups: {
    long: TradeSetup;
    short: TradeSetup;
    breakout: TradeSetup;
    reversal: TradeSetup;
  };
  bestDay: { day: string; date: string; grade: string };
  bestSession: { name: string; volatilityScore: number };
  worstSession: { name: string; volatilityScore: number };
  dayPlans: DayPlan[];
}

export interface TradeSetup {
  entry: string;
  stop: string;
  tp1: string;
  tp2: string;
  tp3: string;
  rr: string;
  hold: string;
  confidence: number;
}

export interface DayPlan {
  date: string;
  day: string;
  bias: string;
  expectedRange: number;
  expectedVolatility: string;
  expectedSession: string;
  bestIst: string;
  bestUtc: string;
  avoid: string;
  target: string;
  primary: string;
  secondary: string;
  invalidation: string;
  probability: number;
}

export interface ExecutionDecisionResult {
  direction: string;
  finalVerdict: string;
  grade: string;
  confidence: number;
  btcDisagrees: boolean;
  env: { environment: string; strength: number; confidence: number };
  btcConfirm: { direction: string; momentum: string; status: string; volatility: string; score: number };
  relative: { ratio: number | null; score: number; label: string; state: string };
  liquidity: {
    liquidityAbove: { price: number; label: string }[];
    liquidityBelow: { price: number; label: string }[];
    target: number;
    sweep: string;
    equalHighs: string;
    equalLows: string;
    manual: string;
  };
  deriv: { bias: string; funding: number | null; oi: number | null; crowding: number; risk: number; liquidationRisk: number; target: string };
  volume: { score: number; state: string; latest: number; base: number };
  momentum: number;
  entry: number;
  macro: { risk: string; events: any[]; hasManualEvents: boolean; note: string };
  sessions: any[];
  structureScore: number;
  liquidityScore: number;
  liquidationsScore: number;
  derivativesScore: number;
  sessionScore: number;
  macroScore: number;
  items: { name: string; weight: number; score: number }[];
  setups: { long: TradeSetup; short: TradeSetup; breakout: TradeSetup; reversal: TradeSetup };
  selected: TradeSetup;
}

export interface QuantReportResult {
  weekly: WeeklyPlaybookResult;
  env: { environment: string; strength: number; confidence: number };
  eth: any;
  btc: any;
  atr30: number;
  atr90: number;
  atr180: number;
  atr365: number;
  volPercentile: number;
  movement24: { point: number; probability: number }[];
  movement48: { point: number; probability: number }[];
  movement72: { point: number; probability: number }[];
  movementWeek: { point: number; probability: number }[];
  corr30: number | null;
  corr90: number | null;
  corr180: number | null;
  corr365: number | null;
  seasonality: {
    months: { name: string; avgMove: number; medianMove: number; volatility: number; trendProbability: number }[];
    quarters: { name: string; avgMove: number; volatility: number; expansionProbability: number }[];
  };
  clusters: { trigger: string; continuation: number; expansion: number; contraction: number; meanReversion: number }[];
  expectancy: { expectedValue: number; avgWin: number; avgLoss: number; winRate: number; lossRate: number; profitFactor: number; sharpe: number; score: number };
  riskRegime: string;
  decisionScore: number;
  finalDecision: string;
}

export interface PriceAlert {
  id: string;
  symbol: SymbolType;
  type: "support" | "resistance";
  levelPrice: number;
  label: string;
  crossedPrice: number;
  direction: "up" | "down";
  timestamp: string;
  read: boolean;
}

export interface DemoAccount {
  currency: "USDC" | "USDT";
  startingBalance: number;
  balance: number;
  openPositions: OpenPosition[];
  closedTrades: ClosedTrade[];
  createdAt: string;
}

export interface OpenPosition {
  id: string;
  symbol: SymbolType;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  currentPrice: number;
  size: number; // raw USD size (including leverage)
  margin: number; // size / leverage
  leverage: number;
  stopLoss: number;
  takeProfit: number | null;
  openedAt: string;
  lastFundingAppliedAt: string; // ISO string
  feePaid: number;
  fundingPaid: number;
}

export interface ClosedTrade {
  id: string;
  symbol: SymbolType;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  size: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number | null;
  pnl: number;
  pnlPct: number;
  duration: string;
  closeReason: "stop" | "target" | "manual" | "liquidation";
  closedAt: string;
  feePaid: number;
  fundingPaid: number;
}

