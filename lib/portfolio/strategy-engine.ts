/**
 * Multi-leg Options Strategy Engine
 * Computes combined P/L, max profit/loss, breakevens, aggregated Greeks, and payoff curves.
 */

import { blackScholes, daysToYears } from './options-pricing';

// --- Interfaces ---

export interface StrategyLeg {
    id: string;
    side: 'buy' | 'sell';
    optionType: 'call' | 'put';
    strike: number;
    quantity: number;
    premium: number;
    iv: number; // as decimal, e.g. 0.30
}

export interface StrategyGreeks {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
}

export interface PayoffPoint {
    stockPrice: number;
    pnl: number;
}

export interface StrategyAnalysis {
    legs: StrategyLeg[];
    netDebitCredit: number;
    maxProfit: number;
    maxLoss: number;
    maxProfitUnlimited: boolean;
    maxLossUnlimited: boolean;
    breakevens: number[];
    greeks: StrategyGreeks;
    payoffCurve: PayoffPoint[];
}

// --- Preset definitions ---

export type StrikeOffset = 'atm' | 'otm1' | 'otm2' | 'itm1' | 'itm2';

export interface PresetLegTemplate {
    side: 'buy' | 'sell';
    optionType: 'call' | 'put';
    strikeOffset: StrikeOffset;
    quantity: number;
}

export interface StrategyPreset {
    name: string;
    legs: PresetLegTemplate[];
}

export const STRATEGY_PRESETS: Record<string, StrategyPreset> = {
    'Bull Call Spread': {
        name: 'Bull Call Spread',
        legs: [
            { side: 'buy', optionType: 'call', strikeOffset: 'atm', quantity: 1 },
            { side: 'sell', optionType: 'call', strikeOffset: 'otm1', quantity: 1 },
        ],
    },
    'Bear Put Spread': {
        name: 'Bear Put Spread',
        legs: [
            { side: 'buy', optionType: 'put', strikeOffset: 'atm', quantity: 1 },
            { side: 'sell', optionType: 'put', strikeOffset: 'otm1', quantity: 1 },
        ],
    },
    'Long Straddle': {
        name: 'Long Straddle',
        legs: [
            { side: 'buy', optionType: 'call', strikeOffset: 'atm', quantity: 1 },
            { side: 'buy', optionType: 'put', strikeOffset: 'atm', quantity: 1 },
        ],
    },
    'Long Strangle': {
        name: 'Long Strangle',
        legs: [
            { side: 'buy', optionType: 'call', strikeOffset: 'otm1', quantity: 1 },
            { side: 'buy', optionType: 'put', strikeOffset: 'otm1', quantity: 1 },
        ],
    },
    'Iron Condor': {
        name: 'Iron Condor',
        legs: [
            { side: 'buy', optionType: 'put', strikeOffset: 'otm2', quantity: 1 },
            { side: 'sell', optionType: 'put', strikeOffset: 'otm1', quantity: 1 },
            { side: 'sell', optionType: 'call', strikeOffset: 'otm1', quantity: 1 },
            { side: 'buy', optionType: 'call', strikeOffset: 'otm2', quantity: 1 },
        ],
    },
};

// --- Core computation functions ---

/** Compute a single leg's P/L at expiration for a given stock price (per contract, ×100 shares) */
export function computeLegPayoffAtExpiry(leg: StrategyLeg, stockPrice: number): number {
    const intrinsic =
        leg.optionType === 'call'
            ? Math.max(stockPrice - leg.strike, 0)
            : Math.max(leg.strike - stockPrice, 0);

    const direction = leg.side === 'buy' ? 1 : -1;
    return direction * (intrinsic - leg.premium) * leg.quantity * 100;
}

/** Sum all legs' payoff at expiration for a given stock price */
export function computeStrategyPayoffAtExpiry(legs: StrategyLeg[], stockPrice: number): number {
    return legs.reduce((sum, leg) => sum + computeLegPayoffAtExpiry(leg, stockPrice), 0);
}

/** Generate a payoff curve over a range of stock prices */
export function generatePayoffCurve(
    legs: StrategyLeg[],
    currentStockPrice: number,
    numPoints: number = 200
): PayoffPoint[] {
    const minPrice = currentStockPrice * 0.5;
    const maxPrice = currentStockPrice * 1.5;
    const step = (maxPrice - minPrice) / (numPoints - 1);

    const points: PayoffPoint[] = [];
    for (let i = 0; i < numPoints; i++) {
        const sp = minPrice + step * i;
        points.push({ stockPrice: sp, pnl: computeStrategyPayoffAtExpiry(legs, sp) });
    }
    return points;
}

/** Compute net debit/credit: negative = net debit (you pay), positive = net credit (you receive) */
export function computeNetDebitCredit(legs: StrategyLeg[]): number {
    return legs.reduce((sum, leg) => {
        const direction = leg.side === 'buy' ? -1 : 1;
        return sum + direction * leg.premium * leg.quantity * 100;
    }, 0);
}

/** Scan the payoff curve for max profit and max loss, detecting unlimited risk at edges */
export function computeMaxProfitLoss(payoffCurve: PayoffPoint[]): {
    maxProfit: number;
    maxLoss: number;
    maxProfitUnlimited: boolean;
    maxLossUnlimited: boolean;
} {
    if (payoffCurve.length === 0) {
        return { maxProfit: 0, maxLoss: 0, maxProfitUnlimited: false, maxLossUnlimited: false };
    }

    let maxProfit = -Infinity;
    let maxLoss = Infinity;

    for (const p of payoffCurve) {
        if (p.pnl > maxProfit) maxProfit = p.pnl;
        if (p.pnl < maxLoss) maxLoss = p.pnl;
    }

    // Check if P/L is still increasing/decreasing at the edges (slope check)
    const n = payoffCurve.length;
    const leftSlope = payoffCurve[1].pnl - payoffCurve[0].pnl;
    const rightSlope = payoffCurve[n - 1].pnl - payoffCurve[n - 2].pnl;

    // If the max profit is at an edge and slope is moving away from zero, it's unlimited
    const maxProfitUnlimited =
        (rightSlope > 0.01 && payoffCurve[n - 1].pnl === maxProfit) ||
        (leftSlope < -0.01 && payoffCurve[0].pnl === maxProfit);

    const maxLossUnlimited =
        (rightSlope < -0.01 && payoffCurve[n - 1].pnl === maxLoss) ||
        (leftSlope > 0.01 && payoffCurve[0].pnl === maxLoss);

    return { maxProfit, maxLoss, maxProfitUnlimited, maxLossUnlimited };
}

/** Find breakeven prices via linear interpolation where P/L crosses zero */
export function computeBreakevens(payoffCurve: PayoffPoint[]): number[] {
    const breakevens: number[] = [];
    for (let i = 1; i < payoffCurve.length; i++) {
        const prev = payoffCurve[i - 1];
        const curr = payoffCurve[i];

        if ((prev.pnl <= 0 && curr.pnl >= 0) || (prev.pnl >= 0 && curr.pnl <= 0)) {
            // Linear interpolation
            const ratio = Math.abs(prev.pnl) / (Math.abs(prev.pnl) + Math.abs(curr.pnl));
            const breakeven = prev.stockPrice + ratio * (curr.stockPrice - prev.stockPrice);
            breakevens.push(Math.round(breakeven * 100) / 100);
        }
    }
    return breakevens;
}

/** Compute aggregated Greeks across all legs using Black-Scholes */
export function computeStrategyGreeks(
    legs: StrategyLeg[],
    stockPrice: number,
    T: number,
    r: number
): StrategyGreeks {
    const greeks: StrategyGreeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };

    for (const leg of legs) {
        if (leg.iv <= 0 || T <= 0) continue;

        const result = blackScholes({
            stockPrice,
            strikePrice: leg.strike,
            timeToExpiry: T,
            riskFreeRate: r,
            volatility: leg.iv,
            optionType: leg.optionType,
        });

        const direction = leg.side === 'buy' ? 1 : -1;
        const multiplier = direction * leg.quantity * 100;

        greeks.delta += result.delta * multiplier;
        greeks.gamma += result.gamma * multiplier;
        greeks.theta += result.theta * multiplier;
        greeks.vega += result.vega * multiplier;
        greeks.rho += result.rho * multiplier;
    }

    return greeks;
}

/** Resolve a strike offset (atm, otm1, etc.) to an actual strike from available strikes */
export function resolveStrikeOffset(
    offset: StrikeOffset,
    optionType: 'call' | 'put',
    stockPrice: number,
    strikes: number[]
): number {
    if (strikes.length === 0) return stockPrice;

    // Sort strikes ascending
    const sorted = [...strikes].sort((a, b) => a - b);

    // Find ATM: closest strike to current stock price
    let atmIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < sorted.length; i++) {
        const dist = Math.abs(sorted[i] - stockPrice);
        if (dist < minDist) {
            minDist = dist;
            atmIdx = i;
        }
    }

    if (offset === 'atm') return sorted[atmIdx];

    // For OTM: calls go higher, puts go lower
    // For ITM: calls go lower, puts go higher
    const step = (() => {
        switch (offset) {
            case 'otm1':
                return optionType === 'call' ? 1 : -1;
            case 'otm2':
                return optionType === 'call' ? 2 : -2;
            case 'itm1':
                return optionType === 'call' ? -1 : 1;
            case 'itm2':
                return optionType === 'call' ? -2 : 2;
        }
    })();

    const targetIdx = Math.max(0, Math.min(sorted.length - 1, atmIdx + step));
    return sorted[targetIdx];
}

/** Top-level convenience: analyze a full strategy */
export function analyzeStrategy(
    legs: StrategyLeg[],
    stockPrice: number,
    T: number,
    r: number
): StrategyAnalysis {
    if (legs.length === 0) {
        return {
            legs,
            netDebitCredit: 0,
            maxProfit: 0,
            maxLoss: 0,
            maxProfitUnlimited: false,
            maxLossUnlimited: false,
            breakevens: [],
            greeks: { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
            payoffCurve: [],
        };
    }

    const payoffCurve = generatePayoffCurve(legs, stockPrice);
    const netDebitCredit = computeNetDebitCredit(legs);
    const { maxProfit, maxLoss, maxProfitUnlimited, maxLossUnlimited } =
        computeMaxProfitLoss(payoffCurve);
    const breakevens = computeBreakevens(payoffCurve);
    const greeks = computeStrategyGreeks(legs, stockPrice, T, r);

    return {
        legs,
        netDebitCredit,
        maxProfit,
        maxLoss,
        maxProfitUnlimited,
        maxLossUnlimited,
        breakevens,
        greeks,
        payoffCurve,
    };
}
