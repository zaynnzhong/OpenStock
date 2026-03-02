/**
 * Black-Scholes Options Pricing Calculator
 * Computes theoretical option prices and Greeks (Delta, Gamma, Theta, Vega, Rho)
 */

export interface BlackScholesParams {
    stockPrice: number;
    strikePrice: number;
    timeToExpiry: number; // in years
    riskFreeRate: number; // as decimal (e.g. 0.0425 for 4.25%)
    volatility: number;   // as decimal (e.g. 0.30 for 30%)
    dividendYield?: number; // as decimal (e.g. 0.02 for 2%) — Merton model
    optionType: 'call' | 'put';
}

export interface BlackScholesResult {
    price: number;
    delta: number;
    gamma: number;
    theta: number; // per day
    vega: number;  // per 1% change in volatility
    rho: number;   // per 1% change in rate
}

/** Standard normal cumulative distribution function */
export function normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

    return 0.5 * (1.0 + sign * y);
}

/** Standard normal probability density function */
export function normalPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Convert calendar days to years (365-day basis) */
export function daysToYears(days: number): number {
    return days / 365;
}

export function blackScholes(params: BlackScholesParams): BlackScholesResult {
    const { stockPrice: S, strikePrice: K, timeToExpiry: T, riskFreeRate: r, volatility: sigma, dividendYield: q = 0, optionType } = params;

    // Guard against expired or zero-time options
    if (T <= 0) {
        const intrinsic = optionType === 'call'
            ? Math.max(S - K, 0)
            : Math.max(K - S, 0);
        return { price: intrinsic, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    }

    const sqrtT = Math.sqrt(T);
    // Merton model: use (r - q) in d1 to account for continuous dividend yield
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;

    const Nd1 = normalCDF(d1);
    const Nd2 = normalCDF(d2);
    const NNd1 = normalCDF(-d1);
    const NNd2 = normalCDF(-d2);
    const nd1 = normalPDF(d1);
    const discount = Math.exp(-r * T);
    const divDiscount = Math.exp(-q * T);

    let price: number;
    let delta: number;
    let rho: number;

    if (optionType === 'call') {
        price = S * divDiscount * Nd1 - K * discount * Nd2;
        delta = divDiscount * Nd1;
        rho = K * T * discount * Nd2 / 100;
    } else {
        price = K * discount * NNd2 - S * divDiscount * NNd1;
        delta = divDiscount * (Nd1 - 1);
        rho = -K * T * discount * NNd2 / 100;
    }

    // Greeks common to both call and put
    const gamma = divDiscount * nd1 / (S * sigma * sqrtT);
    const vega = S * divDiscount * nd1 * sqrtT / 100;
    const theta = optionType === 'call'
        ? (-(S * divDiscount * nd1 * sigma) / (2 * sqrtT) - r * K * discount * Nd2 + q * S * divDiscount * Nd1) / 365
        : (-(S * divDiscount * nd1 * sigma) / (2 * sqrtT) + r * K * discount * NNd2 - q * S * divDiscount * NNd1) / 365;

    return { price, delta, gamma, theta, vega, rho };
}
