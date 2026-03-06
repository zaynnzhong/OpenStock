'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';
import { WatchlistGroup } from '@/database/models/watchlist-group.model';
import { revalidatePath } from 'next/cache';

// -- Group CRUD Operations --

export async function createWatchlistGroup(userId: string, name: string, color?: string) {
    try {
        await connectToDatabase();
        const count = await WatchlistGroup.countDocuments({ userId });
        const group = await WatchlistGroup.create({
            userId,
            name: name.trim(),
            color: color || null,
            sortOrder: count,
        });
        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(group));
    } catch (error) {
        console.error('Error creating watchlist group:', error);
        throw new Error('Failed to create watchlist group');
    }
}

export async function updateWatchlistGroup(userId: string, groupId: string, updates: { name?: string; color?: string }) {
    try {
        await connectToDatabase();
        const updateObj: any = {};
        if (updates.name !== undefined) updateObj.name = updates.name.trim();
        if (updates.color !== undefined) updateObj.color = updates.color;

        const updated = await WatchlistGroup.findOneAndUpdate(
            { _id: groupId, userId },
            updateObj,
            { new: true }
        );
        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(updated));
    } catch (error) {
        console.error('Error updating watchlist group:', error);
        throw new Error('Failed to update watchlist group');
    }
}

export async function deleteWatchlistGroup(userId: string, groupId: string) {
    try {
        await connectToDatabase();
        await WatchlistGroup.findOneAndDelete({ _id: groupId, userId });
        // Remove groupId from all watchlist items' lists arrays
        await Watchlist.updateMany(
            { userId, lists: groupId },
            { $pull: { lists: groupId } }
        );
        revalidatePath('/watchlist');
        return { success: true };
    } catch (error) {
        console.error('Error deleting watchlist group:', error);
        throw new Error('Failed to delete watchlist group');
    }
}

export async function getWatchlistGroups(userId: string) {
    try {
        await connectToDatabase();
        const groups = await WatchlistGroup.find({ userId }).sort({ sortOrder: 1 });
        return JSON.parse(JSON.stringify(groups));
    } catch (error) {
        console.error('Error fetching watchlist groups:', error);
        return [];
    }
}

export async function addToWatchlistGroup(userId: string, symbol: string, groupId: string) {
    try {
        await connectToDatabase();
        const updated = await Watchlist.findOneAndUpdate(
            { userId, symbol: symbol.toUpperCase() },
            { $addToSet: { lists: groupId } },
            { new: true }
        );
        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(updated));
    } catch (error) {
        console.error('Error adding to watchlist group:', error);
        throw new Error('Failed to add to watchlist group');
    }
}

export async function removeFromWatchlistGroup(userId: string, symbol: string, groupId: string) {
    try {
        await connectToDatabase();
        const updated = await Watchlist.findOneAndUpdate(
            { userId, symbol: symbol.toUpperCase() },
            { $pull: { lists: groupId } },
            { new: true }
        );
        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(updated));
    } catch (error) {
        console.error('Error removing from watchlist group:', error);
        throw new Error('Failed to remove from watchlist group');
    }
}

export async function reorderWatchlistGroups(userId: string, orderedIds: string[]) {
    try {
        await connectToDatabase();
        const ops = orderedIds.map((id, index) =>
            WatchlistGroup.findOneAndUpdate({ _id: id, userId }, { sortOrder: index })
        );
        await Promise.all(ops);
        revalidatePath('/watchlist');
        return { success: true };
    } catch (error) {
        console.error('Error reordering watchlist groups:', error);
        throw new Error('Failed to reorder watchlist groups');
    }
}

// -- CRUD Operations --

export async function addToWatchlist(
    userId: string,
    symbol: string,
    company: string,
    groupId?: string
) {
    try {
        await connectToDatabase();

        // Try to get current price for priceAtAdd
        let priceAtAdd: number | null = null;
        try {
            const { getQuote } = await import('@/lib/actions/finnhub.actions');
            const quote = await getQuote(symbol);
            if (quote?.c && quote.c > 0) {
                priceAtAdd = quote.c;
            }
        } catch {
            // Non-critical — proceed without price snapshot
        }

        const updateObj: any = {
            userId,
            symbol: symbol.toUpperCase(),
            company,
            addedAt: new Date(),
            priceAtAdd,
        };

        // Upsert to avoid duplicates/errors if it already exists
        const newItem = await Watchlist.findOneAndUpdate(
            { userId, symbol: symbol.toUpperCase() },
            updateObj,
            { upsert: true, new: true }
        );

        // If groupId provided, add to that group
        if (groupId) {
            await Watchlist.findOneAndUpdate(
                { userId, symbol: symbol.toUpperCase() },
                { $addToSet: { lists: groupId } }
            );
        }

        revalidatePath('/watchlist');
        revalidatePath('/');
        return JSON.parse(JSON.stringify(newItem));
    } catch (error) {
        console.error('Error adding to watchlist:', error);
        throw new Error('Failed to add to watchlist');
    }
}

export async function removeFromWatchlist(userId: string, symbol: string) {
    try {
        await connectToDatabase();
        await Watchlist.findOneAndDelete({ userId, symbol: symbol.toUpperCase() });
        revalidatePath('/watchlist');
        revalidatePath('/'); // In case it's used elsewhere
        return { success: true };
    } catch (error) {
        console.error('Error removing from watchlist:', error);
        throw new Error('Failed to remove from watchlist');
    }
}

export async function getUserWatchlist(userId: string) {
    try {
        await connectToDatabase();
        const watchlist = await Watchlist.find({ userId }).sort({ addedAt: -1 });
        return JSON.parse(JSON.stringify(watchlist));
    } catch (error) {
        console.error('Error fetching watchlist:', error);
        return [];
    }
}

export async function updateWatchSince(userId: string, symbol: string, date: string | null) {
    try {
        await connectToDatabase();

        const updated = await Watchlist.findOneAndUpdate(
            { userId, symbol: symbol.toUpperCase() },
            { watchSince: date ? new Date(date) : null },
            { new: true }
        );

        revalidatePath('/watchlist');
        revalidatePath('/');
        return JSON.parse(JSON.stringify(updated));
    } catch (error) {
        console.error('Error updating watchSince:', error);
        throw new Error('Failed to update watch since date');
    }
}

export async function updateNotes(userId: string, symbol: string, notes: string) {
    try {
        await connectToDatabase();

        const updated = await Watchlist.findOneAndUpdate(
            { userId, symbol: symbol.toUpperCase() },
            { notes },
            { new: true }
        );

        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(updated));
    } catch (error) {
        console.error('Error updating notes:', error);
        throw new Error('Failed to update notes');
    }
}

// Check if a symbol is in the user's watchlist
export async function isStockInWatchlist(userId: string, symbol: string) {
    try {
        await connectToDatabase();
        const item = await Watchlist.findOne({ userId, symbol: symbol.toUpperCase() });
        return !!item;
    } catch (error) {
        console.error('Error checking watchlist status:', error);
        return false;
    }
}

// -- Legacy Support (if needed by other components) --

export async function getWatchlistSymbolsByEmail(email: string): Promise<string[]> {
    if (!email) return [];

    try {
        const mongoose = await connectToDatabase();
        const db = mongoose.connection.db;
        if (!db) throw new Error('MongoDB connection not found');

        // Better Auth stores users in the "user" collection
        const user = await db.collection('user').findOne<{ _id?: unknown; id?: string; email?: string }>({ email });

        if (!user) return [];

        const userId = (user.id as string) || String(user._id || '');
        if (!userId) return [];

        const items = await Watchlist.find({ userId }, { symbol: 1 }).lean();
        return items.map((i) => String(i.symbol));
    } catch (err) {
        console.error('getWatchlistSymbolsByEmail error:', err);
        return [];
    }
}
