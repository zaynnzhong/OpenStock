"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { TrendingUp, Pencil } from "lucide-react";
import { squarify } from "@/lib/treemap";
import { formatChangePercent } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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
    userId?: string;
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

export default function PortfolioHeatmap({ initialData, symbols, userId }: PortfolioHeatmapProps) {
    const [stocks, setStocks] = useState<HeatmapStockData[]>(initialData);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [editingStock, setEditingStock] = useState<HeatmapStockData | null>(null);
    const [editShares, setEditShares] = useState("");
    const [editAvgCost, setEditAvgCost] = useState("");
    const [saving, setSaving] = useState(false);

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

    // Recalculate weights: price × shares / total portfolio value
    // Stocks without holdings get a small minimum weight so they still appear
    const stocksWithWeights = useMemo(() => {
        const hasAnyHoldings = stocks.some((s) => s.shares > 0);

        if (hasAnyHoldings) {
            const totalValue = stocks.reduce(
                (sum, s) => sum + (s.shares > 0 ? s.shares * s.price : 0),
                0
            );
            if (totalValue <= 0) return stocks;

            // Give stocks without holdings a small minimum (2% of total)
            const minWeight = 2;
            const holdingsStocks = stocks.filter((s) => s.shares > 0);
            const noHoldingsStocks = stocks.filter((s) => s.shares <= 0);
            const reservedWeight = noHoldingsStocks.length * minWeight;
            const availableWeight = 100 - reservedWeight;

            return stocks.map((s) => ({
                ...s,
                weight:
                    s.shares > 0
                        ? ((s.shares * s.price) / totalValue) * availableWeight
                        : minWeight,
            }));
        }

        // No holdings — use equal weight
        const equalWeight = 100 / stocks.length;
        return stocks.map((s) => ({ ...s, weight: equalWeight }));
    }, [stocks]);

    // Compute treemap layout
    const rects = useMemo(() => {
        if (dimensions.width === 0 || dimensions.height === 0) return [];
        const items = stocksWithWeights.filter((s) => s.weight > 0);
        if (items.length === 0) return [];
        return squarify(items as any[], dimensions.width, dimensions.height);
    }, [stocksWithWeights, dimensions]);

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

    const handleEditClick = (e: React.MouseEvent, stock: HeatmapStockData) => {
        e.preventDefault();
        e.stopPropagation();
        setEditingStock(stock);
        setEditShares(stock.shares > 0 ? String(stock.shares) : "");
        setEditAvgCost(stock.avgCost > 0 ? String(stock.avgCost) : "");
    };

    const [saveError, setSaveError] = useState("");

    const handleSaveHoldings = async () => {
        if (!editingStock) return;
        if (!userId) {
            setSaveError("Not signed in. Please log in to save holdings.");
            return;
        }
        setSaving(true);
        setSaveError("");

        const sharesNum = parseFloat(editShares) || 0;
        const avgCostNum = parseFloat(editAvgCost) || 0;

        try {
            const res = await fetch("/api/holdings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    symbol: editingStock.symbol,
                    shares: sharesNum,
                    avgCost: avgCostNum,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Save failed");
            }

            // Update local state immediately
            setStocks((current) =>
                current.map((s) =>
                    s.symbol === editingStock.symbol
                        ? { ...s, shares: sharesNum, avgCost: avgCostNum }
                        : s
                )
            );
            setEditingStock(null);
        } catch (err) {
            console.error("Failed to update holdings:", err);
            setSaveError("Failed to save. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const hasAnyHoldings = stocks.some((s) => s.shares > 0);

    // Today's return: sum of (daily change * shares) for all holdings
    const todaysReturn = useMemo(() => {
        if (!hasAnyHoldings) return { value: 0, percent: 0 };
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
    }, [stocks, hasAnyHoldings]);

    if (stocks.length === 0) {
        return (
            <div className="w-full">
                <h3 className="font-semibold text-2xl text-gray-100 mb-5">
                    Portfolio Heatmap
                </h3>
                <div className="flex flex-col items-center justify-center py-16 px-6 bg-gray-900/30 rounded-xl border border-gray-800 border-dashed">
                    <TrendingUp className="w-12 h-12 text-gray-600 mb-4" />
                    <h4 className="text-lg font-semibold text-gray-300 mb-2">
                        No stocks in your watchlist
                    </h4>
                    <p className="text-gray-500 text-center max-w-sm">
                        Add stocks to your watchlist to see your portfolio heatmap.
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
                    {!hasAnyHoldings ? (
                        <p className="text-xs text-gray-500 mt-1">
                            Click the pencil icon on any block to add your holdings
                        </p>
                    ) : !stocks.some((s) => s.avgCost > 0) ? (
                        <p className="text-xs text-gray-500 mt-1">
                            Click the pencil icon to add your avg cost and see unrealized P/L
                        </p>
                    ) : null}
                </div>
                <div className="flex items-center gap-4">
                    {hasAnyHoldings && (
                        <div className="text-right">
                            <p className="text-xs text-gray-500">Today&apos;s Return</p>
                            <p className={`text-sm font-semibold ${todaysReturn.value >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {todaysReturn.value >= 0 ? "+" : ""}${Math.abs(todaysReturn.value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {" "}({todaysReturn.percent >= 0 ? "+" : ""}{todaysReturn.percent.toFixed(2)}%)
                            </p>
                        </div>
                    )}
                    <span className="text-xs text-gray-500">
                        {hasAnyHoldings
                            ? "Sized by position value"
                            : "Equal weight (no holdings set)"}
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
                            {/* Edit holdings button */}
                            <button
                                onClick={(e) => handleEditClick(e, stock)}
                                className="absolute top-0.5 right-0.5 p-0.5 rounded opacity-0 group-hover/block:opacity-100 transition-opacity bg-black/40 hover:bg-black/60 z-20"
                                title="Edit holdings"
                            >
                                <Pencil className="w-2.5 h-2.5 text-white/80" />
                            </button>

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

            {/* Edit Holdings Dialog */}
            <Dialog
                open={!!editingStock}
                onOpenChange={(open) => !open && setEditingStock(null)}
            >
                <DialogContent className="bg-gray-950 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-gray-100">
                            Edit Holdings — {editingStock?.symbol}
                        </DialogTitle>
                        <DialogDescription>
                            Enter how many shares you hold to weight the heatmap by position size.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="edit-shares" className="text-gray-300">
                                Number of Shares
                            </Label>
                            <Input
                                id="edit-shares"
                                type="number"
                                min="0"
                                step="any"
                                placeholder="e.g. 50"
                                value={editShares}
                                onChange={(e) => setEditShares(e.target.value)}
                                className="form-input"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-avgcost" className="text-gray-300">
                                Average Cost per Share (USD)
                            </Label>
                            <Input
                                id="edit-avgcost"
                                type="number"
                                min="0"
                                step="any"
                                placeholder="e.g. 25.50"
                                value={editAvgCost}
                                onChange={(e) => setEditAvgCost(e.target.value)}
                                className="form-input"
                            />
                        </div>
                    </div>
                    {saveError && (
                        <p className="text-red-400 text-sm px-1">{saveError}</p>
                    )}
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setEditingStock(null)}
                            className="text-gray-400"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveHoldings}
                            disabled={saving}
                            className="bg-white text-black hover:bg-gray-200"
                        >
                            {saving ? "Saving..." : "Save"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
