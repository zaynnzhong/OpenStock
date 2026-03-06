"use client";

import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { ArrowUp, ArrowDown, Bell, ChevronDown, ChevronRight, Plus, X, TrendingUp, TrendingDown } from "lucide-react";
import CreateAlertModal from "./CreateAlertModal";
import WatchlistButton from "@/components/WatchlistButton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { removeFromWatchlist, updateWatchSince, updateNotes, addToWatchlistGroup, removeFromWatchlistGroup } from "@/lib/actions/watchlist.actions";

interface WatchlistGroup {
    _id: string;
    name: string;
    color?: string;
}

interface WatchlistTableProps {
    data: any[];
    userId: string;
    onRefresh?: () => void;
    groups?: WatchlistGroup[];
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

function SMAIndicator({ label, value, price }: { label: string; value: number | null; price: number }) {
    if (!value) return (
        <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 w-20">{label}</span>
            <span className="text-gray-600">--</span>
        </div>
    );

    const isAbove = price >= value;
    const pctDiff = ((price - value) / value) * 100;
    return (
        <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 w-20">{label}</span>
            <span className={`font-mono ${isAbove ? "text-green-400" : "text-red-400"}`}>
                ${value.toFixed(2)}
            </span>
            {isAbove ? (
                <TrendingUp className="w-3.5 h-3.5 text-green-400" />
            ) : (
                <TrendingDown className="w-3.5 h-3.5 text-red-400" />
            )}
            <span className={`text-xs font-medium ${isAbove ? "text-green-500" : "text-red-500"}`}>
                {pctDiff >= 0 ? "+" : ""}{pctDiff.toFixed(1)}%
            </span>
        </div>
    );
}

function ExpandedRow({ stock, userId, groups, onGroupChange }: {
    stock: any;
    userId: string;
    groups: WatchlistGroup[];
    onGroupChange: () => void;
}) {
    const [smaData, setSmaData] = useState<{ sma200d: number | null; sma20w: number | null; sma50w: number | null; price: number | null } | null>(null);
    const [loadingSMA, setLoadingSMA] = useState(true);
    const [addingGroup, setAddingGroup] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { getSMAIndicators } = await import("@/lib/actions/finnhub.actions");
                const data = await getSMAIndicators(stock.symbol);
                if (!cancelled) setSmaData(data);
            } catch {
                if (!cancelled) setSmaData({ sma200d: null, sma20w: null, sma50w: null, price: null });
            } finally {
                if (!cancelled) setLoadingSMA(false);
            }
        })();
        return () => { cancelled = true; };
    }, [stock.symbol]);

    const priceAtAdd = stock.priceAtAdd;
    const changeSinceAdd = priceAtAdd && priceAtAdd > 0
        ? ((stock.price - priceAtAdd) / priceAtAdd * 100)
        : null;

    const stockLists: string[] = stock.lists || [];
    const availableGroups = groups.filter(g => !stockLists.includes(g._id));

    const handleAddGroup = async (groupId: string) => {
        try {
            await addToWatchlistGroup(userId, stock.symbol, groupId);
            onGroupChange();
            setAddingGroup(false);
        } catch {
            // Error handled in action
        }
    };

    const handleRemoveGroup = async (groupId: string) => {
        try {
            await removeFromWatchlistGroup(userId, stock.symbol, groupId);
            onGroupChange();
        } catch {
            // Error handled in action
        }
    };

    return (
        <tr>
            <td colSpan={8} className="px-6 py-4 bg-white/[0.02]">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* SMA Indicators */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">SMA Indicators</h4>
                        {loadingSMA ? (
                            <div className="text-sm text-gray-600 animate-pulse">Loading indicators...</div>
                        ) : (
                            <div className="space-y-1.5">
                                <SMAIndicator label="SMA 200D" value={smaData?.sma200d ?? null} price={stock.price} />
                                <SMAIndicator label="SMA 20W" value={smaData?.sma20w ?? null} price={stock.price} />
                                <SMAIndicator label="SMA 50W" value={smaData?.sma50w ?? null} price={stock.price} />
                            </div>
                        )}
                    </div>

                    {/* Change Since Add */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Since Added</h4>
                        {changeSinceAdd !== null ? (
                            <div className="space-y-1">
                                <div className="text-sm text-gray-400">
                                    Added at <span className="text-white font-mono">${priceAtAdd.toFixed(2)}</span>
                                </div>
                                <div className={`text-lg font-bold ${changeSinceAdd >= 0 ? "text-green-400" : "text-red-400"}`}>
                                    {changeSinceAdd >= 0 ? "+" : ""}{changeSinceAdd.toFixed(1)}%
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-gray-600">No price at add recorded</div>
                        )}

                        {/* Quick Alert Buttons */}
                        <div className="pt-2 space-y-1">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Quick Alerts</h4>
                            <CreateAlertModal
                                userId={userId}
                                symbol={stock.symbol}
                                currentPrice={stock.price}
                                companyName={stock.name}
                            >
                                <button className="text-xs px-2.5 py-1 rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors">
                                    <Bell className="w-3 h-3 inline mr-1" />
                                    Set Alert
                                </button>
                            </CreateAlertModal>
                        </div>
                    </div>

                    {/* Group Tags */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Lists</h4>
                        <div className="flex flex-wrap gap-1.5">
                            {stockLists.map(listId => {
                                const group = groups.find(g => g._id === listId);
                                if (!group) return null;
                                return (
                                    <span
                                        key={listId}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-gray-300"
                                    >
                                        {group.color && (
                                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: group.color }} />
                                        )}
                                        {group.name}
                                        <button
                                            onClick={() => handleRemoveGroup(listId)}
                                            className="ml-0.5 hover:text-red-400 transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                );
                            })}

                            {addingGroup ? (
                                <div className="flex items-center gap-1">
                                    {availableGroups.length > 0 ? (
                                        <select
                                            autoFocus
                                            onChange={(e) => {
                                                if (e.target.value) handleAddGroup(e.target.value);
                                            }}
                                            onBlur={() => setAddingGroup(false)}
                                            className="bg-white/10 border border-white/20 rounded text-xs text-white px-2 py-1 outline-none"
                                            defaultValue=""
                                        >
                                            <option value="" disabled>Select list...</option>
                                            {availableGroups.map(g => (
                                                <option key={g._id} value={g._id} className="bg-gray-900">{g.name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className="text-xs text-gray-600">No more lists</span>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={() => setAddingGroup(true)}
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-colors"
                                >
                                    <Plus className="w-3 h-3" />
                                    Add
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    );
}

export default function WatchlistTable({ data, userId, onRefresh, groups = [] }: WatchlistTableProps) {
    const [stocks, setStocks] = useState(data);
    const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

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

    const handleGroupChange = () => {
        if (onRefresh) onRefresh();
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
                        <th className="px-3 py-4 w-8"></th>
                        <th className="px-4 py-4 font-semibold tracking-wide">Company</th>
                        <th className="px-4 py-4 font-semibold tracking-wide">Symbol</th>
                        <th className="px-4 py-4 font-semibold tracking-wide">Price</th>
                        <th className="px-4 py-4 font-semibold tracking-wide">Change</th>
                        <th className="px-4 py-4 font-semibold tracking-wide">Market Cap</th>
                        <th className="px-4 py-4 font-semibold tracking-wide">Watch Since</th>
                        <th className="px-4 py-4 font-semibold tracking-wide">Notes</th>
                        <th className="px-4 py-4 text-right font-semibold tracking-wide">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                    {stocks.map((stock: any) => {
                        const isPositive = stock.change >= 0;
                        const isExpanded = expandedSymbol === stock.symbol;
                        return (
                            <React.Fragment key={stock.symbol}>
                                <tr className="hover:bg-white/5 transition-colors group">
                                    <td className="px-3 py-4">
                                        <button
                                            onClick={() => setExpandedSymbol(isExpanded ? null : stock.symbol)}
                                            className="p-1 rounded hover:bg-white/10 transition-colors text-gray-500 hover:text-gray-300"
                                        >
                                            {isExpanded ? (
                                                <ChevronDown className="w-4 h-4" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4" />
                                            )}
                                        </button>
                                    </td>
                                    <td className="px-4 py-4">
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
                                                {/* Compact list dots */}
                                                {stock.lists && stock.lists.length > 0 && (
                                                    <div className="flex items-center gap-1 mt-0.5">
                                                        {stock.lists.slice(0, 3).map((listId: string) => {
                                                            const group = groups.find(g => g._id === listId);
                                                            return group?.color ? (
                                                                <span
                                                                    key={listId}
                                                                    className="w-2 h-2 rounded-full"
                                                                    style={{ backgroundColor: group.color }}
                                                                    title={group.name}
                                                                />
                                                            ) : null;
                                                        })}
                                                        {stock.lists.length > 3 && (
                                                            <span className="text-[10px] text-gray-500">+{stock.lists.length - 3}</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 font-medium text-gray-300">
                                        <span className="bg-white/5 px-2.5 py-1 rounded-md text-xs font-mono border border-white/10">
                                            {stock.symbol}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 text-white font-medium text-base tracking-tight">
                                        {formatCurrency(stock.price)}
                                    </td>
                                    <td className={`px-4 py-4 font-medium`}>
                                        <div className={`flex items-center w-fit px-2 py-1 rounded-md ${isPositive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                                            {isPositive ? <ArrowUp className="w-3.5 h-3.5 mr-1.5" /> : <ArrowDown className="w-3.5 h-3.5 mr-1.5" />}
                                            {Math.abs(stock.changePercent).toFixed(2)}%
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-gray-400 font-medium">
                                        {formatNumber(stock.marketCap)}
                                    </td>
                                    <td className="px-4 py-4 text-gray-400">
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
                                    <td className="px-4 py-4 max-w-[200px]">
                                        <EditableNotesCell
                                            value={stock.notes || ""}
                                            symbol={stock.symbol}
                                            userId={userId}
                                            onSaved={handleNotesSaved}
                                        />
                                    </td>
                                    <td className="px-4 py-4 text-right">
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
                                {isExpanded && (
                                    <ExpandedRow
                                        stock={stock}
                                        userId={userId}
                                        groups={groups}
                                        onGroupChange={handleGroupChange}
                                    />
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
