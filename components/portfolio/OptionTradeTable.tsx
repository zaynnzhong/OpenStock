"use client";

import { Trash2, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { useMemo, useState } from "react";
import type { OptionPriceData } from "@/lib/actions/trade.actions";

interface OptionTradeTableProps {
    trades: TradeData[];
    loading: boolean;
    statusFilter: '' | 'Open' | 'Closed';
    currentPrices?: Record<string, OptionPriceData>;
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

interface ContractGroup {
    key: string;
    symbol: string;
    contractType: string;
    strike: number;
    expDate: string;
    direction: 'long' | 'short';
    trades: TradeData[];
    netContracts: number;
    totalCashFlow: number;
    avgPremium: number;
    status: 'Open' | 'Closed';
    latestTradeDate: number;
}

export default function OptionTradeTable({ trades, loading, statusFilter, currentPrices, onEdit, onDelete }: OptionTradeTableProps) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const toggleExpand = (key: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const contractGroups = useMemo(() => {
        const groupMap = new Map<string, ContractGroup>();

        // Sort chronologically for correct net position calculation
        const sorted = [...trades].sort((a, b) =>
            new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
        );

        for (const t of sorted) {
            const d = t.optionDetails;
            if (!d) continue;
            const key = getContractKey(d, t.symbol);
            const contracts = d.contracts || 1;
            const cf = t.cashFlow ?? t.totalAmount;

            if (!groupMap.has(key)) {
                const expDate = d.expirationDate ? new Date(d.expirationDate).toISOString().split('T')[0] : '';
                groupMap.set(key, {
                    key,
                    symbol: t.symbol,
                    contractType: d.contractType,
                    strike: d.strikePrice,
                    expDate,
                    direction: isOpenAction(d.action) ? (d.action === 'SELL_TO_OPEN' ? 'short' : 'long') : 'short',
                    trades: [],
                    netContracts: 0,
                    totalCashFlow: 0,
                    avgPremium: 0,
                    status: 'Open',
                    latestTradeDate: 0,
                });
            }

            const group = groupMap.get(key)!;
            group.trades.push(t);

            if (isOpenAction(d.action)) {
                group.netContracts += contracts;
            } else {
                group.netContracts -= contracts;
            }

            group.totalCashFlow += cf;

            const tradeDate = new Date(t.executedAt).getTime();
            if (tradeDate > group.latestTradeDate) {
                group.latestTradeDate = tradeDate;
            }
        }

        // Compute avg premium & status for each group
        for (const group of groupMap.values()) {
            // Weighted avg premium of opening trades only
            let totalPremiumWeighted = 0;
            let totalOpenContracts = 0;
            for (const t of group.trades) {
                const d = t.optionDetails!;
                if (isOpenAction(d.action)) {
                    const premium = d.premiumPerContract || t.pricePerShare;
                    const contracts = d.contracts || 1;
                    totalPremiumWeighted += premium * contracts;
                    totalOpenContracts += contracts;
                }
            }
            group.avgPremium = totalOpenContracts > 0 ? totalPremiumWeighted / totalOpenContracts : 0;

            // Direction from first opening trade
            const firstOpen = group.trades.find(t => t.optionDetails && isOpenAction(t.optionDetails.action));
            if (firstOpen?.optionDetails) {
                group.direction = firstOpen.optionDetails.action === 'SELL_TO_OPEN' ? 'short' : 'long';
            }

            group.status = group.netContracts <= 0 ? 'Closed' : 'Open';
        }

        // Sort: open first, then by most recent trade date desc
        const groups = Array.from(groupMap.values());
        groups.sort((a, b) => {
            if (a.status !== b.status) return a.status === 'Open' ? -1 : 1;
            return b.latestTradeDate - a.latestTradeDate;
        });

        return groups;
    }, [trades]);

    const filteredGroups = useMemo(() => {
        if (!statusFilter) return contractGroups;
        return contractGroups.filter(g => g.status === statusFilter);
    }, [contractGroups, statusFilter]);

    const COL_COUNT = 12;

    return (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-xl">
            <table className="w-full text-left text-sm border-collapse min-w-[1100px]">
                <thead className="bg-white/5 text-gray-400 font-medium border-b border-white/10">
                    <tr>
                        <th className="px-2 py-3 w-8"></th>
                        <th className="px-4 py-3 font-semibold">Symbol</th>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Strike</th>
                        <th className="px-4 py-3 font-semibold">Expiration</th>
                        <th className="px-4 py-3 font-semibold">Contracts</th>
                        <th className="px-4 py-3 font-semibold">Avg Premium</th>
                        <th className="px-4 py-3 font-semibold">Net Credit/Debit</th>
                        <th className="px-4 py-3 font-semibold">Current</th>
                        <th className="px-4 py-3 font-semibold">Unrealized</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">P/L</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {loading ? (
                        <tr>
                            <td colSpan={COL_COUNT} className="px-4 py-8 text-center text-gray-500">Loading trades...</td>
                        </tr>
                    ) : filteredGroups.length === 0 ? (
                        <tr>
                            <td colSpan={COL_COUNT} className="px-4 py-8 text-center text-gray-500">No option trades found.</td>
                        </tr>
                    ) : (
                        filteredGroups.map(group => {
                            const isExpanded = expanded.has(group.key);
                            const cf = group.totalCashFlow;
                            const cfColor = cf > 0 ? 'text-green-400' : cf < 0 ? 'text-red-400' : 'text-gray-400';
                            const cfSign = cf > 0 ? '+' : '';

                            // Current price & unrealized for open groups
                            const priceData = currentPrices?.[group.key];
                            const currentMid = group.status === 'Open' && priceData ? priceData.mid : null;
                            let unrealizedPL: number | null = null;
                            if (currentMid !== null && group.status === 'Open') {
                                const isShort = group.direction === 'short';
                                unrealizedPL = isShort
                                    ? (group.avgPremium - currentMid) * group.netContracts * 100
                                    : (currentMid - group.avgPremium) * group.netContracts * 100;
                                unrealizedPL = Math.round(unrealizedPL * 100) / 100;
                            }

                            // P/L for closed groups
                            const showPL = group.status === 'Closed';
                            const pl = group.totalCashFlow;
                            const plPositive = pl >= 0;

                            return (
                                <GroupRows
                                    key={group.key}
                                    group={group}
                                    isExpanded={isExpanded}
                                    onToggle={() => toggleExpand(group.key)}
                                    cfColor={cfColor}
                                    cfSign={cfSign}
                                    cf={cf}
                                    currentMid={currentMid}
                                    unrealizedPL={unrealizedPL}
                                    showPL={showPL}
                                    pl={pl}
                                    plPositive={plPositive}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                    colCount={COL_COUNT}
                                />
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
}

interface GroupRowsProps {
    group: ContractGroup;
    isExpanded: boolean;
    onToggle: () => void;
    cfColor: string;
    cfSign: string;
    cf: number;
    currentMid: number | null;
    unrealizedPL: number | null;
    showPL: boolean;
    pl: number;
    plPositive: boolean;
    onEdit: (trade: TradeData) => void;
    onDelete: (tradeId: string) => void;
    colCount: number;
}

function GroupRows({ group, isExpanded, onToggle, cfColor, cfSign, cf, currentMid, unrealizedPL, showPL, pl, plPositive, onEdit, onDelete, colCount }: GroupRowsProps) {
    // Sort detail trades by date desc
    const sortedTrades = useMemo(() =>
        [...group.trades].sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()),
        [group.trades]
    );

    return (
        <>
            {/* Summary row */}
            <tr className="hover:bg-white/5 transition-colors cursor-pointer" onClick={onToggle}>
                <td className="px-2 py-3">
                    {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-gray-500" />
                        : <ChevronRight className="w-4 h-4 text-gray-500" />
                    }
                </td>
                <td className="px-4 py-3">
                    <span className="bg-white/5 px-2 py-0.5 rounded text-xs font-mono border border-white/10 text-white">
                        {group.symbol}
                    </span>
                </td>
                <td className="px-4 py-3">
                    <Badge variant={group.contractType === 'CALL' ? 'success' : 'destructive'}>
                        {group.contractType}
                    </Badge>
                </td>
                <td className="px-4 py-3 text-gray-300">
                    {formatCurrency(group.strike)}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                    {group.expDate ? (
                        <>
                            {new Date(group.expDate + 'T00:00:00').toLocaleDateString()}
                            {group.status === 'Open' && (() => {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const exp = new Date(group.expDate + 'T00:00:00');
                                const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                const dteColor = days <= 7 ? 'text-red-400'
                                    : days <= 30 ? 'text-orange-400'
                                    : days <= 90 ? 'text-yellow-400'
                                    : 'text-emerald-400';
                                return (
                                    <span className={`ml-1.5 ${dteColor} font-medium`}>
                                        ({days}d)
                                    </span>
                                );
                            })()}
                        </>
                    ) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-300">
                    {group.netContracts > 0 ? group.netContracts : '—'}
                </td>
                <td className="px-4 py-3 text-gray-300">
                    {formatCurrency(group.avgPremium)}
                </td>
                <td className={`px-4 py-3 font-medium ${cfColor}`}>
                    {cfSign}{formatCurrency(Math.abs(cf))}
                </td>
                <td className="px-4 py-3 text-gray-300">
                    {currentMid !== null ? formatCurrency(currentMid) : '—'}
                </td>
                <td className={`px-4 py-3 font-medium ${unrealizedPL !== null ? (unrealizedPL >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                    {unrealizedPL !== null ? `${unrealizedPL >= 0 ? '+' : '-'}${formatCurrency(Math.abs(unrealizedPL))}` : '—'}
                </td>
                <td className="px-4 py-3">
                    <Badge variant={group.status === 'Closed' ? 'secondary' : 'success'}>
                        {group.status}
                    </Badge>
                </td>
                <td className={`px-4 py-3 font-medium ${showPL ? (plPositive ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                    {showPL ? `${plPositive ? '+' : '-'}${formatCurrency(Math.abs(pl))}` : '—'}
                </td>
            </tr>

            {/* Detail rows */}
            {isExpanded && sortedTrades.map(trade => {
                const d = trade.optionDetails;
                const tradeCf = trade.cashFlow ?? trade.totalAmount;
                const tradeCfColor = tradeCf > 0 ? 'text-green-400' : tradeCf < 0 ? 'text-red-400' : 'text-gray-400';
                const tradeCfSign = tradeCf > 0 ? '+' : '';

                return (
                    <tr key={trade._id} className="bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                        <td className="px-2 py-2"></td>
                        <td className="px-4 py-2 text-gray-500 text-xs">
                            {new Date(trade.executedAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">
                            <Badge variant={d?.action.startsWith('SELL') ? 'sell' : 'buy'}>
                                {d ? ACTION_LABELS[d.action] || d.action : '—'}
                            </Badge>
                        </td>
                        <td className="px-4 py-2 text-gray-300 text-xs">
                            {d?.contracts || trade.quantity || '—'}
                        </td>
                        <td className="px-4 py-2 text-gray-300 text-xs">
                            {d?.premiumPerContract ? formatCurrency(d.premiumPerContract) : formatCurrency(trade.pricePerShare)}
                        </td>
                        <td className={`px-4 py-2 text-xs font-medium ${tradeCfColor}`}>
                            {tradeCfSign}{formatCurrency(Math.abs(tradeCf))}
                        </td>
                        {/* Spacer cells to align with summary columns */}
                        <td colSpan={4}></td>
                        <td></td>
                        <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onEdit(trade); }}
                                    className="p-1.5 rounded text-gray-500 hover:text-teal-400 hover:bg-teal-500/10 transition-colors"
                                    title="Edit trade"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(trade._id); }}
                                    className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    title="Delete trade"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </td>
                    </tr>
                );
            })}
        </>
    );
}
