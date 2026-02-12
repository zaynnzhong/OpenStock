"use client";

import { TrendingUp, TrendingDown, DollarSign, BarChart3, Percent, Coins } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface PortfolioSummaryCardsProps {
    summary: PortfolioSummaryData;
}

function StatCard({
    label,
    value,
    subValue,
    icon: Icon,
    positive,
}: {
    label: string;
    value: string;
    subValue?: string;
    icon: React.ElementType;
    positive?: boolean | null;
}) {
    const colorClass = positive === true
        ? "text-green-400"
        : positive === false
            ? "text-red-400"
            : "text-white";

    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</span>
                    <Icon className="w-4 h-4 text-gray-500" />
                </div>
                <div className={`text-xl font-bold ${colorClass}`}>{value}</div>
                {subValue && (
                    <div className={`text-xs mt-1 ${colorClass} opacity-75`}>{subValue}</div>
                )}
            </CardContent>
        </Card>
    );
}

export default function PortfolioSummaryCards({ summary }: PortfolioSummaryCardsProps) {
    const totalPL = summary.totalRealizedPL + summary.totalUnrealizedPL;
    const totalPLPercent = summary.totalCostBasis > 0
        ? (totalPL / summary.totalCostBasis) * 100
        : 0;

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
                label="Total Value"
                value={formatCurrency(summary.totalValue)}
                icon={DollarSign}
            />
            <StatCard
                label="Total P/L"
                value={`${totalPL >= 0 ? '+' : ''}${formatCurrency(totalPL)}`}
                subValue={`${totalPLPercent >= 0 ? '+' : ''}${totalPLPercent.toFixed(2)}%`}
                icon={totalPL >= 0 ? TrendingUp : TrendingDown}
                positive={totalPL >= 0}
            />
            <StatCard
                label="Today"
                value={`${summary.todayReturn >= 0 ? '+' : ''}${formatCurrency(summary.todayReturn)}`}
                subValue={`${summary.todayReturnPercent >= 0 ? '+' : ''}${summary.todayReturnPercent.toFixed(2)}%`}
                icon={summary.todayReturn >= 0 ? TrendingUp : TrendingDown}
                positive={summary.todayReturn >= 0}
            />
            <StatCard
                label="Realized P/L"
                value={`${summary.totalRealizedPL >= 0 ? '+' : ''}${formatCurrency(summary.totalRealizedPL)}`}
                icon={BarChart3}
                positive={summary.totalRealizedPL >= 0}
            />
            <StatCard
                label="Unrealized P/L"
                value={`${summary.totalUnrealizedPL >= 0 ? '+' : ''}${formatCurrency(summary.totalUnrealizedPL)}`}
                icon={Percent}
                positive={summary.totalUnrealizedPL >= 0}
            />
            <StatCard
                label="Options Premium"
                value={`${summary.totalOptionsPremium >= 0 ? '+' : ''}${formatCurrency(summary.totalOptionsPremium)}`}
                icon={Coins}
                positive={summary.totalOptionsPremium > 0 ? true : summary.totalOptionsPremium < 0 ? false : null}
            />
        </div>
    );
}
