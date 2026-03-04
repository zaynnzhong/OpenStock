"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { squarify } from "@/lib/treemap";
import { formatChangePercent } from "@/lib/utils";

export interface HeatmapStockData {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    marketCap: number;
    shares: number;
    avgCost: number;
    weight: number;
}

interface PortfolioHeatmapProps {
    initialData: HeatmapStockData[];
    symbols: string[];
}

function getHeatmapBg(changePercent: number): string {
    const absChange = Math.abs(changePercent);
    if (absChange < 0.01) return "rgba(55, 55, 60, 0.6)";

    const intensity = Math.min(1, 0.15 + (absChange / 5) * 0.85);
    if (changePercent > 0) {
        return `rgba(34, 197, 94, ${intensity})`;
    }
    return `rgba(239, 68, 68, ${intensity})`;
}

export default function PortfolioHeatmap({ initialData, symbols }: PortfolioHeatmapProps) {
    const [stocks, setStocks] = useState<HeatmapStockData[]>(initialData);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    // Measure container
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: Math.max(500, entry.contentRect.width * 0.55),
                });
            }
        });

        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Compute treemap layout using pre-computed weights
    const rects = useMemo(() => {
        if (dimensions.width === 0 || dimensions.height === 0) return [];
        const items = stocks.filter((s) => s.weight > 0);
        if (items.length === 0) return [];
        return squarify(items as any[], dimensions.width, dimensions.height);
    }, [stocks, dimensions]);

    // Poll for price updates
    const pollPrices = useCallback(async () => {
        if (symbols.length === 0) return;
        try {
            const { getWatchlistData } = await import("@/lib/actions/finnhub.actions");
            const freshData = await getWatchlistData(symbols);
            if (freshData && freshData.length > 0) {
                setStocks((current) => {
                    const freshMap = new Map(
                        freshData.map((d: { symbol: string }) => [d.symbol, d])
                    );
                    return current.map((stock) => {
                        const fresh = freshMap.get(stock.symbol) as
                            | { price: number; change: number; changePercent: number }
                            | undefined;
                        if (fresh && fresh.price > 0) {
                            return {
                                ...stock,
                                price: fresh.price,
                                change: fresh.change,
                                changePercent: fresh.changePercent,
                            };
                        }
                        return stock;
                    });
                });
            }
        } catch (err) {
            console.error("Heatmap poll error:", err);
        }
    }, [symbols]);

    useEffect(() => {
        if (symbols.length === 0) return;

        // If any stock has $0 price, retry quickly
        const hasMissingPrices = stocks.some(s => !s.price || s.price === 0);
        if (hasMissingPrices) {
            const retryTimeout = setTimeout(pollPrices, 5000);
            return () => clearTimeout(retryTimeout);
        }

        const interval = setInterval(pollPrices, 30000);
        return () => clearInterval(interval);
    }, [pollPrices, symbols.length, stocks]);

    // Today's return: sum of (daily change * shares) for all holdings
    const todaysReturn = useMemo(() => {
        const totalChange = stocks.reduce(
            (sum, s) => sum + (s.shares > 0 ? s.change * s.shares : 0),
            0
        );
        const totalPrevValue = stocks.reduce(
            (sum, s) => sum + (s.shares > 0 ? (s.price - s.change) * s.shares : 0),
            0
        );
        const pct = totalPrevValue > 0 ? (totalChange / totalPrevValue) * 100 : 0;
        return { value: totalChange, percent: pct };
    }, [stocks]);

    if (stocks.length === 0) {
        return (
            <div className="w-full">
                <h3 className="font-semibold text-2xl text-gray-100 mb-5">
                    Portfolio Heatmap
                </h3>
                <div className="flex flex-col items-center justify-center py-16 px-6 bg-gray-900/30 rounded-xl border border-gray-800 border-dashed">
                    <TrendingUp className="w-12 h-12 text-gray-600 mb-4" />
                    <h4 className="text-lg font-semibold text-gray-300 mb-2">
                        No positions yet
                    </h4>
                    <p className="text-gray-500 text-center max-w-sm">
                        Log trades in Portfolio to see your heatmap.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h3 className="font-semibold text-2xl text-gray-100">
                        Portfolio Heatmap
                    </h3>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-xs text-gray-500">Today&apos;s Return</p>
                        <p className={`text-sm font-semibold ${todaysReturn.value >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {todaysReturn.value >= 0 ? "+" : ""}${Math.abs(todaysReturn.value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {" "}({todaysReturn.percent >= 0 ? "+" : ""}{todaysReturn.percent.toFixed(2)}%)
                        </p>
                    </div>
                    <span className="text-xs text-gray-500">
                        Sized by position value
                    </span>
                </div>
            </div>
            <div
                ref={containerRef}
                className="relative w-full rounded-xl overflow-hidden border border-white/10"
                style={{ height: dimensions.height || 500 }}
            >
                {rects.map((rect) => {
                    const stock = rect as unknown as HeatmapStockData & {
                        x: number;
                        y: number;
                        w: number;
                        h: number;
                    };
                    // Size tiers based on block dimensions
                    const isXLarge = stock.w > 180 && stock.h > 120;
                    const isLarge = stock.w > 120 && stock.h > 90;
                    const isMedium = stock.w > 80 && stock.h > 60;
                    const isSmall = stock.w > 55 && stock.h > 40;
                    const isTiny = !isSmall;

                    // Today's return per symbol
                    const dailyReturn = stock.shares > 0 ? stock.change * stock.shares : 0;
                    const hasDailyReturn = stock.shares > 0 && stock.change !== 0;

                    // Unrealized P/L
                    const hasHoldingsData = stock.shares > 0 && stock.avgCost > 0 && stock.price > 0;
                    const unrealizedPL = hasHoldingsData
                        ? (stock.price - stock.avgCost) * stock.shares
                        : 0;
                    const unrealizedPLPercent = hasHoldingsData
                        ? ((stock.price - stock.avgCost) / stock.avgCost) * 100
                        : 0;

                    return (
                        <Link
                            key={stock.symbol}
                            href={`/stocks/${stock.symbol}`}
                            className="absolute flex flex-col items-center justify-center text-center transition-all duration-200 hover:brightness-125 hover:z-10 border border-black/30 group/block overflow-hidden p-1"
                            style={{
                                left: stock.x,
                                top: stock.y,
                                width: stock.w,
                                height: stock.h,
                                backgroundColor: getHeatmapBg(stock.changePercent),
                            }}
                        >
                            {/* Tiny blocks: just symbol */}
                            {isTiny && (
                                <span className="font-bold text-white text-[10px] leading-none truncate w-full">
                                    {stock.symbol}
                                </span>
                            )}

                            {/* Small blocks: price + symbol */}
                            {isSmall && !isMedium && (
                                <>
                                    <span className="font-bold text-white text-xs leading-tight truncate w-full">
                                        ${stock.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="font-bold text-white text-[11px] leading-tight truncate w-full">
                                        {stock.symbol}
                                    </span>
                                    {hasDailyReturn && (
                                        <span className={`text-[10px] font-semibold leading-tight ${dailyReturn >= 0 ? "text-green-300" : "text-red-300"}`}>
                                            {dailyReturn >= 0 ? "+" : "-"}${Math.abs(dailyReturn).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    )}
                                    <span className={`text-[10px] font-semibold leading-tight ${stock.changePercent >= 0 ? "text-green-300" : "text-red-300"}`}>
                                        {formatChangePercent(stock.changePercent)}
                                    </span>
                                </>
                            )}

                            {/* Medium blocks: price + symbol + today's return + change% + P/L% */}
                            {isMedium && !isLarge && (
                                <>
                                    <span className="font-extrabold text-white text-sm leading-tight truncate w-full">
                                        ${stock.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="font-bold text-white text-xs leading-tight truncate w-full">
                                        {stock.symbol}
                                    </span>
                                    {hasDailyReturn && (
                                        <span className={`text-[10px] font-semibold mt-0.5 leading-tight ${dailyReturn >= 0 ? "text-green-300" : "text-red-300"}`}>
                                            {dailyReturn >= 0 ? "+" : "-"}${Math.abs(dailyReturn).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    )}
                                    <span className={`text-xs font-semibold mt-0.5 leading-tight ${stock.changePercent >= 0 ? "text-green-300" : "text-red-300"}`}>
                                        {formatChangePercent(stock.changePercent)}
                                    </span>
                                    {hasHoldingsData && (
                                        <span className={`text-[10px] font-semibold leading-tight ${unrealizedPL >= 0 ? "text-green-300" : "text-red-300"}`}>
                                            {unrealizedPLPercent >= 0 ? "+" : ""}{unrealizedPLPercent.toFixed(1)}%
                                        </span>
                                    )}
                                </>
                            )}

                            {/* Large blocks: full info */}
                            {isLarge && (
                                <>
                                    <span className="font-extrabold text-white text-base leading-tight truncate w-full">
                                        ${stock.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="font-bold text-white text-sm leading-tight truncate w-full">
                                        {stock.symbol}
                                    </span>
                                    {isXLarge && (
                                        <span className="text-white/90 text-xs leading-tight mt-0.5 px-1 line-clamp-1">
                                            {stock.name}
                                        </span>
                                    )}
                                    {hasDailyReturn && (
                                        <span className={`text-xs font-semibold mt-0.5 leading-tight ${dailyReturn >= 0 ? "text-green-300" : "text-red-300"}`}>
                                            {dailyReturn >= 0 ? "+" : "-"}${Math.abs(dailyReturn).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} today
                                        </span>
                                    )}
                                    <span className={`text-xs font-semibold mt-0.5 leading-tight ${stock.changePercent >= 0 ? "text-green-300" : "text-red-300"}`}>
                                        {formatChangePercent(stock.changePercent)}
                                    </span>
                                    {hasHoldingsData && (
                                        <span className={`text-xs font-semibold leading-tight ${unrealizedPL >= 0 ? "text-green-300" : "text-red-300"}`}>
                                            {unrealizedPL >= 0 ? "+" : ""}
                                            ${Math.abs(unrealizedPL).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            {" "}({unrealizedPLPercent >= 0 ? "+" : ""}{unrealizedPLPercent.toFixed(1)}%)
                                        </span>
                                    )}
                                    {stock.shares > 0 && (
                                        <span className="text-white/70 text-[10px] mt-0.5">
                                            {stock.weight.toFixed(1)}% · {stock.shares} shares
                                        </span>
                                    )}
                                </>
                            )}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
