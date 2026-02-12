import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export interface WatchlistItem extends Document {
    userId: string;
    symbol: string;
    company: string;
    shares: number;
    avgCost: number;
    addedAt: Date;
    watchSince: Date | null;
}

const WatchlistSchema = new Schema<WatchlistItem>(
    {
        userId: { type: String, required: true, index: true },
        symbol: { type: String, required: true, uppercase: true, trim: true },
        company: { type: String, required: true, trim: true },
        shares: { type: Number, default: 0 },
        avgCost: { type: Number, default: 0 },
        addedAt: { type: Date, default: Date.now },
        watchSince: { type: Date, default: null },
    },
    { timestamps: false }
);

// Prevent duplicate symbols per user
WatchlistSchema.index({ userId: 1, symbol: 1 }, { unique: true });

// Delete cached model to ensure schema changes are picked up across hot reloads
if (mongoose.models.Watchlist) {
    mongoose.deleteModel('Watchlist');
}

export const Watchlist: Model<WatchlistItem> = model<WatchlistItem>('Watchlist', WatchlistSchema);
