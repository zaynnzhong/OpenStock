'use server';

import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/database/mongoose';
import { PositionPlan, type PositionTier, type TierTargets, type TierMaxSlots } from '@/database/models/position-plan.model';
import { Alert } from '@/database/models/alert.model';
import { getYahooSectorIndustry, getQuote } from '@/lib/actions/finnhub.actions';
import { auditPositionPlan, type RulesEngineInput } from '@/lib/portfolio/rules-engine';

function serialize<T>(doc: T): T {
    return JSON.parse(JSON.stringify(doc));
}

const MAX_TOTAL_SLOTS = 30;

export async function getPositionPlan(userId: string) {
    await connectToDatabase();
    const plan = await PositionPlan.findOne({ userId }).lean();
    return plan ? serialize(plan) : null;
}

export async function upsertPositionPlanSlot(
    userId: string,
    slot: {
        symbol: string;
        tier: PositionTier;
        topics: string[];
        targetPct: number | null;
        targetAmount: number | null;
        notes: string;
        stagedTargets?: StagedTarget[];
        stopLossPrice?: number;
        trailingStopPct?: number;
        maxDrawdownPct?: number;
        sector?: string;
        industry?: string;
    }
) {
    await connectToDatabase();
    const upperSymbol = slot.symbol.toUpperCase();

    // Enforce total slots ≤ 12
    const existing = await PositionPlan.findOne({
        userId,
        'slots.symbol': upperSymbol,
    });

    if (!existing) {
        const plan = await PositionPlan.findOne({ userId });
        const currentCount = plan?.slots?.length ?? 0;
        if (currentCount >= MAX_TOTAL_SLOTS) {
            throw new Error(`Maximum ${MAX_TOTAL_SLOTS} total positions reached. Remove a position before adding.`);
        }
    }

    // Auto-fetch sector/industry if not provided
    let sector = slot.sector;
    let industry = slot.industry;
    if (!sector) {
        try {
            const result = await getYahooSectorIndustry(upperSymbol);
            if (result) {
                sector = result.sector || undefined;
                industry = result.industry || undefined;
            }
        } catch { /* skip */ }
    }

    const slotData = {
        symbol: upperSymbol,
        tier: slot.tier,
        topics: slot.topics,
        targetPct: slot.targetPct,
        targetAmount: slot.targetAmount,
        notes: slot.notes,
        stagedTargets: slot.stagedTargets || [],
        stopLossPrice: slot.stopLossPrice,
        trailingStopPct: slot.trailingStopPct,
        maxDrawdownPct: slot.maxDrawdownPct ?? 2,
        sector,
        industry,
    };

    if (existing) {
        await PositionPlan.findOneAndUpdate(
            { userId, 'slots.symbol': upperSymbol },
            {
                $set: {
                    'slots.$.tier': slotData.tier,
                    'slots.$.topics': slotData.topics,
                    'slots.$.targetPct': slotData.targetPct,
                    'slots.$.targetAmount': slotData.targetAmount,
                    'slots.$.notes': slotData.notes,
                    'slots.$.stagedTargets': slotData.stagedTargets,
                    'slots.$.stopLossPrice': slotData.stopLossPrice,
                    'slots.$.trailingStopPct': slotData.trailingStopPct,
                    'slots.$.maxDrawdownPct': slotData.maxDrawdownPct,
                    'slots.$.sector': slotData.sector,
                    'slots.$.industry': slotData.industry,
                },
            }
        );
    } else {
        await PositionPlan.findOneAndUpdate(
            { userId },
            {
                $push: {
                    slots: {
                        ...slotData,
                        addedAt: new Date(),
                    },
                },
            },
            { upsert: true }
        );
    }

    revalidatePath('/portfolio');
    const plan = await PositionPlan.findOne({ userId }).lean();
    return serialize(plan);
}

export async function updateTierTargets(userId: string, tierTargets: TierTargets) {
    await connectToDatabase();

    // Validate sum = 100
    const total = tierTargets.core + tierTargets.satellite + tierTargets.speculative;
    if (Math.abs(total - 100) > 0.5) {
        throw new Error(`Tier targets must sum to 100% (currently ${total}%)`);
    }

    await PositionPlan.findOneAndUpdate(
        { userId },
        { $set: { tierTargets } },
        { upsert: true }
    );

    revalidatePath('/portfolio');
    const plan = await PositionPlan.findOne({ userId }).lean();
    return serialize(plan);
}

export async function updateTierMaxSlots(userId: string, tierMaxSlots: TierMaxSlots) {
    await connectToDatabase();

    // Enforce total across all tiers ≤ 12
    const total = tierMaxSlots.core + tierMaxSlots.satellite + tierMaxSlots.speculative;
    if (total > MAX_TOTAL_SLOTS) {
        throw new Error(`Total max slots (${total}) cannot exceed ${MAX_TOTAL_SLOTS}`);
    }

    await PositionPlan.findOneAndUpdate(
        { userId },
        { $set: { tierMaxSlots } },
        { upsert: true }
    );

    revalidatePath('/portfolio');
    const plan = await PositionPlan.findOne({ userId }).lean();
    return serialize(plan);
}

/** Fetch sector + industry from Yahoo Finance for a symbol */
export async function fetchSymbolSector(symbol: string): Promise<{ sector: string; industry: string }> {
    try {
        const result = await getYahooSectorIndustry(symbol);
        return result ?? { sector: '', industry: '' };
    } catch {
        return { sector: '', industry: '' };
    }
}

/** Bulk-fetch sectors for multiple symbols and auto-tag slots that have no topics, plus populate sector/industry */
export async function autoTagAllSlots(userId: string) {
    await connectToDatabase();
    const plan = await PositionPlan.findOne({ userId });
    if (!plan || !plan.slots.length) return serialize(plan);

    let changed = false;
    for (const slot of plan.slots) {
        try {
            const result = await getYahooSectorIndustry(slot.symbol);
            if (result) {
                // Populate sector/industry fields
                if (!slot.sector && result.sector) {
                    slot.sector = result.sector;
                    changed = true;
                }
                if (!slot.industry && result.industry) {
                    slot.industry = result.industry;
                    changed = true;
                }

                // Auto-tag slots with no topics
                if (!slot.topics || slot.topics.length === 0) {
                    const tags: string[] = [];
                    if (result.sector) tags.push(result.sector);
                    if (result.industry && result.industry !== result.sector) tags.push(result.industry);
                    if (tags.length > 0) {
                        slot.topics = tags;
                        changed = true;
                    }
                }
            }
        } catch {
            // skip failed lookups
        }
    }

    if (changed) {
        await plan.save();
        revalidatePath('/portfolio');
    }

    return serialize(plan.toObject());
}

/**
 * Comprehensive initialization: auto-classify sectors, set default stop losses,
 * and populate cost basis from position data.
 * Stop loss defaults: Core -8%, Satellite -12%, Speculative -18% from current price.
 */
export async function initializeAllSlotDefaults(
    userId: string,
    positions: PositionWithPriceData[]
) {
    await connectToDatabase();
    const plan = await PositionPlan.findOne({ userId });
    if (!plan || !plan.slots.length) return serialize(plan);

    const STOP_LOSS_PCT: Record<string, number> = {
        core: 8,
        satellite: 12,
        speculative: 18,
    };

    let changed = false;
    for (const slot of plan.slots) {
        const pos = positions.find(p => p.symbol === slot.symbol);

        // 1. Auto-fetch sector/industry
        try {
            const result = await getYahooSectorIndustry(slot.symbol);
            if (result) {
                if (!slot.sector && result.sector) {
                    slot.sector = result.sector;
                    changed = true;
                }
                if (!slot.industry && result.industry) {
                    slot.industry = result.industry;
                    changed = true;
                }
                if (!slot.topics || slot.topics.length === 0) {
                    const tags: string[] = [];
                    if (result.sector) tags.push(result.sector);
                    if (result.industry && result.industry !== result.sector) tags.push(result.industry);
                    if (tags.length > 0) {
                        slot.topics = tags;
                        changed = true;
                    }
                }
            }
        } catch { /* skip */ }

        // 2. Set default stop loss if not already set and position exists
        if (!slot.stopLossPrice && pos && pos.currentPrice > 0) {
            const pct = STOP_LOSS_PCT[slot.tier] || 12;
            slot.stopLossPrice = Math.round(pos.currentPrice * (1 - pct / 100) * 100) / 100;
            slot.maxDrawdownPct = slot.maxDrawdownPct || plan.maxDrawdownPctDefault || 2;
            changed = true;
        }

        // 3. Populate cost basis and avg entry price from position data
        if (pos) {
            if (!slot.costBasis && pos.costBasis > 0) {
                slot.costBasis = pos.costBasis;
                changed = true;
            }
            if (!slot.avgEntryPrice && pos.avgCostPerShare > 0) {
                slot.avgEntryPrice = pos.avgCostPerShare;
                changed = true;
            }
        }
    }

    if (changed) {
        await plan.save();

        // Sync alerts for all slots that now have stop losses or targets
        for (const slot of plan.slots) {
            if (slot.stopLossPrice || (slot.stagedTargets && slot.stagedTargets.length > 0)) {
                try {
                    await syncPositionPlanAlerts(userId, slot.symbol);
                } catch { /* skip */ }
            }
        }

        revalidatePath('/portfolio');
    }

    return serialize(plan.toObject());
}

export async function removePositionPlanSlot(userId: string, symbol: string) {
    await connectToDatabase();
    const upperSymbol = symbol.toUpperCase();

    await PositionPlan.findOneAndUpdate(
        { userId },
        { $pull: { slots: { symbol: upperSymbol } } }
    );

    // Clean up position_plan alerts for this symbol
    await Alert.deleteMany({ userId, symbol: upperSymbol, source: 'position_plan' });

    revalidatePath('/portfolio');
    const plan = await PositionPlan.findOne({ userId }).lean();
    return serialize(plan);
}

// ---------- Cash Management ----------

export async function setCashBalance(userId: string, balance: number) {
    await connectToDatabase();

    // Ensure defaults are applied on upsert
    await PositionPlan.findOneAndUpdate(
        { userId },
        {
            $set: { cashBalance: balance },
            $setOnInsert: {
                slots: [],
                tierTargets: { core: 70, satellite: 25, speculative: 5 },
                tierMaxSlots: { core: 3, satellite: 6, speculative: 3 },
                cashTransactions: [],
                maxDrawdownPctDefault: 2,
            },
        },
        { upsert: true, new: true }
    );

    revalidatePath('/portfolio');
    const plan = await PositionPlan.findOne({ userId }).lean();
    return serialize(plan);
}

export async function recordCashTransaction(
    userId: string,
    transaction: {
        type: CashTransactionType;
        amount: number;
        description: string;
        relatedSymbol?: string;
        relatedTradeId?: string;
        date?: string;
    }
) {
    await connectToDatabase();

    const txn = {
        type: transaction.type,
        amount: transaction.amount,
        description: transaction.description,
        relatedSymbol: transaction.relatedSymbol,
        relatedTradeId: transaction.relatedTradeId,
        date: transaction.date ? new Date(transaction.date) : new Date(),
    };

    // Calculate balance change
    let balanceChange = 0;
    if (['DEPOSIT', 'TRADE_SELL', 'OPTION_PREMIUM', 'DIVIDEND'].includes(transaction.type)) {
        balanceChange = Math.abs(transaction.amount);
    } else {
        // WITHDRAWAL, TRADE_BUY
        balanceChange = -Math.abs(transaction.amount);
    }

    await PositionPlan.findOneAndUpdate(
        { userId },
        {
            $push: { cashTransactions: txn },
            $inc: { cashBalance: balanceChange },
            $setOnInsert: {
                slots: [],
                tierTargets: { core: 70, satellite: 25, speculative: 5 },
                tierMaxSlots: { core: 3, satellite: 6, speculative: 3 },
                maxDrawdownPctDefault: 2,
            },
        },
        { upsert: true, new: true }
    );

    revalidatePath('/portfolio');
    const plan = await PositionPlan.findOne({ userId }).lean();
    return serialize(plan);
}

export async function adjustCashForTrade(
    userId: string,
    params: {
        symbol: string;
        type: TradeType;
        totalAmount: number;
        tradeId?: string;
        optionAction?: OptionAction;
    }
) {
    const { symbol, type, totalAmount, tradeId, optionAction } = params;

    let txnType: CashTransactionType;
    let description: string;

    if (type === 'BUY') {
        txnType = 'TRADE_BUY';
        description = `Buy ${symbol}`;
    } else if (type === 'SELL') {
        txnType = 'TRADE_SELL';
        description = `Sell ${symbol}`;
    } else if (type === 'OPTION_PREMIUM') {
        txnType = 'OPTION_PREMIUM';
        if (optionAction === 'BUY_TO_OPEN' || optionAction === 'BUY_TO_CLOSE') {
            // Buying options costs money
            description = `${optionAction} ${symbol}`;
            return recordCashTransaction(userId, {
                type: 'TRADE_BUY',
                amount: totalAmount,
                description,
                relatedSymbol: symbol,
                relatedTradeId: tradeId,
            });
        } else {
            // Selling options receives premium
            description = `${optionAction} ${symbol}`;
            return recordCashTransaction(userId, {
                type: 'TRADE_SELL',
                amount: totalAmount,
                description,
                relatedSymbol: symbol,
                relatedTradeId: tradeId,
            });
        }
    } else if (type === 'DIVIDEND') {
        txnType = 'DIVIDEND';
        description = `Dividend from ${symbol}`;
    } else {
        return;
    }

    return recordCashTransaction(userId, {
        type: txnType,
        amount: totalAmount,
        description,
        relatedSymbol: symbol,
        relatedTradeId: tradeId,
    });
}

// ---------- Exit Plan ----------

export async function updateSlotTargets(
    userId: string,
    symbol: string,
    targets: {
        stagedTargets: StagedTarget[];
        stopLossPrice?: number;
        trailingStopPct?: number;
    }
) {
    await connectToDatabase();
    const upperSymbol = symbol.toUpperCase();

    await PositionPlan.findOneAndUpdate(
        { userId, 'slots.symbol': upperSymbol },
        {
            $set: {
                'slots.$.stagedTargets': targets.stagedTargets,
                'slots.$.stopLossPrice': targets.stopLossPrice,
                'slots.$.trailingStopPct': targets.trailingStopPct,
            },
        }
    );

    // Sync alerts
    await syncPositionPlanAlerts(userId, upperSymbol);

    revalidatePath('/portfolio');
    const plan = await PositionPlan.findOne({ userId }).lean();
    return serialize(plan);
}

export async function syncPositionPlanAlerts(userId: string, symbol: string) {
    await connectToDatabase();
    const upperSymbol = symbol.toUpperCase();

    // Delete old position_plan alerts for this symbol
    await Alert.deleteMany({ userId, symbol: upperSymbol, source: 'position_plan' });

    const plan = await PositionPlan.findOne({ userId }).lean();
    const slot = plan?.slots?.find((s: any) => s.symbol === upperSymbol);
    if (!slot) return;

    const alertsToCreate: any[] = [];

    // Create ABOVE alerts for unreached staged targets
    for (const target of (slot.stagedTargets || [])) {
        if (!target.reached) {
            alertsToCreate.push({
                userId,
                symbol: upperSymbol,
                targetPrice: target.price,
                condition: 'ABOVE',
                source: 'position_plan',
                active: true,
                triggered: false,
            });
        }
    }

    // Create BELOW alert for stop loss
    if (slot.stopLossPrice) {
        alertsToCreate.push({
            userId,
            symbol: upperSymbol,
            targetPrice: slot.stopLossPrice,
            condition: 'BELOW',
            source: 'position_plan',
            active: true,
            triggered: false,
        });
    }

    if (alertsToCreate.length > 0) {
        await Alert.insertMany(alertsToCreate);
    }
}

// ---------- Rules Audit ----------

export async function runRulesAudit(
    userId: string,
    positions: PositionWithPriceData[],
    trades: TradeData[]
): Promise<RulesAuditResult> {
    await connectToDatabase();

    const plan = await PositionPlan.findOne({ userId }).lean();
    if (!plan) {
        return {
            violations: [],
            structureValid: true,
            totalScore: 100,
            timestamp: new Date().toISOString(),
        };
    }

    const planData = serialize(plan) as unknown as PositionPlanData;
    const totalAccountValue = positions.reduce((sum, p) => sum + p.marketValue, 0) + (planData.cashBalance || 0);

    const input: RulesEngineInput = {
        plan: planData,
        positions,
        totalAccountValue,
        trades,
    };

    const result = auditPositionPlan(input);

    // Persist audit result so it survives page reloads
    await PositionPlan.findOneAndUpdate(
        { userId },
        { $set: { lastAuditResult: result } }
    );

    revalidatePath('/portfolio');
    return result;
}

// ---------- Sector Heat Data ----------

const SECTOR_ETFS = [
    { sector: 'Technology', etf: 'XLK' },
    { sector: 'Financial', etf: 'XLF' },
    { sector: 'Energy', etf: 'XLE' },
    { sector: 'Healthcare', etf: 'XLV' },
    { sector: 'Industrials', etf: 'XLI' },
    { sector: 'Consumer Cyclical', etf: 'XLY' },
    { sector: 'Consumer Defensive', etf: 'XLP' },
    { sector: 'Utilities', etf: 'XLU' },
    { sector: 'Real Estate', etf: 'XLRE' },
    { sector: 'Communication Services', etf: 'XLC' },
    { sector: 'Basic Materials', etf: 'XLB' },
];

export async function getSectorHeatData(
    portfolioSlots?: PositionPlanSlot[],
    positions?: PositionWithPriceData[]
): Promise<SectorHeatData[]> {
    // Compute your allocation per sector
    const totalValue = positions?.reduce((sum, p) => sum + p.marketValue, 0) || 0;
    const sectorAllocation = new Map<string, number>();
    if (portfolioSlots && positions) {
        for (const slot of portfolioSlots) {
            if (!slot.sector) continue;
            const pos = positions.find(p => p.symbol === slot.symbol);
            if (!pos) continue;
            const current = sectorAllocation.get(slot.sector) || 0;
            sectorAllocation.set(slot.sector, current + (totalValue > 0 ? (pos.marketValue / totalValue) * 100 : 0));
        }
    }

    // Fetch sector ETF performance data
    const results: SectorHeatData[] = [];
    const quotePromises = SECTOR_ETFS.map(async ({ sector, etf }) => {
        try {
            const quote = await getQuote(etf);
            if (!quote) return null;

            const price = quote.c || 0;
            const prevClose = quote.pc || price;
            const perf1D = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

            // For weekly/monthly we approximate from daily change
            // More accurate data would need historical prices
            return {
                sector,
                etfSymbol: etf,
                performance1D: perf1D,
                performance1W: perf1D * 2.5, // rough approximation
                performance1M: perf1D * 8, // rough approximation
                momentum: perf1D, // simplified
                yourAllocationPct: sectorAllocation.get(sector) || 0,
            } as SectorHeatData;
        } catch {
            return {
                sector,
                etfSymbol: etf,
                performance1D: 0,
                performance1W: 0,
                performance1M: 0,
                momentum: 0,
                yourAllocationPct: sectorAllocation.get(sector) || 0,
            } as SectorHeatData;
        }
    });

    const settled = await Promise.all(quotePromises);
    for (const item of settled) {
        if (item) results.push(item);
    }

    return results;
}
