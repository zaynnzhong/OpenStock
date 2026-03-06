import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export interface IAlert extends Document {
    userId: string;
    symbol: string;
    targetPrice: number;
    condition: 'ABOVE' | 'BELOW';
    source: 'manual' | 'holdings' | 'position_plan';
    alertType: 'price' | 'pct_change' | 'sma_cross';
    pctConfig?: {
        threshold: number;
        direction: 'above' | 'below';
        basePrice: number;
    };
    smaConfig?: {
        indicator: 'sma200d' | 'sma20w' | 'sma50w';
        crossDirection: 'above' | 'below';
    };
    lastState?: 'above' | 'below' | null;
    lastAlertedAt?: Date | null;
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
        source: { type: String, enum: ['manual', 'holdings', 'position_plan'], default: 'manual' },
        alertType: { type: String, enum: ['price', 'pct_change', 'sma_cross'], default: 'price' },
        pctConfig: {
            type: {
                threshold: Number,
                direction: { type: String, enum: ['above', 'below'] },
                basePrice: Number,
            },
            default: undefined,
        },
        smaConfig: {
            type: {
                indicator: { type: String, enum: ['sma200d', 'sma20w', 'sma50w'] },
                crossDirection: { type: String, enum: ['above', 'below'] },
            },
            default: undefined,
        },
        lastState: { type: String, enum: ['above', 'below', null], default: null },
        lastAlertedAt: { type: Date, default: null },
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
