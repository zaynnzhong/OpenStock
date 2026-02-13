import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export type TradeType = 'BUY' | 'SELL' | 'OPTION_PREMIUM' | 'DIVIDEND';
export type OptionAction = 'BUY_TO_OPEN' | 'BUY_TO_CLOSE' | 'SELL_TO_OPEN' | 'SELL_TO_CLOSE';
export type TradeSource = 'manual' | 'csv_robinhood' | 'csv_schwab' | 'csv_generic' | 'discord';

export interface OptionDetails {
    contractType: 'CALL' | 'PUT';
    action: OptionAction;
    strikePrice: number;
    expirationDate: Date;
    contracts: number;
    premiumPerContract: number;
}

export interface TradeDocument extends Document {
    userId: string;
    symbol: string;
    type: TradeType;
    quantity: number;
    pricePerShare: number;
    totalAmount: number;
    fees: number;
    optionDetails?: OptionDetails;
    notes?: string;
    executedAt: Date;
    source: TradeSource;
    importBatchId?: string;
    createdAt: Date;
    updatedAt: Date;
}

const OptionDetailsSchema = new Schema<OptionDetails>(
    {
        contractType: { type: String, enum: ['CALL', 'PUT'], required: true },
        action: { type: String, enum: ['BUY_TO_OPEN', 'BUY_TO_CLOSE', 'SELL_TO_OPEN', 'SELL_TO_CLOSE'], required: true },
        strikePrice: { type: Number, required: true },
        expirationDate: { type: Date, required: true },
        contracts: { type: Number, required: true },
        premiumPerContract: { type: Number, required: true },
    },
    { _id: false }
);

const TradeSchema = new Schema<TradeDocument>(
    {
        userId: { type: String, required: true },
        symbol: { type: String, required: true, uppercase: true, trim: true },
        type: { type: String, enum: ['BUY', 'SELL', 'OPTION_PREMIUM', 'DIVIDEND'], required: true },
        quantity: { type: Number, required: true, default: 0 },
        pricePerShare: { type: Number, required: true, default: 0 },
        totalAmount: { type: Number, required: true, default: 0 },
        fees: { type: Number, default: 0 },
        optionDetails: { type: OptionDetailsSchema, default: undefined },
        notes: { type: String, default: undefined },
        executedAt: { type: Date, required: true },
        source: { type: String, enum: ['manual', 'csv_robinhood', 'csv_schwab', 'csv_generic', 'discord'], default: 'manual' },
        importBatchId: { type: String, default: undefined },
    },
    { timestamps: true }
);

TradeSchema.index({ userId: 1, symbol: 1, executedAt: 1 });
TradeSchema.index({ userId: 1, executedAt: 1 });

if (mongoose.models.Trade) {
    mongoose.deleteModel('Trade');
}

export const Trade: Model<TradeDocument> = model<TradeDocument>('Trade', TradeSchema);
