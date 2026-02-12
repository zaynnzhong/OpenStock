'use server';

import { connectToDatabase } from '@/database/mongoose';
import { PortfolioSettings, type CostBasisMethod } from '@/database/models/portfolio-settings.model';

function serialize<T>(doc: T): T {
    return JSON.parse(JSON.stringify(doc));
}

export async function getPortfolioSettings(userId: string) {
    await connectToDatabase();

    let settings = await PortfolioSettings.findOne({ userId }).lean();

    if (!settings) {
        const created = await PortfolioSettings.create({
            userId,
            defaultMethod: 'AVERAGE',
            symbolOverrides: [],
        });
        return serialize(created.toObject());
    }

    return serialize(settings);
}

export async function updateDefaultCostBasisMethod(userId: string, method: CostBasisMethod) {
    await connectToDatabase();

    const settings = await PortfolioSettings.findOneAndUpdate(
        { userId },
        { defaultMethod: method },
        { upsert: true, new: true }
    ).lean();

    return serialize(settings);
}

export async function updateSymbolCostBasisOverride(
    userId: string,
    symbol: string,
    method: CostBasisMethod | null
) {
    await connectToDatabase();

    const upperSymbol = symbol.toUpperCase();

    if (method === null) {
        // Remove override
        await PortfolioSettings.findOneAndUpdate(
            { userId },
            { $pull: { symbolOverrides: { symbol: upperSymbol } } },
            { upsert: true }
        );
    } else {
        // Check if override exists
        const existing = await PortfolioSettings.findOne({
            userId,
            'symbolOverrides.symbol': upperSymbol,
        });

        if (existing) {
            await PortfolioSettings.findOneAndUpdate(
                { userId, 'symbolOverrides.symbol': upperSymbol },
                { $set: { 'symbolOverrides.$.method': method } }
            );
        } else {
            await PortfolioSettings.findOneAndUpdate(
                { userId },
                { $push: { symbolOverrides: { symbol: upperSymbol, method } } },
                { upsert: true }
            );
        }
    }

    const settings = await PortfolioSettings.findOne({ userId }).lean();
    return serialize(settings);
}
