"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ArrowRightLeft, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTradesWithPL, deleteTrade, updateTrade, renameSymbol, getOpenOptionPrices, type OptionPriceData } from "@/lib/actions/trade.actions";
import StockTradeTable from "./StockTradeTable";
import OptionTradeTable from "./OptionTradeTable";
import EditOptionTradeModal from "./EditOptionTradeModal";
import DateInput from "./DateInput";

interface TradeHistoryProps {
    userId: string;
    initialTrades?: TradeData[];
    initialTotal?: number;
}

const PAGE_SIZE = 50;

const inputClass =
    "w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30";

export default function TradeHistory({ userId }: TradeHistoryProps) {
    // Stock trades state
    const [stockTrades, setStockTrades] = useState<TradeData[]>([]);
    const [stockTotal, setStockTotal] = useState(0);
    const [stockPage, setStockPage] = useState(0);
    const [stockLoading, setStockLoading] = useState(false);
    const [stockOpen, setStockOpen] = useState(true);

    // Option trades state
    const [optionTrades, setOptionTrades] = useState<TradeData[]>([]);
    const [optionTotal, setOptionTotal] = useState(0);
    const [optionPage, setOptionPage] = useState(0);
    const [optionLoading, setOptionLoading] = useState(false);
    const [optionOpen, setOptionOpen] = useState(true);
    const [optionStatusFilter, setOptionStatusFilter] = useState<'' | 'Open' | 'Closed'>('');
    const [optionPrices, setOptionPrices] = useState<Record<string, OptionPriceData>>({});

    // Shared state
    const [filterSymbol, setFilterSymbol] = useState("");

    // Edit modal state (stock trades)
    const [editingTrade, setEditingTrade] = useState<TradeData | null>(null);
    const [editForm, setEditForm] = useState({ symbol: "", type: "" as TradeType, quantity: "", price: "", fees: "", date: "", notes: "" });
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    // Rename state
    const [showRename, setShowRename] = useState(false);
    const [renameFrom, setRenameFrom] = useState("");
    const [renameTo, setRenameTo] = useState("");
    const [renameSaving, setRenameSaving] = useState(false);
    const [renameResult, setRenameResult] = useState<string | null>(null);

    const fetchStockTrades = useCallback(async () => {
        setStockLoading(true);
        try {
            const result = await getTradesWithPL(userId, {
                symbol: filterSymbol || undefined,
                type: 'stock',
                limit: PAGE_SIZE,
                offset: stockPage * PAGE_SIZE,
                sort: 'desc',
            });
            setStockTrades(result.trades as TradeData[]);
            setStockTotal(result.total);
        } catch {
            // Keep existing data
        } finally {
            setStockLoading(false);
        }
    }, [userId, filterSymbol, stockPage]);

    const fetchOptionTrades = useCallback(async () => {
        setOptionLoading(true);
        try {
            const result = await getTradesWithPL(userId, {
                symbol: filterSymbol || undefined,
                type: 'option',
                limit: PAGE_SIZE,
                offset: optionPage * PAGE_SIZE,
                sort: 'desc',
            });
            setOptionTrades(result.trades as TradeData[]);
            setOptionTotal(result.total);
        } catch {
            // Keep existing data
        } finally {
            setOptionLoading(false);
        }
    }, [userId, filterSymbol, optionPage]);

    const fetchOptionPrices = useCallback(async () => {
        try {
            const prices = await getOpenOptionPrices(userId, filterSymbol || undefined);
            setOptionPrices(prices);
        } catch {
            // Keep existing data
        }
    }, [userId, filterSymbol]);

    useEffect(() => { fetchStockTrades(); }, [fetchStockTrades]);
    useEffect(() => { fetchOptionTrades(); }, [fetchOptionTrades]);
    useEffect(() => { fetchOptionPrices(); }, [fetchOptionPrices]);

    const handleDelete = async (tradeId: string) => {
        if (!confirm('Delete this trade? This will recalculate your position.')) return;
        try {
            await deleteTrade(tradeId, userId);
            await Promise.all([fetchStockTrades(), fetchOptionTrades()]);
        } catch (err) {
            console.error('Failed to delete trade:', err);
        }
    };

    const openEdit = (trade: TradeData) => {
        if (trade.type === 'OPTION_PREMIUM') {
            setEditingTrade(trade);
            return;
        }
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
        if (editForm.type !== 'DIVIDEND' && (qty <= 0 || price <= 0)) {
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
            await Promise.all([fetchStockTrades(), fetchOptionTrades()]);
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
            await Promise.all([fetchStockTrades(), fetchOptionTrades()]);
        } catch (err: any) {
            setRenameResult(err.message || "Failed to rename.");
        } finally {
            setRenameSaving(false);
        }
    };

    const stockTotalPages = Math.ceil(stockTotal / PAGE_SIZE);
    const optionTotalPages = Math.ceil(optionTotal / PAGE_SIZE);

    const isOptionEdit = editingTrade?.type === 'OPTION_PREMIUM';

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-3 flex-wrap items-center">
                <input
                    type="text"
                    placeholder="Filter by symbol..."
                    value={filterSymbol}
                    onChange={e => { setFilterSymbol(e.target.value.toUpperCase()); setStockPage(0); setOptionPage(0); }}
                    className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30 w-40"
                />
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

            {/* Stock Trades Section */}
            <div>
                <button
                    onClick={() => setStockOpen(!stockOpen)}
                    className="flex items-center gap-2 w-full text-left py-2 group"
                >
                    {stockOpen ? (
                        <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                    ) : (
                        <ChevronRightIcon className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                    )}
                    <h3 className="text-sm font-semibold text-white group-hover:text-white transition-colors">
                        Stock Trades
                    </h3>
                    <span className="text-xs text-gray-500">({stockTotal})</span>
                </button>
                {stockOpen && (
                    <div className="space-y-3">
                        <StockTradeTable
                            trades={stockTrades}
                            loading={stockLoading}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                        />
                        {stockTotalPages > 1 && (
                            <div className="flex items-center justify-between text-sm text-gray-400">
                                <span>Showing {stockPage * PAGE_SIZE + 1}–{Math.min((stockPage + 1) * PAGE_SIZE, stockTotal)} of {stockTotal}</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setStockPage(p => Math.max(0, p - 1))}
                                        disabled={stockPage === 0}
                                        className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setStockPage(p => Math.min(stockTotalPages - 1, p + 1))}
                                        disabled={stockPage >= stockTotalPages - 1}
                                        className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Option Trades Section */}
            <div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setOptionOpen(!optionOpen)}
                        className="flex items-center gap-2 text-left py-2 group"
                    >
                        {optionOpen ? (
                            <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                        ) : (
                            <ChevronRightIcon className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                        )}
                        <h3 className="text-sm font-semibold text-white group-hover:text-white transition-colors">
                            Option Trades
                        </h3>
                        <span className="text-xs text-gray-500">({optionTotal})</span>
                    </button>
                    {optionOpen && (
                        <select
                            value={optionStatusFilter}
                            onChange={e => setOptionStatusFilter(e.target.value as '' | 'Open' | 'Closed')}
                            className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-300 outline-none focus:border-white/30"
                        >
                            <option value="">All Status</option>
                            <option value="Open">Open</option>
                            <option value="Closed">Closed</option>
                        </select>
                    )}
                </div>
                {optionOpen && (
                    <div className="space-y-3">
                        <OptionTradeTable
                            trades={optionTrades}
                            loading={optionLoading}
                            statusFilter={optionStatusFilter}
                            currentPrices={optionPrices}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                        />
                        {optionTotalPages > 1 && (
                            <div className="flex items-center justify-between text-sm text-gray-400">
                                <span>Showing {optionPage * PAGE_SIZE + 1}–{Math.min((optionPage + 1) * PAGE_SIZE, optionTotal)} of {optionTotal}</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setOptionPage(p => Math.max(0, p - 1))}
                                        disabled={optionPage === 0}
                                        className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setOptionPage(p => Math.min(optionTotalPages - 1, p + 1))}
                                        disabled={optionPage >= optionTotalPages - 1}
                                        className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Edit Stock Trade Modal */}
            {editingTrade && !isOptionEdit && (
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
                                    <DateInput
                                        value={editForm.date}
                                        onChange={v => setEditForm(f => ({ ...f, date: v }))}
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

            {/* Edit Option Trade Modal */}
            {editingTrade && isOptionEdit && (
                <EditOptionTradeModal
                    trade={editingTrade}
                    userId={userId}
                    onClose={() => setEditingTrade(null)}
                    onSaved={async () => {
                        setEditingTrade(null);
                        await Promise.all([fetchStockTrades(), fetchOptionTrades()]);
                    }}
                />
            )}
        </div>
    );
}
