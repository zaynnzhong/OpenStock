"use client";

import { useState } from "react";
import { Pencil, Check, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface SectorTargetEditorProps {
    sector: string;
    actualPct: number;
    targetPct: number | undefined;
    onSave: (sector: string, targetPct: number) => void;
}

export default function SectorTargetEditor({ sector, actualPct, targetPct, onSave }: SectorTargetEditorProps) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(targetPct?.toString() || "");

    const drift = targetPct != null ? actualPct - targetPct : 0;
    const hasDrift = targetPct != null && Math.abs(drift) > 0.5;

    const handleSave = () => {
        const num = parseFloat(value);
        if (!isNaN(num) && num >= 0 && num <= 100) {
            onSave(sector, num);
            setEditing(false);
        }
    };

    if (editing) {
        return (
            <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">Target:</span>
                <Input
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                        if (e.key === "Escape") setEditing(false);
                    }}
                    className="w-16 h-6 bg-gray-800 border-gray-700 text-gray-200 text-xs text-center"
                    min={0}
                    max={100}
                    step={1}
                    autoFocus
                />
                <span className="text-xs text-gray-400">%</span>
                <button onClick={handleSave} className="text-green-400 hover:text-green-300">
                    <Check className="h-3 w-3" />
                </button>
                <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-300">
                    <X className="h-3 w-3" />
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Actual: {actualPct.toFixed(1)}%</span>
            <span className="text-gray-600">|</span>
            {targetPct != null ? (
                <>
                    <span className="text-xs text-gray-400">Target: {targetPct.toFixed(1)}%</span>
                    <button
                        onClick={() => { setValue(targetPct.toString()); setEditing(true); }}
                        className="text-gray-500 hover:text-gray-300"
                    >
                        <Pencil className="h-3 w-3" />
                    </button>
                    <span className="text-gray-600">|</span>
                    <span className={`text-xs font-medium ${drift > 0 ? "text-red-400" : drift < 0 ? "text-green-400" : "text-gray-400"}`}>
                        Drift: {drift > 0 ? "+" : ""}{drift.toFixed(1)}%
                    </span>
                    {hasDrift && (
                        <Badge
                            className={`text-[9px] ${
                                Math.abs(drift) > 5
                                    ? "bg-red-500/20 text-red-400 border-red-500/30"
                                    : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                            }`}
                        >
                            {Math.abs(drift) > 5 ? "High" : "Drift"}
                        </Badge>
                    )}
                </>
            ) : (
                <button
                    onClick={() => { setValue(actualPct.toFixed(0)); setEditing(true); }}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                    Set target
                </button>
            )}
        </div>
    );
}

interface SectorTargetAutoFillProps {
    sectors: { sector: string; actualPct: number }[];
    onAutoFill: (targets: SectorTarget[]) => void;
}

export function SectorTargetAutoFill({ sectors, onAutoFill }: SectorTargetAutoFillProps) {
    const handleAutoFill = () => {
        const totalActual = sectors.reduce((sum, s) => sum + s.actualPct, 0);
        if (totalActual === 0) return;

        const targets: SectorTarget[] = sectors.map((s) => ({
            sector: s.sector,
            targetPct: Math.round((s.actualPct / totalActual) * 100 * 10) / 10,
        }));

        // Adjust rounding to hit exactly 100
        const sum = targets.reduce((s, t) => s + t.targetPct, 0);
        if (targets.length > 0 && Math.abs(sum - 100) > 0.01) {
            targets[0].targetPct = Math.round((targets[0].targetPct + (100 - sum)) * 10) / 10;
        }

        onAutoFill(targets);
    };

    return (
        <Button variant="ghost" size="sm" onClick={handleAutoFill} className="h-6 text-xs text-gray-400 hover:text-gray-200">
            <Sparkles className="h-3 w-3 mr-1" />
            Auto-fill targets
        </Button>
    );
}
