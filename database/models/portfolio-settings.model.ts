import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export type CostBasisMethod = 'FIFO' | 'AVERAGE';

export interface SymbolOverride {
    symbol: string;
    method: CostBasisMethod;
}

export interface PortfolioSettingsDocument extends Document {
    userId: string;
    defaultMethod: CostBasisMethod;
    symbolOverrides: SymbolOverride[];
    createdAt: Date;
    updatedAt: Date;
}

const SymbolOverrideSchema = new Schema<SymbolOverride>(
    {
        symbol: { type: String, required: true, uppercase: true, trim: true },
        method: { type: String, enum: ['FIFO', 'AVERAGE'], required: true },
    },
    { _id: false }
);

const PortfolioSettingsSchema = new Schema<PortfolioSettingsDocument>(
    {
        userId: { type: String, required: true, unique: true },
        defaultMethod: { type: String, enum: ['FIFO', 'AVERAGE'], default: 'AVERAGE' },
        symbolOverrides: { type: [SymbolOverrideSchema], default: [] },
    },
    { timestamps: true }
);

PortfolioSettingsSchema.index({ userId: 1 }, { unique: true });

if (mongoose.models.PortfolioSettings) {
    mongoose.deleteModel('PortfolioSettings');
}

export const PortfolioSettings: Model<PortfolioSettingsDocument> = model<PortfolioSettingsDocument>(
    'PortfolioSettings',
    PortfolioSettingsSchema
);
