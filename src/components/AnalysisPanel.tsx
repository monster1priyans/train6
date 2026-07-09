import React from "react";
import {
  ManualInputs,
  AnalysisResult,
  WeeklyPlaybookResult,
  ExecutionDecisionResult,
  QuantReportResult,
  SymbolType,
  TimeframeType,
  PriceAlert,
  DemoAccount
} from "../types";
import { formatPrice, formatPct, formatVolume } from "../utils/format";
import { scoreClass, gradeFromScore, clamp } from "../utils/math";
import { DemoTradeTab } from "./DemoTradeTab";

interface AnalysisPanelProps {
  symbol: SymbolType;
  timeframe: TimeframeType;
  manualInputs: ManualInputs;
  onManualInputChange: (inputs: ManualInputs) => void;
  activeReport: "signal" | "weekly" | "execution" | "quant" | "demo";
  onReportChange: (report: "signal" | "weekly" | "execution" | "quant" | "demo") => void;
  onRunAnalysis: (reportType: "signal" | "weekly" | "execution" | "quant" | "demo") => void;
  isAnalyzing: boolean;
  signalReport: AnalysisResult | null;
  weeklyReport: WeeklyPlaybookResult | null;
  executionReport: ExecutionDecisionResult | null;
  quantReport: QuantReportResult | null;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  alerts?: PriceAlert[];
  demoAccount: DemoAccount | null;
  onInitializeDemo: (currency: "USDC" | "USDT", startingBalance: number) => void;
  onOpenPositionDemo: (position: any) => string | null;
  onClosePositionDemo: (id: string, isManual?: boolean) => void;
  onForceFundingDemo: (id: string) => void;
  onResetDemo: () => void;
  currentPrice: number;
  currentFundingRate: number | null;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  symbol,
  timeframe,
  manualInputs,
  onManualInputChange,
  activeReport,
  onReportChange,
  onRunAnalysis,
  isAnalyzing,
  signalReport,
  weeklyReport,
  executionReport,
  quantReport,
  isFocusMode = false,
  onToggleFocusMode,
  alerts = [],
  demoAccount,
  onInitializeDemo,
  onOpenPositionDemo,
  onClosePositionDemo,
  onForceFundingDemo,
  onResetDemo,
  currentPrice,
  currentFundingRate
}) => {
  const handleInputChange = (field: keyof ManualInputs, value: string) => {
    let parsedValue: any = value;
    if (field === "btcDominance" || field === "fearGreed") {
      const clean = value.replace(/[^0-9.-]/g, "");
      parsedValue = clean !== "" ? Number(clean) : null;
    }
    onManualInputChange({
      ...manualInputs,
      [field]: parsedValue
    });
  };

  const sectionCard = (title: string, children: React.ReactNode, highlight = false) => (
    <article
      key={title}
      className={`signal-card ${highlight ? "highlight border-[rgba(117,221,183,0.32)]" : ""}`}
    >
      <div className="card-title">
        <span>{title}</span>
      </div>
      <div className="report-block flex flex-col gap-2">{children}</div>
    </article>
  );

  const kvHtml = (label: string, value: React.ReactNode) => (
    <div key={label} className="kv">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );

  const levelHtml = (label: string, level: { price: number; label: string }, cls: "support" | "resistance") => {
    const matchingAlert = alerts.find(
      (alt) => alt.symbol === symbol && alt.levelPrice === level.price && alt.type === cls
    );
    return (
      <div key={label + level.price} className={`level-row ${cls}`}>
        <span>{label}</span>
        <strong className="flex items-center gap-1.5 flex-wrap justify-end">
          <span>{formatPrice(level.price, symbol)} - {level.label}</span>
          {matchingAlert && (
            <span
              className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider animate-pulse ${
                matchingAlert.direction === "up"
                  ? "bg-[var(--up-soft)] text-[var(--up)] border border-[var(--up)]/20"
                  : "bg-[var(--down-soft)] text-[var(--down)] border border-[var(--down)]/20"
              }`}
              title={`Price crossed ${matchingAlert.direction === "up" ? "upwards" : "downwards"} at ${matchingAlert.timestamp}`}
            >
              Crossed {matchingAlert.direction === "up" ? "▲" : "▼"}
            </span>
          )}
        </strong>
      </div>
    );
  };

  const decisionRow = (label: string, value: string) => (
    <div key={label} className="decision-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );

  const tableHtml = (headers: string[], rows: (string | number)[][]) => (
    <div className="overflow-x-auto w-full my-2">
      <table className="mini-table w-full border-collapse">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {row.map((cell, cIdx) => (
                <td key={cIdx}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Render Reports
  /* Signal Engine: Builds and renders momentum, trend, and support/resistance zones */
  const renderSignal = (a: AnalysisResult) => {
    return (
      <div className="flex flex-col gap-3">
        {sectionCard(
          "Signal Analysis",
          <>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-[var(--muted)]">Calculated Strength</span>
              <div className="score flex items-baseline gap-1">
                <strong className="text-2xl font-bold text-[var(--accent)]">{a.score.toFixed(1)}</strong>
                <span className="text-xs text-[var(--muted)]">/10</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              <span className={`badge ${a.biasClass}`}>{a.bias}</span>
              <span className={`badge ${a.verdictClass}`}>{a.verdict}</span>
              <span className="badge gold">{a.volatility} Volatility</span>
            </div>
            <p className="copy mt-1 text-sm">{a.context}</p>
          </>,
          true
        )}

        {sectionCard(
          "Market Structure",
          <>
            {kvHtml("Structure Bias", a.structure)}
            {kvHtml("BOS / CHoCH", a.bos)}
            {kvHtml("Relative Strength Index", a.rsi.toFixed(1))}
            {kvHtml("Average True Range", a.atrPct.toFixed(2) + "%")}
          </>
        )}

        {sectionCard(
          "Support & Resistance Zones",
          <div className="levels flex flex-col gap-2">
            {a.resistances.map((lvl) => levelHtml("Resistance", lvl, "resistance"))}
            {a.supports.map((lvl) => levelHtml("Support", lvl, "support"))}
          </div>
        )}

        {sectionCard(
          "Target & Execution Setup",
          <>
            {kvHtml("Direction", a.setup.direction)}
            {kvHtml("Entry Zone", a.setup.entry)}
            {kvHtml("Execution Trigger", a.setup.trigger)}
            {kvHtml("Stop Loss", a.setup.sl ? formatPrice(a.setup.sl, symbol) : "N/A")}
            {kvHtml("Target 1 (1.2x ATR)", a.setup.tp1 ? formatPrice(a.setup.tp1, symbol) : "N/A")}
            {kvHtml("Target 2 (2.1x ATR)", a.setup.tp2 ? formatPrice(a.setup.tp2, symbol) : "N/A")}
            {kvHtml("Target 3 (3.2x ATR)", a.setup.tp3 ? formatPrice(a.setup.tp3, symbol) : "N/A")}
            {kvHtml("Risk/Reward Ratio", a.setup.rr)}
          </>
        )}

        {sectionCard("Setup Invalidation", <p className="copy text-sm">{a.setup.invalidation}</p>)}

        {sectionCard("Execution Psychology", <p className="copy text-sm">{a.setup.psychology}</p>)}
      </div>
    );
  };

  /* Weekly Playbook Engine: Models probability of target sweeps, session profiles, and day plans */
  const renderWeekly = (model: WeeklyPlaybookResult) => {
    const finalBias =
      model.bullishProb > model.bearishProb && model.bullishProb > model.rangeProb
        ? "Bullish"
        : model.bearishProb > model.rangeProb
        ? "Bearish"
        : "Range";

    const finalGrade = gradeFromScore(model.alignmentScore);

    const probRows = model.probabilities.map((p) => [
      p.point + "+ points",
      p.probability.toFixed(1) + "%",
      p.point >= 80 ? "High" : "Normal"
    ]);

    const weekdayRows = model.weekdays.map((d) => [
      d.day,
      d.date,
      d.historicalVolatilityRank + "/100",
      formatPrice(d.expectedRange, symbol),
      d.trendProbability.toFixed(0) + "%",
      d.rangeProbability.toFixed(0) + "%",
      d.level,
      d.grade
    ]);

    const sessionRows = model.sessions.map((s) => [
      s.name,
      s.volatilityScore.toFixed(0) + "/100",
      s.breakoutProbability.toFixed(0) + "%",
      s.fakeoutProbability.toFixed(0) + "%",
      formatPrice(s.expectedRange, symbol)
    ]);

    const topHoursRows = model.topHours.slice(0, 5).map((h) => [
      h.utc,
      h.ist,
      formatPrice(h.expectedRange, symbol),
      h.level
    ]);

    const dayPlansRows = model.dayPlans.map((d) => [
      d.day + " " + d.date,
      d.bias,
      formatPrice(d.expectedRange, symbol),
      d.expectedVolatility,
      d.expectedSession,
      d.bestIst,
      d.avoid,
      d.target,
      d.probability + "%"
    ]);

    const setupOpportunitiesRows = [
      [
        "Best Long",
        model.setups.long.entry,
        model.setups.long.stop,
        model.setups.long.tp1,
        model.setups.long.tp2,
        model.setups.long.tp3,
        model.setups.long.rr,
        model.setups.long.hold,
        model.setups.long.confidence + "%"
      ],
      [
        "Best Short",
        model.setups.short.entry,
        model.setups.short.stop,
        model.setups.short.tp1,
        model.setups.short.tp2,
        model.setups.short.tp3,
        model.setups.short.rr,
        model.setups.short.hold,
        model.setups.short.confidence + "%"
      ],
      [
        "Breakout",
        model.setups.breakout.entry,
        model.setups.breakout.stop,
        model.setups.breakout.tp1,
        model.setups.breakout.tp2,
        model.setups.breakout.tp3,
        model.setups.breakout.rr,
        model.setups.breakout.hold,
        model.setups.breakout.confidence + "%"
      ],
      [
        "Reversal",
        model.setups.reversal.entry,
        model.setups.reversal.stop,
        model.setups.reversal.tp1,
        model.setups.reversal.tp2,
        model.setups.reversal.tp3,
        model.setups.reversal.rr,
        model.setups.reversal.hold,
        model.setups.reversal.confidence + "%"
      ]
    ];

    return (
      <div className="flex flex-col gap-3">
        {sectionCard(
          "Weekly Environment",
          <>
            {kvHtml("Current Regime", model.env.environment)}
            {kvHtml("Weekly Alignment Score", Math.round(model.alignmentScore) + "/100")}
            {kvHtml("Expected Weekly Volatility", model.weeklyVolLevel + " / " + formatPrice(model.weeklyRange, symbol))}
          </>,
          true
        )}

        {sectionCard(
          "BTC Convergence Confirmation",
          <>
            {kvHtml("BTC Directional Bias", model.btcConfirm.direction)}
            {kvHtml("BTC Momentum Regime", model.btcConfirm.momentum)}
            {kvHtml("BTC Trend Structure", model.btcConfirm.status)}
            {kvHtml("BTC Volatility Level", model.btcConfirm.volatility)}
            {kvHtml("BTC Correlation Score", Math.round(model.btcConfirm.score) + "/100")}
          </>
        )}

        {sectionCard(
          "ETHBTC Relative Strength",
          <>
            {kvHtml("Strength Assessment", model.relative.label)}
            {kvHtml("Current Trend", model.relative.state)}
            {kvHtml("ETHBTC Ratio", model.relative.ratio ? model.relative.ratio.toFixed(5) : "N/A")}
            {kvHtml("Outperformance Score", Math.round(model.relative.score) + "/100")}
          </>
        )}

        {sectionCard(
          "Weekly Liquidity Targets",
          <>
            <div className="levels flex flex-col gap-2 mb-3">
              {model.liquidity.liquidityAbove.map((l) => levelHtml("Sweep Target", l, "resistance"))}
              {model.liquidity.liquidityBelow.map((l) => levelHtml("Sweep Target", l, "support"))}
            </div>
            {kvHtml("Equal High Zones", model.liquidity.equalHighs)}
            {kvHtml("Equal Low Zones", model.liquidity.equalLows)}
            {kvHtml("Primary Liquidity Target", formatPrice(model.liquidity.target, symbol))}
            {kvHtml("Sweeping Bias", model.liquidity.sweep)}
          </>
        )}

        {sectionCard(
          "Volatility Move Probabilities",
          tableHtml(["Move threshold", "Occurrence Probability", "Volatility Level"], probRows)
        )}

        {sectionCard(
          "Weekday Volatility Profile",
          tableHtml(["Day", "Date", "Vol Rank", "Expected Range", "Trend Prob", "Range Prob", "Level", "Grade"], weekdayRows)
        )}

        {sectionCard(
          "Session Dynamics",
          <>
            {tableHtml(["Session", "Vol Rank", "Breakout %", "Fakeout %", "Expected Range"], sessionRows)}
            {kvHtml("Highest Volatility Session", model.bestSession.name)}
            {kvHtml("Most Compressed Session", model.worstSession.name)}
          </>
        )}

        {sectionCard(
          "Hourly Volatility Rankings",
          <>
            {tableHtml(["UTC Hour", "IST Hour", "Expected Range", "Volatility Level"], topHoursRows)}
          </>
        )}

        {sectionCard(
          "Macro Risk Profile",
          <>
            {kvHtml("Macro Event Risk", model.macro.risk)}
            {model.macro.events.length > 0 ? (
              <div className="mt-2 text-xs text-[var(--gold)] border border-[rgba(245,196,81,0.24)] bg-[var(--gold-soft)] p-2 rounded">
                Manual events provided. Avoid trading 30 minutes before and after these events.
              </div>
            ) : (
              <div className="mt-2 text-xs text-[var(--muted)] bg-white/5 p-2 rounded">
                {model.macro.note}
              </div>
            )}
          </>
        )}

        {sectionCard(
          "Day-by-Day Strategic Playbook",
          tableHtml(["Day / Date", "Bias", "Range", "Volatility", "Session", "Best IST", "Avoid", "Target", "Prob"], dayPlansRows)
        )}

        {sectionCard(
          "Weekly Trade Setups",
          tableHtml(["Setup", "Entry Zone", "Stop Loss", "TP1", "TP2", "TP3", "R/R", "Hold Time", "Confidence"], setupOpportunitiesRows)
        )}

        {sectionCard(
          "Capital Risk Framework",
          <>
            {kvHtml("Optimal Risk per Trade", model.alignmentScore >= 80 ? "0.50% to 1.00%" : "0.25% to 0.50%")}
            {kvHtml("Max Daily Capital Drawdown", "1.50% or 2 stopped trades")}
            {kvHtml("Max Weekly Allocation Loss", "3.00% hard account stop")}
            {kvHtml("Leverage Cap Guidelines", model.env.environment === "Expansion" ? "1x to 2x" : "1x to 3x")}
            {kvHtml("Volatility Size Adjustments", `${model.weeklyVolLevel}: scale down positions if ATR expands`)}
          </>
        )}

        {sectionCard(
          "Weekly Outlier Scenarios",
          <>
            {kvHtml("Bullish Scenario Probability", model.bullishProb.toFixed(0) + "%")}
            {kvHtml("Bearish Scenario Probability", model.bearishProb.toFixed(0) + "%")}
            {kvHtml("Range-Bound Sidelining", model.rangeProb.toFixed(0) + "%")}
            {kvHtml("Black Swan Shock", model.blackSwanProb.toFixed(0) + "%")}
            {kvHtml("Most Probable Path", `${finalBias} path toward ${formatPrice(model.liquidity.target, symbol)}`)}
          </>
        )}

        {sectionCard(
          "Executive Summary",
          <>
            {decisionRow("Weekly Playbook Verdict", finalBias === "Bearish" ? "Execute Shorts" : finalBias === "Bullish" ? "Execute Longs" : "Range Play")}
            {decisionRow("Best Execution Day", model.bestDay.day + " " + model.bestDay.date)}
            {decisionRow("Best Trading Session", model.bestSession.name)}
            {decisionRow("Premium Setup Opportunity", finalBias === "Bearish" ? "Best Short" : finalBias === "Bullish" ? "Best Long" : "Wick Sweep Reversal")}
            {decisionRow("Risk/Reward Optimization", model.setups.breakout.rr)}
            {decisionRow("Institutional Trade Grade", finalGrade)}
          </>,
          true
        )}
      </div>
    );
  };

  /* Execution Decision Engine: Evaluates order flows, crowding indices, and position risk limits */
  const renderExecution = (model: ExecutionDecisionResult) => {
    const riskProfile =
      model.confidence >= 85
        ? { risk: "0.50% to 1.00%", size: "Full planned size after trigger", lev: "1x to 3x", exposure: "Single position" }
        : model.confidence >= 75
        ? { risk: "0.25% to 0.50%", size: "Half planned tactical size", lev: "1x to 2x", exposure: "No additions" }
        : { risk: "0%", size: "No Position", lev: "0x", exposure: "Flat" };

    const scoreRows = model.items.map((item) => [
      item.name,
      item.weight,
      item.score.toFixed(0) + "/100"
    ]);

    const activeSetup = model.direction === "NO TRADE" ? null : model.selected;

    return (
      <div className="flex flex-col gap-3">
        {sectionCard(
          "Smart Money Filter Result",
          <>
            <div className="flex flex-wrap gap-2 mb-2">
              <span className={`badge ${model.direction.includes("LONG") ? "up" : model.direction.includes("SHORT") ? "down" : "gold"}`}>
                {model.direction}
              </span>
              <span className={`badge ${model.finalVerdict === "EXECUTE" ? "up" : "down"}`}>
                {model.finalVerdict}
              </span>
              <span className={`badge ${model.grade === "NO TRADE" ? "down" : scoreClass(model.confidence)}`}>
                Trade Grade: {model.grade}
              </span>
            </div>
            {kvHtml("Overall Trade Score", Math.round(model.confidence) + "/100")}
            {kvHtml("Disagreement Penalty", model.btcDisagrees ? "Active (30% reduction)" : "None")}
          </>,
          true
        )}

        {sectionCard(
          "Regime Analysis",
          <>
            {kvHtml("Volatility Regime", model.env.environment)}
            {kvHtml("Trend Force Score", Math.round(model.env.strength) + "/100")}
            {kvHtml("Tradeability Index", Math.round(model.env.confidence) + "/100")}
          </>
        )}

        {sectionCard(
          "Correlated Squeeze Risks",
          <>
            {kvHtml("Derivatives Cluster Squeeze Target", model.deriv.target)}
            {kvHtml("Estimated Squeeze Risk", model.deriv.liquidationRisk.toFixed(0) + "/100")}
            {kvHtml("External Heatmap Notes", model.liquidity.manual)}
          </>
        )}

        {sectionCard(
          "Derivatives Leverage Crowd",
          <>
            {kvHtml("Leverage Skew Bias", model.deriv.bias)}
            {kvHtml("8H Funding Rate", model.deriv.funding !== null ? model.deriv.funding.toFixed(4) + "%" : "N/A")}
            {kvHtml("Notional Open Interest", model.deriv.oi !== null ? formatPrice(model.deriv.oi, symbol) : "N/A")}
            {kvHtml("Derivatives Crowding Index", model.deriv.crowding.toFixed(0) + "/100")}
            {kvHtml("Squeeze Sidelining Risk", model.deriv.risk.toFixed(0) + "/100")}
          </>
        )}

        {sectionCard(
          "Institutional Volume Quality",
          <>
            {kvHtml("Volume Score", model.volume.score.toFixed(0) + "/100")}
            {kvHtml("Volume Regime State", model.volume.state)}
            {kvHtml("Current vs Base Volume", `${formatVolume(model.volume.latest)} / ${formatVolume(model.volume.base)}`)}
          </>
        )}

        {sectionCard(
          "Position Risk Management",
          <>
            {kvHtml("Recommended Leverage Range", riskProfile.lev)}
            {kvHtml("Position Capital Sizing", riskProfile.size)}
            {kvHtml("Position Trade Risk Allowance", riskProfile.risk)}
            {kvHtml("Asset Exposure Cap", riskProfile.exposure)}
          </>
        )}

        {sectionCard(
          "Trade Execution Blueprint",
          activeSetup ? (
            <>
              {kvHtml("Entry Order Zone", activeSetup.entry)}
              {kvHtml("Stop Loss Placement", activeSetup.stop)}
              {kvHtml("Target 1 (TP1)", activeSetup.tp1)}
              {kvHtml("Target 2 (TP2)", activeSetup.tp2)}
              {kvHtml("Target 3 (TP3)", activeSetup.tp3)}
              {kvHtml("Risk/Reward Ratio", activeSetup.rr)}
              {kvHtml("Planned Position Sizing", riskProfile.size)}
              {kvHtml("Maximum Target Leverage", riskProfile.lev)}
              {kvHtml("Expected Position Hold", activeSetup.hold)}
              {kvHtml("Mathematical Probability", Math.round(clamp(model.confidence, 5, 92)) + "%")}
            </>
          ) : (
            <div className="text-xs text-[var(--muted)] p-2 bg-white/5 rounded">
              Filter returned NO TRADE. Standard execution blueprint is sidelined until confidence is above 75.
            </div>
          )
        )}

        {sectionCard(
          "Smart Money Scorecard",
          tableHtml(["Decision Engine", "Weight", "Calculated Score"], scoreRows)
        )}

        {sectionCard(
          "Execution Summary Verdict",
          <>
            {decisionRow("Execution Command", model.finalVerdict)}
            {decisionRow("Position Target", model.direction)}
            {decisionRow("Signal Confidence", Math.round(model.confidence) + "/100")}
            {decisionRow("Trade Grade Assessment", model.grade)}
          </>,
          true
        )}
      </div>
    );
  };

  /* Quant Report Engine: Computes seasonal, correlation, and mathematical expectancy matrices */
  const renderQuant = (model: QuantReportResult) => {
    const volRegimeRows = [
      ["Current ATR (Volatility)", formatPrice(model.eth.atrDaily, symbol)],
      ["30D Exponential ATR", formatPrice(model.atr30, symbol)],
      ["90D Exponential ATR", formatPrice(model.atr90, symbol)],
      ["180D Exponential ATR", formatPrice(model.atr180, symbol)],
      ["365D Rolling ATR", formatPrice(model.atr365, symbol)],
      ["Volatility Percentile Rank", model.volPercentile.toFixed(0) + "th percentile"]
    ];

    const weekdayRows = model.weekly.weekdays.map((d) => [
      d.day,
      formatPrice(d.expectedRange, symbol),
      d.trendProbability.toFixed(0) + "%",
      d.grade
    ]);

    const hourlyRows = model.weekly.topHours.slice(0, 10).map((h) => [
      h.utc,
      h.ist,
      formatPrice(h.expectedRange, symbol),
      h.breakoutProbability.toFixed(0) + "%",
      h.reversalProbability.toFixed(0) + "%"
    ]);

    const sessionRows = model.weekly.sessions.map((s) => [
      s.name,
      formatPrice(s.expectedRange, symbol),
      s.volatilityScore.toFixed(0) + "/100",
      s.breakoutProbability.toFixed(0) + "%"
    ]);

    const movementRows = model.movement24.map((p, index) => [
      p.point + "+ points",
      p.probability.toFixed(0) + "%",
      model.movement48[index].probability.toFixed(0) + "%",
      model.movement72[index].probability.toFixed(0) + "%",
      model.movementWeek[index].probability.toFixed(0) + "%"
    ]);

    const clusterRows = model.clusters.map((c) => [
      c.trigger,
      c.continuation.toFixed(0) + "%",
      c.expansion.toFixed(0) + "%",
      c.contraction.toFixed(0) + "%",
      c.meanReversion.toFixed(0) + "%"
    ]);

    const monthRows = model.seasonality.months.map((m) => [
      m.name,
      m.avgMove.toFixed(2) + "%",
      m.medianMove.toFixed(2) + "%",
      formatPrice(m.volatility, symbol),
      m.trendProbability.toFixed(0) + "%"
    ]);

    const quarterRows = model.seasonality.quarters.map((q) => [
      q.name,
      q.avgMove.toFixed(2) + "%",
      formatPrice(q.volatility, symbol),
      q.expansionProbability.toFixed(0) + "%"
    ]);

    const correlationStrength =
      Math.abs(model.corr30 || 0) > 0.85
        ? "Extreme"
        : Math.abs(model.corr30 || 0) > 0.65
        ? "Strong"
        : Math.abs(model.corr30 || 0) > 0.35
        ? "Medium"
        : "Weak";

    return (
      <div className="flex flex-col gap-3">
        {sectionCard(
          "Quant Regime Context",
          <>
            {kvHtml("Regime Environment", model.env.environment)}
            {kvHtml("Regime Stability Score", Math.round(model.env.strength) + "/100")}
            {kvHtml("Historical Similarity Index", Math.round(100 - Math.abs(model.volPercentile - 50)) + "/100")}
          </>,
          true
        )}

        {sectionCard(
          "Volatility Distribution Profiles",
          <>
            {tableHtml(["ATR Metric Type", "Points Value"], volRegimeRows)}
            {kvHtml("Volatility Classification", model.volPercentile >= 85 ? "Extreme Expansion" : model.volPercentile >= 70 ? "High Volatility" : model.volPercentile <= 25 ? "Compressed Compression" : "Normal")}
            {kvHtml("Expected Daily Range ATR", formatPrice(model.eth.atrDaily, symbol))}
            {kvHtml("Expected Weekly Range ATR", formatPrice(model.weekly.weeklyRange, symbol))}
          </>
        )}

        {sectionCard("Weekday Volatility Probabilities", tableHtml(["Day", "Expected Range", "Trend Alignment %", "Grade"], weekdayRows))}

        {sectionCard("Hourly Expansion Probability", tableHtml(["UTC Time", "IST Time", "Expected Range", "Breakout %", "Reversal %"], hourlyRows))}

        {sectionCard("Session Profile Index", tableHtml(["Session", "Expected Range", "Volatility Rank", "Breakout %"], sessionRows))}

        {sectionCard("Expansion Probability Over Horizons", tableHtml(["Range Threshold", "24H Horizon", "48H Horizon", "72H Horizon", "1 Week Horizon"], movementRows))}

        {sectionCard("Volatility Clustering Tendencies", tableHtml(["Trigger Event", "Continuation %", "Expansion Risk", "Contraction %", "Mean Reversion"], clusterRows))}

        {sectionCard(
          "Yearly Seasonal Returns",
          <>
            {tableHtml(["Month", "Average return", "Median return", "Volatility (ATR)", "Trend Alignment %"], monthRows)}
            {tableHtml(["Quarter", "Average return", "Volatility (ATR)", "Expansion Probability"], quarterRows)}
          </>
        )}

        {sectionCard(
          "Inter-Asset Correlation (BTC vs ETH)",
          <>
            {kvHtml("30D Running Correlation", model.corr30 !== null ? model.corr30.toFixed(2) : "N/A")}
            {kvHtml("90D Running Correlation", model.corr90 !== null ? model.corr90.toFixed(2) : "N/A")}
            {kvHtml("180D Running Correlation", model.corr180 !== null ? model.corr180.toFixed(2) : "N/A")}
            {kvHtml("365D Rolling Correlation", model.corr365 !== null ? model.corr365.toFixed(2) : "N/A")}
            {kvHtml("Interdependence Class", correlationStrength)}
            {kvHtml("Directional Trend Leader", model.weekly.relative.label === "Strong" ? "ETH Leading" : model.weekly.relative.label === "Weak" ? "BTC Leading" : "Equal Weight")}
          </>
        )}

        {sectionCard(
          "Mathematical Trade Expectancy",
          <>
            {kvHtml("Expected Mathematical Return", model.expectancy.expectedValue.toFixed(3) + "% per candle")}
            {kvHtml("Historical Average Win Size", model.expectancy.avgWin.toFixed(2) + "%")}
            {kvHtml("Historical Average Loss Size", model.expectancy.avgLoss.toFixed(2) + "%")}
            {kvHtml("Historical Profit Factor Ratio", model.expectancy.profitFactor.toFixed(2))}
            {kvHtml("Proxy Sharpe Sharpe Ratio", model.expectancy.sharpe.toFixed(2))}
            {kvHtml("Estimated Edge Score", model.expectancy.score.toFixed(0) + "/100")}
          </>
        )}

        {sectionCard(
          "Quant System Final Decision",
          <>
            {decisionRow("System Directional Bias", model.finalDecision)}
            {decisionRow("Expectancy Confidence Score", Math.round(model.decisionScore) + "/100")}
            {decisionRow("Expected Hourly Move ATR", formatPrice(model.eth.atr1h, symbol))}
            {decisionRow("Expected Daily Move ATR", formatPrice(model.eth.atrDaily, symbol))}
            {decisionRow("Edge Score / Edge Probability", Math.round(clamp(model.decisionScore, 5, 92)) + "%")}
            {decisionRow("Trade Allocation Rating", model.decisionScore < 80 ? "NO TRADE" : gradeFromScore(model.decisionScore))}
          </>,
          true
        )}
      </div>
    );
  };

  const getActiveReportContent = () => {
    if (activeReport === "demo") {
      return (
        <DemoTradeTab
          symbol={symbol}
          currentPrice={currentPrice}
          currentFundingRate={currentFundingRate}
          demoAccount={demoAccount}
          onInitialize={onInitializeDemo}
          onOpenPosition={onOpenPositionDemo}
          onClosePosition={onClosePositionDemo}
          onForceFunding={onForceFundingDemo}
          onReset={onResetDemo}
          suggestedSetups={weeklyReport?.setups || executionReport?.setups}
        />
      );
    }

    if (isAnalyzing) {
      const details = {
        signal: { title: "Reading the chart", desc: "Checking trend, volatility, key support/resistances, and risk levels." },
        weekly: { title: "Building weekly playbook", desc: "Fetching market depth, correlation matrix, relative strength, and seasonality indices." },
        execution: { title: "Running execution filter", desc: "Evaluating current order flow blocks, open interest skew, and capital risk guidelines." },
        quant: { title: "Calculating quant model", desc: "Modeling movement probability, volatility clustering, and statistical trade expectancy." }
      }[activeReport as "signal" | "weekly" | "execution" | "quant"];

      return (
        <div className="loading-analysis py-16 text-center">
          <div className="loader mb-4"></div>
          <h2 className="text-lg font-bold text-[var(--ink)]">{details?.title || "Analyzing..."}</h2>
          <p className="text-xs text-[var(--muted)] max-w-xs mx-auto mt-2">{details?.desc || "Calculating models."}</p>
        </div>
      );
    }

    if (activeReport === "signal" && signalReport) return renderSignal(signalReport);
    if (activeReport === "weekly" && weeklyReport) return renderWeekly(weeklyReport);
    if (activeReport === "execution" && executionReport) return renderExecution(executionReport);
    if (activeReport === "quant" && quantReport) return renderQuant(quantReport);

    return (
      <div className="placeholder py-16 text-center border border-dashed border-[rgba(255,255,255,0.12)] rounded-lg bg-white/[0.012]">
        <h2 className="text-lg font-bold text-[var(--ink)]">Ready when chart loads</h2>
        <p className="text-xs text-[var(--muted)] max-w-xs mx-auto mt-2">
          Select an analysis engine. The model reads live candlestick and derivatives data directly from the server.
        </p>
      </div>
    );
  };

  return (
    <aside className="analysis-panel flex flex-col min-h-0 bg-[var(--panel-glass)]" aria-label="Market analysis">
      <div className="panel-head border-b border-[rgba(255,255,255,0.075)] p-4 flex items-center justify-between gap-4">
        <div>
          <strong className="text-sm font-bold text-[var(--ink)] uppercase tracking-wider">
            Institutional {symbol} Engine
          </strong>
          <span className="block text-xs text-[var(--muted)] mt-1">
            Derivatives, on-chain flows, volatility forecasting, and risk filters
          </span>
        </div>
        {onToggleFocusMode && (
          <button
            type="button"
            id="fullscreenToggleBtn"
            onClick={onToggleFocusMode}
            className={`px-3 py-1.5 border rounded-md text-xs font-bold transition duration-150 flex items-center gap-1.5 ${
              isFocusMode
                ? "bg-[var(--down-soft)] border-[var(--down)] text-[var(--down)] hover:bg-opacity-80"
                : "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] hover:bg-opacity-80"
            }`}
            title={isFocusMode ? "Exit Fullscreen Mode" : "Enter Fullscreen Mode"}
          >
            {isFocusMode ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                </svg>
                <span>Fullscreen</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Analysis engine tabs */}
      <div className="panel-actions grid grid-cols-5 gap-1 p-3 border-b border-[rgba(255,255,255,0.075)] bg-white/[0.012]">
        <button
          type="button"
          onClick={() => {
            onReportChange("signal");
            onRunAnalysis("signal");
          }}
          disabled={isAnalyzing}
          className={`action-button text-xs py-2 px-1 rounded transition duration-150 font-bold ${
            activeReport === "signal"
              ? "is-active border-[rgba(117,221,183,0.40)] bg-gradient-to-b from-[rgba(117,221,183,0.22)] to-[rgba(117,221,183,0.10)] text-[var(--accent)]"
              : "text-[var(--muted)] bg-transparent hover:bg-white/5 hover:text-[var(--ink)]"
          }`}
        >
          Signal
        </button>
        <button
          type="button"
          onClick={() => {
            onReportChange("weekly");
            onRunAnalysis("weekly");
          }}
          disabled={isAnalyzing}
          className={`action-button text-xs py-2 px-1 rounded transition duration-150 font-bold ${
            activeReport === "weekly"
              ? "is-active border-[rgba(117,221,183,0.40)] bg-gradient-to-b from-[rgba(117,221,183,0.22)] to-[rgba(117,221,183,0.10)] text-[var(--accent)]"
              : "text-[var(--muted)] bg-transparent hover:bg-white/5 hover:text-[var(--ink)]"
          }`}
        >
          Weekly
        </button>
        <button
          type="button"
          onClick={() => {
            onReportChange("execution");
            onRunAnalysis("execution");
          }}
          disabled={isAnalyzing}
          className={`action-button text-xs py-2 px-1 rounded transition duration-150 font-bold ${
            activeReport === "execution"
              ? "is-active border-[rgba(117,221,183,0.40)] bg-gradient-to-b from-[rgba(117,221,183,0.22)] to-[rgba(117,221,183,0.10)] text-[var(--accent)]"
              : "text-[var(--muted)] bg-transparent hover:bg-white/5 hover:text-[var(--ink)]"
          }`}
        >
          Execution
        </button>
        <button
          type="button"
          onClick={() => {
            onReportChange("quant");
            onRunAnalysis("quant");
          }}
          disabled={isAnalyzing}
          className={`action-button text-xs py-2 px-1 rounded transition duration-150 font-bold ${
            activeReport === "quant"
              ? "is-active border-[rgba(117,221,183,0.40)] bg-gradient-to-b from-[rgba(117,221,183,0.22)] to-[rgba(117,221,183,0.10)] text-[var(--accent)]"
              : "text-[var(--muted)] bg-transparent hover:bg-white/5 hover:text-[var(--ink)]"
          }`}
        >
          Quant
        </button>
        <button
          type="button"
          onClick={() => {
            onReportChange("demo");
          }}
          className={`action-button text-xs py-2 px-1 rounded transition duration-150 font-bold ${
            activeReport === "demo"
              ? "is-active border-[rgba(117,221,183,0.40)] bg-gradient-to-b from-[rgba(117,221,183,0.22)] to-[rgba(117,221,183,0.10)] text-[var(--accent)]"
              : "text-[var(--muted)] bg-transparent hover:bg-white/5 hover:text-[var(--ink)]"
          }`}
        >
          Demo Trade
        </button>
      </div>

      {/* Manual details drawer */}
      <details className="data-drawer border-b border-[rgba(255,255,255,0.075)] bg-white/[0.006]">
        <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-widest text-[var(--muted)] p-3 select-none">
          Manual Market Inputs (Optional)
        </summary>
        <div className="manual-grid grid grid-cols-2 gap-3 px-4 pb-4">
          <label className="field flex flex-col gap-1 text-[10px] uppercase font-bold tracking-wider text-[var(--muted)]">
            BTC Dominance %
            <input
              id="btcDominanceInput"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 57.5"
              value={manualInputs.btcDominance !== null ? manualInputs.btcDominance : ""}
              onChange={(e) => handleInputChange("btcDominance", e.target.value)}
              className="text-xs border border-white/10 bg-black/40 text-[var(--ink)] px-3 py-1.5 rounded outline-none focus:border-[rgba(117,221,183,0.55)] focus:shadow-[0_0_0_3px_rgba(117,221,183,0.1)] transition duration-150"
            />
          </label>
          <label className="field flex flex-col gap-1 text-[10px] uppercase font-bold tracking-wider text-[var(--muted)]">
            Fear & Greed Index
            <input
              id="fearGreedInput"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 74"
              value={manualInputs.fearGreed !== null ? manualInputs.fearGreed : ""}
              onChange={(e) => handleInputChange("fearGreed", e.target.value)}
              className="text-xs border border-white/10 bg-black/40 text-[var(--ink)] px-3 py-1.5 rounded outline-none focus:border-[rgba(117,221,183,0.55)] focus:shadow-[0_0_0_3px_rgba(117,221,183,0.1)] transition duration-150"
            />
          </label>
          <label className="field col-span-2 flex flex-col gap-1 text-[10px] uppercase font-bold tracking-wider text-[var(--muted)]">
            Macro Calendar Entries
            <textarea
              id="macroInput"
              placeholder="e.g. Thu 12:30 UTC CPI High, Fri 13:00 UTC Fed Chair speech"
              value={manualInputs.macro}
              onChange={(e) => handleInputChange("macro", e.target.value)}
              className="text-xs border border-white/10 bg-black/40 text-[var(--ink)] p-3 rounded h-16 resize-y outline-none focus:border-[rgba(117,221,183,0.55)] focus:shadow-[0_0_0_3px_rgba(117,221,183,0.1)] transition duration-150"
            />
          </label>
          <label className="field col-span-2 flex flex-col gap-1 text-[10px] uppercase font-bold tracking-wider text-[var(--muted)]">
            On-Chain Flows / Spot ETF Inflow
            <textarea
              id="flowInput"
              placeholder="e.g. exchange stablecoin inflows surging, heavy Fidelity spot BTC buy"
              value={manualInputs.flows}
              onChange={(e) => handleInputChange("flows", e.target.value)}
              className="text-xs border border-white/10 bg-black/40 text-[var(--ink)] p-3 rounded h-16 resize-y outline-none focus:border-[rgba(117,221,183,0.55)] focus:shadow-[0_0_0_3px_rgba(117,221,183,0.1)] transition duration-150"
            />
          </label>
          <label className="field col-span-2 flex flex-col gap-1 text-[10px] uppercase font-bold tracking-wider text-[var(--muted)]">
            Liquidation Zones / Heatmap Clusters
            <textarea
              id="liquidationInput"
              placeholder="e.g. massive long liquidation pool at $3180, short pool at $3360"
              value={manualInputs.liquidations}
              onChange={(e) => handleInputChange("liquidations", e.target.value)}
              className="text-xs border border-white/10 bg-black/40 text-[var(--ink)] p-3 rounded h-16 resize-y outline-none focus:border-[rgba(117,221,183,0.55)] focus:shadow-[0_0_0_3px_rgba(117,221,183,0.1)] transition duration-150"
            />
          </label>
        </div>
      </details>

      {/* Analysis report scroll region */}
      <div className="analysis-body flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
        {getActiveReportContent()}
      </div>
    </aside>
  );
};
