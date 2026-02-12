"use client";

import { useState } from "react";
import { RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    updateDefaultCostBasisMethod,
    updateSymbolCostBasisOverride,
} from "@/lib/actions/portfolio-settings.actions";
import { recomputeSnapshots } from "@/lib/actions/portfolio.actions";

interface PortfolioSettingsProps {
    userId: string;
    settings: {
        defaultMethod: CostBasisMethod;
        symbolOverrides: { symbol: string; method: CostBasisMethod }[];
    };
    positions: PositionWithPriceData[];
    onSettingsChanged?: () => void;
}

export default function PortfolioSettings({ userId, settings, positions, onSettingsChanged }: PortfolioSettingsProps) {
    const [defaultMethod, setDefaultMethod] = useState<CostBasisMethod>(settings.defaultMethod);
    const [overrides, setOverrides] = useState(settings.symbolOverrides);
    const [recomputing, setRecomputing] = useState(false);
    const [recomputeResult, setRecomputeResult] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const handleDefaultChange = async (method: CostBasisMethod) => {
        setSaving(true);
        try {
            await updateDefaultCostBasisMethod(userId, method);
            setDefaultMethod(method);
            onSettingsChanged?.();
        } catch (err) {
            console.error('Failed to update default method:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleOverride = async (symbol: string, method: CostBasisMethod | null) => {
        setSaving(true);
        try {
            await updateSymbolCostBasisOverride(userId, symbol, method);
            if (method === null) {
                setOverrides(prev => prev.filter(o => o.symbol !== symbol));
            } else {
                setOverrides(prev => {
                    const existing = prev.find(o => o.symbol === symbol);
                    if (existing) {
                        return prev.map(o => o.symbol === symbol ? { ...o, method } : o);
                    }
                    return [...prev, { symbol, method }];
                });
            }
            onSettingsChanged?.();
        } catch (err) {
            console.error('Failed to update override:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleRecompute = async () => {
        setRecomputing(true);
        setRecomputeResult(null);
        try {
            const result = await recomputeSnapshots(userId);
            setRecomputeResult(`Computed ${result.computed} daily snapshots.`);
        } catch (err) {
            setRecomputeResult('Failed to recompute snapshots.');
        } finally {
            setRecomputing(false);
        }
    };

    // Symbols with positions
    const symbolsWithPositions = positions
        .filter(p => p.shares > 0 || p.realizedPL !== 0)
        .map(p => p.symbol);

    return (
        <div className="space-y-6">
            {/* Default Method */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Settings className="w-4 h-4" /> Default Cost Basis Method
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3">
                        <Button
                            variant={defaultMethod === 'FIFO' ? 'default' : 'outline'}
                            onClick={() => handleDefaultChange('FIFO')}
                            disabled={saving}
                            className="flex-1"
                        >
                            FIFO
                            <span className="text-xs ml-2 opacity-60">First In, First Out</span>
                        </Button>
                        <Button
                            variant={defaultMethod === 'AVERAGE' ? 'default' : 'outline'}
                            onClick={() => handleDefaultChange('AVERAGE')}
                            disabled={saving}
                            className="flex-1"
                        >
                            Average Cost
                            <span className="text-xs ml-2 opacity-60">Weighted Average</span>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Per-Symbol Overrides */}
            {symbolsWithPositions.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Per-Symbol Overrides</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {symbolsWithPositions.map(symbol => {
                                const override = overrides.find(o => o.symbol === symbol);
                                return (
                                    <div key={symbol} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-sm text-white">{symbol}</span>
                                            {override && <Badge variant="outline" className="text-[10px]">{override.method}</Badge>}
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleOverride(symbol, 'FIFO')}
                                                disabled={saving}
                                                className={`px-2 py-1 text-xs rounded transition-colors ${
                                                    override?.method === 'FIFO'
                                                        ? 'bg-white/15 text-white'
                                                        : 'text-gray-500 hover:text-white hover:bg-white/5'
                                                }`}
                                            >
                                                FIFO
                                            </button>
                                            <button
                                                onClick={() => handleOverride(symbol, 'AVERAGE')}
                                                disabled={saving}
                                                className={`px-2 py-1 text-xs rounded transition-colors ${
                                                    override?.method === 'AVERAGE'
                                                        ? 'bg-white/15 text-white'
                                                        : 'text-gray-500 hover:text-white hover:bg-white/5'
                                                }`}
                                            >
                                                AVG
                                            </button>
                                            {override && (
                                                <button
                                                    onClick={() => handleOverride(symbol, null)}
                                                    disabled={saving}
                                                    className="px-2 py-1 text-xs text-gray-500 hover:text-red-400 rounded transition-colors"
                                                >
                                                    Reset
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Recalculate Snapshots */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Chart Snapshots</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-gray-400 mb-4">
                        Recalculate daily P/L snapshots for the chart. This fetches historical prices and replays all trades.
                    </p>
                    <Button onClick={handleRecompute} disabled={recomputing} className="gap-2">
                        <RefreshCw className={`w-4 h-4 ${recomputing ? 'animate-spin' : ''}`} />
                        {recomputing ? 'Recomputing...' : 'Recalculate Snapshots'}
                    </Button>
                    {recomputeResult && (
                        <p className="text-sm text-green-400 mt-2">{recomputeResult}</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
