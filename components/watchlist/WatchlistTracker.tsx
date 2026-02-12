"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";

interface SparklineData {
    dates: string[];
    prices: number[];
}

interface WatchlistStock {
    symbol: string;
    company: string;
    price: number;
    change: number;
    changePercent: number;
    watchSince: string; // ISO date string
    startPrice: number; // first price in historical data
    sparkline: SparklineData;
}

interface WatchlistTrackerProps {
    stocks: WatchlistStock[];
    symbols: string[];
}

function Sparkline({ prices, width = 120, height = 40 }: { prices: number[]; width?: number; height?: number }) {
    if (prices.length < 2) return null;

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const padding = 2;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const points = prices.map((p, i) => {
        const x = padding + (i / (prices.length - 1)) * chartW;
        const y = padding + chartH - ((p - min) / range) * chartH;
        return `${x},${y}`;
    });

    const linePath = points.join(" ");
    // Area fill: line path + close at bottom-right and bottom-left
    const lastX = padding + chartW;
    const firstX = padding;
    const bottomY = padding + chartH;
    const areaPath = `${points.join(" ")} ${lastX},${bottomY} ${firstX},${bottomY}`;

    const netPositive = prices[prices.length - 1] >= prices[0];
    const color = netPositive ? "#22c55e" : "#ef4444";

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
            <polygon points={areaPath} fill={color} fillOpacity={0.1} />
            <polyline points={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

function formatWatchDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function WatchlistTracker({ stocks: initialStocks, symbols }: WatchlistTrackerProps) {
    const [stocks, setStocks] = useState(initialStocks);

    useEffect(() => {
        setStocks(initialStocks);
    }, [initialStocks]);

    const pollPrices = useCallback(async () => {
        if (symbols.length === 0) return;
        try {
            const { getWatchlistData } = await import("@/lib/actions/finnhub.actions");
            const freshData = await getWatchlistData(symbols);
            if (freshData && freshData.length > 0) {
                setStocks((current) => {
                    const freshMap = new Map(freshData.map((d: any) => [d.symbol, d]));
                    return current.map((stock) => {
                        const fresh = freshMap.get(stock.symbol) as any;
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
            console.error("WatchlistTracker poll error:", err);
        }
    }, [symbols]);

    useEffect(() => {
        if (symbols.length === 0) return;

        const hasMissingPrices = stocks.some((s) => !s.price || s.price === 0);
        if (hasMissingPrices) {
            const retryTimeout = setTimeout(pollPrices, 5000);
            return () => clearTimeout(retryTimeout);
        }

        const interval = setInterval(pollPrices, 30000);
        return () => clearInterval(interval);
    }, [pollPrices, symbols.length, stocks]);

    if (stocks.length === 0) {
        return (
            <div className="w-full">
                <h3 className="font-semibold text-2xl text-gray-100 mb-5">Watchlist Tracker</h3>
                <div className="flex flex-col items-center justify-center py-16 px-6 bg-gray-900/30 rounded-xl border border-gray-800 border-dashed">
                    <Eye className="w-12 h-12 text-gray-600 mb-4" />
                    <h4 className="text-lg font-semibold text-gray-300 mb-2">
                        No watchlist-only stocks
                    </h4>
                    <p className="text-gray-500 text-center max-w-sm">
                        Add stocks without shares to track them here.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full">
            <h3 className="font-semibold text-2xl text-gray-100 mb-5">Watchlist Tracker</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {stocks.map((stock) => {
                    const priceDiff = stock.startPrice > 0 ? stock.price - stock.startPrice : 0;
                    const pctChange = stock.startPrice > 0
                        ? ((stock.price - stock.startPrice) / stock.startPrice) * 100
                        : 0;
                    const isPositive = pctChange >= 0;

                    return (
                        <Link
                            key={stock.symbol}
                            href={`/stocks/${stock.symbol}`}
                            className="block rounded-xl border border-white/10 bg-black/40 backdrop-blur-md p-4 hover:bg-white/5 transition-colors shadow-lg"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <span className="font-bold text-white text-lg">{stock.symbol}</span>
                                    <p className="text-gray-400 text-sm truncate max-w-[180px]">{stock.company}</p>
                                </div>
                                <span className={`text-sm font-semibold px-2 py-0.5 rounded-md ${isPositive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                                    {isPositive ? "+" : ""}{pctChange.toFixed(1)}%
                                </span>
                            </div>

                            <div className="my-3">
                                <Sparkline prices={stock.sparkline.prices} width={280} height={40} />
                            </div>

                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400">
                                    ${stock.startPrice.toFixed(2)} → <span className="text-white font-medium">${stock.price.toFixed(2)}</span>
                                </span>
                                <span className="text-gray-500 text-xs">
                                    Since {formatWatchDate(stock.watchSince)}
                                </span>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
