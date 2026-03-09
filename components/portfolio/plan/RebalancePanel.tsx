"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown, AlertTriangle, TrendingUp, TrendingDown, Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface RebalancePanelProps {
    enrichedSlots: EnrichedPlanSlot[];
    tierTargets: TierTargets;
    sectorTargets: SectorTarget[];
    totalAccountValue: number;
    cashBalance: number;
}

type DriftRow = {
    level: "Tier" | "Sector" | "Position";
    name: string;
    targetPct: number;
    actualPct: number;
    drift: number;
    action: "Buy" | "Sell" | "Hold";
    amount: number;
};

function getDriftBadge(drift: number, threshold: number) {
    const abs = Math.abs(drift);
    if (abs > 5) return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">High</Badge>;
    if (abs > threshold) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">Moderate</Badge>;
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">OK</Badge>;
}

export default function RebalancePanel({
    enrichedSlots,
    tierTargets,
    sectorTargets,
    totalAccountValue,
    cashBalance,
}: RebalancePanelProps) {
    const [driftThreshold, setDriftThreshold] = useState(2);
    const [showCalculation, setShowCalculation] = useState(false);

    // Compute drift rows for tiers
    const tierRows = useMemo((): DriftRow[] => {
        const tiers: PositionTier[] = ["core", "satellite", "speculative"];
        const labels: Record<string, string> = { core: "Core", satellite: "Satellite", speculative: "Speculative" };
        return tiers.map((tier) => {
            const targetPct = tierTargets[tier];
            const tierSlots = enrichedSlots.filter((s) => s.tier === tier);
            const actualPct = tierSlots.reduce((sum, s) => sum + s.actualPct, 0);
            const drift = actualPct - targetPct;
            const amount = Math.abs(drift / 100) * totalAccountValue;
            return {
                level: "Tier",
                name: labels[tier],
                targetPct,
                actualPct,
                drift,
                action: drift > 0.5 ? "Sell" : drift < -0.5 ? "Buy" : "Hold",
                amount: Math.abs(drift) > 0.5 ? amount : 0,
            };
        });
    }, [enrichedSlots, tierTargets, totalAccountValue]);

    // Compute drift rows for sectors
    const sectorRows = useMemo((): DriftRow[] => {
        if (sectorTargets.length === 0) return [];
        const sectorMap = new Map<string, number>();
        enrichedSlots.forEach((s) => {
            const sector = s.sector || "Uncategorized";
            sectorMap.set(sector, (sectorMap.get(sector) || 0) + s.actualPct);
        });
        return sectorTargets.map((st) => {
            const actualPct = sectorMap.get(st.sector) || 0;
            const drift = actualPct - st.targetPct;
            const amount = Math.abs(drift / 100) * totalAccountValue;
            return {
                level: "Sector",
                name: st.sector,
                targetPct: st.targetPct,
                actualPct,
                drift,
                action: drift > 0.5 ? "Sell" : drift < -0.5 ? "Buy" : "Hold",
                amount: Math.abs(drift) > 0.5 ? amount : 0,
            };
        });
    }, [enrichedSlots, sectorTargets, totalAccountValue]);

    // Compute drift rows for positions
    const positionRows = useMemo((): DriftRow[] => {
        return enrichedSlots
            .filter((s) => s.targetPct != null && s.targetPct > 0)
            .map((s) => ({
                level: "Position" as const,
                name: s.symbol,
                targetPct: s.targetPct!,
                actualPct: s.actualPct,
                drift: s.deltaPct,
                action: s.deltaPct > 0.5 ? ("Sell" as const) : s.deltaPct < -0.5 ? ("Buy" as const) : ("Hold" as const),
                amount: Math.abs(s.deltaPct) > 0.5 ? Math.abs(s.deltaPct / 100) * totalAccountValue : 0,
            }));
    }, [enrichedSlots, totalAccountValue]);

    const allRows = [...tierRows, ...sectorRows, ...positionRows];
    const alertRows = allRows.filter((r) => Math.abs(r.drift) > driftThreshold);

    // Rebalance calculations
    const rebalanceActions = useMemo(() => {
        if (!showCalculation) return [];

        // Focus on position-level rebalancing
        const actions = positionRows
            .filter((r) => r.action !== "Hold")
            .sort((a, b) => {
                // Sell first, then buy
                if (a.action === "Sell" && b.action === "Buy") return -1;
                if (a.action === "Buy" && b.action === "Sell") return 1;
                return Math.abs(b.amount) - Math.abs(a.amount);
            });

        // Calculate net cash impact
        let netCash = 0;
        for (const a of actions) {
            if (a.action === "Sell") netCash += a.amount;
            else netCash -= a.amount;
        }

        return actions.map((a) => ({ ...a, netCash }));
    }, [showCalculation, positionRows]);

    const netCashImpact = useMemo(() => {
        let sells = 0;
        let buys = 0;
        for (const r of positionRows) {
            if (r.action === "Sell") sells += r.amount;
            else if (r.action === "Buy") buys += r.amount;
        }
        return sells - buys;
    }, [positionRows]);

    if (enrichedSlots.length === 0) return null;

    return (
        <Card className="border border-gray-800 bg-gray-900/50">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                        <ArrowUpDown className="h-4 w-4 text-blue-400" />
                        Rebalance Calculator
                    </CardTitle>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <span>Drift threshold:</span>
                            <Input
                                type="number"
                                value={driftThreshold}
                                onChange={(e) => setDriftThreshold(Math.max(0.5, Number(e.target.value) || 2))}
                                className="w-14 h-7 bg-gray-800 border-gray-700 text-gray-200 text-xs text-center"
                                step={0.5}
                                min={0.5}
                            />
                            <span>%</span>
                        </div>
                        <Button
                            size="sm"
                            variant={showCalculation ? "default" : "outline"}
                            onClick={() => setShowCalculation(!showCalculation)}
                            className="h-7 text-xs"
                        >
                            <Calculator className="h-3 w-3 mr-1" />
                            {showCalculation ? "Hide Actions" : "Calculate Rebalance"}
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Drift Alerts */}
                {alertRows.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {alertRows.map((r) => (
                            <div
                                key={`${r.level}-${r.name}`}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10"
                            >
                                <AlertTriangle className={`h-3 w-3 ${Math.abs(r.drift) > 5 ? "text-red-400" : "text-yellow-400"}`} />
                                <span className="text-xs text-gray-300">{r.name}</span>
                                <span className={`text-xs font-medium ${r.drift > 0 ? "text-red-400" : "text-green-400"}`}>
                                    {r.drift > 0 ? "+" : ""}{r.drift.toFixed(1)}%
                                </span>
                                {getDriftBadge(r.drift, driftThreshold)}
                            </div>
                        ))}
                    </div>
                )}

                {/* Drift Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="text-gray-400 text-xs border-b border-white/10">
                            <tr>
                                <th className="px-3 py-2 font-medium">Level</th>
                                <th className="px-3 py-2 font-medium">Name</th>
                                <th className="px-3 py-2 font-medium text-right">Target %</th>
                                <th className="px-3 py-2 font-medium text-right">Actual %</th>
                                <th className="px-3 py-2 font-medium text-right">Drift</th>
                                <th className="px-3 py-2 font-medium text-center">Status</th>
                                <th className="px-3 py-2 font-medium text-right">Action</th>
                                <th className="px-3 py-2 font-medium text-right">$ Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {allRows.map((row) => {
                                const isAlert = Math.abs(row.drift) > driftThreshold;
                                return (
                                    <tr
                                        key={`${row.level}-${row.name}`}
                                        className={`${isAlert ? "bg-white/[0.03]" : ""} hover:bg-white/5 transition-colors`}
                                    >
                                        <td className="px-3 py-2">
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] ${
                                                    row.level === "Tier"
                                                        ? "border-blue-500/40 text-blue-400"
                                                        : row.level === "Sector"
                                                        ? "border-purple-500/40 text-purple-400"
                                                        : "border-gray-500/40 text-gray-400"
                                                }`}
                                            >
                                                {row.level}
                                            </Badge>
                                        </td>
                                        <td className="px-3 py-2 text-white font-medium">{row.name}</td>
                                        <td className="px-3 py-2 text-right text-gray-300">{row.targetPct.toFixed(1)}%</td>
                                        <td className="px-3 py-2 text-right text-gray-300">{row.actualPct.toFixed(1)}%</td>
                                        <td className={`px-3 py-2 text-right font-medium ${row.drift > 0 ? "text-red-400" : row.drift < 0 ? "text-green-400" : "text-gray-400"}`}>
                                            {row.drift > 0 ? "+" : ""}{row.drift.toFixed(1)}%
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {getDriftBadge(row.drift, driftThreshold)}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {row.action === "Buy" ? (
                                                <span className="flex items-center justify-end gap-1 text-green-400 text-xs">
                                                    <TrendingUp className="h-3 w-3" /> Buy
                                                </span>
                                            ) : row.action === "Sell" ? (
                                                <span className="flex items-center justify-end gap-1 text-red-400 text-xs">
                                                    <TrendingDown className="h-3 w-3" /> Sell
                                                </span>
                                            ) : (
                                                <span className="text-gray-500 text-xs">Hold</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-300 text-xs">
                                            {row.amount > 0 ? (
                                                <span className={row.action === "Buy" ? "text-green-400" : "text-red-400"}>
                                                    {row.action === "Buy" ? "+" : "-"}{formatCurrency(row.amount)}
                                                </span>
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

                {/* Rebalance Actions */}
                {showCalculation && (
                    <div className="border border-white/10 rounded-lg p-4 bg-white/[0.02] space-y-3">
                        <h4 className="text-sm font-semibold text-white">Rebalance Actions</h4>
                        {rebalanceActions.length === 0 ? (
                            <p className="text-xs text-gray-500">All positions are within target. No rebalancing needed.</p>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    {rebalanceActions.map((a) => (
                                        <div
                                            key={a.name}
                                            className="flex items-center justify-between px-3 py-2 rounded-md bg-white/5"
                                        >
                                            <div className="flex items-center gap-2">
                                                {a.action === "Sell" ? (
                                                    <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                                                ) : (
                                                    <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                                                )}
                                                <span className="text-sm text-white font-medium">{a.name}</span>
                                                <span className={`text-xs ${a.action === "Sell" ? "text-red-400" : "text-green-400"}`}>
                                                    {a.action}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className={`text-sm font-medium ${a.action === "Sell" ? "text-red-400" : "text-green-400"}`}>
                                                    {a.action === "Sell" ? "-" : "+"}{formatCurrency(a.amount)}
                                                </span>
                                                <span className="text-xs text-gray-500 ml-2">
                                                    ({a.drift > 0 ? "+" : ""}{a.drift.toFixed(1)}% drift)
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Net Cash Summary */}
                                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                                    <div className="text-xs text-gray-400">
                                        <span>Available Cash: </span>
                                        <span className="text-white font-medium">{formatCurrency(cashBalance)}</span>
                                    </div>
                                    <div className="text-xs text-gray-400">
                                        <span>Net Cash Impact: </span>
                                        <span className={`font-medium ${netCashImpact >= 0 ? "text-green-400" : "text-red-400"}`}>
                                            {netCashImpact >= 0 ? "+" : ""}{formatCurrency(netCashImpact)}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-400">
                                        <span>Cash After: </span>
                                        <span className={`font-medium ${cashBalance + netCashImpact >= 0 ? "text-white" : "text-red-400"}`}>
                                            {formatCurrency(cashBalance + netCashImpact)}
                                        </span>
                                        {cashBalance + netCashImpact < 0 && (
                                            <span className="text-red-400 ml-1">(need {formatCurrency(Math.abs(cashBalance + netCashImpact))} more)</span>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
