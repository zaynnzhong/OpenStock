import { auth } from "@/lib/better-auth/auth";
import { headers } from "next/headers";
import { getUserWatchlist } from "@/lib/actions/watchlist.actions";
import { getWatchlistData, getHistoricalPrices } from "@/lib/actions/finnhub.actions";
import WatchlistTracker from "./WatchlistTracker";

export default async function WatchlistTrackerWrapper() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user) {
        return <WatchlistTracker stocks={[]} symbols={[]} />;
    }

    const userId = session.user.id;
    const allItems = await getUserWatchlist(userId);
    // Only watchlist-only items (shares === 0)
    const watchOnlyItems = allItems.filter((item: any) => !item.shares || item.shares === 0);

    if (watchOnlyItems.length === 0) {
        return <WatchlistTracker stocks={[]} symbols={[]} />;
    }

    const symbols = watchOnlyItems.map((item: any) => item.symbol);

    // Fetch current prices and historical data in parallel
    let stockData: any[] = [];
    try {
        stockData = await getWatchlistData(symbols);
    } catch {
        // fallback — client will poll
    }

    const historicalResults = await Promise.all(
        watchOnlyItems.map(async (item: any) => {
            const since = item.watchSince || item.addedAt;
            const fromDate = new Date(since).toISOString().split("T")[0];
            const data = await getHistoricalPrices(item.symbol, fromDate);
            return { symbol: item.symbol, data };
        })
    );

    const historicalMap = new Map(historicalResults.map((r) => [r.symbol, r.data]));

    const stocks = watchOnlyItems.map((item: any) => {
        const priceData = stockData.find((s: any) => s.symbol === item.symbol);
        const historical = historicalMap.get(item.symbol);
        const since = item.watchSince || item.addedAt;

        return {
            symbol: item.symbol,
            company: item.company || priceData?.name || item.symbol,
            price: priceData?.price || 0,
            change: priceData?.change || 0,
            changePercent: priceData?.changePercent || 0,
            watchSince: new Date(since).toISOString(),
            startPrice: historical?.prices?.[0] || 0,
            sparkline: {
                dates: historical?.dates || [],
                prices: historical?.prices || [],
            },
        };
    });

    return <WatchlistTracker stocks={stocks} symbols={symbols} />;
}
