"use client";

import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSectorHeatData } from "@/lib/actions/position-plan.actions";

interface SectorRotationPanelProps {
    slots: PositionPlanSlot[];
    positions: PositionWithPriceData[];
}

function perfColor(pct: number) {
    if (pct > 1) return "bg-green-500/80 text-white";
    if (pct > 0) return "bg-green-500/30 text-green-300";
    if (pct > -1) return "bg-red-500/30 text-red-300";
    return "bg-red-500/80 text-white";
}

function perfSign(pct: number) {
    return pct >= 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`;
}

export default function SectorRotationPanel({ slots, positions }: SectorRotationPanelProps) {
    const [data, setData] = useState<SectorHeatData[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const result = await getSectorHeatData(slots, positions);
            setData(result);
            setLoaded(true);
        } finally {
            setLoading(false);
        }
    };

    // Load on first render
    useEffect(() => {
        if (!loaded) loadData();
    }, []);

    // Compute portfolio sector allocation from position data
    const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
    const sectorAllocation = new Map<string, number>();
    for (const slot of slots) {
        if (!slot.sector) continue;
        const pos = positions.find(p => p.symbol === slot.symbol);
        if (!pos) continue;
        const current = sectorAllocation.get(slot.sector) || 0;
        sectorAllocation.set(slot.sector, current + (totalValue > 0 ? (pos.marketValue / totalValue) * 100 : 0));
    }

    // Sort by 1D performance
    const sorted = [...data].sort((a, b) => b.performance1D - a.performance1D);

    return (
        <Card className="border border-gray-800 bg-gray-900/50">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-cyan-400" />
                        Sector Rotation
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadData}
                        disabled={loading}
                        className="h-7 text-xs text-gray-400 hover:text-gray-300"
                    >
                        <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
                        {loading ? "Loading..." : "Refresh"}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {!loaded && !loading ? (
                    <div className="text-center py-6 text-gray-600 text-xs">
                        Click Refresh to load sector data
                    </div>
                ) : loading && !loaded ? (
                    <div className="text-center py-6 text-gray-600 text-xs">
                        Loading sector ETF data...
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Heat Map Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-gray-500 border-b border-gray-800">
                                        <th className="text-left py-1.5 pr-2 font-medium">Sector</th>
                                        <th className="text-center py-1.5 px-1 font-medium w-14">ETF</th>
                                        <th className="text-center py-1.5 px-1 font-medium w-16">1D</th>
                                        <th className="text-center py-1.5 px-1 font-medium w-16">1W</th>
                                        <th className="text-center py-1.5 px-1 font-medium w-16">1M</th>
                                        <th className="text-right py-1.5 pl-1 font-medium w-16">Your %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((row) => {
                                        const yourPct = sectorAllocation.get(row.sector) || row.yourAllocationPct || 0;
                                        return (
                                            <tr key={row.etfSymbol} className="border-b border-gray-800/50 last:border-0">
                                                <td className="py-1.5 pr-2 text-gray-300 font-medium">{row.sector}</td>
                                                <td className="py-1.5 px-1 text-center text-gray-500 font-mono">{row.etfSymbol}</td>
                                                <td className="py-1.5 px-1">
                                                    <span className={`block text-center rounded px-1 py-0.5 text-[10px] font-mono ${perfColor(row.performance1D)}`}>
                                                        {perfSign(row.performance1D)}
                                                    </span>
                                                </td>
                                                <td className="py-1.5 px-1">
                                                    <span className={`block text-center rounded px-1 py-0.5 text-[10px] font-mono ${perfColor(row.performance1W)}`}>
                                                        {perfSign(row.performance1W)}
                                                    </span>
                                                </td>
                                                <td className="py-1.5 px-1">
                                                    <span className={`block text-center rounded px-1 py-0.5 text-[10px] font-mono ${perfColor(row.performance1M)}`}>
                                                        {perfSign(row.performance1M)}
                                                    </span>
                                                </td>
                                                <td className="py-1.5 pl-1 text-right">
                                                    {yourPct > 0 ? (
                                                        <span className="text-gray-300 font-mono">{yourPct.toFixed(1)}%</span>
                                                    ) : (
                                                        <span className="text-gray-600">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Rotation Signals */}
                        {sorted.length > 0 && (
                            <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Rotation Signals</span>
                                <div className="mt-2 space-y-1">
                                    {sorted.slice(0, 3).map(s => (
                                        <div key={s.etfSymbol} className="flex items-center gap-2 text-xs">
                                            <TrendingUp className="h-3 w-3 text-green-400" />
                                            <span className="text-green-400 font-medium">{s.sector}</span>
                                            <span className="text-gray-500">momentum {perfSign(s.performance1D)}</span>
                                        </div>
                                    ))}
                                    {sorted.slice(-3).reverse().map(s => (
                                        <div key={s.etfSymbol} className="flex items-center gap-2 text-xs">
                                            <TrendingDown className="h-3 w-3 text-red-400" />
                                            <span className="text-red-400 font-medium">{s.sector}</span>
                                            <span className="text-gray-500">momentum {perfSign(s.performance1D)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Your Portfolio Sector Distribution */}
                        {sectorAllocation.size > 0 && (
                            <div>
                                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Your Sector Distribution</span>
                                <div className="flex gap-0.5 h-4 rounded overflow-hidden bg-gray-800 mt-1.5">
                                    {[...sectorAllocation.entries()]
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([sector, pct]) => {
                                            const colors = [
                                                "bg-cyan-500", "bg-blue-500", "bg-purple-500", "bg-pink-500",
                                                "bg-amber-500", "bg-green-500", "bg-teal-500", "bg-orange-500",
                                                "bg-indigo-500", "bg-rose-500", "bg-lime-500",
                                            ];
                                            const idx = [...sectorAllocation.keys()].indexOf(sector);
                                            return (
                                                <div
                                                    key={sector}
                                                    className={`${colors[idx % colors.length]} relative group`}
                                                    style={{ width: `${Math.max(pct, 0.5)}%` }}
                                                    title={`${sector}: ${pct.toFixed(1)}%`}
                                                >
                                                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity truncate px-0.5">
                                                        {sector}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                </div>
                                <div className="flex gap-3 mt-1 flex-wrap">
                                    {[...sectorAllocation.entries()]
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([sector, pct]) => (
                                            <span key={sector} className="text-[10px] text-gray-500">
                                                {sector}: {pct.toFixed(1)}%
                                            </span>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
