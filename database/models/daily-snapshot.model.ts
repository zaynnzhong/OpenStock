import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export interface DailySnapshotDocument extends Document {
    userId: string;
    date: string; // YYYY-MM-DD
    totalValue: number;
    totalCostBasis: number;
    realizedPL: number;
    unrealizedPL: number;
    optionsPremiumNet: number;
    positions: {
        symbol: string;
        shares: number;
        costBasis: number;
        marketValue: number;
        realizedPL: number;
        unrealizedPL: number;
    }[];
    createdAt: Date;
    updatedAt: Date;
}

const SnapshotPositionSchema = new Schema(
    {
        symbol: { type: String, required: true },
        shares: { type: Number, required: true },
        costBasis: { type: Number, required: true },
        marketValue: { type: Number, required: true },
        realizedPL: { type: Number, default: 0 },
        unrealizedPL: { type: Number, default: 0 },
    },
    { _id: false }
);

const DailySnapshotSchema = new Schema<DailySnapshotDocument>(
    {
        userId: { type: String, required: true },
        date: { type: String, required: true },
        totalValue: { type: Number, default: 0 },
        totalCostBasis: { type: Number, default: 0 },
        realizedPL: { type: Number, default: 0 },
        unrealizedPL: { type: Number, default: 0 },
        optionsPremiumNet: { type: Number, default: 0 },
        positions: { type: [SnapshotPositionSchema], default: [] },
    },
    { timestamps: true }
);

DailySnapshotSchema.index({ userId: 1, date: 1 }, { unique: true });

if (mongoose.models.DailySnapshot) {
    mongoose.deleteModel('DailySnapshot');
}

export const DailySnapshot: Model<DailySnapshotDocument> = model<DailySnapshotDocument>(
    'DailySnapshot',
    DailySnapshotSchema
);
