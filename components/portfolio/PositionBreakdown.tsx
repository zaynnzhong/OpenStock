"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface PositionBreakdownProps {
    positions: PositionWithPriceData[];
}

export default function PositionBreakdown({ positions }: PositionBreakdownProps) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const toggleExpand = (symbol: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(symbol)) next.delete(symbol);
            else next.add(symbol);
            return next;
        });
    };

    // Sort: active positions first (shares > 0 or open options), then by market value desc
    const sorted = [...positions].sort((a, b) => {
        const aActive = a.shares > 0 || (a.openOptions?.length ?? 0) > 0;
        const bActive = b.shares > 0 || (b.openOptions?.length ?? 0) > 0;
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return b.marketValue - a.marketValue;
    });

    if (sorted.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500">
                <p>No positions yet. Add a trade to get started.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-xl">
            <table className="w-full text-left text-sm border-collapse min-w-[1000px]">
                <thead className="bg-white/5 text-gray-400 font-medium border-b border-white/10">
                    <tr>
                        <th className="px-4 py-3 font-semibold w-8"></th>
                        <th className="px-4 py-3 font-semibold">Symbol</th>
                        <th className="px-4 py-3 font-semibold">Shares</th>
                        <th className="px-4 py-3 font-semibold">Avg Cost</th>
                        <th className="px-4 py-3 font-semibold">Rolling Cost</th>
                        <th className="px-4 py-3 font-semibold">Price</th>
                        <th className="px-4 py-3 font-semibold">Daily</th>
                        <th className="px-4 py-3 font-semibold">Market Value</th>
                        <th className="px-4 py-3 font-semibold">Unrealized P/L</th>
                        <th className="px-4 py-3 font-semibold">Realized P/L</th>
                        <th className="px-4 py-3 font-semibold">Method</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {sorted.map(pos => {
                        const isExpanded = expanded.has(pos.symbol);
                        const unrealizedPositive = pos.unrealizedPL >= 0;
                        const realizedPositive = pos.realizedPL >= 0;

                        return (
                            <PositionRow
                                key={pos.symbol}
                                pos={pos}
                                isExpanded={isExpanded}
                                unrealizedPositive={unrealizedPositive}
                                realizedPositive={realizedPositive}
                                onToggle={() => toggleExpand(pos.symbol)}
                            />
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function PositionRow({
    pos,
    isExpanded,
    unrealizedPositive,
    realizedPositive,
    onToggle,
}: {
    pos: PositionWithPriceData;
    isExpanded: boolean;
    unrealizedPositive: boolean;
    realizedPositive: boolean;
    onToggle: () => void;
}) {
    const stockPL = pos.realizedPL;
    const hasStockPL = stockPL !== 0;
    const hasOpenOptions = (pos.openOptions?.length ?? 0) > 0;
    const hasClosedOptionPL = (pos.optionsClosedPL ?? 0) !== 0;
    const hasDividends = pos.dividendsReceived > 0;
    const hasBreakdown = hasStockPL || hasOpenOptions || hasClosedOptionPL || hasDividends;

    return (
        <>
            <tr className="hover:bg-white/5 transition-colors cursor-pointer" onClick={onToggle}>
                <td className="px-4 py-3">
                    {hasBreakdown && (
                        isExpanded
                            ? <ChevronDown className="w-4 h-4 text-gray-500" />
                            : <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                </td>
                <td className="px-4 py-3">
                    <div className="flex flex-col">
                        <span className="font-semibold text-white">{pos.symbol}</span>
                        <span className="text-xs text-gray-500">{pos.company}</span>
                    </div>
                </td>
                <td className="px-4 py-3 text-gray-300">
                    {pos.shares > 0 ? pos.shares.toFixed(pos.shares % 1 !== 0 ? 4 : 0) : <span className="text-gray-600">0</span>}
                </td>
                <td className="px-4 py-3 text-gray-300">{pos.avgCostPerShare > 0 ? formatCurrency(pos.avgCostPerShare) : '—'}</td>
                <td className="px-4 py-3">
                    {pos.shares > 0 && pos.adjustedCostPerShare !== pos.avgCostPerShare ? (
                        <div className="flex flex-col">
                            <span className={pos.adjustedCostPerShare < pos.avgCostPerShare ? 'text-green-400 font-medium' : 'text-orange-400 font-medium'}>
                                {formatCurrency(pos.adjustedCostPerShare)}
                            </span>
                            <span className="text-[10px] text-gray-500">
                                {pos.adjustedCostPerShare < pos.avgCostPerShare ? '' : '+'}
                                {formatCurrency(pos.adjustedCostPerShare - pos.avgCostPerShare)}/sh
                            </span>
                        </div>
                    ) : pos.avgCostPerShare > 0 ? (
                        <span className="text-gray-500">{formatCurrency(pos.avgCostPerShare)}</span>
                    ) : '—'}
                </td>
                <td className="px-4 py-3 text-white font-medium">{pos.currentPrice > 0 ? formatCurrency(pos.currentPrice) : '—'}</td>
                <td className="px-4 py-3">
                    {pos.dailyChange !== 0 ? (
                        <div className="flex flex-col">
                            <span className={`font-medium ${pos.dailyChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {pos.dailyChange >= 0 ? '+' : ''}{formatCurrency(pos.dailyChange)}
                            </span>
                            <span className={`text-xs opacity-75 ${pos.dailyChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {pos.dailyChangePercent >= 0 ? '+' : ''}{pos.dailyChangePercent.toFixed(2)}%
                            </span>
                        </div>
                    ) : <span className="text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-white">{pos.marketValue > 0 ? formatCurrency(pos.marketValue) : '—'}</td>
                <td className={`px-4 py-3 font-medium ${unrealizedPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {pos.shares > 0 || (pos.openOptions?.length ?? 0) > 0 ? (
                        <div className="flex flex-col">
                            <span>{unrealizedPositive ? '+' : ''}{formatCurrency(pos.unrealizedPL)}</span>
                            {pos.totalReturnPercent !== 0 && (
                                <span className="text-xs opacity-75">{pos.totalReturnPercent >= 0 ? '+' : ''}{pos.totalReturnPercent.toFixed(2)}%</span>
                            )}
                        </div>
                    ) : '—'}
                </td>
                <td className={`px-4 py-3 font-medium ${realizedPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {pos.realizedPL !== 0 ? `${realizedPositive ? '+' : ''}${formatCurrency(pos.realizedPL)}` : '—'}
                </td>
                <td className="px-4 py-3">
                    <Badge variant="outline" className="text-[10px]">{pos.costBasisMethod}</Badge>
                </td>
            </tr>
            {isExpanded && hasBreakdown && (
                <>
                    {hasOpenOptions && pos.openOptions.map((opt, i) => {
                        const dirLabel = opt.direction === 'long' ? 'BTO' : 'STO';
                        const typeLabel = opt.contractType === 'CALL' ? 'C' : 'P';
                        const expLabel = new Date(opt.expirationDate + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                        const label = `${dirLabel} ${opt.netContracts}x $${opt.strikePrice}${typeLabel} ${expLabel}`;
                        const plPositive = opt.unrealizedPL >= 0;
                        return (
                            <tr key={`opt-${i}`} className="bg-white/[0.02]">
                                <td className="px-4 py-2"></td>
                                <td className="px-4 py-2 text-xs text-purple-400 pl-8">{label}</td>
                                <td className="px-4 py-2 text-xs text-gray-500">{opt.netContracts} ct</td>
                                <td className="px-4 py-2 text-xs text-gray-400">{formatCurrency(opt.avgPremium)}</td>
                                <td className="px-4 py-2 text-xs text-gray-500">{formatCurrency(opt.totalCost)}</td>
                                <td className="px-4 py-2 text-xs text-white">{opt.currentPrice > 0 ? formatCurrency(opt.currentPrice) : '—'}</td>
                                <td className="px-4 py-2"></td>
                                <td className="px-4 py-2 text-xs text-gray-300">{opt.currentValue > 0 ? formatCurrency(opt.currentValue) : '—'}</td>
                                <td className={`px-4 py-2 text-xs font-medium ${plPositive ? 'text-green-400' : 'text-red-400'}`}>
                                    {opt.currentPrice > 0 ? `${plPositive ? '+' : ''}${formatCurrency(opt.unrealizedPL)}` : '—'}
                                </td>
                                <td className="px-4 py-2"></td>
                                <td className="px-4 py-2"></td>
                            </tr>
                        );
                    })}
                    {hasStockPL && (
                        <tr className="bg-white/[0.02]">
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 text-xs text-gray-500 pl-8">Stock P/L</td>
                            <td className="px-4 py-2" colSpan={7}></td>
                            <td className={`px-4 py-2 text-xs font-medium ${stockPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {stockPL >= 0 ? '+' : ''}{formatCurrency(stockPL)}
                            </td>
                            <td className="px-4 py-2"></td>
                        </tr>
                    )}
                    {hasClosedOptionPL && (
                        <tr className="bg-white/[0.02]">
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 text-xs text-purple-400 pl-8">Closed Options P/L</td>
                            <td className="px-4 py-2" colSpan={7}></td>
                            <td className={`px-4 py-2 text-xs font-medium ${(pos.optionsClosedPL ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {(pos.optionsClosedPL ?? 0) >= 0 ? '+' : ''}{formatCurrency(pos.optionsClosedPL ?? 0)}
                            </td>
                            <td className="px-4 py-2"></td>
                        </tr>
                    )}
                    {hasDividends && (
                        <tr className="bg-white/[0.02]">
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 text-xs text-blue-400 pl-8">Dividends</td>
                            <td className="px-4 py-2" colSpan={7}></td>
                            <td className="px-4 py-2 text-xs font-medium text-green-400">
                                +{formatCurrency(pos.dividendsReceived)}
                            </td>
                            <td className="px-4 py-2"></td>
                        </tr>
                    )}
                </>
            )}
        </>
    );
}
