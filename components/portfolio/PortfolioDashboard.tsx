"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PortfolioSummaryCards from "./PortfolioSummaryCards";
import PLChart from "./PLChart";
import PositionBreakdown from "./PositionBreakdown";
import TradeHistory from "./TradeHistory";
import AddTradeModal from "./AddTradeModal";
import CSVImportModal from "./CSVImportModal";
import PortfolioSettings from "./PortfolioSettings";

interface PortfolioDashboardProps {
    userId: string;
    summary: PortfolioSummaryData | null;
    trades: TradeData[];
    tradeCount: number;
    settings: {
        defaultMethod: CostBasisMethod;
        symbolOverrides: { symbol: string; method: CostBasisMethod }[];
    };
    watchlistSymbols: string[];
}

export default function PortfolioDashboard({
    userId,
    summary,
    trades,
    tradeCount,
    settings,
    watchlistSymbols,
}: PortfolioDashboardProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState("overview");

    const handleRefresh = useCallback(() => {
        router.refresh();
    }, [router]);

    // Empty state
    if (!summary) {
        return (
            <div className="space-y-6">
                <div className="text-center py-16 bg-gray-900/30 rounded-xl border border-gray-800">
                    <h3 className="text-2xl font-semibold text-gray-300 mb-3">No trades yet</h3>
                    <p className="text-gray-500 mb-8 max-w-md mx-auto">
                        Start tracking your portfolio by adding your first trade or importing from a CSV file.
                    </p>
                    <div className="flex items-center justify-center gap-4">
                        <AddTradeModal userId={userId} onTradeAdded={handleRefresh} watchlistSymbols={watchlistSymbols} />
                        <CSVImportModal userId={userId} onImported={handleRefresh} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <PortfolioSummaryCards summary={summary} />

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="trades">Trades</TabsTrigger>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-3">
                        <AddTradeModal userId={userId} onTradeAdded={handleRefresh} watchlistSymbols={watchlistSymbols} />
                        <CSVImportModal userId={userId} onImported={handleRefresh} />
                    </div>
                </div>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-6">
                    <PLChart userId={userId} />
                    <PositionBreakdown positions={summary.positions} />
                </TabsContent>

                {/* Trades Tab */}
                <TabsContent value="trades">
                    <TradeHistory userId={userId} initialTrades={trades} initialTotal={tradeCount} />
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="settings">
                    <PortfolioSettings
                        userId={userId}
                        settings={settings}
                        positions={summary.positions}
                        onSettingsChanged={handleRefresh}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
