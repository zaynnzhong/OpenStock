'use server';

import { getGeminiModel } from '@/lib/gemini';
import { getOHLCV } from '@/lib/actions/finnhub.actions';
import { getQuote, getOptionsChain } from '@/lib/actions/finnhub.actions';
import { getPortfolioSummary } from '@/lib/actions/portfolio.actions';
import { getTradesWithPL, getOpenOptionPrices } from '@/lib/actions/trade.actions';
import { blackScholes, daysToYears } from '@/lib/portfolio/options-pricing';
import type { BlackScholesResult } from '@/lib/portfolio/options-pricing';
import {
    buildDirectionPrompt,
    buildEntryPrompt,
    buildOptionAnalysisPrompt,
    buildPositionAnalysisPrompt,
    buildPortfolioAnalysisPrompt,
} from '@/lib/prompts/trading-analysis';

export type AnalysisResult = {
    content: string;
    sections?: PortfolioReviewJSON;
    model: string;
    timestamp: number;
    error?: string;
};

const MODEL_ID = 'gemini-2.5-pro';

async function callGemini(prompt: string): Promise<AnalysisResult> {
    try {
        const model = getGeminiModel(MODEL_ID);
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return { content: text, model: MODEL_ID, timestamp: Date.now() };
    } catch (e: any) {
        console.error('Gemini API error:', e);
        return {
            content: '',
            model: MODEL_ID,
            timestamp: Date.now(),
            error: e?.message || 'Gemini API call failed',
        };
    }
}

export async function analyzeDirection(symbol: string): Promise<AnalysisResult> {
    const [daily, weekly, monthly, quote] = await Promise.all([
        getOHLCV(symbol, 'D', 60),
        getOHLCV(symbol, 'W', 52),
        getOHLCV(symbol, 'M', 24),
        getQuote(symbol),
    ]);

    const currentPrice = quote?.c || daily[daily.length - 1]?.close || 0;
    const prompt = buildDirectionPrompt(symbol, daily, weekly, monthly, currentPrice);
    return callGemini(prompt);
}

export async function analyzeEntry(symbol: string): Promise<AnalysisResult> {
    const [fiveMin, daily, monthly, quote] = await Promise.all([
        getOHLCV(symbol, '5', 100),
        getOHLCV(symbol, 'D', 30),
        getOHLCV(symbol, 'M', 12),
        getQuote(symbol),
    ]);

    const currentPrice = quote?.c || fiveMin[fiveMin.length - 1]?.close || 0;
    const prompt = buildEntryPrompt(symbol, fiveMin, daily, monthly, currentPrice);
    return callGemini(prompt);
}

export async function analyzeOptions(symbol: string, userId?: string): Promise<AnalysisResult> {
    const [chain, quote] = await Promise.all([
        getOptionsChain(symbol),
        getQuote(symbol),
    ]);

    if (!chain) {
        return { content: '', model: MODEL_ID, timestamp: Date.now(), error: 'Options chain not available for ' + symbol };
    }

    const currentPrice = quote?.c || chain.stockPrice || 0;
    const riskFreeRate = 0.0425;

    // Compute BS Greeks for each contract
    const greeksMap = new Map<string, BlackScholesResult>();
    const firstExp = chain.expirationDates[0];
    const daysToExp = firstExp ? Math.max(1, (firstExp - Date.now() / 1000) / 86400) : 30;
    const T = daysToYears(daysToExp);

    for (const c of chain.calls) {
        const iv = c.impliedVolatility > 0 ? c.impliedVolatility : 0.3;
        const g = blackScholes({ stockPrice: currentPrice, strikePrice: c.strike, timeToExpiry: T, riskFreeRate, volatility: iv, optionType: 'call' });
        greeksMap.set(`CALL-${c.strike}`, g);
    }
    for (const p of chain.puts) {
        const iv = p.impliedVolatility > 0 ? p.impliedVolatility : 0.3;
        const g = blackScholes({ stockPrice: currentPrice, strikePrice: p.strike, timeToExpiry: T, riskFreeRate, volatility: iv, optionType: 'put' });
        greeksMap.set(`PUT-${p.strike}`, g);
    }

    // Optionally get position if userId provided
    let position: { shares: number; avgCost: number } | undefined;
    if (userId) {
        try {
            const summary = await getPortfolioSummary(userId);
            const pos = summary?.positions.find(p => p.symbol === symbol.toUpperCase());
            if (pos && pos.shares > 0) {
                position = { shares: pos.shares, avgCost: pos.avgCostPerShare };
            }
        } catch { /* ignore */ }
    }

    const prompt = buildOptionAnalysisPrompt(symbol, currentPrice, chain, greeksMap, position);
    return callGemini(prompt);
}

export async function analyzePosition(symbol: string, userId: string): Promise<AnalysisResult> {
    const [summary, tradesResult, optionPrices, ohlcv] = await Promise.all([
        getPortfolioSummary(userId),
        getTradesWithPL(userId, { symbol, limit: 500, sort: 'asc' }),
        getOpenOptionPrices(userId, symbol),
        getOHLCV(symbol, 'D', 60),
    ]);

    const position = summary?.positions.find(p => p.symbol === symbol.toUpperCase());
    if (!position) {
        return { content: '', model: MODEL_ID, timestamp: Date.now(), error: `No position found for ${symbol}` };
    }

    const prompt = buildPositionAnalysisPrompt(symbol, position, tradesResult.trades, optionPrices, ohlcv);
    return callGemini(prompt);
}

export async function analyzePortfolio(userId: string): Promise<AnalysisResult> {
    const [summary, optionPrices, tradesResult] = await Promise.all([
        getPortfolioSummary(userId),
        getOpenOptionPrices(userId),
        getTradesWithPL(userId, { limit: 500, sort: 'asc' }),
    ]);

    if (!summary || summary.positions.length === 0) {
        return { content: '', model: MODEL_ID, timestamp: Date.now(), error: 'No portfolio data found' };
    }

    const prompt = buildPortfolioAnalysisPrompt(summary, optionPrices, tradesResult.trades);
    const result = await callGemini(prompt);

    if (!result.error && result.content) {
        try {
            // Strip markdown code fences if Gemini wraps the JSON
            let raw = result.content.trim();
            if (raw.startsWith('```')) {
                raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
            }
            const parsed = JSON.parse(raw) as PortfolioReviewJSON;
            // Basic shape validation
            if (parsed.structuralAudit && parsed.liquidationList && parsed.deepDive && parsed.executionOrders) {
                result.sections = parsed;
            }
        } catch {
            // JSON parse failed — fall back to markdown rendering
        }
    }

    return result;
}
