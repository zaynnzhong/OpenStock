import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export interface IAlert extends Document {
    userId: string;
    symbol: string;
    targetPrice: number;
    condition: 'ABOVE' | 'BELOW';
    source: 'manual' | 'holdings';
    active: boolean;
    triggered: boolean;
    expiresAt: Date;
    createdAt: Date;
}

const AlertSchema = new Schema<IAlert>(
    {
        userId: { type: String, required: true, index: true },
        symbol: { type: String, required: true, uppercase: true, trim: true },
        targetPrice: { type: Number, required: true },
        condition: { type: String, enum: ['ABOVE', 'BELOW'], required: true },
        source: { type: String, enum: ['manual', 'holdings'], default: 'manual' },
        active: { type: Boolean, default: true },
        triggered: { type: Boolean, default: false },
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
        },
        createdAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// Delete cached model to ensure schema changes are picked up across hot reloads
if (mongoose.models.Alert) {
    mongoose.deleteModel('Alert');
}

export const Alert: Model<IAlert> = model<IAlert>('Alert', AlertSchema);
