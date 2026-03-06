'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Alert, type IAlert } from '@/database/models/alert.model';
import { revalidatePath } from 'next/cache';

// Create a new price alert
export async function createAlert(params: {
    userId: string;
    symbol: string;
    targetPrice: number;
    condition: 'ABOVE' | 'BELOW';
}) {
    try {
        await connectToDatabase();
        const newAlert = await Alert.create({
            ...params,
            alertType: 'price',
            active: true,
        });
        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(newAlert));
    } catch (error) {
        console.error('Error creating alert:', error);
        throw new Error('Failed to create alert');
    }
}

// Create a percentage change alert
export async function createPctChangeAlert(params: {
    userId: string;
    symbol: string;
    threshold: number;
    direction: 'above' | 'below';
    basePrice: number;
}) {
    try {
        await connectToDatabase();
        const { userId, symbol, threshold, direction, basePrice } = params;

        // Calculate target price from base + threshold
        const multiplier = direction === 'above' ? 1 + threshold / 100 : 1 - threshold / 100;
        const targetPrice = Math.round(basePrice * multiplier * 100) / 100;

        const newAlert = await Alert.create({
            userId,
            symbol: symbol.toUpperCase(),
            targetPrice,
            condition: direction === 'above' ? 'ABOVE' : 'BELOW',
            alertType: 'pct_change',
            pctConfig: { threshold, direction, basePrice },
            active: true,
        });
        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(newAlert));
    } catch (error) {
        console.error('Error creating pct change alert:', error);
        throw new Error('Failed to create percentage change alert');
    }
}

// Create an SMA cross alert
export async function createSMAAlert(params: {
    userId: string;
    symbol: string;
    indicator: 'sma200d' | 'sma20w' | 'sma50w';
    crossDirection: 'above' | 'below';
}) {
    try {
        await connectToDatabase();
        const { userId, symbol, indicator, crossDirection } = params;

        // Get current SMA value to set as initial target reference
        let targetPrice = 0;
        try {
            const { getSMAIndicators } = await import('@/lib/actions/finnhub.actions');
            const smaData = await getSMAIndicators(symbol);
            if (indicator === 'sma200d' && smaData.sma200d) targetPrice = smaData.sma200d;
            else if (indicator === 'sma20w' && smaData.sma20w) targetPrice = smaData.sma20w;
            else if (indicator === 'sma50w' && smaData.sma50w) targetPrice = smaData.sma50w;
        } catch {
            // Non-critical
        }

        // Determine initial lastState
        let lastState: 'above' | 'below' | null = null;
        try {
            const { getQuote } = await import('@/lib/actions/finnhub.actions');
            const quote = await getQuote(symbol);
            if (quote?.c && targetPrice > 0) {
                lastState = quote.c >= targetPrice ? 'above' : 'below';
            }
        } catch {
            // Non-critical
        }

        const newAlert = await Alert.create({
            userId,
            symbol: symbol.toUpperCase(),
            targetPrice: targetPrice || 0,
            condition: crossDirection === 'above' ? 'ABOVE' : 'BELOW',
            alertType: 'sma_cross',
            smaConfig: { indicator, crossDirection },
            lastState,
            active: true,
        });
        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(newAlert));
    } catch (error) {
        console.error('Error creating SMA alert:', error);
        throw new Error('Failed to create SMA cross alert');
    }
}

// Get all alerts for a user
export async function getUserAlerts(userId: string) {
    try {
        await connectToDatabase();
        const alerts = await Alert.find({ userId }).sort({ createdAt: -1 });
        return JSON.parse(JSON.stringify(alerts));
    } catch (error) {
        console.error('Error fetching alerts:', error);
        return [];
    }
}

// Delete an alert
export async function deleteAlert(alertId: string) {
    try {
        await connectToDatabase();
        await Alert.findByIdAndDelete(alertId);
        revalidatePath('/watchlist');
        return { success: true };
    } catch (error) {
        console.error('Error deleting alert:', error);
        throw new Error('Failed to delete alert');
    }
}

// Auto-create holding alerts at +/-25% of avg cost
export async function syncHoldingAlerts(
    userId: string,
    symbol: string,
    avgCost: number,
    currentPrice: number
) {
    if (!userId || !symbol || avgCost <= 0 || currentPrice <= 0) return;

    try {
        await connectToDatabase();
        const sym = symbol.toUpperCase();

        const targetAbove = Math.round(avgCost * 1.25 * 100) / 100;
        const targetBelow = Math.round(avgCost * 0.75 * 100) / 100;

        // Remove old auto-created holding alerts for this symbol
        await Alert.deleteMany({
            userId,
            symbol: sym,
            source: 'holdings',
            triggered: false,
        });

        // +25% alert
        if (currentPrice < targetAbove) {
            await Alert.create({
                userId,
                symbol: sym,
                targetPrice: targetAbove,
                condition: 'ABOVE',
                source: 'holdings',
                alertType: 'price',
                active: true,
            });
        } else {
            await Alert.create({
                userId,
                symbol: sym,
                targetPrice: targetAbove,
                condition: 'BELOW',
                source: 'holdings',
                alertType: 'price',
                active: true,
            });
        }

        // -25% alert
        if (currentPrice > targetBelow) {
            await Alert.create({
                userId,
                symbol: sym,
                targetPrice: targetBelow,
                condition: 'BELOW',
                source: 'holdings',
                alertType: 'price',
                active: true,
            });
        } else {
            await Alert.create({
                userId,
                symbol: sym,
                targetPrice: targetBelow,
                condition: 'ABOVE',
                source: 'holdings',
                alertType: 'price',
                active: true,
            });
        }

        revalidatePath('/watchlist');
    } catch (error) {
        console.error('Error syncing holding alerts:', error);
    }
}

// Sync alerts for ALL existing holdings that have avgCost set
export async function syncAllHoldingAlerts(userId: string, holdings: { symbol: string; avgCost: number; price: number }[]) {
    if (!userId || !holdings || holdings.length === 0) return;

    try {
        await connectToDatabase();

        const existingAlerts = await Alert.find({
            userId,
            source: 'holdings',
            triggered: false,
        }).lean();

        const alertedSymbols = new Set(existingAlerts.map((a: any) => a.symbol));

        for (const h of holdings) {
            if (h.avgCost <= 0 || h.price <= 0) continue;
            if (alertedSymbols.has(h.symbol.toUpperCase())) continue;

            await syncHoldingAlerts(userId, h.symbol, h.avgCost, h.price);
        }
    } catch (error) {
        console.error('Error syncing all holding alerts:', error);
    }
}

// Toggle alert active status
export async function toggleAlert(alertId: string, active: boolean) {
    try {
        await connectToDatabase();
        await Alert.findByIdAndUpdate(alertId, { active });
        revalidatePath('/watchlist');
        return { success: true };
    } catch (error) {
        console.error('Error toggling alert:', error);
        throw new Error('Failed to update alert');
    }
}
