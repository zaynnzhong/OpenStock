"use client";

import { useState, useEffect } from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { getRollingPL } from "@/lib/actions/portfolio.actions";

interface PLChartProps {
    userId: string;
    initialData?: PLChartData[];
}

type Range = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

const RANGES: Range[] = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'];

export default function PLChart({ userId, initialData = [] }: PLChartProps) {
    const [range, setRange] = useState<Range>('3M');
    const [data, setData] = useState<PLChartData[]>(initialData);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getRollingPL(userId, range).then(result => {
            if (!cancelled) {
                setData(result);
                setLoading(false);
            }
        }).catch(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [userId, range]);

    const isPositive = data.length > 0 && data[data.length - 1].totalPL >= 0;
    const lineColor = isPositive ? "#22c55e" : "#ef4444";
    const fillColor = isPositive ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)";

    const formatValue = (value: number) => {
        if (Math.abs(value) >= 1000) {
            return `$${(value / 1000).toFixed(1)}k`;
        }
        return `$${value.toFixed(0)}`;
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-md p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Rolling P/L</h3>
                <div className="flex gap-1">
                    {RANGES.map(r => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                range === r
                                    ? 'bg-white/15 text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="h-[300px] flex items-center justify-center text-gray-500">
                    Loading chart data...
                </div>
            ) : data.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-gray-500">
                    <div className="text-center">
                        <p className="text-sm">No snapshot data available.</p>
                        <p className="text-xs mt-1 text-gray-600">Recalculate snapshots in Settings to generate chart data.</p>
                    </div>
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="plGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                            dataKey="date"
                            tickFormatter={formatDate}
                            stroke="#6b7280"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            tickFormatter={formatValue}
                            stroke="#6b7280"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            width={60}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1f1f1f',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                                fontSize: '12px',
                            }}
                            labelFormatter={(label: any) => formatDate(String(label))}
                            formatter={(value: any, name: any) => {
                                const labels: Record<string, string> = {
                                    totalPL: 'Total P/L',
                                    totalValue: 'Portfolio Value',
                                    realizedPL: 'Realized P/L',
                                    unrealizedPL: 'Unrealized P/L',
                                };
                                return [`$${Number(value).toFixed(2)}`, labels[String(name)] || String(name)];
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="totalPL"
                            stroke={lineColor}
                            fill="url(#plGradient)"
                            strokeWidth={2}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
