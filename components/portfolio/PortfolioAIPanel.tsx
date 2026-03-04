"use client";

import { useState, useMemo, useCallback } from "react";
import {
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LabelList,
} from "recharts";
import {
    Sparkles, Loader2, RefreshCw, ChevronDown, ChevronRight,
    Shield, AlertTriangle, Target, Activity,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { analyzePortfolio, type AnalysisResult } from "@/lib/actions/gemini.actions";

/* ── Markdown Renderer (fallback) ──────────────────────────────────── */

function AnalysisMarkdown({ content }: { content: string }) {
    return (
        <div className="prose prose-invert prose-sm max-w-none
            prose-headings:text-gray-100 prose-headings:font-semibold
            prose-h2:mt-6 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-teal-500/20
            prose-h3:mt-4 prose-h3:mb-2 prose-h3:text-teal-300
            prose-h4:mt-3 prose-h4:mb-1
            prose-p:text-gray-300 prose-p:leading-relaxed
            prose-strong:text-white
            prose-li:text-gray-300 prose-li:marker:text-teal-400
            prose-table:text-xs
            prose-thead:bg-white/5
            prose-th:text-gray-400 prose-th:font-medium prose-th:px-3 prose-th:py-2 prose-th:border-white/10
            prose-td:text-gray-300 prose-td:px-3 prose-td:py-1.5 prose-td:border-white/10
            prose-tr:border-white/5
            prose-blockquote:border-teal-500/40 prose-blockquote:text-gray-400 prose-blockquote:not-italic
            prose-code:text-teal-400 prose-code:bg-white/5 prose-code:px-1.5 prose-code:rounded prose-code:text-xs
            prose-a:text-teal-400 prose-a:no-underline hover:prose-a:underline
        ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
    );
}

/* ── Collapsible Section ───────────────────────────────────────────── */

function Section({
    title,
    icon,
    borderColor,
    defaultOpen = true,
    children,
}: {
    title: string;
    icon: React.ReactNode;
    borderColor: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <Card className={`border-l-2 ${borderColor}`}>
            <CardHeader
                className="pb-2 cursor-pointer select-none"
                onClick={() => setOpen(o => !o)}
            >
                <CardTitle className="text-base font-semibold text-gray-100 flex items-center gap-2">
                    {icon}
                    {title}
                    <span className="ml-auto text-gray-500">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                </CardTitle>
            </CardHeader>
            {open && <CardContent className="pt-0">{children}</CardContent>}
        </Card>
    );
}

/* ── Badge Helpers ─────────────────────────────────────────────────── */

const SIGNAL_COLORS: Record<string, string> = {
    GREEN: 'bg-green-500/20 text-green-400 border-green-500/30',
    YELLOW: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    RED: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function SignalBadge({ signal }: { signal: string }) {
    const cls = SIGNAL_COLORS[signal] || 'bg-white/10 text-gray-400';
    return <Badge className={`${cls} text-xs font-bold tracking-wider border`}>{signal}</Badge>;
}

/* ── Structured Card Renderer (CRO Mandate) ───────────────────────── */

function StructuredReview({ sections }: { sections: PortfolioReviewJSON }) {
    const { structuralAudit, liquidationList, deepDive, executionOrders } = sections;

    return (
        <div className="space-y-4">
            {/* I. Structural Audit */}
            <Section
                title="I. Portfolio Structural Audit"
                icon={<Shield className="h-4 w-4 text-amber-400" />}
                borderColor="border-l-amber-500"
            >
                {/* Signal + Slot Count */}
                <div className="flex items-center gap-3 mb-4">
                    <SignalBadge signal={structuralAudit.signal} />
                    <span className="text-sm text-gray-300">
                        <span className="font-mono font-bold text-white">{structuralAudit.totalSlots}</span> tickers
                        {structuralAudit.surplusCount > 0 && (
                            <span className="text-red-400 font-semibold"> — {structuralAudit.surplusCount} over limit</span>
                        )}
                    </span>
                </div>

                <p className="text-sm text-gray-300 leading-relaxed mb-4">{structuralAudit.assessment}</p>

                {/* Core Slots */}
                <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-teal-500/20 text-teal-400 text-[10px] font-bold tracking-wider">CORE</Badge>
                        <span className="text-xs text-gray-500">3 slots / 70% capital</span>
                    </div>
                    <div className="space-y-2">
                        {structuralAudit.coreSlots.map(s => (
                            <div key={s.symbol} className="bg-teal-500/5 border border-teal-500/10 rounded-lg px-3 py-2.5">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-mono font-bold text-white">{s.symbol}</span>
                                    <Badge className="bg-white/10 text-gray-300 text-xs">{s.weight.toFixed(1)}%</Badge>
                                </div>
                                <p className="text-xs text-teal-300/80 font-mono">{s.notionalExposure}</p>
                                <p className="text-xs text-gray-400 mt-1">{s.note}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Satellite Slots */}
                <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-blue-500/20 text-blue-400 text-[10px] font-bold tracking-wider">SATELLITE</Badge>
                        <span className="text-xs text-gray-500">9 slots / 30% capital</span>
                    </div>
                    <div className="space-y-1.5">
                        {structuralAudit.satelliteSlots.map(s => (
                            <div key={s.symbol} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-mono font-medium text-gray-100">{s.symbol}</span>
                                    <span className="text-xs text-gray-500">{s.weight.toFixed(1)}%</span>
                                </div>
                                <span className="text-xs text-gray-400 max-w-[300px] truncate">{s.note}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Beta Sensitivity Table */}
                {structuralAudit.betaSensitivity.length > 0 && (
                    <div className="mb-3">
                        <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Beta Sensitivity</span>
                        <table className="w-full text-sm mt-2">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Scenario</th>
                                    <th className="text-right py-2 px-3 text-gray-400 font-medium">Drawdown</th>
                                    <th className="text-left py-2 px-3 text-gray-400 font-medium hidden sm:table-cell">Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                {structuralAudit.betaSensitivity.map((s, i) => (
                                    <tr key={i} className="border-b border-white/5">
                                        <td className="py-2 px-3 text-gray-200">{s.scenario}</td>
                                        <td className="py-2 px-3 text-right font-mono text-red-400">
                                            -${Math.abs(s.impact).toLocaleString()}
                                        </td>
                                        <td className="py-2 px-3 text-gray-400 hidden sm:table-cell">{s.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Single Point of Failure */}
                <div className="bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">
                    <span className="text-[10px] text-red-400 uppercase tracking-wider font-bold">Single Point of Failure</span>
                    <p className="text-sm text-gray-200 mt-1">{structuralAudit.singlePointOfFailure}</p>
                </div>
            </Section>

            {/* II. Mandatory Liquidation List */}
            <Section
                title="II. Mandatory Liquidation List"
                icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
                borderColor="border-l-red-500"
            >
                <p className="text-sm text-gray-300 leading-relaxed mb-4">{liquidationList.analysis}</p>

                {/* Zombie Positions */}
                {liquidationList.zombiePositions.length > 0 && (
                    <div className="mb-4">
                        <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Zombie Positions</span>
                        <div className="space-y-1.5 mt-2">
                            {liquidationList.zombiePositions.map(z => (
                                <div key={z.symbol} className="flex items-center gap-3 bg-red-500/5 rounded-lg px-3 py-2">
                                    <span className="text-sm font-mono font-bold text-red-300">{z.symbol}</span>
                                    <Badge className="bg-white/10 text-gray-400 text-xs">{z.weight.toFixed(1)}%</Badge>
                                    <Badge className={`text-xs ${z.pnlPct < 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                        {z.pnlPct >= 0 ? '+' : ''}{z.pnlPct.toFixed(1)}%
                                    </Badge>
                                    <span className="text-xs text-gray-400 flex-1 truncate">{z.reason}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Redundancies */}
                {liquidationList.redundancies.length > 0 && (
                    <div className="mb-4">
                        <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Redundancy Cleanup</span>
                        <div className="space-y-2 mt-2">
                            {liquidationList.redundancies.map((r, i) => (
                                <div key={i} className="bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge className="bg-green-500/20 text-green-400 text-[10px]">KEEP</Badge>
                                        <span className="text-sm font-mono font-medium text-white">{r.keep}</span>
                                        <span className="text-gray-600 mx-1">/</span>
                                        <Badge className="bg-red-500/20 text-red-400 text-[10px]">KILL</Badge>
                                        <span className="text-sm font-mono text-red-300">{r.kill.join(', ')}</span>
                                    </div>
                                    <p className="text-xs text-gray-400">{r.reason}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Invalid Theses */}
                {liquidationList.invalidTheses.length > 0 && (
                    <div>
                        <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Invalid Theses</span>
                        <div className="space-y-1.5 mt-2">
                            {liquidationList.invalidTheses.map(t => (
                                <div key={t.symbol} className="flex items-center gap-3 bg-red-500/5 rounded-lg px-3 py-2">
                                    <span className="text-sm font-mono font-bold text-red-300">{t.symbol}</span>
                                    <Badge className="bg-red-500/20 text-red-400 text-xs">{t.lossPct.toFixed(1)}%</Badge>
                                    <span className="text-xs text-gray-400 flex-1 truncate">{t.reason}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Section>

            {/* III. Deep Dive */}
            <Section
                title="III. High-Conviction Deep Dive"
                icon={<Activity className="h-4 w-4 text-teal-400" />}
                borderColor="border-l-teal-500"
            >
                {/* Core Analysis */}
                {deepDive.coreAnalysis.map(c => (
                    <div key={c.symbol} className="mb-4 bg-teal-500/5 border border-teal-500/10 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-teal-500/20 text-teal-400 text-[10px] font-bold">CORE</Badge>
                            <span className="text-base font-mono font-bold text-white">{c.symbol}</span>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed mb-3">{c.analysis}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                            <div className="bg-black/20 rounded-lg px-3 py-2">
                                <span className="text-gray-500 uppercase tracking-wider text-[10px] font-medium">Delta Exposure</span>
                                <p className="text-gray-200 mt-0.5">{c.deltaExposure}</p>
                            </div>
                            <div className="bg-black/20 rounded-lg px-3 py-2">
                                <span className="text-gray-500 uppercase tracking-wider text-[10px] font-medium">Key Levels</span>
                                <p className="text-gray-200 mt-0.5">{c.keyLevels}</p>
                            </div>
                            <div className="bg-black/20 rounded-lg px-3 py-2">
                                <span className="text-gray-500 uppercase tracking-wider text-[10px] font-medium">Theta Risk</span>
                                <p className="text-gray-200 mt-0.5">{c.thetaRisk}</p>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Satellite Analysis */}
                {deepDive.satelliteAnalysis.map(s => (
                    <div key={s.symbol} className="mb-4 bg-blue-500/5 border border-blue-500/10 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-blue-500/20 text-blue-400 text-[10px] font-bold">SATELLITE</Badge>
                            <span className="text-base font-mono font-bold text-white">{s.symbol}</span>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed mb-3">{s.analysis}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div className="bg-black/20 rounded-lg px-3 py-2">
                                <span className="text-gray-500 uppercase tracking-wider text-[10px] font-medium">Profit Tranches</span>
                                <p className="text-gray-200 mt-0.5">{s.profitTranches}</p>
                            </div>
                            <div className="bg-black/20 rounded-lg px-3 py-2">
                                <span className="text-gray-500 uppercase tracking-wider text-[10px] font-medium">Re-entry Level</span>
                                <p className="text-gray-200 mt-0.5">{s.reentryLevel}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </Section>

            {/* IV. Execution Orders */}
            <Section
                title="IV. Execution Orders"
                icon={<Target className="h-4 w-4 text-red-400" />}
                borderColor="border-l-red-600"
            >
                <div className="space-y-3 mb-4">
                    {executionOrders.sellOrders.map(o => (
                        <div key={o.priority} className="flex gap-3 items-start">
                            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-red-500/20 text-red-400 text-sm font-bold flex items-center justify-center">
                                {o.priority}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                    <span className="text-sm font-mono font-bold text-white">{o.symbol}</span>
                                    <span className="text-sm text-red-300 font-medium">{o.action}</span>
                                </div>
                                <p className="text-sm text-gray-400">{o.reason}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Circuit Breaker */}
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                        <Shield className="h-4 w-4 text-red-400" />
                        <span className="text-xs text-red-400 uppercase tracking-wider font-bold">Equity Circuit Breaker</span>
                    </div>
                    <p className="text-sm text-gray-200">
                        Trigger: <span className="font-mono font-bold text-red-300">${executionOrders.circuitBreaker.triggerValue.toLocaleString()}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{executionOrders.circuitBreaker.description}</p>
                </div>
            </Section>
        </div>
    );
}

/* ── Constants ────────────────────────────────────────────────────────── */

const PIE_COLORS = ['#2dd4bf', '#fb923c', '#c084fc', '#60a5fa', '#4ade80', '#f87171', '#facc15', '#f472b6', '#22d3ee', '#a3e635'];

const TOOLTIP_CONTENT_STYLE = {
    backgroundColor: '#262626',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    fontSize: '13px',
};
const TOOLTIP_LABEL_STYLE = { color: '#fafafa', fontWeight: 500 };
const TOOLTIP_ITEM_STYLE = { color: '#e5e5e5' };

/* ── Portfolio Charts ────────────────────────────────────────────────── */

function PortfolioCharts({ positions }: { positions: PositionWithPriceData[] }) {
    const pieData = useMemo(() => {
        const total = positions.reduce((s, p) => s + p.marketValue, 0);
        return positions
            .filter(p => p.marketValue > 0)
            .sort((a, b) => b.marketValue - a.marketValue)
            .map(p => ({
                name: p.symbol,
                value: p.marketValue,
                pct: total > 0 ? (p.marketValue / total * 100) : 0,
            }));
    }, [positions]);

    const barData = useMemo(() => {
        return positions
            .filter(p => p.marketValue > 0)
            .map(p => ({
                symbol: p.symbol,
                pl: +(p.totalReturnPercent.toFixed(1)),
                fill: p.totalReturnPercent >= 0 ? '#22c55e' : '#ef4444',
            }))
            .sort((a, b) => Math.abs(b.pl) - Math.abs(a.pl));
    }, [positions]);

    if (positions.length === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pie Chart */}
            <Card className="bg-white/[0.06]">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold text-white">Portfolio Allocation</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="45%"
                                innerRadius={55}
                                outerRadius={95}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="name"
                                stroke="rgba(0,0,0,0.3)"
                                strokeWidth={1}
                            >
                                {pieData.map((_, idx) => (
                                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (!active || !payload?.[0]) return null;
                                    const d = payload[0].payload as { name: string; value: number; pct: number };
                                    return (
                                        <div className="rounded-lg border border-white/20 bg-neutral-800 px-3 py-2 text-sm shadow-lg">
                                            <p className="font-semibold text-white">{d.name}</p>
                                            <p className="text-gray-200">${d.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                            <p className="text-gray-400">{d.pct.toFixed(1)}% of portfolio</p>
                                        </div>
                                    );
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-x-5 gap-y-2 mt-2 justify-center">
                        {pieData.map((d, idx) => (
                            <div key={d.name} className="flex items-center gap-1.5 text-sm">
                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                                <span className="text-white font-medium">{d.name}</span>
                                <span className="text-gray-300">{d.pct.toFixed(1)}%</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Bar Chart */}
            <Card className="bg-white/[0.06]">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold text-white">Return by Holding (%)</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={Math.max(280, barData.length * 28 + 40)}>
                        <BarChart data={barData} layout="vertical" margin={{ left: 50, right: 50, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={false} />
                            <XAxis type="number" stroke="#a3a3a3" tick={{ fill: '#e5e5e5' }} fontSize={12} tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`} />
                            <YAxis type="category" dataKey="symbol" stroke="#a3a3a3" tick={{ fill: '#fafafa', fontWeight: 500 }} fontSize={13} width={50} interval={0} />
                            <Tooltip
                                contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE}
                                formatter={(value: any) => [`${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(1)}%`, 'Return']}
                            />
                            <Bar dataKey="pl" radius={[0, 4, 4, 0]} barSize={14}>
                                {barData.map((entry, idx) => (
                                    <Cell key={idx} fill={entry.fill} />
                                ))}
                                <LabelList
                                    dataKey="pl"
                                    position="right"
                                    formatter={(v: any) => `${Number(v) >= 0 ? '+' : ''}${v}%`}
                                    style={{ fontSize: 12, fill: '#fafafa', fontWeight: 500 }}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}

/* ── Main Panel ──────────────────────────────────────────────────────── */

export default function PortfolioAIPanel({
    userId,
    positions,
}: {
    userId: string;
    positions: PositionWithPriceData[];
}) {
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [loading, setLoading] = useState(false);

    const runReview = useCallback(async () => {
        setLoading(true);
        setResult(null);
        try {
            const res = await analyzePortfolio(userId);
            setResult(res);
        } catch (e: any) {
            setResult({ content: '', model: '', timestamp: Date.now(), error: e?.message || 'Analysis failed' });
        } finally {
            setLoading(false);
        }
    }, [userId]);

    return (
        <div className="space-y-6">
            {/* Charts — always visible */}
            <PortfolioCharts positions={positions} />

            {/* AI Review Button */}
            <div className="flex justify-center">
                <button
                    onClick={runReview}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl
                        bg-gradient-to-r from-teal-500/20 via-teal-500/10 to-purple-500/20
                        text-white border border-teal-500/20
                        hover:border-teal-500/40 hover:from-teal-500/30 hover:to-purple-500/30
                        transition-all disabled:opacity-50 shadow-lg shadow-teal-500/5"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-teal-400" />}
                    AI Portfolio Review
                </button>
            </div>

            {/* Loading skeleton */}
            {loading && (
                <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                        <Card key={i}>
                            <CardContent className="py-6">
                                <div className="space-y-2 animate-pulse">
                                    <div className="h-3 bg-white/5 rounded w-1/3" />
                                    <div className="h-3 bg-white/5 rounded w-full" />
                                    <div className="h-3 bg-white/5 rounded w-4/5" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin text-teal-400" />
                        Analyzing portfolio with Gemini...
                    </div>
                </div>
            )}

            {/* Error */}
            {result && !loading && result.error && (
                <Card className="border-red-500/20 bg-red-500/5">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-red-400">{result.error}</p>
                            <button
                                onClick={runReview}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                                    bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                            >
                                <RefreshCw className="h-3 w-3" /> Retry
                            </button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Structured Result */}
            {result && !loading && !result.error && (
                <>
                    <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-teal-500/15 text-teal-400 border-teal-500/20">
                            <Sparkles className="h-3 w-3 mr-1" />
                            Portfolio Review
                        </Badge>
                        <button
                            onClick={runReview}
                            className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500
                                hover:text-gray-300 rounded border border-white/5 hover:border-white/10 transition-colors"
                        >
                            <RefreshCw className="h-3 w-3" /> Re-run
                        </button>
                    </div>

                    {result.sections ? (
                        <StructuredReview sections={result.sections} />
                    ) : (
                        <Card>
                            <CardContent className="pt-6">
                                <div className="max-h-[600px] overflow-y-auto scrollbar-thin pr-1">
                                    <AnalysisMarkdown content={result.content} />
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-gray-600 px-1">
                        <span>Model: {result.model}</span>
                        <span>{new Date(result.timestamp).toLocaleTimeString()}</span>
                    </div>
                </>
            )}
        </div>
    );
}
