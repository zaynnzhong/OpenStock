"use client";

import { useState, useMemo, useCallback } from "react";
import { blackScholes, daysToYears } from "@/lib/portfolio/options-pricing";
import {
    getQuote,
    getOptionsChain,
    getSMA,
    type OptionContract,
    type OptionsChainData,
} from "@/lib/actions/finnhub.actions";

const inputClass =
    "w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30";

interface Strategy {
    name: string;
    legs: {
        side: "buy" | "sell";
        optionType: "call" | "put";
        strike: number;
        premium: number;
        iv: number;
    }[];
}

interface HorizonResult {
    label: string;
    daysLeft: number;
    value: number;
    returnPct: number;
}

interface DirectionResults {
    strategies: Strategy[];
    results: { strategy: Strategy; cost: number; horizons: HorizonResult[] }[];
    bestPicks: { label: string; strategy: string; returnPct: number }[];
}

interface SMAData {
    price: number;
    smaShort: number;
    smaLong: number;
    shortPeriod: number;
    longPeriod: number;
}

// ── Shared sub-component for a direction's table + best picks ──
function DirectionSection({
    direction,
    data,
    horizons,
    daysToExpiry,
}: {
    direction: "bullish" | "bearish";
    data: DirectionResults;
    horizons: { label: string; daysFromNow: number }[];
    daysToExpiry: number;
}) {
    const isBull = direction === "bullish";
    const { results, bestPicks } = data;
    if (results.length === 0) return null;

    return (
        <div className="space-y-4">
            <h3
                className={`text-sm font-semibold uppercase tracking-wider ${
                    isBull ? "text-green-400" : "text-red-400"
                }`}
            >
                {isBull ? "▲ Bullish" : "▼ Bearish"} Strategies
            </h3>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="text-left text-xs text-gray-400 uppercase tracking-wider py-2 pr-4 whitespace-nowrap">
                                Strategy
                            </th>
                            <th className="text-right text-xs text-gray-400 uppercase tracking-wider py-2 px-3 whitespace-nowrap">
                                Cost
                            </th>
                            {horizons.map((h, i) => (
                                <th
                                    key={i}
                                    className="text-right text-xs text-gray-400 uppercase tracking-wider py-2 px-3 whitespace-nowrap"
                                >
                                    <div>{h.label}</div>
                                    <div className="text-[10px] text-gray-600 font-normal normal-case">
                                        {daysToExpiry - h.daysFromNow > 0
                                            ? `${daysToExpiry - h.daysFromNow}d left`
                                            : "at expiry"}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((res, sIdx) => (
                            <tr
                                key={sIdx}
                                className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                            >
                                <td className="py-3 pr-4 text-white font-medium whitespace-nowrap">
                                    {res.strategy.name}
                                </td>
                                <td className="py-3 px-3 text-right whitespace-nowrap">
                                    <span className="text-gray-300">
                                        ${Math.abs(res.cost).toFixed(0)}
                                    </span>
                                </td>
                                {res.horizons.map((h, hIdx) => (
                                    <td key={hIdx} className="py-3 px-3 text-right whitespace-nowrap">
                                        <div
                                            className={`font-medium ${
                                                h.value >= 0 ? "text-green-400" : "text-red-400"
                                            }`}
                                        >
                                            {h.value >= 0 ? "+" : "-"}${Math.abs(h.value).toFixed(0)}
                                        </div>
                                        <div
                                            className={`text-[10px] ${
                                                h.returnPct >= 0 ? "text-green-600" : "text-red-600"
                                            }`}
                                        >
                                            {h.returnPct >= 0 ? "+" : ""}
                                            {h.returnPct.toFixed(1)}%
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Best Pick Summary */}
            <div
                className={`border rounded-lg p-4 ${
                    isBull
                        ? "bg-green-500/5 border-green-500/10"
                        : "bg-red-500/5 border-red-500/10"
                }`}
            >
                <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-3">
                    Best {isBull ? "Bullish" : "Bearish"} Pick by Horizon
                </h4>
                <div className="flex flex-wrap gap-3">
                    {bestPicks.map((pick, i) => (
                        <div
                            key={i}
                            className="bg-white/5 border border-white/10 rounded-md px-3 py-2"
                        >
                            <div className="text-[10px] text-gray-500">{pick.label}</div>
                            <div className="text-sm text-white font-medium">{pick.strategy}</div>
                            <div
                                className={`text-xs ${
                                    pick.returnPct >= 0 ? "text-green-400" : "text-red-400"
                                }`}
                            >
                                {pick.returnPct >= 0 ? "+" : ""}
                                {pick.returnPct.toFixed(1)}%
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Main component ──
export default function TargetPriceAnalyzer() {
    const [symbol, setSymbol] = useState("");
    const [stockPrice, setStockPrice] = useState<number>(0);
    const [chainData, setChainData] = useState<OptionsChainData | null>(null);
    const [selectedExpiration, setSelectedExpiration] = useState<number | null>(null);
    const [bullishTarget, setBullishTarget] = useState<number>(0);
    const [bearishTarget, setBearishTarget] = useState<number>(0);
    const [riskFreeRate, setRiskFreeRate] = useState("4.25");
    const [fetching, setFetching] = useState(false);
    const [chainLoading, setChainLoading] = useState(false);
    const [smaData, setSmaData] = useState<SMAData | null>(null);

    // Days to expiry
    const daysToExpiry = useMemo(() => {
        if (!selectedExpiration) return 0;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const exp = new Date(selectedExpiration * 1000);
        return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }, [selectedExpiration]);

    // Trend signal
    const trendSignal = useMemo(() => {
        if (!smaData || !stockPrice) return null;
        const { smaShort, smaLong } = smaData;
        if (stockPrice > smaShort && smaShort > smaLong)
            return { label: "Uptrend", detail: "Price > SMA20 > SMA50", color: "green" as const };
        if (stockPrice < smaShort && smaShort < smaLong)
            return { label: "Downtrend", detail: "Price < SMA20 < SMA50", color: "red" as const };
        return { label: "Mixed", detail: "No clear trend alignment", color: "yellow" as const };
    }, [smaData, stockPrice]);

    // Helpers
    const findNearest = useCallback((target: number, strikes: number[]): number => {
        if (strikes.length === 0) return target;
        return strikes.reduce((best, s) =>
            Math.abs(s - target) < Math.abs(best - target) ? s : best
        );
    }, []);

    const findContract = useCallback(
        (optionType: "call" | "put", strike: number): OptionContract | null => {
            if (!chainData) return null;
            const contracts = optionType === "call" ? chainData.calls : chainData.puts;
            return contracts.find((c) => Math.abs(c.strike - strike) < 0.01) || null;
        },
        [chainData]
    );

    const midPrice = (contract: OptionContract | null): number => {
        if (!contract) return 0;
        if (contract.bid > 0 && contract.ask > 0) return (contract.bid + contract.ask) / 2;
        return contract.lastPrice || 0;
    };

    // Auto-suggest targets from SMA data
    const suggestTargets = useCallback(
        (price: number, sma: SMAData, strikes: number[]) => {
            const momentum = Math.abs(price - sma.smaLong);
            let bullRaw = price + momentum;
            if (bullRaw < price * 1.05) bullRaw = price * 1.05;
            let bearRaw = price - momentum;
            if (bearRaw > price * 0.95) bearRaw = price * 0.95;
            if (bearRaw < 0) bearRaw = price * 0.9;

            const bull = strikes.length > 0 ? findNearest(bullRaw, strikes) : Math.round(bullRaw * 100) / 100;
            const bear = strikes.length > 0 ? findNearest(bearRaw, strikes) : Math.round(bearRaw * 100) / 100;
            return { bull, bear };
        },
        [findNearest]
    );

    // Data fetching
    const handleSymbolBlur = useCallback(async () => {
        const sym = symbol.trim().toUpperCase();
        if (!sym) return;
        setFetching(true);
        setChainLoading(true);
        try {
            const [quote, chain, sma] = await Promise.all([
                getQuote(sym),
                getOptionsChain(sym),
                getSMA(sym),
            ]);
            const price = quote?.c || 0;
            if (price) setStockPrice(price);
            if (sma) setSmaData(sma);
            if (chain) {
                setChainData(chain);
                if (chain.expirationDates.length > 0) {
                    setSelectedExpiration(chain.expirationDates[0]);
                }
                // Auto-suggest targets
                if (price && sma && chain.strikes.length > 0) {
                    const { bull, bear } = suggestTargets(price, sma, chain.strikes);
                    setBullishTarget(bull);
                    setBearishTarget(bear);
                }
            }
        } catch {
            // silently fail
        } finally {
            setFetching(false);
            setChainLoading(false);
        }
    }, [symbol, suggestTargets]);

    const handleExpirationChange = useCallback(
        async (ts: number) => {
            setSelectedExpiration(ts);
            if (!symbol.trim()) return;
            setChainLoading(true);
            try {
                const chain = await getOptionsChain(symbol.trim().toUpperCase(), ts);
                if (chain) setChainData(chain);
            } catch {
                // silently fail
            } finally {
                setChainLoading(false);
            }
        },
        [symbol]
    );

    // Time horizons
    const horizons = useMemo(() => {
        if (daysToExpiry <= 0) return [];
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const monthOffsets = [1, 3, 6, 9, 12];
        const results: { label: string; daysFromNow: number }[] = [];

        for (const mo of monthOffsets) {
            const d = new Date(now);
            d.setMonth(d.getMonth() + mo);
            const daysFromNow = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysFromNow >= daysToExpiry) break;
            const monthLabel = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
            results.push({ label: monthLabel, daysFromNow });
        }

        const expDate = new Date(selectedExpiration! * 1000);
        const expLabel = expDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        results.push({ label: expLabel, daysFromNow: daysToExpiry });

        return results;
    }, [daysToExpiry, selectedExpiration]);

    // Build strategies for one direction
    const buildStrategies = useCallback(
        (direction: "bullish" | "bearish", target: number): Strategy[] => {
            if (!chainData || stockPrice <= 0 || target <= 0) return [];
            const strikes = chainData.strikes;
            if (strikes.length === 0) return [];

            const atmStrike = findNearest(stockPrice, strikes);
            const targetStrike = findNearest(target, strikes);
            const optionType: "call" | "put" = direction === "bullish" ? "call" : "put";

            const atmContract = findContract(optionType, atmStrike);
            const targetContract = findContract(optionType, targetStrike);

            const strats: Strategy[] = [];

            strats.push({
                name: `Long $${atmStrike} ${optionType === "call" ? "Call" : "Put"}`,
                legs: [{
                    side: "buy",
                    optionType,
                    strike: atmStrike,
                    premium: midPrice(atmContract),
                    iv: atmContract?.impliedVolatility || 0.3,
                }],
            });

            strats.push({
                name: `Long $${targetStrike} ${optionType === "call" ? "Call" : "Put"}`,
                legs: [{
                    side: "buy",
                    optionType,
                    strike: targetStrike,
                    premium: midPrice(targetContract),
                    iv: targetContract?.impliedVolatility || 0.3,
                }],
            });

            if (direction === "bullish") {
                strats.push({
                    name: `Bull Call Spread $${atmStrike}/$${targetStrike}`,
                    legs: [
                        {
                            side: "buy",
                            optionType: "call",
                            strike: atmStrike,
                            premium: midPrice(atmContract),
                            iv: atmContract?.impliedVolatility || 0.3,
                        },
                        {
                            side: "sell",
                            optionType: "call",
                            strike: targetStrike,
                            premium: midPrice(targetContract),
                            iv: targetContract?.impliedVolatility || 0.3,
                        },
                    ],
                });
            } else {
                strats.push({
                    name: `Bear Put Spread $${atmStrike}/$${targetStrike}`,
                    legs: [
                        {
                            side: "buy",
                            optionType: "put",
                            strike: atmStrike,
                            premium: midPrice(atmContract),
                            iv: atmContract?.impliedVolatility || 0.3,
                        },
                        {
                            side: "sell",
                            optionType: "put",
                            strike: targetStrike,
                            premium: midPrice(targetContract),
                            iv: targetContract?.impliedVolatility || 0.3,
                        },
                    ],
                });
            }

            return strats;
        },
        [chainData, stockPrice, findNearest, findContract]
    );

    // Compute results for a set of strategies
    const r = parseFloat(riskFreeRate) / 100 || 0.0425;

    const computeResults = useCallback(
        (
            strategies: Strategy[],
            targetPrice: number
        ): DirectionResults => {
            if (strategies.length === 0 || horizons.length === 0)
                return { strategies, results: [], bestPicks: [] };

            const results = strategies.map((strat) => {
                const cost = strat.legs.reduce((sum, leg) => {
                    return sum + (leg.side === "buy" ? leg.premium : -leg.premium) * 100;
                }, 0);

                const horizonResults = horizons.map((h) => {
                    const daysLeft = daysToExpiry - h.daysFromNow;
                    const T = daysToYears(Math.max(daysLeft, 0));

                    const value = strat.legs.reduce((sum, leg) => {
                        const bsResult = blackScholes({
                            stockPrice: targetPrice,
                            strikePrice: leg.strike,
                            timeToExpiry: T,
                            riskFreeRate: r,
                            volatility: leg.iv,
                            optionType: leg.optionType,
                        });
                        const legValue = bsResult.price * 100;
                        return sum + (leg.side === "buy" ? legValue : -legValue);
                    }, 0);

                    const profit = value - cost;
                    const returnPct = cost !== 0 ? (profit / Math.abs(cost)) * 100 : 0;

                    return {
                        label: h.label,
                        daysLeft: Math.max(daysLeft, 0),
                        value: profit,
                        returnPct,
                    };
                });

                return { strategy: strat, cost, horizons: horizonResults };
            });

            const bestPicks = horizons.map((h, hIdx) => {
                let bestIdx = 0;
                let bestReturn = -Infinity;
                results.forEach((res, sIdx) => {
                    const ret = res.horizons[hIdx]?.returnPct ?? -Infinity;
                    if (ret > bestReturn) {
                        bestReturn = ret;
                        bestIdx = sIdx;
                    }
                });
                return {
                    label: h.label,
                    strategy: results[bestIdx].strategy.name,
                    returnPct: bestReturn,
                };
            });

            return { strategies, results, bestPicks };
        },
        [horizons, daysToExpiry, r]
    );

    // Compute both directions
    const bullishStrategies = useMemo(
        () => buildStrategies("bullish", bullishTarget),
        [buildStrategies, bullishTarget]
    );
    const bearishStrategies = useMemo(
        () => buildStrategies("bearish", bearishTarget),
        [buildStrategies, bearishTarget]
    );
    const bullishData = useMemo(
        () => computeResults(bullishStrategies, bullishTarget),
        [computeResults, bullishStrategies, bullishTarget]
    );
    const bearishData = useMemo(
        () => computeResults(bearishStrategies, bearishTarget),
        [computeResults, bearishStrategies, bearishTarget]
    );

    const showBullish = bullishData.results.length > 0 && bullishTarget > stockPrice && stockPrice > 0;
    const showBearish = bearishData.results.length > 0 && bearishTarget < stockPrice && stockPrice > 0;

    const trendColors = {
        green: "bg-green-500/10 border-green-500/20 text-green-400",
        red: "bg-red-500/10 border-red-500/20 text-red-400",
        yellow: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
    };

    return (
        <div className="space-y-6">
            {/* Row 1: Symbol, Stock Price, Expiration, Risk-Free Rate */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Symbol</label>
                    <input
                        type="text"
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                        onBlur={handleSymbolBlur}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSymbolBlur(); }}
                        placeholder="GOOG"
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">
                        Stock Price{" "}
                        {fetching && <span className="text-gray-500">(loading...)</span>}
                    </label>
                    <input
                        type="number"
                        step="any"
                        min="0"
                        value={stockPrice || ""}
                        onChange={(e) => setStockPrice(parseFloat(e.target.value) || 0)}
                        placeholder="150.00"
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">
                        Expiration{" "}
                        {daysToExpiry > 0 && (
                            <span className="text-gray-500">({daysToExpiry}d)</span>
                        )}
                    </label>
                    {chainData && chainData.expirationDates.length > 0 ? (
                        <select
                            value={selectedExpiration || ""}
                            onChange={(e) => handleExpirationChange(Number(e.target.value))}
                            className={inputClass}
                        >
                            {chainData.expirationDates.map((ts) => {
                                const d = new Date(ts * 1000);
                                const label = d.toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                });
                                return (
                                    <option key={ts} value={ts}>
                                        {label}
                                    </option>
                                );
                            })}
                        </select>
                    ) : (
                        <input
                            type="text"
                            disabled
                            placeholder={chainLoading ? "Loading..." : "Load symbol first"}
                            className={inputClass + " opacity-50"}
                        />
                    )}
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Risk-Free Rate (%)</label>
                    <input
                        type="number"
                        step="any"
                        min="0"
                        value={riskFreeRate}
                        onChange={(e) => setRiskFreeRate(e.target.value)}
                        placeholder="4.25"
                        className={inputClass}
                    />
                </div>
            </div>

            {/* Technical Stats Bar */}
            {smaData && stockPrice > 0 && (
                <div
                    className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 rounded-lg text-sm border ${
                        trendColors[trendSignal?.color || "yellow"]
                    }`}
                >
                    <div>
                        <span className="text-gray-400 text-xs mr-1">Price</span>
                        <span className="font-medium">${stockPrice.toFixed(2)}</span>
                    </div>
                    <div>
                        <span className="text-gray-400 text-xs mr-1">SMA20</span>
                        <span className="font-medium">${smaData.smaShort.toFixed(2)}</span>
                    </div>
                    <div>
                        <span className="text-gray-400 text-xs mr-1">SMA50</span>
                        <span className="font-medium">${smaData.smaLong.toFixed(2)}</span>
                    </div>
                    {trendSignal && (
                        <div className="ml-auto text-xs">
                            <span className="font-semibold">{trendSignal.label}</span>
                            <span className="text-gray-400 ml-1.5">{trendSignal.detail}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Row 2: Bullish Target | Bearish Target */}
            {stockPrice > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Bullish Target */}
                    <div className="bg-green-500/5 border border-green-500/10 rounded-lg p-4 space-y-2">
                        <label className="block text-xs text-green-400 font-semibold uppercase tracking-wider">
                            ▲ Bullish Target
                        </label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            value={bullishTarget || ""}
                            onChange={(e) => setBullishTarget(parseFloat(e.target.value) || 0)}
                            placeholder="Target above current price"
                            className={inputClass + " !border-green-500/20 focus:!border-green-500/40"}
                        />
                        {smaData && (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => {
                                        const strikes = chainData?.strikes || [];
                                        const val = strikes.length > 0 ? findNearest(smaData.smaShort, strikes) : Math.round(smaData.smaShort * 100) / 100;
                                        setBullishTarget(val);
                                    }}
                                    className="text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 rounded px-2 py-0.5 text-gray-300 transition-colors"
                                >
                                    SMA20: ${smaData.smaShort.toFixed(0)}
                                </button>
                                <button
                                    onClick={() => {
                                        const strikes = chainData?.strikes || [];
                                        const val = strikes.length > 0 ? findNearest(smaData.smaLong, strikes) : Math.round(smaData.smaLong * 100) / 100;
                                        setBullishTarget(val);
                                    }}
                                    className="text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 rounded px-2 py-0.5 text-gray-300 transition-colors"
                                >
                                    SMA50: ${smaData.smaLong.toFixed(0)}
                                </button>
                                {bullishTarget > 0 && stockPrice > 0 && (
                                    <span className="text-[11px] text-green-600 ml-auto self-center">
                                        +{(((bullishTarget - stockPrice) / stockPrice) * 100).toFixed(1)}%
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Bearish Target */}
                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-4 space-y-2">
                        <label className="block text-xs text-red-400 font-semibold uppercase tracking-wider">
                            ▼ Bearish Target
                        </label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            value={bearishTarget || ""}
                            onChange={(e) => setBearishTarget(parseFloat(e.target.value) || 0)}
                            placeholder="Target below current price"
                            className={inputClass + " !border-red-500/20 focus:!border-red-500/40"}
                        />
                        {smaData && (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => {
                                        const strikes = chainData?.strikes || [];
                                        const val = strikes.length > 0 ? findNearest(smaData.smaShort, strikes) : Math.round(smaData.smaShort * 100) / 100;
                                        setBearishTarget(val);
                                    }}
                                    className="text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 rounded px-2 py-0.5 text-gray-300 transition-colors"
                                >
                                    SMA20: ${smaData.smaShort.toFixed(0)}
                                </button>
                                <button
                                    onClick={() => {
                                        const strikes = chainData?.strikes || [];
                                        const val = strikes.length > 0 ? findNearest(smaData.smaLong, strikes) : Math.round(smaData.smaLong * 100) / 100;
                                        setBearishTarget(val);
                                    }}
                                    className="text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 rounded px-2 py-0.5 text-gray-300 transition-colors"
                                >
                                    SMA50: ${smaData.smaLong.toFixed(0)}
                                </button>
                                {bearishTarget > 0 && stockPrice > 0 && (
                                    <span className="text-[11px] text-red-600 ml-auto self-center">
                                        {(((bearishTarget - stockPrice) / stockPrice) * 100).toFixed(1)}%
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bullish Strategies */}
            {showBullish && (
                <DirectionSection
                    direction="bullish"
                    data={bullishData}
                    horizons={horizons}
                    daysToExpiry={daysToExpiry}
                />
            )}

            {/* Bearish Strategies */}
            {showBearish && (
                <DirectionSection
                    direction="bearish"
                    data={bearishData}
                    horizons={horizons}
                    daysToExpiry={daysToExpiry}
                />
            )}

            {/* Empty state */}
            {!showBullish && !showBearish && stockPrice > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center">
                    <p className="text-gray-500 text-sm">
                        {chainLoading
                            ? "Loading options chain..."
                            : "Set bullish and bearish targets to compare strategies."}
                    </p>
                </div>
            )}
        </div>
    );
}
