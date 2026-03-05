import { auth } from "@/lib/better-auth/auth";
import { headers } from "next/headers";
import { getPortfolioSummary } from "@/lib/actions/portfolio.actions";
import { getWatchlistData } from "@/lib/actions/finnhub.actions";
import PortfolioHeatmap, { type HeatmapStockData } from "./PortfolioHeatmap";

export default async function PortfolioHeatmapWrapper() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user) {
        return <PortfolioHeatmap initialData={[]} symbols={[]} />;
    }

    const userId = session.user.id;
    const summary = await getPortfolioSummary(userId);

    if (!summary || summary.positions.length === 0) {
        return <PortfolioHeatmap initialData={[]} symbols={[]} />;
    }

    // Include positions with shares or open options (e.g., deep ITM calls as synthetic stock)
    const activePositions = summary.positions.filter(p => p.shares > 0 || (p.openOptions?.length ?? 0) > 0);
    if (activePositions.length === 0) {
        return <PortfolioHeatmap initialData={[]} symbols={[]} />;
    }

    const symbols = activePositions.map(p => p.symbol);

    // Fetch current prices for daily change data
    let stockData: any[] = [];
    try {
        stockData = await getWatchlistData(symbols);
    } catch {
        // Rate limit — client will poll
    }

    const priceMap = new Map(stockData.map((s: any) => [s.symbol, s]));

    const initialData: HeatmapStockData[] = activePositions.map(pos => {
        const price = priceMap.get(pos.symbol);
        const weight = summary.totalValue > 0
            ? (pos.marketValue / summary.totalValue) * 100
            : 100 / activePositions.length;

        return {
            symbol: pos.symbol,
            name: pos.company || price?.name || pos.symbol,
            price: pos.currentPrice,
            change: price?.change || 0,
            changePercent: price?.changePercent || 0,
            marketCap: price?.marketCap || 0,
            shares: pos.shares,
            avgCost: pos.avgCostPerShare,
            weight,
        };
    });

    return <PortfolioHeatmap initialData={initialData} symbols={symbols} />;
}
