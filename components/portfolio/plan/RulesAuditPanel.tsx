"use client";

import { useState } from "react";
import { Shield, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { runRulesAudit } from "@/lib/actions/position-plan.actions";

interface RulesAuditPanelProps {
    userId: string;
    positions: PositionWithPriceData[];
    trades: TradeData[];
}

const SEVERITY_CONFIG = {
    error: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", label: "Error" },
    warning: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", label: "Warning" },
    info: { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", label: "Info" },
};

function getHealthColor(score: number) {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    if (score >= 40) return "text-orange-400";
    return "text-red-400";
}

export default function RulesAuditPanel({ userId, positions, trades }: RulesAuditPanelProps) {
    const [result, setResult] = useState<RulesAuditResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(true);

    const handleRunAudit = async () => {
        setLoading(true);
        try {
            const auditResult = await runRulesAudit(userId, positions, trades);
            setResult(auditResult);
            setExpanded(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="border border-gray-800 bg-gray-900/50">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                        <Shield className="h-4 w-4 text-purple-400" />
                        Trading Discipline Audit
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        {result && (
                            <>
                                <span className={`text-sm font-bold ${getHealthColor(result.totalScore)}`}>
                                    {result.totalScore}/100
                                </span>
                                <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-gray-300">
                                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>
                            </>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRunAudit}
                            disabled={loading}
                            className="h-7 text-xs text-purple-400 hover:text-purple-300"
                        >
                            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
                            {loading ? "Auditing..." : "Run Audit"}
                        </Button>
                    </div>
                </div>
            </CardHeader>

            {result && expanded && (
                <CardContent className="space-y-2">
                    {result.violations.length === 0 ? (
                        <div className="text-center py-4">
                            <span className="text-green-400 text-sm font-medium">All rules passed! Portfolio is well-disciplined.</span>
                        </div>
                    ) : (
                        result.violations.map((v, i) => {
                            const config = SEVERITY_CONFIG[v.severity];
                            const Icon = config.icon;
                            return (
                                <div key={i} className={`p-3 rounded-lg border ${config.bg}`}>
                                    <div className="flex items-start gap-2">
                                        <Icon className={`h-4 w-4 mt-0.5 ${config.color} shrink-0`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className={`text-xs font-semibold ${config.color}`}>{v.ruleName}</span>
                                                <span className="text-[10px] text-gray-600 font-mono">{v.ruleId}</span>
                                            </div>
                                            <p className="text-xs text-gray-300">{v.message}</p>
                                            {v.affectedSymbols.length > 0 && (
                                                <div className="flex gap-1 mt-1 flex-wrap">
                                                    {v.affectedSymbols.map(sym => (
                                                        <span key={sym} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
                                                            {sym}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            <p className="text-[10px] text-gray-500 mt-1 italic">{v.recommendation}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}

                    <div className="text-[10px] text-gray-600 text-right">
                        Last audit: {new Date(result.timestamp).toLocaleString()}
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
