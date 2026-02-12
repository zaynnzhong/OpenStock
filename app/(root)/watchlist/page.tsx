import React, { Suspense } from 'react';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserWatchlist } from '@/lib/actions/watchlist.actions';
import { getUserAlerts, syncAllHoldingAlerts } from '@/lib/actions/alert.actions';
import { getNews, getWatchlistData } from '@/lib/actions/finnhub.actions';
import WatchlistManager from '@/components/watchlist/WatchlistManager';
import AlertsPanel from '@/components/watchlist/AlertsPanel';
import NewsGrid from '@/components/watchlist/NewsGrid';
import SearchCommand from '@/components/SearchCommand';
import { Loader2 } from 'lucide-react';

export default async function WatchlistPage() {
    const session = await auth.api.getSession({
        headers: await headers()
    });

    if (!session) {
        redirect('/sign-in');
    }

    const userId = session.user.id;

    // Parallel data fetching
    const [watchlistItems, alerts, news] = await Promise.all([
        getUserWatchlist(userId),
        getUserAlerts(userId),
        getNews() // Initial news fetch
    ]);

    const watchlistSymbols = watchlistItems.map((item: any) => item.symbol);

    // Fetch stock prices for the table
    let stockData: any[] = [];
    if (watchlistSymbols.length > 0) {
        try {
            stockData = await getWatchlistData(watchlistSymbols);
        } catch {
            // Rate limit — table will show without prices
        }
    }

    // Merge watchlist holdings with market data
    const tableData = watchlistItems.map((item: any) => {
        const market = stockData.find((s: any) => s.symbol === item.symbol);
        return {
            symbol: item.symbol,
            name: market?.name || item.company || item.symbol,
            logo: market?.logo || null,
            price: market?.price || 0,
            change: market?.change || 0,
            changePercent: market?.changePercent || 0,
            marketCap: market?.marketCap || 0,
            shares: item.shares || 0,
            avgCost: item.avgCost || 0,
        };
    });

    // Backfill holding alerts for existing holdings that don't have alerts yet
    const holdingsWithCost = tableData.filter((s: any) => s.avgCost > 0 && s.price > 0);
    let finalAlerts = alerts;
    if (holdingsWithCost.length > 0) {
        await syncAllHoldingAlerts(userId, holdingsWithCost);
        // Re-fetch alerts so the initial render includes newly created ones
        finalAlerts = await getUserAlerts(userId);
    }

    // Fallback news if watchlist has items
    const relevantNews = watchlistSymbols.length > 0 ? await getNews(watchlistSymbols) : news;

    return (
        <div className="min-h-screen bg-black text-gray-100 p-6 md:p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
                        Watchlist
                    </h1>
                    <p className="text-gray-500 mt-1">Track your favorite stocks and manage alerts.</p>
                </div>
                <div className="flex items-center space-x-4">
                    <SearchCommand renderAs="button" label="Add Stock" initialStocks={[]} />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Main Content */}
                <div className="lg:col-span-3 space-y-8">
                    <div className="space-y-6">
                        <WatchlistManager initialItems={watchlistItems} userId={userId} tableData={tableData} />
                    </div>

                    {/* News Section */}
                    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-500" /></div>}>
                        <NewsGrid news={relevantNews || []} />
                    </Suspense>
                </div>

                {/* Sidebar - Alerts */}
                <div className="lg:col-span-1">
                    <AlertsPanel alerts={finalAlerts} userId={userId} />
                </div>
            </div>
        </div>
    );
}
