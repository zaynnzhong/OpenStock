"use client";

import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { ArrowUp, ArrowDown, Bell } from "lucide-react";
import CreateAlertModal from "./CreateAlertModal";
import WatchlistButton from "@/components/WatchlistButton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { removeFromWatchlist, updateWatchSince, updateNotes } from "@/lib/actions/watchlist.actions";

interface WatchlistTableProps {
    data: any[];
    userId: string;
    onRefresh?: () => void;
}

function EditableNotesCell({
    value,
    symbol,
    userId,
    onSaved,
}: {
    value: string;
    symbol: string;
    userId: string;
    onSaved: (symbol: string, notes: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const startEdit = () => {
        setDraft(value || "");
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const save = async () => {
        const trimmed = draft.trim();
        if (trimmed === (value || "")) {
            setEditing(false);
            return;
        }
        setSaving(true);
        try {
            await updateNotes(userId, symbol, trimmed);
            onSaved(symbol, trimmed);
        } catch (err) {
            console.error("Failed to save notes:", err);
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
            <input
                ref={inputRef}
                type="text"
                maxLength={120}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={save}
                disabled={saving}
                className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
                placeholder="Add a note..."
            />
        );
    }

    return (
        <button
            onClick={startEdit}
            className="text-left hover:bg-white/10 rounded px-2 py-1 -mx-2 -my-1 transition-colors cursor-text group/cell w-full"
            title="Click to edit"
        >
            {value ? (
                <span className="text-gray-300 text-sm">{value}</span>
            ) : (
                <span className="text-gray-600 group-hover/cell:text-gray-400 text-sm">Add note...</span>
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

    const handleNotesSaved = (symbol: string, notes: string) => {
        setStocks(current =>
            current.map(s =>
                s.symbol === symbol ? { ...s, notes } : s
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
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-xl">
            <table className="w-full text-left text-sm border-collapse min-w-[900px]">
                <thead className="bg-white/5 text-gray-400 font-medium border-b border-white/10">
                    <tr>
                        <th className="px-6 py-4 font-semibold tracking-wide">Company</th>
                        <th className="px-6 py-4 font-semibold tracking-wide">Symbol</th>
                        <th className="px-6 py-4 font-semibold tracking-wide">Price</th>
                        <th className="px-6 py-4 font-semibold tracking-wide">Change</th>
                        <th className="px-6 py-4 font-semibold tracking-wide">Market Cap</th>
                        <th className="px-6 py-4 font-semibold tracking-wide">Watch Since</th>
                        <th className="px-6 py-4 font-semibold tracking-wide">Notes</th>
                        <th className="px-6 py-4 text-right font-semibold tracking-wide">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                    {stocks.map((stock: any) => {
                        const isPositive = stock.change >= 0;
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
                                <td className="px-6 py-4 text-gray-400 font-medium">
                                    {formatNumber(stock.marketCap)}
                                </td>
                                <td className="px-6 py-4 text-gray-400">
                                    <input
                                        type="date"
                                        value={stock.watchSince ? new Date(stock.watchSince).toISOString().split('T')[0] : (stock.addedAt ? new Date(stock.addedAt).toISOString().split('T')[0] : '')}
                                        onChange={async (e) => {
                                            const newDate = e.target.value || null;
                                            try {
                                                await updateWatchSince(userId, stock.symbol, newDate);
                                                setStocks(current =>
                                                    current.map(s =>
                                                        s.symbol === stock.symbol
                                                            ? { ...s, watchSince: newDate ? new Date(newDate).toISOString() : null }
                                                            : s
                                                    )
                                                );
                                            } catch (err) {
                                                console.error('Failed to update watchSince:', err);
                                            }
                                        }}
                                        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-gray-300 outline-none focus:border-blue-500 w-[130px]"
                                    />
                                </td>
                                <td className="px-6 py-4 max-w-[200px]">
                                    <EditableNotesCell
                                        value={stock.notes || ""}
                                        symbol={stock.symbol}
                                        userId={userId}
                                        onSaved={handleNotesSaved}
                                    />
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
