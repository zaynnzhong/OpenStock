"use client";

import { useMemo } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PIE_COLORS = ['#2dd4bf', '#fb923c', '#c084fc', '#60a5fa', '#4ade80', '#f87171', '#facc15', '#f472b6', '#22d3ee', '#a3e635'];
const CASH_COLOR = '#6b7280';
const TARGET_RING_COLORS = ['#2dd4bf80', '#fb923c80', '#c084fc80', '#60a5fa80', '#4ade8080', '#f8717180', '#facc1580', '#f472b680', '#22d3ee80', '#a3e63580'];

const TOOLTIP_CONTENT_STYLE = {
    backgroundColor: '#262626',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    fontSize: '13px',
};
const TOOLTIP_LABEL_STYLE = { color: '#fafafa', fontWeight: 500 };
const TOOLTIP_ITEM_STYLE = { color: '#e5e5e5' };

interface PortfolioChartsProps {
    positions: PositionWithPriceData[];
    cashBalance: number;
    showTargetRing?: boolean;
    enrichedSlots?: EnrichedPlanSlot[];
}

export default function PortfolioCharts({ positions, cashBalance, showTargetRing, enrichedSlots }: PortfolioChartsProps) {
    const pieData = useMemo(() => {
        const holdingsValue = positions.reduce((s, p) => s + p.marketValue, 0);
        const total = holdingsValue + cashBalance;
        const items = positions
            .filter(p => p.marketValue > 0)
            .sort((a, b) => b.marketValue - a.marketValue)
            .map(p => ({
                name: p.symbol,
                value: p.marketValue,
                pct: total > 0 ? (p.marketValue / total * 100) : 0,
                isCash: false,
            }));
        if (cashBalance > 0) {
            items.push({
                name: 'Cash',
                value: cashBalance,
                pct: total > 0 ? (cashBalance / total * 100) : 0,
                isCash: true,
            });
        }
        return items;
    }, [positions, cashBalance]);

    const targetRingData = useMemo(() => {
        if (!showTargetRing || !enrichedSlots) return [];
        const slotsWithTarget = enrichedSlots.filter(s => s.targetPct != null && s.targetPct > 0);
        if (slotsWithTarget.length === 0) return [];

        const items = slotsWithTarget
            .sort((a, b) => (b.targetPct ?? 0) - (a.targetPct ?? 0))
            .map(s => ({
                name: `${s.symbol} target`,
                value: s.targetPct ?? 0,
                pct: s.targetPct ?? 0,
                symbol: s.symbol,
            }));

        const assignedPct = items.reduce((sum, i) => sum + i.pct, 0);
        if (assignedPct < 100) {
            items.push({
                name: 'Unassigned',
                value: 100 - assignedPct,
                pct: 100 - assignedPct,
                symbol: '',
            });
        }
        return items;
    }, [showTargetRing, enrichedSlots]);

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
                    <CardTitle className="text-base font-semibold text-white">
                        Portfolio Allocation
                        {showTargetRing && targetRingData.length > 0 && (
                            <span className="text-xs text-gray-400 font-normal ml-2">outer ring = targets</span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="45%"
                                innerRadius={showTargetRing && targetRingData.length > 0 ? 45 : 55}
                                outerRadius={showTargetRing && targetRingData.length > 0 ? 80 : 95}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="name"
                                stroke="rgba(0,0,0,0.3)"
                                strokeWidth={1}
                            >
                                {pieData.map((entry, idx) => (
                                    <Cell key={idx} fill={entry.isCash ? CASH_COLOR : PIE_COLORS[idx % PIE_COLORS.length]} />
                                ))}
                            </Pie>
                            {showTargetRing && targetRingData.length > 0 && (
                                <Pie
                                    data={targetRingData}
                                    cx="50%"
                                    cy="45%"
                                    innerRadius={84}
                                    outerRadius={98}
                                    paddingAngle={1}
                                    dataKey="value"
                                    nameKey="name"
                                    stroke="rgba(0,0,0,0.2)"
                                    strokeWidth={1}
                                >
                                    {targetRingData.map((entry, idx) => (
                                        <Cell
                                            key={idx}
                                            fill={entry.symbol ? TARGET_RING_COLORS[idx % TARGET_RING_COLORS.length] : '#333333'}
                                        />
                                    ))}
                                </Pie>
                            )}
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (!active || !payload?.[0]) return null;
                                    const d = payload[0].payload as { name: string; value: number; pct: number };
                                    return (
                                        <div className="rounded-lg border border-white/20 bg-neutral-800 px-3 py-2 text-sm shadow-lg">
                                            <p className="font-semibold text-white">{d.name}</p>
                                            <p className="text-gray-200">${d.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                            <p className="text-gray-400">{d.pct.toFixed(1)}%</p>
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
                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.isCash ? CASH_COLOR : PIE_COLORS[idx % PIE_COLORS.length] }} />
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
