'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Trade, type TradeDocument } from '@/database/models/trade.model';
import { Watchlist } from '@/database/models/watchlist.model';
import { PortfolioSettings } from '@/database/models/portfolio-settings.model';
import { computePosition, computePerTradePL, type TradeInput } from '@/lib/portfolio/cost-basis';
import { parseCSV, type ParseResult } from '@/lib/portfolio/csv-parser';
import { revalidatePath } from 'next/cache';

function serialize<T>(doc: T): T {
    return JSON.parse(JSON.stringify(doc));
}

export async function createTrade(data: {
    userId: string;
    symbol: string;
    type: TradeType;
    quantity: number;
    pricePerShare: number;
    totalAmount: number;
    fees?: number;
    optionDetails?: TradeData['optionDetails'];
    notes?: string;
    executedAt: string;
    source?: TradeSource;
}) {
    await connectToDatabase();

    const trade = await Trade.create({
        ...data,
        symbol: data.symbol.toUpperCase(),
        fees: data.fees || 0,
        executedAt: new Date(data.executedAt),
        source: data.source || 'manual',
    });

    await syncWatchlistFromTrades(data.userId, data.symbol.toUpperCase());
    revalidatePath('/portfolio');
    revalidatePath('/watchlist');

    return serialize(trade);
}

export async function updateTrade(tradeId: string, userId: string, updates: Partial<{
    symbol: string;
    type: TradeType;
    quantity: number;
    pricePerShare: number;
    totalAmount: number;
    fees: number;
    optionDetails: TradeData['optionDetails'];
    notes: string;
    executedAt: string;
}>) {
    await connectToDatabase();

    const trade = await Trade.findOne({ _id: tradeId, userId });
    if (!trade) throw new Error('Trade not found');

    const oldSymbol = trade.symbol;

    if (updates.symbol) updates.symbol = updates.symbol.toUpperCase();
    if (updates.executedAt) (updates as any).executedAt = new Date(updates.executedAt);

    Object.assign(trade, updates);
    await trade.save();

    // Sync both old and new symbol if symbol changed
    await syncWatchlistFromTrades(userId, trade.symbol);
    if (oldSymbol !== trade.symbol) {
        await syncWatchlistFromTrades(userId, oldSymbol);
    }

    revalidatePath('/portfolio');
    revalidatePath('/watchlist');

    return serialize(trade);
}

export async function deleteTrade(tradeId: string, userId: string) {
    await connectToDatabase();

    const trade = await Trade.findOneAndDelete({ _id: tradeId, userId });
    if (!trade) throw new Error('Trade not found');

    await syncWatchlistFromTrades(userId, trade.symbol);
    revalidatePath('/portfolio');
    revalidatePath('/watchlist');

    return { success: true };
}

export async function getUserTrades(
    userId: string,
    options: {
        symbol?: string;
        limit?: number;
        offset?: number;
        sort?: 'asc' | 'desc';
    } = {}
) {
    await connectToDatabase();

    const { symbol, limit = 50, offset = 0, sort = 'desc' } = options;

    const query: any = { userId };
    if (symbol) query.symbol = symbol.toUpperCase();

    const [trades, total] = await Promise.all([
        Trade.find(query)
            .sort({ executedAt: sort === 'asc' ? 1 : -1 })
            .skip(offset)
            .limit(limit)
            .lean(),
        Trade.countDocuments(query),
    ]);

    return { trades: serialize(trades) as unknown as TradeData[], total };
}

export async function previewCSVImport(
    userId: string,
    csvContent: string,
    format?: 'csv_robinhood' | 'csv_schwab' | 'csv_generic'
): Promise<ParseResult> {
    return parseCSV(csvContent, format);
}

export async function confirmCSVImport(
    userId: string,
    trades: ParseResult['trades'],
    source: TradeSource
) {
    await connectToDatabase();

    const importBatchId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const docs = trades.map(t => ({
        userId,
        symbol: t.symbol.toUpperCase(),
        type: t.type,
        quantity: t.quantity,
        pricePerShare: t.pricePerShare,
        totalAmount: t.totalAmount,
        fees: t.fees,
        executedAt: t.executedAt,
        source,
        importBatchId,
        optionDetails: t.optionDetails,
        notes: t.notes,
    }));

    const inserted = await Trade.insertMany(docs);

    // Sync all affected symbols
    const symbols = [...new Set(trades.map(t => t.symbol.toUpperCase()))];
    await Promise.all(symbols.map(sym => syncWatchlistFromTrades(userId, sym)));

    revalidatePath('/portfolio');
    revalidatePath('/watchlist');

    return { count: inserted.length, importBatchId };
}

export async function getPositionSummary(userId: string, symbol: string) {
    await connectToDatabase();

    const upperSymbol = symbol.toUpperCase();
    const trades = await Trade.find({ userId, symbol: upperSymbol })
        .sort({ executedAt: 1 })
        .lean();

    if (trades.length === 0) return null;

    const settings = await PortfolioSettings.findOne({ userId }).lean();
    const method = settings?.symbolOverrides?.find(o => o.symbol === upperSymbol)?.method
        || settings?.defaultMethod
        || 'AVERAGE';

    const tradeInputs: TradeInput[] = trades.map(t => ({
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

    return computePosition(tradeInputs, method);
}

export async function getAllPositions(userId: string) {
    await connectToDatabase();

    const trades = await Trade.find({ userId }).sort({ executedAt: 1 }).lean();
    if (trades.length === 0) return [];

    const settings = await PortfolioSettings.findOne({ userId }).lean();
    const defaultMethod = settings?.defaultMethod || 'AVERAGE';

    // Group trades by symbol
    const bySymbol = new Map<string, TradeDocument[]>();
    for (const trade of trades) {
        const sym = trade.symbol;
        if (!bySymbol.has(sym)) bySymbol.set(sym, []);
        bySymbol.get(sym)!.push(trade as any);
    }

    const positions: Array<{
        symbol: string;
        method: CostBasisMethod;
        shares: number;
        costBasis: number;
        avgCostPerShare: number;
        realizedPL: number;
        optionsPremiumNet: number;
        adjustedCostBasis: number;
        dividendsReceived: number;
        lots: { shares: number; costPerShare: number; date: Date }[];
    }> = [];

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

        const position = computePosition(tradeInputs, method);
        positions.push({ symbol, method, ...position });
    }

    return positions;
}

export async function syncWatchlistFromTrades(userId: string, symbol: string) {
    await connectToDatabase();

    const upperSymbol = symbol.toUpperCase();
    const trades = await Trade.find({ userId, symbol: upperSymbol })
        .sort({ executedAt: 1 })
        .lean();

    if (trades.length === 0) return;

    const settings = await PortfolioSettings.findOne({ userId }).lean();
    const method = settings?.symbolOverrides?.find(o => o.symbol === upperSymbol)?.method
        || settings?.defaultMethod
        || 'AVERAGE';

    const tradeInputs: TradeInput[] = trades.map(t => ({
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

    const position = computePosition(tradeInputs, method);

    // Update watchlist entry if it exists
    await Watchlist.findOneAndUpdate(
        { userId, symbol: upperSymbol },
        {
            shares: position.shares,
            avgCost: position.avgCostPerShare,
        }
    );
}

export async function hasTradesForSymbol(userId: string, symbol: string): Promise<boolean> {
    await connectToDatabase();
    const count = await Trade.countDocuments({ userId, symbol: symbol.toUpperCase() });
    return count > 0;
}

export async function getTradeSymbols(userId: string): Promise<string[]> {
    await connectToDatabase();
    const symbols = await Trade.distinct('symbol', { userId });
    return symbols;
}

/**
 * Fetches trades with per-trade realized P/L and running cost annotations.
 * Groups trades by symbol, computes per-trade P/L, then merges back and sorts.
 */
export async function getTradesWithPL(
    userId: string,
    options: {
        symbol?: string;
        limit?: number;
        offset?: number;
        sort?: 'asc' | 'desc';
    } = {}
) {
    await connectToDatabase();

    const { symbol, limit = 50, offset = 0, sort = 'desc' } = options;

    const query: any = { userId };
    if (symbol) query.symbol = symbol.toUpperCase();

    const [allTrades, total] = await Promise.all([
        Trade.find(query).sort({ executedAt: 1 }).lean(),
        Trade.countDocuments(query),
    ]);

    if (allTrades.length === 0) return { trades: [] as TradeData[], total: 0 };

    const settings = await PortfolioSettings.findOne({ userId }).lean();
    const defaultMethod = settings?.defaultMethod || 'AVERAGE';

    // Group by symbol for per-trade P/L computation
    const bySymbol = new Map<string, typeof allTrades>();
    for (const t of allTrades) {
        if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
        bySymbol.get(t.symbol)!.push(t);
    }

    // Compute per-trade P/L per symbol, build a map from trade _id to annotations
    const plMap = new Map<string, { realizedPL: number; cashFlow: number; runningCostPerShare: number; runningAdjustedCostPerShare: number }>();

    for (const [sym, symTrades] of bySymbol) {
        const method = settings?.symbolOverrides?.find(o => o.symbol === sym)?.method || defaultMethod;

        const inputs: TradeInput[] = symTrades.map(t => ({
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

        const withPL = computePerTradePL(inputs, method);

        // Match back by index (same order since both sorted by executedAt asc)
        for (let i = 0; i < symTrades.length; i++) {
            const id = String(symTrades[i]._id);
            plMap.set(id, {
                realizedPL: withPL[i].realizedPL,
                cashFlow: withPL[i].cashFlow,
                runningCostPerShare: withPL[i].runningCostPerShare,
                runningAdjustedCostPerShare: withPL[i].runningAdjustedCostPerShare,
            });
        }
    }

    // Sort for pagination (desc = newest first)
    const sorted = [...allTrades].sort((a, b) =>
        sort === 'desc'
            ? new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
            : new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
    );

    const page = sorted.slice(offset, offset + limit);

    const annotated = page.map(t => {
        const id = String(t._id);
        const pl = plMap.get(id);
        return {
            ...serialize(t),
            realizedPL: pl?.realizedPL ?? 0,
            cashFlow: pl?.cashFlow ?? 0,
            runningCostPerShare: pl?.runningCostPerShare ?? 0,
            runningAdjustedCostPerShare: pl?.runningAdjustedCostPerShare ?? 0,
        };
    }) as unknown as TradeData[];

    return { trades: annotated, total };
}
