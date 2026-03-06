import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export interface IWatchlistGroup extends Document {
    userId: string;
    name: string;
    color?: string;
    sortOrder: number;
    createdAt: Date;
}

const WatchlistGroupSchema = new Schema<IWatchlistGroup>(
    {
        userId: { type: String, required: true, index: true },
        name: { type: String, required: true, trim: true },
        color: { type: String, default: null },
        sortOrder: { type: Number, default: 0 },
        createdAt: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

WatchlistGroupSchema.index({ userId: 1, name: 1 }, { unique: true });

if (mongoose.models.WatchlistGroup) {
    mongoose.deleteModel('WatchlistGroup');
}

export const WatchlistGroup: Model<IWatchlistGroup> = model<IWatchlistGroup>('WatchlistGroup', WatchlistGroupSchema);
