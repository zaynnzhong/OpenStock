"use client";

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, BarChart3, Shield, Layers, Pencil } from "lucide-react";

interface PlanOverviewBarProps {
    cashBalance: number;
    totalAccountValue: number;
    totalSlots: number;
    maxSlots: number;
    healthScore: number;
    onMaxSlotsChange?: (value: number) => void;
}

function getHealthColor(score: number) {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    if (score >= 40) return "text-orange-400";
    return "text-red-400";
}

function getHealthBg(score: number) {
    if (score >= 80) return "bg-green-500/20 border-green-500/30";
    if (score >= 60) return "bg-yellow-500/20 border-yellow-500/30";
    if (score >= 40) return "bg-orange-500/20 border-orange-500/30";
    return "bg-red-500/20 border-red-500/30";
}

export default function PlanOverviewBar({
    cashBalance,
    totalAccountValue,
    totalSlots,
    maxSlots,
    healthScore,
    onMaxSlotsChange,
}: PlanOverviewBarProps) {
    const positionsValue = totalAccountValue - cashBalance;
    const cashPct = totalAccountValue > 0 ? (cashBalance / totalAccountValue) * 100 : 0;
    const slotFillPct = maxSlots > 0 ? (totalSlots / maxSlots) * 100 : 0;
    const [editingMaxSlots, setEditingMaxSlots] = useState(false);
    const [editMaxVal, setEditMaxVal] = useState(maxSlots.toString());
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Cash */}
            <Card className="border border-gray-800 bg-gray-900/50">
                <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <DollarSign className="h-3.5 w-3.5 text-green-400" />
                        <span className="text-xs text-gray-500">Cash</span>
                    </div>
                    <div className="text-lg font-bold text-gray-100">
                        ${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                    <span className="text-[10px] text-gray-500">{cashPct.toFixed(1)}% of account</span>
                </CardContent>
            </Card>

            {/* Total Account Value */}
            <Card className="border border-gray-800 bg-gray-900/50">
                <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
                        <span className="text-xs text-gray-500">Total Value</span>
                    </div>
                    <div className="text-lg font-bold text-gray-100">
                        ${totalAccountValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                    <span className="text-[10px] text-gray-500">
                        Positions: ${positionsValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                </CardContent>
            </Card>

            {/* Structure Meter */}
            <Card className="border border-gray-800 bg-gray-900/50">
                <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <Layers className="h-3.5 w-3.5 text-purple-400" />
                        <span className="text-xs text-gray-500">Positions</span>
                    </div>
                    <div className="text-lg font-bold text-gray-100 flex items-center gap-1">
                        {totalSlots}/
                        {editingMaxSlots ? (
                            <input
                                ref={inputRef}
                                type="number"
                                min="1"
                                max="50"
                                className="w-10 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-lg text-gray-200 text-center font-bold"
                                value={editMaxVal}
                                autoFocus
                                onChange={(e) => setEditMaxVal(e.target.value)}
                                onBlur={() => {
                                    const parsed = parseInt(editMaxVal);
                                    if (!isNaN(parsed) && parsed >= 1 && onMaxSlotsChange) {
                                        onMaxSlotsChange(parsed);
                                    }
                                    setEditingMaxSlots(false);
                                }}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingMaxSlots(false); }}
                            />
                        ) : (
                            <button
                                className="hover:text-purple-400 transition-colors flex items-center gap-1 group"
                                onClick={() => { setEditMaxVal(maxSlots.toString()); setEditingMaxSlots(true); }}
                                title="Click to edit max positions"
                            >
                                {maxSlots}
                                <Pencil className="h-3 w-3 text-gray-300 group-hover:text-purple-400" />
                            </button>
                        )}
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-700 mt-1">
                        <div
                            className={`h-1.5 rounded-full transition-all ${slotFillPct > 90 ? "bg-red-500" : slotFillPct > 70 ? "bg-yellow-500" : "bg-purple-500"}`}
                            style={{ width: `${Math.min(slotFillPct, 100)}%` }}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Health Score */}
            <Card className={`border ${getHealthBg(healthScore)}`}>
                <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <Shield className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-xs text-gray-500">Health</span>
                    </div>
                    <div className={`text-lg font-bold ${getHealthColor(healthScore)}`}>
                        {healthScore}/100
                    </div>
                    <span className="text-[10px] text-gray-500">
                        {healthScore >= 80 ? "Healthy" : healthScore >= 60 ? "Caution" : healthScore >= 40 ? "At Risk" : "Critical"}
                    </span>
                </CardContent>
            </Card>
        </div>
    );
}
