"use client";

import { Trash2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface StockTradeTableProps {
    trades: TradeData[];
    loading: boolean;
    onEdit: (trade: TradeData) => void;
    onDelete: (tradeId: string) => void;
}

const TYPE_BADGE_VARIANT: Record<string, "buy" | "sell" | "dividend"> = {
    BUY: "buy",
    SELL: "sell",
    DIVIDEND: "dividend",
};

function getCashFlowDisplay(trade: TradeData) {
    const cf = trade.cashFlow ?? 0;
    if (cf > 0) return { sign: '+', color: 'text-green-400' };
    if (cf < 0) return { sign: '', color: 'text-red-400' };
    return { sign: '', color: 'text-gray-400' };
}

export default function StockTradeTable({ trades, loading, onEdit, onDelete }: StockTradeTableProps) {
    return (
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
                    ) : trades.length === 0 ? (
                        <tr>
                            <td colSpan={10} className="px-4 py-8 text-center text-gray-500">No stock trades found.</td>
                        </tr>
                    ) : (
                        trades.map(trade => {
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
                                                onClick={() => onEdit(trade)}
                                                className="p-1.5 rounded text-gray-500 hover:text-teal-400 hover:bg-teal-500/10 transition-colors"
                                                title="Edit trade"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => onDelete(trade._id)}
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
    );
}
