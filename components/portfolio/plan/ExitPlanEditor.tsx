"use client";

import { useState } from "react";
import { Plus, Trash2, Target, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { updateSlotTargets } from "@/lib/actions/position-plan.actions";

interface ExitPlanEditorProps {
    userId: string;
    slot: EnrichedPlanSlot;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdate: (plan: any) => void;
}

export default function ExitPlanEditor({
    userId,
    slot,
    open,
    onOpenChange,
    onUpdate,
}: ExitPlanEditorProps) {
    const [targets, setTargets] = useState<StagedTarget[]>(slot.stagedTargets || []);
    const [stopLoss, setStopLoss] = useState(slot.stopLossPrice?.toString() ?? "");
    const [trailingStop, setTrailingStop] = useState(slot.trailingStopPct?.toString() ?? "");
    const [saving, setSaving] = useState(false);

    const currentPrice = slot.currentPrice || 0;

    const addTarget = () => {
        setTargets([...targets, {
            price: 0,
            label: `Target ${targets.length + 1}`,
            sellPct: 25,
            reached: false,
        }]);
    };

    const removeTarget = (idx: number) => {
        setTargets(targets.filter((_, i) => i !== idx));
    };

    const updateTarget = (idx: number, field: keyof StagedTarget, value: any) => {
        const updated = [...targets];
        (updated[idx] as any)[field] = value;
        setTargets(updated);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const result = await updateSlotTargets(userId, slot.symbol, {
                stagedTargets: targets.map(t => ({
                    ...t,
                    price: Number(t.price),
                    sellPct: Number(t.sellPct),
                    trailingStopPct: t.trailingStopPct ? Number(t.trailingStopPct) : undefined,
                })),
                stopLossPrice: stopLoss ? parseFloat(stopLoss) : undefined,
                trailingStopPct: trailingStop ? parseFloat(trailingStop) : undefined,
            });
            onUpdate(result);
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    const stopLossVal = parseFloat(stopLoss);
    const stopLossDistPct = currentPrice > 0 && !isNaN(stopLossVal) ? ((currentPrice - stopLossVal) / currentPrice * 100) : null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-gray-900 border-gray-700 text-gray-100 sm:max-w-lg max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-gray-100 flex items-center gap-2">
                        <Target className="h-4 w-4 text-blue-400" />
                        Exit Plan — {slot.symbol}
                    </DialogTitle>
                </DialogHeader>

                {currentPrice > 0 && (
                    <div className="text-xs text-gray-500 -mt-2">
                        Current Price: <span className="text-gray-300 font-mono">${currentPrice.toFixed(2)}</span>
                    </div>
                )}

                <div className="space-y-4">
                    {/* Stop Loss */}
                    <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                        <div className="flex items-center gap-2 mb-2">
                            <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                            <Label className="text-red-400 text-xs font-semibold">Stop Loss</Label>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="Stop price..."
                                    value={stopLoss}
                                    onChange={(e) => setStopLoss(e.target.value)}
                                    className="bg-gray-800 border-gray-700 text-gray-200 text-xs"
                                />
                                {stopLossDistPct !== null && stopLossDistPct > 0 && (
                                    <span className="text-[10px] text-gray-500 mt-0.5 block">
                                        {stopLossDistPct.toFixed(1)}% below current price
                                    </span>
                                )}
                            </div>
                            <div className="w-24">
                                <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="Trail %"
                                    value={trailingStop}
                                    onChange={(e) => setTrailingStop(e.target.value)}
                                    className="bg-gray-800 border-gray-700 text-gray-200 text-xs"
                                />
                                <span className="text-[10px] text-gray-600 mt-0.5 block">Trailing %</span>
                            </div>
                        </div>
                    </div>

                    {/* Staged Targets */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label className="text-gray-400 text-xs font-semibold">Staged Profit Targets</Label>
                            <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-400 hover:text-blue-300" onClick={addTarget}>
                                <Plus className="h-3 w-3 mr-1" /> Add Target
                            </Button>
                        </div>

                        {targets.length === 0 ? (
                            <p className="text-xs text-gray-600 text-center py-3">No targets set. Add staged profit targets to plan your exit.</p>
                        ) : (
                            <div className="space-y-2">
                                {targets.map((t, i) => {
                                    const priceDist = currentPrice > 0 && t.price > 0
                                        ? ((t.price - currentPrice) / currentPrice * 100)
                                        : null;
                                    return (
                                        <div key={i} className="p-2.5 rounded-lg bg-gray-800/50 border border-gray-700/50 space-y-1.5">
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    placeholder="Label"
                                                    value={t.label}
                                                    onChange={(e) => updateTarget(i, "label", e.target.value)}
                                                    className="bg-gray-800 border-gray-700 text-gray-200 text-xs h-7 flex-1"
                                                />
                                                <button onClick={() => removeTarget(i)} className="text-gray-600 hover:text-red-400">
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                    <span className="text-[10px] text-gray-500">Price</span>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={t.price || ""}
                                                        onChange={(e) => updateTarget(i, "price", parseFloat(e.target.value) || 0)}
                                                        className="bg-gray-800 border-gray-700 text-gray-200 text-xs h-7"
                                                    />
                                                    {priceDist !== null && (
                                                        <span className={`text-[10px] ${priceDist >= 0 ? "text-green-500" : "text-red-500"}`}>
                                                            {priceDist >= 0 ? "+" : ""}{priceDist.toFixed(1)}%
                                                        </span>
                                                    )}
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-gray-500">Sell %</span>
                                                    <Input
                                                        type="number"
                                                        value={t.sellPct || ""}
                                                        onChange={(e) => updateTarget(i, "sellPct", parseFloat(e.target.value) || 0)}
                                                        className="bg-gray-800 border-gray-700 text-gray-200 text-xs h-7"
                                                    />
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-gray-500">Trail Stop %</span>
                                                    <Input
                                                        type="number"
                                                        step="0.1"
                                                        value={t.trailingStopPct || ""}
                                                        onChange={(e) => updateTarget(i, "trailingStopPct", parseFloat(e.target.value) || undefined)}
                                                        className="bg-gray-800 border-gray-700 text-gray-200 text-xs h-7"
                                                    />
                                                </div>
                                            </div>
                                            {t.reached && (
                                                <span className="text-[10px] text-green-400">Reached {t.reachedAt ? new Date(t.reachedAt).toLocaleDateString() : ""}</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* P/L Scenario Visualization */}
                    {currentPrice > 0 && (targets.length > 0 || !isNaN(stopLossVal)) && (
                        <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider">P/L Scenario</span>
                            <div className="mt-2 space-y-1">
                                {!isNaN(stopLossVal) && stopLossVal > 0 && (
                                    <div className="flex justify-between text-xs">
                                        <span className="text-red-400">Stop Loss @ ${stopLossVal.toFixed(2)}</span>
                                        <span className="text-red-400 font-mono">
                                            {((stopLossVal - currentPrice) / currentPrice * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                )}
                                {targets.filter(t => t.price > 0).sort((a, b) => a.price - b.price).map((t, i) => (
                                    <div key={i} className="flex justify-between text-xs">
                                        <span className="text-green-400">{t.label} @ ${Number(t.price).toFixed(2)} (sell {t.sellPct}%)</span>
                                        <span className="text-green-400 font-mono">
                                            +{((t.price - currentPrice) / currentPrice * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <Button onClick={handleSave} disabled={saving} className="w-full">
                        {saving ? "Saving..." : "Save Exit Plan"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
