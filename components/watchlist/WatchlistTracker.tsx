"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Eye, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from "lucide-react";

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
    watchSince: string;
    startPrice: number;
    sparkline: SparklineData;
    priceAtAdd?: number | null;
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

function SMADot({ value, price }: { value: number | null; price: number }) {
    if (!value) return <span className="w-2 h-2 rounded-full bg-gray-700" />;
    const isAbove = price >= value;
    return (
        <span
            className={`w-2 h-2 rounded-full ${isAbove ? "bg-green-500" : "bg-red-500"}`}
            title={`$${value.toFixed(2)} (${isAbove ? "above" : "below"})`}
        />
    );
}

function ExpandedIndicators({ symbol, price, priceAtAdd }: { symbol: string; price: number; priceAtAdd?: number | null }) {
    const [smaData, setSmaData] = useState<{ sma200d: number | null; sma20w: number | null; sma50w: number | null } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { getSMAIndicators } = await import("@/lib/actions/finnhub.actions");
                const data = await getSMAIndicators(symbol);
                if (!cancelled) setSmaData(data);
            } catch {
                if (!cancelled) setSmaData({ sma200d: null, sma20w: null, sma50w: null });
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [symbol]);

    const changeSinceAdd = priceAtAdd && priceAtAdd > 0
        ? ((price - priceAtAdd) / priceAtAdd * 100)
        : null;

    if (loading) {
        return <div className="text-xs text-gray-600 animate-pulse mt-2 pt-2 border-t border-white/5">Loading...</div>;
    }

    const indicators = [
        { label: "SMA 200D", value: smaData?.sma200d },
        { label: "SMA 20W", value: smaData?.sma20w },
        { label: "SMA 50W", value: smaData?.sma50w },
    ];

    return (
        <div className="mt-2 pt-2 border-t border-white/5 space-y-1" onClick={(e) => e.preventDefault()}>
            {indicators.map(ind => {
                const isAbove = ind.value ? price >= ind.value : null;
                return (
                    <div key={ind.label} className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">{ind.label}</span>
                        {ind.value ? (
                            <span className={`font-mono ${isAbove ? "text-green-400" : "text-red-400"}`}>
                                ${ind.value.toFixed(2)}
                                {isAbove ? (
                                    <TrendingUp className="w-3 h-3 inline ml-1" />
                                ) : (
                                    <TrendingDown className="w-3 h-3 inline ml-1" />
                                )}
                                <span className="ml-1 text-[10px] font-medium">
                                    {((price - ind.value) / ind.value * 100) >= 0 ? "+" : ""}
                                    {((price - ind.value) / ind.value * 100).toFixed(1)}%
                                </span>
                            </span>
                        ) : (
                            <span className="text-gray-700">--</span>
                        )}
                    </div>
                );
            })}
            {changeSinceAdd !== null && (
                <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-gray-500">Since Add</span>
                    <span className={`font-mono font-semibold ${changeSinceAdd >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {changeSinceAdd >= 0 ? "+" : ""}{changeSinceAdd.toFixed(1)}%
                    </span>
                </div>
            )}
        </div>
    );
}

export default function WatchlistTracker({ stocks: initialStocks, symbols }: WatchlistTrackerProps) {
    const [stocks, setStocks] = useState(initialStocks);
    const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

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
                    const isExpanded = expandedSymbol === stock.symbol;

                    return (
                        <div key={stock.symbol} className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-lg overflow-hidden">
                            <Link
                                href={`/stocks/${stock.symbol}`}
                                className="block p-4 hover:bg-white/5 transition-colors"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <span className="font-bold text-white text-lg">{stock.symbol}</span>
                                        <p className="text-gray-400 text-sm truncate max-w-[180px]">{stock.company}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Compact SMA dots - always visible */}
                                        <div className="flex items-center gap-0.5" title="SMA indicators (expand for details)">
                                            <span className="w-1.5 h-1.5 rounded-full bg-gray-700" />
                                            <span className="w-1.5 h-1.5 rounded-full bg-gray-700" />
                                            <span className="w-1.5 h-1.5 rounded-full bg-gray-700" />
                                        </div>
                                        <span className={`text-sm font-semibold px-2 py-0.5 rounded-md ${isPositive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                                            {isPositive ? "+" : ""}{pctChange.toFixed(1)}%
                                        </span>
                                    </div>
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

                            {/* Expand toggle */}
                            <button
                                onClick={() => setExpandedSymbol(isExpanded ? null : stock.symbol)}
                                className="w-full px-4 py-1.5 flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors border-t border-white/5"
                            >
                                {isExpanded ? (
                                    <>Collapse <ChevronUp className="w-3 h-3" /></>
                                ) : (
                                    <>Indicators <ChevronDown className="w-3 h-3" /></>
                                )}
                            </button>

                            {isExpanded && (
                                <div className="px-4 pb-3">
                                    <ExpandedIndicators
                                        symbol={stock.symbol}
                                        price={stock.price}
                                        priceAtAdd={stock.priceAtAdd}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
