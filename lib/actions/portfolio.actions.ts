'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Trade } from '@/database/models/trade.model';
import { DailySnapshot } from '@/database/models/daily-snapshot.model';
import { PortfolioSettings } from '@/database/models/portfolio-settings.model';
import { computePosition, type TradeInput } from '@/lib/portfolio/cost-basis';
import { getHistoricalPrices, getWatchlistData } from '@/lib/actions/finnhub.actions';
import { Watchlist } from '@/database/models/watchlist.model';

function serialize<T>(doc: T): T {
    return JSON.parse(JSON.stringify(doc));
}

export async function getPortfolioSummary(userId: string): Promise<PortfolioSummaryData | null> {
    await connectToDatabase();

    const trades = await Trade.find({ userId }).sort({ executedAt: 1 }).lean();
    if (trades.length === 0) return null;

    const settings = await PortfolioSettings.findOne({ userId }).lean();
    const defaultMethod = settings?.defaultMethod || 'AVERAGE';

    // Group trades by symbol
    const bySymbol = new Map<string, typeof trades>();
    for (const trade of trades) {
        const sym = trade.symbol;
        if (!bySymbol.has(sym)) bySymbol.set(sym, []);
        bySymbol.get(sym)!.push(trade);
    }

    // Get all symbols that have positions
    const allSymbols = [...bySymbol.keys()];

    // Fetch current prices
    let priceData: any[] = [];
    try {
        priceData = await getWatchlistData(allSymbols);
    } catch {
        // Continue with no prices
    }

    // Get company names from watchlist
    const watchlistItems = await Watchlist.find({ userId, symbol: { $in: allSymbols } }).lean();
    const companyMap = new Map(watchlistItems.map(w => [w.symbol, w.company]));

    const priceMap = new Map(priceData.map(p => [p.symbol, p]));

    const positions: PositionWithPriceData[] = [];
    let totalValue = 0;
    let totalCostBasis = 0;
    let totalRealizedPL = 0;
    let totalUnrealizedPL = 0;
    let totalOptionsPremium = 0;
    let totalDividends = 0;

    for (const [symbol, symbolTrades] of bySymbol) {
        const method = settings?.symbolOverrides?.find(o => o.symbol === symbol)?.method || defaultMethod;

        const tradeInputs: TradeInput[] = symbolTrades.map(t => ({
            type: t.type,
            quantity: t.quantity,
            pricePerShare: t.pricePerShare,
            totalAmount: t.totalAmount,
            fees: t.fees,
            executedAt: t.executedAt,
            optionDetails: t.optionDetails ? {
                action: t.optionDetails.action,
                contracts: t.optionDetails.contracts,
                premiumPerContract: t.optionDetails.premiumPerContract,
            } : undefined,
        }));

        const pos = computePosition(tradeInputs, method);
        const price = priceMap.get(symbol);
        const currentPrice = price?.price || 0;
        const marketValue = pos.shares * currentPrice;
        const unrealizedPL = pos.shares > 0 && currentPrice > 0
            ? marketValue - pos.costBasis
            : 0;
        const totalReturn = pos.realizedPL + unrealizedPL + pos.optionsPremiumNet + pos.dividendsReceived;
        const totalReturnPercent = pos.costBasis > 0 ? (totalReturn / pos.costBasis) * 100 : 0;

        const adjustedCostPerShare = pos.shares > 0
            ? (pos.costBasis - pos.optionsPremiumNet - pos.dividendsReceived - pos.realizedPL) / pos.shares
            : 0;

        positions.push({
            symbol,
            company: companyMap.get(symbol) || price?.name || symbol,
            shares: pos.shares,
            costBasis: pos.costBasis,
            avgCostPerShare: pos.avgCostPerShare,
            adjustedCostBasis: pos.adjustedCostBasis,
            adjustedCostPerShare,
            realizedPL: pos.realizedPL,
            unrealizedPL,
            optionsPremiumNet: pos.optionsPremiumNet,
            dividendsReceived: pos.dividendsReceived,
            currentPrice,
            marketValue,
            totalReturn,
            totalReturnPercent,
            costBasisMethod: method,
            lots: pos.lots.map(l => ({
                shares: l.shares,
                costPerShare: l.costPerShare,
                date: l.date.toISOString(),
            })),
        });

        totalValue += marketValue;
        totalCostBasis += pos.costBasis;
        totalRealizedPL += pos.realizedPL;
        totalUnrealizedPL += unrealizedPL;
        totalOptionsPremium += pos.optionsPremiumNet;
        totalDividends += pos.dividendsReceived;
    }

    // Calculate today's return from price data
    let todayReturn = 0;
    for (const pos of positions) {
        const price = priceMap.get(pos.symbol);
        if (price && pos.shares > 0) {
            todayReturn += (price.change || 0) * pos.shares;
        }
    }
    const todayReturnPercent = totalValue > 0 ? (todayReturn / (totalValue - todayReturn)) * 100 : 0;

    return {
        totalValue,
        totalCostBasis,
        totalRealizedPL,
        totalUnrealizedPL,
        totalOptionsPremium,
        totalDividends,
        todayReturn,
        todayReturnPercent,
        positions,
    };
}

export async function getRollingPL(
    userId: string,
    range: '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'
): Promise<PLChartData[]> {
    await connectToDatabase();

    // Calculate from date based on range
    const now = new Date();
    let fromDate: Date;

    switch (range) {
        case '1M':
            fromDate = new Date(now);
            fromDate.setMonth(fromDate.getMonth() - 1);
            break;
        case '3M':
            fromDate = new Date(now);
            fromDate.setMonth(fromDate.getMonth() - 3);
            break;
        case '6M':
            fromDate = new Date(now);
            fromDate.setMonth(fromDate.getMonth() - 6);
            break;
        case 'YTD':
            fromDate = new Date(now.getFullYear(), 0, 1);
            break;
        case '1Y':
            fromDate = new Date(now);
            fromDate.setFullYear(fromDate.getFullYear() - 1);
            break;
        case 'ALL':
            fromDate = new Date(2000, 0, 1);
            break;
    }

    const fromStr = fromDate.toISOString().split('T')[0];

    const snapshots = await DailySnapshot.find({
        userId,
        date: { $gte: fromStr },
    })
        .sort({ date: 1 })
        .lean();

    return snapshots.map(s => ({
        date: s.date,
        totalValue: s.totalValue,
        totalCostBasis: s.totalCostBasis,
        realizedPL: s.realizedPL,
        unrealizedPL: s.unrealizedPL,
        totalPL: s.realizedPL + s.unrealizedPL,
    }));
}

export async function recomputeSnapshots(userId: string, fromDate?: string) {
    await connectToDatabase();

    const trades = await Trade.find({ userId }).sort({ executedAt: 1 }).lean();
    if (trades.length === 0) return { computed: 0 };

    const settings = await PortfolioSettings.findOne({ userId }).lean();
    const defaultMethod = settings?.defaultMethod || 'AVERAGE';

    // Determine start date
    const earliestTrade = trades[0].executedAt;
    const startDate = fromDate
        ? new Date(Math.max(new Date(fromDate).getTime(), new Date(earliestTrade).getTime()))
        : new Date(earliestTrade);

    const startStr = startDate.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    // Get all unique symbols
    const symbols = [...new Set(trades.map(t => t.symbol))];

    // Fetch historical prices for all symbols
    const priceHistory = new Map<string, Map<string, number>>();
    await Promise.all(
        symbols.map(async (sym) => {
            try {
                const data = await getHistoricalPrices(sym, startStr);
                if (data) {
                    const dateMap = new Map<string, number>();
                    for (let i = 0; i < data.dates.length; i++) {
                        dateMap.set(data.dates[i], data.prices[i]);
                    }
                    priceHistory.set(sym, dateMap);
                }
            } catch {
                // Skip symbols we can't get prices for
            }
        })
    );

    // Walk day by day
    let computed = 0;
    const currentDate = new Date(startStr);
    const endDate = new Date(todayStr);

    while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];

        // Get trades up to this date
        const tradesUpToDate = trades.filter(
            t => new Date(t.executedAt).toISOString().split('T')[0] <= dateStr
        );

        if (tradesUpToDate.length === 0) {
            currentDate.setDate(currentDate.getDate() + 1);
            continue;
        }

        // Compute positions for each symbol
        const bySymbol = new Map<string, typeof trades>();
        for (const trade of tradesUpToDate) {
            if (!bySymbol.has(trade.symbol)) bySymbol.set(trade.symbol, []);
            bySymbol.get(trade.symbol)!.push(trade);
        }

        let totalValue = 0;
        let totalCostBasis = 0;
        let totalRealizedPL = 0;
        let totalUnrealizedPL = 0;
        let totalOptionsPremium = 0;
        const snapshotPositions: DailySnapshotPosition[] = [];

        for (const [symbol, symbolTrades] of bySymbol) {
            const method = settings?.symbolOverrides?.find(o => o.symbol === symbol)?.method || defaultMethod;

            const tradeInputs: TradeInput[] = symbolTrades.map(t => ({
                type: t.type,
                quantity: t.quantity,
                pricePerShare: t.pricePerShare,
                totalAmount: t.totalAmount,
                fees: t.fees,
                executedAt: t.executedAt,
                optionDetails: t.optionDetails ? {
                    action: t.optionDetails.action,
                    contracts: t.optionDetails.contracts,
                    premiumPerContract: t.optionDetails.premiumPerContract,
                } : undefined,
            }));

            const pos = computePosition(tradeInputs, method);

            // Find closest price for this date
            const symPrices = priceHistory.get(symbol);
            let price = 0;
            if (symPrices) {
                price = symPrices.get(dateStr) || 0;
                // If no exact match, find nearest previous
                if (price === 0) {
                    const sortedDates = [...symPrices.keys()].sort();
                    for (const d of sortedDates) {
                        if (d <= dateStr) price = symPrices.get(d)!;
                        else break;
                    }
                }
            }

            const marketValue = pos.shares * price;
            const unrealizedPL = pos.shares > 0 && price > 0 ? marketValue - pos.costBasis : 0;

            totalValue += marketValue;
            totalCostBasis += pos.costBasis;
            totalRealizedPL += pos.realizedPL;
            totalUnrealizedPL += unrealizedPL;
            totalOptionsPremium += pos.optionsPremiumNet;

            if (pos.shares > 0) {
                snapshotPositions.push({
                    symbol,
                    shares: pos.shares,
                    costBasis: pos.costBasis,
                    marketValue,
                    realizedPL: pos.realizedPL,
                    unrealizedPL,
                });
            }
        }

        await DailySnapshot.findOneAndUpdate(
            { userId, date: dateStr },
            {
                totalValue,
                totalCostBasis,
                realizedPL: totalRealizedPL,
                unrealizedPL: totalUnrealizedPL,
                optionsPremiumNet: totalOptionsPremium,
                positions: snapshotPositions,
            },
            { upsert: true }
        );

        computed++;
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return { computed };
}

// Internal type for snapshot positions
type DailySnapshotPosition = {
    symbol: string;
    shares: number;
    costBasis: number;
    marketValue: number;
    realizedPL: number;
    unrealizedPL: number;
};
