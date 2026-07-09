import React, { useEffect, useRef, useState } from "react";
import { Candle, SymbolType, TimeframeType, MarketStats } from "../types";
import {
  formatPrice,
  formatVolume,
  formatPlainPrice,
  formatSignedPrice,
  formatPct,
  fullDate,
  shortDate
} from "../utils/format";
import { calcSma, finite, clamp, quantile } from "../utils/math";

interface ChartSectionProps {
  candles: Candle[];
  stats: MarketStats | null;
  symbol: SymbolType;
  timeframe: TimeframeType;
  dataSource: string;
  isLoading: boolean;
}

export const ChartSection: React.FC<ChartSectionProps> = ({
  candles,
  stats,
  symbol,
  timeframe,
  dataSource,
  isLoading
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 480 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipData, setTooltipData] = useState<{
    visible: boolean;
    x: number;
    y: number;
    time: string;
    price: string;
    changeText: string;
    isUp: boolean;
  }>({
    visible: false,
    x: 0,
    y: 0,
    time: "",
    price: "",
    changeText: "",
    isUp: true
  });

  // Calculate SMAs
  const sma20 = React.useMemo(() => {
    const values: (number | null)[] = [];
    let sum = 0;
    const period = 20;
    for (let i = 0; i < candles.length; i++) {
      sum += candles[i].c;
      if (i >= period) sum -= candles[i - period].c;
      values.push(i >= period - 1 ? sum / period : null);
    }
    return values;
  }, [candles]);

  const sma50 = React.useMemo(() => {
    const values: (number | null)[] = [];
    let sum = 0;
    const period = 50;
    for (let i = 0; i < candles.length; i++) {
      sum += candles[i].c;
      if (i >= period) sum -= candles[i - period].c;
      values.push(i >= period - 1 ? sum / period : null);
    }
    return values;
  }, [candles]);

  // Handle ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries || !entries[0]) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width: Math.max(320, width),
        height: Math.max(380, height)
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Drawing the Chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(dimensions.width * dpr);
    canvas.height = Math.floor(dimensions.height * dpr);
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // Grid details
    const pad = { left: 18, right: 76, top: 24, bottom: 34 };
    const chartW = dimensions.width - pad.left - pad.right;
    const priceBottom = Math.round(dimensions.height * 0.76);
    const volumeTop = priceBottom + 18;
    const priceH = priceBottom - pad.top;
    const volumeH = dimensions.height - volumeTop - pad.bottom;

    const activeIndex = hoverIndex !== null ? clamp(hoverIndex, 0, candles.length - 1) : candles.length - 1;

    // Scale calculations
    const lastPrice = candles[candles.length - 1].c;
    const pricesForScale = candles.flatMap((c) => [c.o, c.h, c.l, c.c]);
    let minPrice = quantile(pricesForScale, 0.01);
    let maxPrice = quantile(pricesForScale, 0.99);
    minPrice = Math.min(minPrice, lastPrice);
    maxPrice = Math.max(maxPrice, lastPrice);

    if (!finite(minPrice) || !finite(maxPrice) || minPrice === maxPrice) {
      minPrice = Math.min(...candles.map((c) => c.l));
      maxPrice = Math.max(...candles.map((c) => c.h));
    }

    const pricePad = Math.max((maxPrice - minPrice) * 0.08, maxPrice * 0.002);
    const yMin = minPrice - pricePad;
    const yMax = maxPrice + pricePad;
    const volumeMax = Math.max(...candles.map((c) => c.v), 1);
    const stepX = chartW / Math.max(1, candles.length - 1);
    const candleW = clamp(stepX * 0.58, 2, 12);

    const upColor = "#41d99a";
    const downColor = "#f07888";
    const gridLineColor = "rgba(255, 255, 255, 0.08)";
    const mutedTextColor = "#9b9e92";

    const xOf = (index: number) => pad.left + index * stepX;
    const yOf = (price: number) => pad.top + ((yMax - price) / (yMax - yMin)) * priceH;
    const yVol = (volume: number) => volumeTop + volumeH - (volume / volumeMax) * volumeH;

    // Draw background hover column
    if (hoverIndex !== null) {
      const activeX = xOf(activeIndex);
      ctx.fillStyle = "rgba(117, 221, 183, 0.055)";
      ctx.fillRect(
        Math.max(pad.left, activeX - stepX / 2),
        pad.top,
        Math.min(stepX, chartW),
        dimensions.height - pad.top - pad.bottom
      );
    }

    // Grid lines & labels
    ctx.strokeStyle = gridLineColor;
    ctx.fillStyle = mutedTextColor;
    ctx.lineWidth = 1;
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (let i = 0; i <= 5; i++) {
      const y = pad.top + (priceH / 5) * i;
      const priceVal = yMax - ((yMax - yMin) / 5) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(dimensions.width - pad.right + 8, y);
      ctx.stroke();
      ctx.fillText(formatPlainPrice(priceVal, symbol), dimensions.width - pad.right + 14, y);
    }

    // X axis time stamps
    for (let i = 0; i <= 4; i++) {
      const idx = Math.min(candles.length - 1, Math.round((candles.length - 1) * (i / 4)));
      const x = xOf(idx);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, dimensions.height - pad.bottom);
      ctx.stroke();

      ctx.save();
      ctx.fillStyle = mutedTextColor;
      ctx.textAlign = i === 0 ? "left" : i === 4 ? "right" : "center";
      ctx.fillText(shortDate(candles[idx].t, timeframe), x, dimensions.height - 15);
      ctx.restore();
    }

    // Volume bars
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const x = xOf(i);
      const isCandleUp = candle.c >= candle.o;
      const color = isCandleUp ? upColor : downColor;
      const volY = yVol(candle.v);

      ctx.fillStyle = hexToRgba(color, 0.24);
      ctx.fillRect(x - candleW / 2, volY, candleW, volumeTop + volumeH - volY);
    }

    // Plot SMA 20
    ctx.strokeStyle = "#75ddb7";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let startedSma20 = false;
    for (let i = 0; i < candles.length; i++) {
      const val = sma20[i];
      if (val !== null && finite(val)) {
        const x = xOf(i);
        const y = yOf(val);
        if (!startedSma20) {
          ctx.moveTo(x, y);
          startedSma20 = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    }
    ctx.stroke();

    // Plot SMA 50
    ctx.strokeStyle = "#f5c451";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let startedSma50 = false;
    for (let i = 0; i < candles.length; i++) {
      const val = sma50[i];
      if (val !== null && finite(val)) {
        const x = xOf(i);
        const y = yOf(val);
        if (!startedSma50) {
          ctx.moveTo(x, y);
          startedSma50 = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    }
    ctx.stroke();

    // Candlesticks (Wick & Body)
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const x = xOf(i);
      const isCandleUp = candle.c >= candle.o;
      const color = isCandleUp ? upColor : downColor;

      const yOpen = yOf(candle.o);
      const yClose = yOf(candle.c);
      const yHigh = yOf(candle.h);
      const yLow = yOf(candle.l);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Body
      ctx.fillStyle = color;
      const bodyTop = Math.min(yOpen, yClose);
      const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
    }

    // Current Price line (Latest candle horizontal dashed line & value badge)
    const latestCandle = candles[candles.length - 1];
    const lastY = yOf(latestCandle.c);
    ctx.strokeStyle = hexToRgba(latestCandle.c >= latestCandle.o ? upColor : downColor, 0.75);
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(pad.left, lastY);
    ctx.lineTo(dimensions.width - pad.right + 8, lastY);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // Draw value badge on Y-axis
    ctx.fillStyle = latestCandle.c >= latestCandle.o ? upColor : downColor;
    drawRoundedRect(ctx, dimensions.width - pad.right + 10, lastY - 12, 62, 24, 5);
    ctx.fill();

    ctx.fillStyle = "#11120f";
    ctx.font = "700 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(formatPlainPrice(latestCandle.c, symbol), dimensions.width - pad.right + 41, lastY);

    // Draw active hover coordinate lines and crosshairs
    if (hoverIndex !== null) {
      const x = xOf(activeIndex);
      const c = candles[activeIndex];
      const closeY = yOf(c.c);
      const crossColor = hexToRgba(c.c >= c.o ? upColor : downColor, 0.7);

      // Vertical line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, dimensions.height - pad.bottom);
      ctx.stroke();

      // Horizontal line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.beginPath();
      ctx.moveTo(pad.left, closeY);
      ctx.lineTo(dimensions.width - pad.right, closeY);
      ctx.stroke();

      // Inner dot
      ctx.fillStyle = crossColor;
      ctx.strokeStyle = "rgba(9, 11, 9, 0.92)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, closeY, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Active price pill
      drawCanvasPill(
        ctx,
        dimensions.width - pad.right + 10,
        closeY - 11,
        formatPlainPrice(c.c, symbol),
        crossColor,
        "#0c100d"
      );

      // Active time pill
      const timeText = shortDate(c.t, timeframe);
      const timeWidth = 64;
      drawCanvasPill(
        ctx,
        clamp(x - timeWidth / 2, pad.left, dimensions.width - pad.right - timeWidth),
        dimensions.height - pad.bottom + 4,
        timeText,
        "rgba(18, 20, 17, 0.95)",
        "#d9ded4",
        timeWidth
      );
    }
  }, [candles, dimensions, hoverIndex, symbol, timeframe, sma20, sma50]);

  // Handle crosshair coordinate tracking
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!candles.length || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padLeft = 18;
    const padRight = 76;
    const chartW = dimensions.width - padLeft - padRight;
    const clampedX = clamp(x, padLeft, dimensions.width - padRight);

    const index = Math.round(((clampedX - padLeft) / chartW) * (candles.length - 1));
    const activeIndex = clamp(index, 0, candles.length - 1);
    setHoverIndex(activeIndex);

    // Update Tooltip
    const activeCandle = candles[activeIndex];
    const stepX = chartW / Math.max(1, candles.length - 1);
    const tooltipX = padLeft + activeIndex * stepX;

    const padTop = 24;
    const priceBottom = Math.round(dimensions.height * 0.76);
    const priceH = priceBottom - padTop;
    const pricesForScale = candles.flatMap((cand) => [cand.o, cand.h, cand.l, cand.c]);
    const lastPrice = candles[candles.length - 1].c;
    let minPrice = quantile(pricesForScale, 0.01);
    let maxPrice = quantile(pricesForScale, 0.99);
    minPrice = Math.min(minPrice, lastPrice);
    maxPrice = Math.max(maxPrice, lastPrice);
    const pricePad = Math.max((maxPrice - minPrice) * 0.08, maxPrice * 0.002);
    const yMin = minPrice - pricePad;
    const yMax = maxPrice + pricePad;

    const tooltipY = padTop + ((yMax - activeCandle.h) / (yMax - yMin)) * priceH;

    const change = activeCandle.c - activeCandle.o;
    const changePct = activeCandle.o ? (change / activeCandle.o) * 100 : 0;

    setTooltipData({
      visible: true,
      x: clamp(tooltipX, 82, dimensions.width - 82),
      y: clamp(tooltipY, 76, dimensions.height - 26),
      time: fullDate(activeCandle.t),
      price: formatPrice(activeCandle.c, symbol),
      changeText: `${formatSignedPrice(change, symbol)} / ${formatPct(changePct, 2)}`,
      isUp: change >= 0
    });
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
    setTooltipData((prev) => ({ ...prev, visible: false }));
  };

  // Canvas utility helpers
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  const drawCanvasPill = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    fill: string,
    color: string,
    fixedWidth?: number
  ) => {
    ctx.save();
    ctx.font = "760 11px Inter, system-ui, sans-serif";
    const width = fixedWidth || Math.max(58, ctx.measureText(text).width + 16);
    const height = 22;
    drawRoundedRect(ctx, x, y, width, height, 6);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + width / 2, y + height / 2);
    ctx.restore();
    return width;
  };

  const currentDisplayCandle = React.useMemo(() => {
    if (!candles.length) return null;
    const index = hoverIndex !== null ? clamp(hoverIndex, 0, candles.length - 1) : candles.length - 1;
    return candles[index];
  }, [candles, hoverIndex]);

  const changeDirection = currentDisplayCandle
    ? currentDisplayCandle.c >= currentDisplayCandle.o
      ? "up"
      : "down"
    : "up";

  return (
    <section className="chart-shell" aria-label="Price chart">
      <div className="chart-head">
        <div className="market-title">
          <strong id="marketTitle">{symbol}-USD</strong>
          <span id="marketSubtitle" className="text-xs text-[var(--muted)]">
            {timeframe.toUpperCase()} candles from {dataSource}
          </span>
        </div>

        {/* Live Candle Readout */}
        <div className="chart-readout" id="chartReadout" aria-live="polite">
          <span className="readout-time text-xs font-semibold px-2 py-0.5 bg-white/5 rounded">
            {currentDisplayCandle
              ? `${hoverIndex !== null ? "Selected" : "Latest"} ${fullDate(currentDisplayCandle.t)}`
              : "Loading..."}
          </span>
          <span className="readout-chip">
            <span>O</span>
            <b>{currentDisplayCandle ? formatPrice(currentDisplayCandle.o, symbol) : "..."}</b>
          </span>
          <span className="readout-chip text-[var(--up)]">
            <span>H</span>
            <b>{currentDisplayCandle ? formatPrice(currentDisplayCandle.h, symbol) : "..."}</b>
          </span>
          <span className="readout-chip text-[var(--down)]">
            <span>L</span>
            <b>{currentDisplayCandle ? formatPrice(currentDisplayCandle.l, symbol) : "..."}</b>
          </span>
          <span className={`readout-chip ${changeDirection === "up" ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
            <span>C</span>
            <b>{currentDisplayCandle ? formatPrice(currentDisplayCandle.c, symbol) : "..."}</b>
          </span>
          <span className="readout-chip">
            <span>Vol</span>
            <b>{currentDisplayCandle ? formatVolume(currentDisplayCandle.v) : "..."}</b>
          </span>
        </div>

        {/* Legend */}
        <div className="legend" aria-label="Chart legend">
          <span className="legend-item">
            <span className="swatch inline-block w-4 h-0.5 bg-[#75ddb7] mr-1"></span>SMA 20
          </span>
          <span className="legend-item">
            <span className="swatch inline-block w-4 h-0.5 bg-[#f5c451] mr-1"></span>SMA 50
          </span>
          <span className="legend-item text-xs text-[var(--muted)]">Volume below price</span>
        </div>
      </div>

      <div
        className="chart-wrap relative overflow-hidden flex-1"
        id="chartWrap"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <canvas ref={canvasRef} id="chart" className="block w-full h-full"></canvas>

        {/* Interactive Tooltip */}
        {tooltipData.visible && (
          <div
            className="tooltip is-visible"
            style={{
              left: `${tooltipData.x}px`,
              top: `${tooltipData.y}px`
            }}
            role="status"
          >
            <div className="tip-time text-[10px] text-[var(--muted)] uppercase tracking-wider">
              {tooltipData.time}
            </div>
            <div className="tip-price text-base font-extrabold text-[var(--ink)]">
              {tooltipData.price}
            </div>
            <div className={`tip-change text-xs font-bold ${tooltipData.isUp ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
              {tooltipData.changeText}
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="loading-cover is-visible" id="loadingCover">
            <div className="text-center">
              <div className="loader"></div>
              <div className="mt-2">Loading market data...</div>
            </div>
          </div>
        )}

        {/* Empty state cover */}
        {!isLoading && candles.length === 0 && (
          <div className="chart-empty is-visible" id="chartEmpty">
            No chart data is available yet. Please wait or check your network.
          </div>
        )}
      </div>
    </section>
  );
};
