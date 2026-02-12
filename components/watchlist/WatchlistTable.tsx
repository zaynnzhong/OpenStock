"use client";

import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUp, ArrowDown, Bell, Check, X } from "lucide-react";
import CreateAlertModal from "./CreateAlertModal";
import WatchlistButton from "@/components/WatchlistButton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { removeFromWatchlist } from "@/lib/actions/watchlist.actions";

interface WatchlistTableProps {
    data: any[];
    userId: string;
    onRefresh?: () => void;
}

function EditableCell({
    value,
    symbol,
    field,
    userId,
    onSaved,
    format,
}: {
    value: number;
    symbol: string;
    field: "shares" | "avgCost";
    userId: string;
    onSaved: (symbol: string, field: "shares" | "avgCost", newVal: number) => void;
    format?: (v: number) => string;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const startEdit = () => {
        setDraft(value > 0 ? String(value) : "");
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const save = async () => {
        const num = parseFloat(draft) || 0;
        if (num === value) {
            setEditing(false);
            return;
        }
        setSaving(true);
        try {
            const body: any = { userId, symbol };
            body[field] = num;
            // We need to send both fields; fetch current other field from parent
            const res = await fetch("/api/holdings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                onSaved(symbol, field, num);
            }
        } catch (err) {
            console.error("Failed to save:", err);
        } finally {
            setSaving(false);
            setEditing(false);
        }
    };

    const cancel = () => {
        setEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") cancel();
    };

    if (editing) {
        return (
            <div className="flex items-center gap-1">
                <input
                    ref={inputRef}
                    type="number"
                    min="0"
                    step="any"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={save}
                    disabled={saving}
                    className="w-20 bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
                />
            </div>
        );
    }

    return (
        <button
            onClick={startEdit}
            className="text-left hover:bg-white/10 rounded px-2 py-1 -mx-2 -my-1 transition-colors cursor-text group/cell"
            title="Click to edit"
        >
            {value > 0 ? (
                <span>{format ? format(value) : value}</span>
            ) : (
                <span className="text-gray-600 group-hover/cell:text-gray-400">—</span>
            )}
        </button>
    );
}

export default function WatchlistTable({ data, userId, onRefresh }: WatchlistTableProps) {
    const [stocks, setStocks] = useState(data);

    useEffect(() => {
        setStocks(data);
    }, [data]);

    useEffect(() => {
        if (!stocks || stocks.length === 0) return;

        const pollPrices = async () => {
            try {
                const symbols = stocks.map(s => s.symbol);
                if (symbols.length === 0) return;

                const { getWatchlistData } = await import('@/lib/actions/finnhub.actions');
                const updatedData = await getWatchlistData(symbols);

                if (updatedData && updatedData.length > 0) {
                    setStocks(current => {
                        const map = new Map(updatedData.map(item => [item.symbol, item]));
                        return current.map(existing => {
                            const fresh = map.get(existing.symbol);
                            // Only update if we got a real price — never overwrite with $0
                            if (fresh && fresh.price > 0) {
                                return {
                                    ...existing,
                                    price: fresh.price,
                                    change: fresh.change,
                                    changePercent: fresh.changePercent,
                                };
                            }
                            return existing;
                        });
                    });
                }
            } catch (err) {
                console.error("Failed to poll watchlist prices", err);
            }
        };

        // If any stock has $0 price, retry quickly to fill in missing data
        const hasMissingPrices = stocks.some(s => !s.price || s.price === 0);
        if (hasMissingPrices) {
            const retryTimeout = setTimeout(pollPrices, 5000);
            return () => clearTimeout(retryTimeout);
        }

        const interval = setInterval(pollPrices, 30000);
        return () => clearInterval(interval);
    }, [stocks]);

    const handleCellSaved = (symbol: string, field: "shares" | "avgCost", newVal: number) => {
        setStocks(current =>
            current.map(s =>
                s.symbol === symbol ? { ...s, [field]: newVal } : s
            )
        );
    };

    if (!stocks || stocks.length === 0) {
        return (
            <div className="text-center py-12 bg-gray-900/50 rounded-lg border border-gray-800">
                <h3 className="text-xl font-medium text-gray-300 mb-2">Your watchlist is empty</h3>
                <p className="text-gray-500 mb-6">Add stocks to track their performance and set alerts.</p>
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-xl">
            <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-white/5 text-gray-400 font-medium border-b border-white/10">
                    <tr>
                        <th className="px-6 py-4 font-semibold tracking-wide">Company</th>
                        <th className="px-6 py-4 font-semibold tracking-wide">Symbol</th>
                        <th className="px-6 py-4 font-semibold tracking-wide">Price</th>
                        <th className="px-6 py-4 font-semibold tracking-wide">Change</th>
                        <th className="px-6 py-4 font-semibold tracking-wide">Shares</th>
                        <th className="px-6 py-4 font-semibold tracking-wide">Avg Cost</th>
                        <th className="px-6 py-4 font-semibold tracking-wide">P/L</th>
                        <th className="px-6 py-4 font-semibold tracking-wide">Market Cap</th>
                        <th className="px-6 py-4 text-right font-semibold tracking-wide">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                    {stocks.map((stock: any) => {
                        const isPositive = stock.change >= 0;
                        const hasHoldings = stock.shares > 0 && stock.avgCost > 0 && stock.price > 0;
                        const unrealizedPL = hasHoldings ? (stock.price - stock.avgCost) * stock.shares : 0;
                        const unrealizedPLPercent = hasHoldings ? ((stock.price - stock.avgCost) / stock.avgCost) * 100 : 0;
                        const plPositive = unrealizedPL >= 0;
                        return (
                            <tr key={stock.symbol} className="hover:bg-white/5 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="flex items-center space-x-4">
                                        {stock.logo ? (
                                            <div className="w-10 h-10 relative rounded-full overflow-hidden bg-white/10 shadow-sm border border-white/5">
                                                <Image
                                                    src={stock.logo}
                                                    alt={stock.symbol}
                                                    fill
                                                    className="object-contain p-1.5"
                                                />
                                            </div>
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-xs font-bold text-white shadow-sm border border-white/5">
                                                {stock.symbol[0]}
                                            </div>
                                        )}
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-white text-base">{stock.name}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 font-medium text-gray-300">
                                    <span className="bg-white/5 px-2.5 py-1 rounded-md text-xs font-mono border border-white/10">
                                        {stock.symbol}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-white font-medium text-base tracking-tight">
                                    {formatCurrency(stock.price)}
                                </td>
                                <td className={`px-6 py-4 font-medium`}>
                                    <div className={`flex items-center w-fit px-2 py-1 rounded-md ${isPositive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                                        {isPositive ? <ArrowUp className="w-3.5 h-3.5 mr-1.5" /> : <ArrowDown className="w-3.5 h-3.5 mr-1.5" />}
                                        {Math.abs(stock.changePercent).toFixed(2)}%
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-gray-300 font-medium">
                                    <EditableCell
                                        value={stock.shares}
                                        symbol={stock.symbol}
                                        field="shares"
                                        userId={userId}
                                        onSaved={handleCellSaved}
                                    />
                                </td>
                                <td className="px-6 py-4 text-gray-300 font-medium">
                                    <EditableCell
                                        value={stock.avgCost}
                                        symbol={stock.symbol}
                                        field="avgCost"
                                        userId={userId}
                                        onSaved={handleCellSaved}
                                        format={(v) => formatCurrency(v)}
                                    />
                                </td>
                                <td className="px-6 py-4 font-medium">
                                    {hasHoldings ? (
                                        <div className={`flex flex-col ${plPositive ? "text-green-400" : "text-red-400"}`}>
                                            <span>{plPositive ? "+" : ""}${Math.abs(unrealizedPL).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            <span className="text-xs opacity-75">{plPositive ? "+" : ""}{unrealizedPLPercent.toFixed(2)}%</span>
                                        </div>
                                    ) : (
                                        <span className="text-gray-600">—</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-gray-400 font-medium">
                                    {formatNumber(stock.marketCap)}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end space-x-3 opacity-80 group-hover:opacity-100 transition-opacity">
                                        <CreateAlertModal
                                            userId={userId}
                                            symbol={stock.symbol}
                                            currentPrice={stock.price}
                                            onAlertCreated={onRefresh}
                                        >
                                            <button className="p-2.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-all border border-transparent hover:border-white/10" title="Add Alert">
                                                <Bell className="w-4.5 h-4.5" />
                                            </button>
                                        </CreateAlertModal>

                                        <div className="transform scale-95 hover:scale-100 transition-transform">
                                            <WatchlistButton
                                                symbol={stock.symbol}
                                                company={stock.name}
                                                isInWatchlist={true}
                                                type="icon"
                                                showTrashIcon={false}
                                                onWatchlistChange={async (sym, added) => {
                                                    if (!added) {
                                                        await removeFromWatchlist(userId, sym);
                                                        setStocks((curr: any[]) => curr.filter((s: any) => s.symbol !== sym));
                                                        if (onRefresh) onRefresh();
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
