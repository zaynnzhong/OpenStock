"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createTrade } from "@/lib/actions/trade.actions";

interface AddTradeModalProps {
    userId: string;
    onTradeAdded?: () => void;
    watchlistSymbols?: string[];
}

export default function AddTradeModal({ userId, onTradeAdded, watchlistSymbols = [] }: AddTradeModalProps) {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [symbol, setSymbol] = useState("");
    const [type, setType] = useState<TradeType>("BUY");
    const [quantity, setQuantity] = useState("");
    const [pricePerShare, setPricePerShare] = useState("");
    const [fees, setFees] = useState("");
    const [executedAt, setExecutedAt] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState("");

    // Option fields
    const [showOptions, setShowOptions] = useState(false);
    const [contractType, setContractType] = useState<"CALL" | "PUT">("CALL");
    const [optionAction, setOptionAction] = useState<OptionAction>("SELL_TO_OPEN");
    const [strikePrice, setStrikePrice] = useState("");
    const [expDate, setExpDate] = useState("");
    const [contracts, setContracts] = useState("");
    const [premiumPerContract, setPremiumPerContract] = useState("");

    const resetForm = () => {
        setSymbol("");
        setType("BUY");
        setQuantity("");
        setPricePerShare("");
        setFees("");
        setExecutedAt(new Date().toISOString().split('T')[0]);
        setNotes("");
        setShowOptions(false);
        setContractType("CALL");
        setOptionAction("SELL_TO_OPEN");
        setStrikePrice("");
        setExpDate("");
        setContracts("");
        setPremiumPerContract("");
        setError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!symbol.trim()) { setError("Symbol is required"); return; }
        if (!executedAt) { setError("Date is required"); return; }

        const qty = parseFloat(quantity) || 0;
        const price = parseFloat(pricePerShare) || 0;
        const fee = parseFloat(fees) || 0;

        if (type !== 'DIVIDEND' && type !== 'OPTION_PREMIUM' && (qty <= 0 || price <= 0)) {
            setError("Quantity and price must be greater than 0");
            return;
        }

        const totalAmount = type === 'OPTION_PREMIUM' && showOptions
            ? (parseFloat(contracts) || 0) * (parseFloat(premiumPerContract) || 0) * 100
            : qty * price;

        setSaving(true);
        try {
            await createTrade({
                userId,
                symbol: symbol.toUpperCase(),
                type,
                quantity: qty,
                pricePerShare: price,
                totalAmount,
                fees: fee,
                executedAt,
                notes: notes || undefined,
                optionDetails: type === 'OPTION_PREMIUM' && showOptions ? {
                    contractType,
                    action: optionAction,
                    strikePrice: parseFloat(strikePrice) || 0,
                    expirationDate: expDate,
                    contracts: parseFloat(contracts) || 0,
                    premiumPerContract: parseFloat(premiumPerContract) || 0,
                } : undefined,
            });

            resetForm();
            setOpen(false);
            onTradeAdded?.();
        } catch (err: any) {
            setError(err.message || "Failed to create trade");
        } finally {
            setSaving(false);
        }
    };

    if (!open) {
        return (
            <Button onClick={() => setOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Add Trade
            </Button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-gray-900 border border-white/10 rounded-xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-white">Add Trade</h2>
                    <button onClick={() => { resetForm(); setOpen(false); }} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Symbol with autocomplete from watchlist */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Symbol</label>
                        <input
                            type="text"
                            value={symbol}
                            onChange={e => setSymbol(e.target.value.toUpperCase())}
                            placeholder="AAPL"
                            list="watchlist-symbols"
                            className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30"
                        />
                        <datalist id="watchlist-symbols">
                            {watchlistSymbols.map(s => <option key={s} value={s} />)}
                        </datalist>
                    </div>

                    {/* Type */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Type</label>
                        <select
                            value={type}
                            onChange={e => {
                                const t = e.target.value as TradeType;
                                setType(t);
                                setShowOptions(t === 'OPTION_PREMIUM');
                            }}
                            className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                        >
                            <option value="BUY">Buy</option>
                            <option value="SELL">Sell</option>
                            <option value="OPTION_PREMIUM">Option Premium</option>
                            <option value="DIVIDEND">Dividend</option>
                        </select>
                    </div>

                    {/* Quantity & Price */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Quantity</label>
                            <input
                                type="number"
                                step="any"
                                min="0"
                                value={quantity}
                                onChange={e => setQuantity(e.target.value)}
                                placeholder="10"
                                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Price per Share</label>
                            <input
                                type="number"
                                step="any"
                                min="0"
                                value={pricePerShare}
                                onChange={e => setPricePerShare(e.target.value)}
                                placeholder="150.00"
                                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30"
                            />
                        </div>
                    </div>

                    {/* Fees & Date */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Fees</label>
                            <input
                                type="number"
                                step="any"
                                min="0"
                                value={fees}
                                onChange={e => setFees(e.target.value)}
                                placeholder="0"
                                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Date</label>
                            <input
                                type="date"
                                value={executedAt}
                                onChange={e => setExecutedAt(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                            />
                        </div>
                    </div>

                    {/* Option Details */}
                    {type === 'OPTION_PREMIUM' && (
                        <div className="space-y-3 p-3 border border-purple-500/20 rounded-lg bg-purple-500/5">
                            <h4 className="text-xs font-semibold text-purple-400 uppercase">Option Details</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Contract Type</label>
                                    <select value={contractType} onChange={e => setContractType(e.target.value as "CALL" | "PUT")}
                                        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none">
                                        <option value="CALL">Call</option>
                                        <option value="PUT">Put</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Action</label>
                                    <select value={optionAction} onChange={e => setOptionAction(e.target.value as OptionAction)}
                                        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none">
                                        <option value="SELL_TO_OPEN">Sell to Open</option>
                                        <option value="SELL_TO_CLOSE">Sell to Close</option>
                                        <option value="BUY_TO_OPEN">Buy to Open</option>
                                        <option value="BUY_TO_CLOSE">Buy to Close</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Strike Price</label>
                                    <input type="number" step="any" value={strikePrice} onChange={e => setStrikePrice(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Expiration</label>
                                    <input type="date" value={expDate} onChange={e => setExpDate(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Contracts</label>
                                    <input type="number" step="1" min="1" value={contracts} onChange={e => setContracts(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Premium / Contract</label>
                                    <input type="number" step="any" value={premiumPerContract} onChange={e => setPremiumPerContract(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
                        <input
                            type="text"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Earnings play, DCA, etc."
                            className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30"
                        />
                    </div>

                    {error && (
                        <p className="text-red-400 text-xs">{error}</p>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="ghost" onClick={() => { resetForm(); setOpen(false); }}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Saving...' : 'Add Trade'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
