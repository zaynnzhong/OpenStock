"use client";

import { Trash2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { useMemo } from "react";

interface OptionTradeTableProps {
    trades: TradeData[];
    loading: boolean;
    statusFilter: '' | 'Open' | 'Closed';
    onEdit: (trade: TradeData) => void;
    onDelete: (tradeId: string) => void;
}

const ACTION_LABELS: Record<string, string> = {
    SELL_TO_OPEN: "STO",
    SELL_TO_CLOSE: "STC",
    BUY_TO_OPEN: "BTO",
    BUY_TO_CLOSE: "BTC",
};

function getContractKey(d: NonNullable<TradeData['optionDetails']>, symbol: string) {
    const expDate = d.expirationDate ? new Date(d.expirationDate).toISOString().split('T')[0] : '';
    return `${symbol}|${d.contractType}|${d.strikePrice}|${expDate}`;
}

function isOpenAction(action: OptionAction) {
    return action === 'BUY_TO_OPEN' || action === 'SELL_TO_OPEN';
}

export default function OptionTradeTable({ trades, loading, statusFilter, onEdit, onDelete }: OptionTradeTableProps) {
    // Compute open/closed status per contract group
    const statusMap = useMemo(() => {
        const groups = new Map<string, number>();
        // Process in chronological order for net position
        const sorted = [...trades].sort((a, b) =>
            new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
        );
        for (const t of sorted) {
            if (!t.optionDetails) continue;
            const key = getContractKey(t.optionDetails, t.symbol);
            const current = groups.get(key) || 0;
            const contracts = t.optionDetails.contracts || 1;
            if (isOpenAction(t.optionDetails.action)) {
                groups.set(key, current + contracts);
            } else {
                groups.set(key, current - contracts);
            }
        }
        // Map: contractKey -> "Open" | "Closed"
        const result = new Map<string, string>();
        for (const [key, net] of groups) {
            result.set(key, net <= 0 ? 'Closed' : 'Open');
        }
        return result;
    }, [trades]);

    const filteredTrades = useMemo(() => {
        if (!statusFilter) return trades;
        return trades.filter(t => {
            if (!t.optionDetails) return false;
            const key = getContractKey(t.optionDetails, t.symbol);
            return statusMap.get(key) === statusFilter;
        });
    }, [trades, statusFilter, statusMap]);

    return (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-xl">
            <table className="w-full text-left text-sm border-collapse min-w-[950px]">
                <thead className="bg-white/5 text-gray-400 font-medium border-b border-white/10">
                    <tr>
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Symbol</th>
                        <th className="px-4 py-3 font-semibold">Action</th>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Strike</th>
                        <th className="px-4 py-3 font-semibold">Expiration</th>
                        <th className="px-4 py-3 font-semibold">Contracts</th>
                        <th className="px-4 py-3 font-semibold">Premium</th>
                        <th className="px-4 py-3 font-semibold">Total</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">P/L</th>
                        <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {loading ? (
                        <tr>
                            <td colSpan={12} className="px-4 py-8 text-center text-gray-500">Loading trades...</td>
                        </tr>
                    ) : filteredTrades.length === 0 ? (
                        <tr>
                            <td colSpan={12} className="px-4 py-8 text-center text-gray-500">No option trades found.</td>
                        </tr>
                    ) : (
                        filteredTrades.map(trade => {
                            const d = trade.optionDetails;
                            const cf = trade.cashFlow ?? trade.totalAmount;
                            const cfColor = cf > 0 ? 'text-green-400' : cf < 0 ? 'text-red-400' : 'text-gray-400';
                            const cfSign = cf > 0 ? '+' : '';

                            const contractKey = d ? getContractKey(d, trade.symbol) : '';
                            const status = statusMap.get(contractKey) || 'Open';
                            const isClosing = d && !isOpenAction(d.action);
                            const hasPL = isClosing && trade.realizedPL !== undefined && trade.realizedPL !== 0;
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
                                        <Badge variant={d?.action.startsWith('SELL') ? 'sell' : 'buy'}>
                                            {d ? ACTION_LABELS[d.action] || d.action : '—'}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                        {d ? (
                                            <Badge variant={d.contractType === 'CALL' ? 'success' : 'destructive'}>
                                                {d.contractType}
                                            </Badge>
                                        ) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300">
                                        {d?.strikePrice ? formatCurrency(d.strikePrice) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-400 text-xs">
                                        {d?.expirationDate ? new Date(d.expirationDate).toLocaleDateString() : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300">
                                        {d?.contracts || trade.quantity || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300">
                                        {d?.premiumPerContract ? formatCurrency(d.premiumPerContract) : formatCurrency(trade.pricePerShare)}
                                    </td>
                                    <td className={`px-4 py-3 font-medium ${cfColor}`}>
                                        {cfSign}{formatCurrency(Math.abs(cf))}
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge variant={status === 'Closed' ? 'secondary' : 'success'}>
                                            {status}
                                        </Badge>
                                    </td>
                                    <td className={`px-4 py-3 font-medium ${hasPL ? (plPositive ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                                        {hasPL ? `${plPositive ? '+' : ''}${formatCurrency(trade.realizedPL!)}` : '—'}
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
