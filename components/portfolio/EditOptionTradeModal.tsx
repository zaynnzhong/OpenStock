"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateTrade } from "@/lib/actions/trade.actions";
import DateInput from "./DateInput";

interface EditOptionTradeModalProps {
    trade: TradeData;
    userId: string;
    onClose: () => void;
    onSaved: () => void;
}

const inputClass =
    "w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30";

export default function EditOptionTradeModal({ trade, userId, onClose, onSaved }: EditOptionTradeModalProps) {
    const d = trade.optionDetails;

    const [symbol, setSymbol] = useState(trade.symbol);
    const [date, setDate] = useState(new Date(trade.executedAt).toISOString().split('T')[0]);
    const [fees, setFees] = useState(String(trade.fees || 0));
    const [notes, setNotes] = useState(trade.notes || "");

    const [contractType, setContractType] = useState<'CALL' | 'PUT'>(d?.contractType || 'CALL');
    const [action, setAction] = useState<OptionAction>(d?.action || 'SELL_TO_OPEN');
    const [strikePrice, setStrikePrice] = useState(String(d?.strikePrice || ""));
    const [expirationDate, setExpirationDate] = useState(d?.expirationDate ? new Date(d.expirationDate).toISOString().split('T')[0] : "");
    const [contracts, setContracts] = useState(String(d?.contracts || 1));
    const [premiumPerContract, setPremiumPerContract] = useState(String(d?.premiumPerContract || ""));

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const contractsNum = parseInt(contracts) || 1;
        const premiumNum = parseFloat(premiumPerContract) || 0;
        const strikeNum = parseFloat(strikePrice) || 0;

        if (!symbol.trim()) { setError("Symbol is required"); return; }
        if (strikeNum <= 0) { setError("Strike price must be > 0"); return; }
        if (premiumNum < 0) { setError("Premium cannot be negative"); return; }

        const totalAmount = contractsNum * premiumNum * 100;

        setSaving(true);
        try {
            await updateTrade(trade._id, userId, {
                symbol: symbol.toUpperCase(),
                type: 'OPTION_PREMIUM',
                quantity: contractsNum,
                pricePerShare: premiumNum,
                totalAmount,
                fees: parseFloat(fees) || 0,
                executedAt: date,
                notes: notes || undefined,
                optionDetails: {
                    contractType,
                    action,
                    strikePrice: strikeNum,
                    expirationDate,
                    contracts: contractsNum,
                    premiumPerContract: premiumNum,
                },
            });
            onSaved();
        } catch (err: any) {
            setError(err.message || "Failed to update trade");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-gray-900 border border-white/10 rounded-xl shadow-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-white">Edit Option Trade</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Symbol</label>
                            <input
                                type="text"
                                value={symbol}
                                onChange={e => setSymbol(e.target.value.toUpperCase())}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Date</label>
                            <DateInput
                                value={date}
                                onChange={setDate}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    {/* Option Details */}
                    <div className="space-y-3 p-3 border border-purple-500/20 rounded-lg bg-purple-500/5">
                        <h4 className="text-xs font-semibold text-purple-400 uppercase">Option Details</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Contract Type</label>
                                <select value={contractType} onChange={e => setContractType(e.target.value as 'CALL' | 'PUT')} className={inputClass}>
                                    <option value="CALL">Call</option>
                                    <option value="PUT">Put</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Action</label>
                                <select value={action} onChange={e => setAction(e.target.value as OptionAction)} className={inputClass}>
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
                                <input type="number" step="any" value={strikePrice} onChange={e => setStrikePrice(e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Expiration</label>
                                <DateInput value={expirationDate} onChange={setExpirationDate} className={inputClass} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Contracts</label>
                                <input type="number" step="1" min="1" value={contracts} onChange={e => setContracts(e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Premium / Contract</label>
                                <input type="number" step="any" value={premiumPerContract} onChange={e => setPremiumPerContract(e.target.value)} className={inputClass} />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Fees</label>
                            <input type="number" step="any" min="0" value={fees} onChange={e => setFees(e.target.value)} className={inputClass} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Notes</label>
                            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className={inputClass} />
                        </div>
                    </div>

                    {error && <p className="text-red-400 text-xs">{error}</p>}

                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
