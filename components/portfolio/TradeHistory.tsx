"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, Pencil, X, ArrowRightLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTradesWithPL, deleteTrade, updateTrade, renameSymbol } from "@/lib/actions/trade.actions";
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

const inputClass =
    "w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30";

/** Returns cash flow sign and color for a trade */
function getCashFlowDisplay(trade: TradeData) {
    const cf = trade.cashFlow ?? 0;
    if (cf > 0) return { sign: '+', color: 'text-green-400' };
    if (cf < 0) return { sign: '', color: 'text-red-400' };
    return { sign: '', color: 'text-gray-400' };
}

export default function TradeHistory({ userId, initialTrades = [], initialTotal = 0 }: TradeHistoryProps) {
    const [trades, setTrades] = useState<TradeData[]>(initialTrades);
    const [total, setTotal] = useState(initialTotal);
    const [page, setPage] = useState(0);
    const [filterSymbol, setFilterSymbol] = useState("");
    const [filterType, setFilterType] = useState<string>("");
    const [loading, setLoading] = useState(false);

    // Edit modal state
    const [editingTrade, setEditingTrade] = useState<TradeData | null>(null);
    const [editForm, setEditForm] = useState({ symbol: "", type: "" as TradeType, quantity: "", price: "", fees: "", date: "", notes: "" });
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    // Rename modal state
    const [showRename, setShowRename] = useState(false);
    const [renameFrom, setRenameFrom] = useState("");
    const [renameTo, setRenameTo] = useState("");
    const [renameSaving, setRenameSaving] = useState(false);
    const [renameResult, setRenameResult] = useState<string | null>(null);

    const fetchTrades = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getTradesWithPL(userId, {
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

    const openEdit = (trade: TradeData) => {
        setEditingTrade(trade);
        setEditForm({
            symbol: trade.symbol,
            type: trade.type,
            quantity: String(trade.quantity),
            price: String(trade.pricePerShare),
            fees: String(trade.fees || 0),
            date: new Date(trade.executedAt).toISOString().split('T')[0],
            notes: trade.notes || "",
        });
        setEditError(null);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTrade) return;
        setEditError(null);

        const qty = parseFloat(editForm.quantity) || 0;
        const price = parseFloat(editForm.price) || 0;
        if (!editForm.symbol.trim()) { setEditError("Symbol is required"); return; }
        if (editForm.type !== 'DIVIDEND' && editForm.type !== 'OPTION_PREMIUM' && (qty <= 0 || price <= 0)) {
            setEditError("Quantity and price must be > 0");
            return;
        }

        setEditSaving(true);
        try {
            await updateTrade(editingTrade._id, userId, {
                symbol: editForm.symbol.toUpperCase(),
                type: editForm.type,
                quantity: qty,
                pricePerShare: price,
                totalAmount: qty * price,
                fees: parseFloat(editForm.fees) || 0,
                executedAt: editForm.date,
                notes: editForm.notes || undefined,
            });
            setEditingTrade(null);
            await fetchTrades();
        } catch (err: any) {
            setEditError(err.message || "Failed to update trade");
        } finally {
            setEditSaving(false);
        }
    };

    const handleRename = async () => {
        const from = renameFrom.trim().toUpperCase();
        const to = renameTo.trim().toUpperCase();
        if (!from || !to) return;
        if (from === to) { setRenameResult("Symbols are the same."); return; }

        setRenameSaving(true);
        setRenameResult(null);
        try {
            const count = await renameSymbol(userId, from, to);
            setRenameResult(`Renamed ${count} trade${count !== 1 ? 's' : ''} from ${from} to ${to}.`);
            setRenameFrom("");
            setRenameTo("");
            await fetchTrades();
        } catch (err: any) {
            setRenameResult(err.message || "Failed to rename.");
        } finally {
            setRenameSaving(false);
        }
    };

    const totalPages = Math.ceil(total / PAGE_SIZE);

    const filteredTrades = filterType
        ? trades.filter(t => t.type === filterType)
        : trades;

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-3 flex-wrap items-center">
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
                <button
                    onClick={() => { setShowRename(!showRename); setRenameResult(null); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white bg-white/5 border border-white/10 rounded-md hover:bg-white/10 transition-colors"
                    title="Rename symbol across all trades (e.g. for mergers)"
                >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    Rename Symbol
                </button>
            </div>

            {/* Rename Symbol Bar */}
            {showRename && (
                <div className="flex flex-wrap items-end gap-3 p-4 rounded-lg border border-white/10 bg-white/[0.02]">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">From</label>
                        <input
                            type="text"
                            value={renameFrom}
                            onChange={e => setRenameFrom(e.target.value.toUpperCase())}
                            placeholder="INFQ"
                            className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30 w-28"
                        />
                    </div>
                    <span className="text-gray-500 pb-1.5">→</span>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">To</label>
                        <input
                            type="text"
                            value={renameTo}
                            onChange={e => setRenameTo(e.target.value.toUpperCase())}
                            placeholder="CCCX"
                            className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30 w-28"
                        />
                    </div>
                    <Button
                        onClick={handleRename}
                        disabled={renameSaving || !renameFrom.trim() || !renameTo.trim()}
                        size="sm"
                    >
                        {renameSaving ? "Renaming..." : "Rename All"}
                    </Button>
                    {renameResult && (
                        <span className="text-xs text-gray-400 pb-1.5">{renameResult}</span>
                    )}
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-xl">
                <table className="w-full text-left text-sm border-collapse min-w-[850px]">
                    <thead className="bg-white/5 text-gray-400 font-medium border-b border-white/10">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Date</th>
                            <th className="px-4 py-3 font-semibold">Symbol</th>
                            <th className="px-4 py-3 font-semibold">Type</th>
                            <th className="px-4 py-3 font-semibold">Qty</th>
                            <th className="px-4 py-3 font-semibold">Price</th>
                            <th className="px-4 py-3 font-semibold">Total</th>
                            <th className="px-4 py-3 font-semibold">Realized P/L</th>
                            <th className="px-4 py-3 font-semibold">Fees</th>
                            <th className="px-4 py-3 font-semibold">Source</th>
                            <th className="px-4 py-3 font-semibold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {loading ? (
                            <tr>
                                <td colSpan={10} className="px-4 py-8 text-center text-gray-500">Loading trades...</td>
                            </tr>
                        ) : filteredTrades.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="px-4 py-8 text-center text-gray-500">No trades found.</td>
                            </tr>
                        ) : (
                            filteredTrades.map(trade => {
                                const cf = getCashFlowDisplay(trade);
                                const hasPL = trade.type === 'SELL' && trade.realizedPL !== undefined && trade.realizedPL !== 0;
                                const plPositive = (trade.realizedPL ?? 0) >= 0;

                                return (
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
                                        <td className="px-4 py-3 text-gray-300">{trade.quantity > 0 ? trade.quantity : '—'}</td>
                                        <td className="px-4 py-3 text-gray-300">{trade.pricePerShare > 0 ? formatCurrency(trade.pricePerShare) : '—'}</td>
                                        <td className={`px-4 py-3 font-medium ${cf.color}`}>
                                            {cf.sign}{formatCurrency(Math.abs(trade.cashFlow ?? trade.totalAmount))}
                                        </td>
                                        <td className={`px-4 py-3 font-medium ${hasPL ? (plPositive ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                                            {hasPL ? (
                                                `${plPositive ? '+' : ''}${formatCurrency(trade.realizedPL!)}`
                                            ) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">{trade.fees > 0 ? formatCurrency(trade.fees) : '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs text-gray-500">{trade.source}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => openEdit(trade)}
                                                    className="p-1.5 rounded text-gray-500 hover:text-teal-400 hover:bg-teal-500/10 transition-colors"
                                                    title="Edit trade"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(trade._id)}
                                                    className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                    title="Delete trade"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
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

            {/* Edit Trade Modal */}
            {editingTrade && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-gray-900 border border-white/10 rounded-xl shadow-2xl p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-semibold text-white">Edit Trade</h2>
                            <button onClick={() => setEditingTrade(null)} className="text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Symbol</label>
                                    <input
                                        type="text"
                                        value={editForm.symbol}
                                        onChange={e => setEditForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                                        className={inputClass}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Type</label>
                                    <select
                                        value={editForm.type}
                                        onChange={e => setEditForm(f => ({ ...f, type: e.target.value as TradeType }))}
                                        className={inputClass}
                                    >
                                        <option value="BUY">Buy</option>
                                        <option value="SELL">Sell</option>
                                        <option value="OPTION_PREMIUM">Option Premium</option>
                                        <option value="DIVIDEND">Dividend</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Quantity</label>
                                    <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={editForm.quantity}
                                        onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                                        className={inputClass}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Price per Share</label>
                                    <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={editForm.price}
                                        onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                                        className={inputClass}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Fees</label>
                                    <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={editForm.fees}
                                        onChange={e => setEditForm(f => ({ ...f, fees: e.target.value }))}
                                        className={inputClass}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={editForm.date}
                                        onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                                        className={inputClass}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Notes</label>
                                <input
                                    type="text"
                                    value={editForm.notes}
                                    onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Optional"
                                    className={inputClass}
                                />
                            </div>

                            {editError && <p className="text-red-400 text-xs">{editError}</p>}

                            <div className="flex justify-end gap-3 pt-2">
                                <Button type="button" variant="ghost" onClick={() => setEditingTrade(null)}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={editSaving}>
                                    {editSaving ? "Saving..." : "Save Changes"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
