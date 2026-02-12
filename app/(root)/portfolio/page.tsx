import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPortfolioSummary } from '@/lib/actions/portfolio.actions';
import { getUserTrades } from '@/lib/actions/trade.actions';
import { getPortfolioSettings } from '@/lib/actions/portfolio-settings.actions';
import { getUserWatchlist } from '@/lib/actions/watchlist.actions';
import PortfolioDashboard from '@/components/portfolio/PortfolioDashboard';

export default async function PortfolioPage() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session) {
        redirect('/sign-in');
    }

    const userId = session.user.id;

    // Parallel data fetching
    const [summary, tradesResult, settings, watchlistItems] = await Promise.all([
        getPortfolioSummary(userId),
        getUserTrades(userId, { limit: 50, offset: 0, sort: 'desc' }),
        getPortfolioSettings(userId),
        getUserWatchlist(userId),
    ]);

    const watchlistSymbols = watchlistItems.map((item: any) => item.symbol);

    return (
        <div className="min-h-screen bg-black text-gray-100 p-6 md:p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
                        Portfolio
                    </h1>
                    <p className="text-gray-500 mt-1">Track your trades, P/L, and cost basis.</p>
                </div>
            </div>

            <PortfolioDashboard
                userId={userId}
                summary={summary}
                trades={tradesResult.trades}
                tradeCount={tradesResult.total}
                settings={{
                    defaultMethod: settings?.defaultMethod || 'AVERAGE',
                    symbolOverrides: settings?.symbolOverrides || [],
                }}
                watchlistSymbols={watchlistSymbols}
            />
        </div>
    );
}
