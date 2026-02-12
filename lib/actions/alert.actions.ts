'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Alert, type IAlert } from '@/database/models/alert.model';
import { revalidatePath } from 'next/cache';

// Create a new alert
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
            active: true,
            // expiresAt handled by default value in schema
        });
        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(newAlert));
    } catch (error) {
        console.error('Error creating alert:', error);
        throw new Error('Failed to create alert');
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

// Auto-create holding alerts at ±25% of avg cost
// Skips if the stock is already past the target (ITM)
// Replaces old holding alerts when avgCost changes
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
            // Price hasn't hit +25% yet — alert when it goes ABOVE
            await Alert.create({
                userId,
                symbol: sym,
                targetPrice: targetAbove,
                condition: 'ABOVE',
                source: 'holdings',
                active: true,
            });
        } else {
            // Price already past +25% — alert if it drops back to that level
            await Alert.create({
                userId,
                symbol: sym,
                targetPrice: targetAbove,
                condition: 'BELOW',
                source: 'holdings',
                active: true,
            });
        }

        // -25% alert
        if (currentPrice > targetBelow) {
            // Price hasn't hit -25% yet — alert when it drops BELOW
            await Alert.create({
                userId,
                symbol: sym,
                targetPrice: targetBelow,
                condition: 'BELOW',
                source: 'holdings',
                active: true,
            });
        } else {
            // Price already past -25% — alert when it recovers back ABOVE
            await Alert.create({
                userId,
                symbol: sym,
                targetPrice: targetBelow,
                condition: 'ABOVE',
                source: 'holdings',
                active: true,
            });
        }

        revalidatePath('/watchlist');
    } catch (error) {
        console.error('Error syncing holding alerts:', error);
    }
}

// Sync alerts for ALL existing holdings that have avgCost set
// Called on watchlist page load to backfill alerts for pre-existing holdings
export async function syncAllHoldingAlerts(userId: string, holdings: { symbol: string; avgCost: number; price: number }[]) {
    if (!userId || !holdings || holdings.length === 0) return;

    try {
        await connectToDatabase();

        // Get all existing holding alerts for this user in one query
        const existingAlerts = await Alert.find({
            userId,
            source: 'holdings',
            triggered: false,
        }).lean();

        // Build a set of symbols that already have holding alerts
        const alertedSymbols = new Set(existingAlerts.map((a: any) => a.symbol));

        // Only sync stocks that have avgCost > 0 and don't already have holding alerts
        for (const h of holdings) {
            if (h.avgCost <= 0 || h.price <= 0) continue;
            if (alertedSymbols.has(h.symbol.toUpperCase())) continue;

            await syncHoldingAlerts(userId, h.symbol, h.avgCost, h.price);
        }
    } catch (error) {
        console.error('Error syncing all holding alerts:', error);
    }
}

// Toggle alert active status (optional utility)
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
