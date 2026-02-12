"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getUserTrades, deleteTrade } from "@/lib/actions/trade.actions";
import { formatCurrency } from "@/lib/utils";

interface TradeHistoryProps {
    userId: string;
    initialTrades?: TradeData[];
    initialTotal?: number;
}

const PAGE_SIZE = 50;

const TYPE_BADGE_VARIANT: Record<string, "buy" | "sell" | "option" | "dividend"> = {
    BUY: "buy",
    SELL: "sell",
    OPTION_PREMIUM: "option",
    DIVIDEND: "dividend",
};

export default function TradeHistory({ userId, initialTrades = [], initialTotal = 0 }: TradeHistoryProps) {
    const [trades, setTrades] = useState<TradeData[]>(initialTrades);
    const [total, setTotal] = useState(initialTotal);
    const [page, setPage] = useState(0);
    const [filterSymbol, setFilterSymbol] = useState("");
    const [filterType, setFilterType] = useState<string>("");
    const [loading, setLoading] = useState(false);

    const fetchTrades = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getUserTrades(userId, {
                symbol: filterSymbol || undefined,
                limit: PAGE_SIZE,
                offset: page * PAGE_SIZE,
                sort: 'desc',
            });
            setTrades(result.trades as TradeData[]);
            setTotal(result.total);
        } catch {
            // Keep existing data
        } finally {
            setLoading(false);
        }
    }, [userId, filterSymbol, page]);

    useEffect(() => {
        fetchTrades();
    }, [fetchTrades]);

    const handleDelete = async (tradeId: string) => {
        if (!confirm('Delete this trade? This will recalculate your position.')) return;
        try {
            await deleteTrade(tradeId, userId);
            await fetchTrades();
        } catch (err) {
            console.error('Failed to delete trade:', err);
        }
    };

    const totalPages = Math.ceil(total / PAGE_SIZE);

    const filteredTrades = filterType
        ? trades.filter(t => t.type === filterType)
        : trades;

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
                <input
                    type="text"
                    placeholder="Filter by symbol..."
                    value={filterSymbol}
                    onChange={e => { setFilterSymbol(e.target.value.toUpperCase()); setPage(0); }}
                    className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30 w-40"
                />
                <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
                >
                    <option value="">All Types</option>
                    <option value="BUY">Buy</option>
                    <option value="SELL">Sell</option>
                    <option value="OPTION_PREMIUM">Option Premium</option>
                    <option value="DIVIDEND">Dividend</option>
                </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-xl">
                <table className="w-full text-left text-sm border-collapse min-w-[700px]">
                    <thead className="bg-white/5 text-gray-400 font-medium border-b border-white/10">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Date</th>
                            <th className="px-4 py-3 font-semibold">Symbol</th>
                            <th className="px-4 py-3 font-semibold">Type</th>
                            <th className="px-4 py-3 font-semibold">Qty</th>
                            <th className="px-4 py-3 font-semibold">Price</th>
                            <th className="px-4 py-3 font-semibold">Total</th>
                            <th className="px-4 py-3 font-semibold">Fees</th>
                            <th className="px-4 py-3 font-semibold">Source</th>
                            <th className="px-4 py-3 font-semibold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {loading ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Loading trades...</td>
                            </tr>
                        ) : filteredTrades.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">No trades found.</td>
                            </tr>
                        ) : (
                            filteredTrades.map(trade => (
                                <tr key={trade._id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-4 py-3 text-gray-400 text-xs">
                                        {new Date(trade.executedAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="bg-white/5 px-2 py-0.5 rounded text-xs font-mono border border-white/10 text-white">
                                            {trade.symbol}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge variant={TYPE_BADGE_VARIANT[trade.type] || "default"}>
                                            {trade.type.replace('_', ' ')}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-gray-300">{trade.quantity}</td>
                                    <td className="px-4 py-3 text-gray-300">{formatCurrency(trade.pricePerShare)}</td>
                                    <td className="px-4 py-3 text-white font-medium">{formatCurrency(trade.totalAmount)}</td>
                                    <td className="px-4 py-3 text-gray-500">{trade.fees > 0 ? formatCurrency(trade.fees) : '—'}</td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs text-gray-500">{trade.source}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => handleDelete(trade._id)}
                                            className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                            title="Delete trade"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-gray-400">
                    <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
