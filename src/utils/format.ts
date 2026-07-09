import { SymbolType, TimeframeType } from "../types";
import { META, finite } from "./math";

export function formatPrice(value: number | null | undefined, symbol: SymbolType = "ETH"): string {
  if (value === null || value === undefined || !finite(value)) return "N/A";
  const precision = META[symbol]?.precision ?? 2;
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  });
}

export function formatSignedPrice(value: number | null | undefined, symbol: SymbolType = "ETH"): string {
  if (value === null || value === undefined || !finite(value)) return "N/A";
  const sign = Number(value) >= 0 ? "+" : "-";
  return sign + formatPrice(Math.abs(Number(value)), symbol);
}

export function formatPlainPrice(value: number | null | undefined, symbol: SymbolType = "ETH"): string {
  if (value === null || value === undefined || !finite(value)) return "N/A";
  const precision = META[symbol]?.precision ?? 2;
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  });
}

export function formatPct(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !finite(value)) return "N/A";
  const n = Number(value);
  return (n >= 0 ? "+" : "") + n.toFixed(decimals) + "%";
}

export function formatCompactUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !finite(value)) return "N/A";
  const n = Math.abs(Number(value));
  const sign = Number(value) < 0 ? "-" : "";
  if (n >= 1e12) return sign + "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return sign + "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return sign + "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return sign + "$" + (n / 1e3).toFixed(1) + "K";
  return sign + "$" + n.toFixed(0);
}

export function formatVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || !finite(value)) return "N/A";
  const n = Math.abs(Number(value));
  if (n >= 1e9) return (Number(value) / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (Number(value) / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (Number(value) / 1e3).toFixed(1) + "K";
  return Number(value).toFixed(0);
}

export function shortDate(seconds: number, timeframe: TimeframeType): string {
  const date = new Date(seconds * 1000);
  if (timeframe === "1D") {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fullDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
