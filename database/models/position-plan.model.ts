import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export type PositionTier = 'core' | 'satellite' | 'speculative';

export interface StagedTarget {
    price: number;
    label: string;
    sellPct: number;
    trailingStopPct?: number;
    reached: boolean;
    reachedAt?: Date;
}

export interface CashTransaction {
    type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRADE_BUY' | 'TRADE_SELL' | 'OPTION_PREMIUM' | 'DIVIDEND';
    amount: number;
    description: string;
    relatedSymbol?: string;
    relatedTradeId?: string;
    date: Date;
}

export interface PositionPlanSlot {
    symbol: string;
    tier: PositionTier;
    topics: string[];
    targetPct: number | null;
    targetAmount: number | null;
    notes: string;
    addedAt: Date;
    sector?: string;
    industry?: string;
    stagedTargets: StagedTarget[];
    stopLossPrice?: number;
    trailingStopPct?: number;
    trailingStopActivatedAt?: Date;
    maxDrawdownPct: number;
    costBasis?: number;
    avgEntryPrice?: number;
}

export interface TierTargets {
    core: number;
    satellite: number;
    speculative: number;
}

export interface TierMaxSlots {
    core: number;
    satellite: number;
    speculative: number;
}

export interface PositionPlanDocument extends Document {
    userId: string;
    slots: PositionPlanSlot[];
    tierTargets: TierTargets;
    tierMaxSlots: TierMaxSlots;
    cashBalance: number;
    cashTransactions: CashTransaction[];
    maxDrawdownPctDefault: number;
    lastAuditResult?: {
        violations: any[];
        structureValid: boolean;
        totalScore: number;
        timestamp: Date;
    };
    createdAt: Date;
    updatedAt: Date;
}

const StagedTargetSchema = new Schema<StagedTarget>(
    {
        price: { type: Number, required: true },
        label: { type: String, required: true },
        sellPct: { type: Number, required: true },
        trailingStopPct: { type: Number },
        reached: { type: Boolean, default: false },
        reachedAt: { type: Date },
    },
    { _id: false }
);

const CashTransactionSchema = new Schema<CashTransaction>(
    {
        type: {
            type: String,
            enum: ['DEPOSIT', 'WITHDRAWAL', 'TRADE_BUY', 'TRADE_SELL', 'OPTION_PREMIUM', 'DIVIDEND'],
            required: true,
        },
        amount: { type: Number, required: true },
        description: { type: String, default: '' },
        relatedSymbol: { type: String },
        relatedTradeId: { type: String },
        date: { type: Date, default: Date.now },
    },
    { _id: false }
);

const PositionPlanSlotSchema = new Schema<PositionPlanSlot>(
    {
        symbol: { type: String, required: true, uppercase: true, trim: true },
        tier: { type: String, enum: ['core', 'satellite', 'speculative'], required: true },
        topics: { type: [String], default: [] },
        targetPct: { type: Number, default: null },
        targetAmount: { type: Number, default: null },
        notes: { type: String, default: '' },
        addedAt: { type: Date, default: Date.now },
        sector: { type: String },
        industry: { type: String },
        stagedTargets: { type: [StagedTargetSchema], default: [] },
        stopLossPrice: { type: Number },
        trailingStopPct: { type: Number },
        trailingStopActivatedAt: { type: Date },
        maxDrawdownPct: { type: Number, default: 2 },
        costBasis: { type: Number },
        avgEntryPrice: { type: Number },
    },
    { _id: false }
);

const PositionPlanSchema = new Schema<PositionPlanDocument>(
    {
        userId: { type: String, required: true, unique: true },
        slots: { type: [PositionPlanSlotSchema], default: [] },
        tierTargets: {
            type: {
                core: { type: Number, default: 70 },
                satellite: { type: Number, default: 25 },
                speculative: { type: Number, default: 5 },
            },
            default: { core: 70, satellite: 25, speculative: 5 },
        },
        tierMaxSlots: {
            type: {
                core: { type: Number, default: 3 },
                satellite: { type: Number, default: 6 },
                speculative: { type: Number, default: 3 },
            },
            default: { core: 3, satellite: 6, speculative: 3 },
        },
        cashBalance: { type: Number, default: 0 },
        cashTransactions: { type: [CashTransactionSchema], default: [] },
        maxDrawdownPctDefault: { type: Number, default: 2 },
        lastAuditResult: {
            type: {
                violations: { type: [Schema.Types.Mixed], default: [] },
                structureValid: { type: Boolean },
                totalScore: { type: Number },
                timestamp: { type: Date },
            },
            default: undefined,
        },
    },
    { timestamps: true }
);

PositionPlanSchema.index({ userId: 1 }, { unique: true });

if (mongoose.models.PositionPlan) {
    mongoose.deleteModel('PositionPlan');
}

export const PositionPlan: Model<PositionPlanDocument> = model<PositionPlanDocument>(
    'PositionPlan',
    PositionPlanSchema
);
