import { auth } from "@/lib/better-auth/auth";
import { headers } from "next/headers";
import { getUserWatchlist } from "@/lib/actions/watchlist.actions";
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
    const watchlistItems = await getUserWatchlist(userId);
    const symbols = watchlistItems.map((item: any) => item.symbol);

    if (symbols.length === 0) {
        return <PortfolioHeatmap initialData={[]} symbols={[]} />;
    }

    let stockData: any[] = [];
    try {
        stockData = await getWatchlistData(symbols);
    } catch {
        // Rate limit or network error — use watchlist data with zero prices
        // The client component will poll and fill in real data
    }

    // If API failed, create stub data so the heatmap still renders
    if (!stockData || stockData.length === 0) {
        stockData = symbols.map((sym: string) => {
            const item = watchlistItems.find((w: any) => w.symbol === sym);
            return {
                symbol: sym,
                name: item?.company || sym,
                price: 0,
                change: 0,
                changePercent: 0,
                marketCap: 0,
            };
        });
    }

    const initialData: HeatmapStockData[] = stockData.map((stock: any) => {
        const watchlistItem = watchlistItems.find(
            (item: any) => item.symbol === stock.symbol
        );
        const shares = watchlistItem?.shares || 0;
        const avgCost = watchlistItem?.avgCost || 0;

        return {
            symbol: stock.symbol,
            name: stock.name,
            price: stock.price,
            change: stock.change,
            changePercent: stock.changePercent,
            marketCap: stock.marketCap || 0,
            shares,
            avgCost,
            weight: 0,
        };
    });

    // Compute weights: use market value (shares * price) if any holdings exist,
    // otherwise fall back to market cap, or equal weight
    const hasAnyHoldings = initialData.some((s) => s.shares > 0);

    if (hasAnyHoldings) {
        const totalValue = initialData.reduce(
            (sum, s) => sum + (s.shares > 0 ? s.shares * s.price : 0),
            0
        );
        for (const stock of initialData) {
            stock.weight =
                totalValue > 0 && stock.shares > 0
                    ? ((stock.shares * stock.price) / totalValue) * 100
                    : 0;
        }
    } else {
        // No holdings at all — use market cap for sizing, or equal weight as last resort
        const totalMcap = initialData.reduce((sum, s) => sum + (s.marketCap || 0), 0);
        if (totalMcap > 0) {
            for (const stock of initialData) {
                stock.weight = ((stock.marketCap || 1) / totalMcap) * 100;
            }
        } else {
            const equalWeight = 100 / initialData.length;
            for (const stock of initialData) {
                stock.weight = equalWeight;
            }
        }
    }

    return <PortfolioHeatmap initialData={initialData} symbols={symbols} userId={userId} />;
}
