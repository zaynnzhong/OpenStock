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

interface SMAData {
    price: number;
    smaShort: number;
    smaLong: number;
    shortPeriod: number;
    longPeriod: number;
}

interface LeapCandidate {
    strike: number;
    premium: number;
    intrinsic: number;
    extrinsic: number;
    extrinsicPct: number;
    delta: number;
    leverage: number;
    annualizedCost: number;
    breakEven: number;
    breakEvenPct: number;
    openInterest: number;
}

export default function DeepITMLeapFinder() {
    const [symbol, setSymbol] = useState("");
    const [stockPrice, setStockPrice] = useState<number>(0);
    const [chainData, setChainData] = useState<OptionsChainData | null>(null);
    const [selectedExpiration, setSelectedExpiration] = useState<number | null>(null);
    const [minDelta, setMinDelta] = useState("0.70");
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

    // Filter expirations to LEAPs (>180 days out)
    const leapExpirations = useMemo(() => {
        if (!chainData) return [];
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const nowMs = now.getTime();
        return chainData.expirationDates.filter((ts) => {
            const days = Math.ceil((ts * 1000 - nowMs) / (1000 * 60 * 60 * 24));
            return days > 180;
        });
    }, [chainData]);

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

    const midPrice = (contract: OptionContract | null): number => {
        if (!contract) return 0;
        if (contract.bid > 0 && contract.ask > 0) return (contract.bid + contract.ask) / 2;
        return contract.lastPrice || 0;
    };

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
                // Find LEAP expirations (>180 days)
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const nowMs = now.getTime();
                const leaps = chain.expirationDates.filter((ts) => {
                    const days = Math.ceil((ts * 1000 - nowMs) / (1000 * 60 * 60 * 24));
                    return days > 180;
                });

                if (leaps.length > 0) {
                    // Auto-select the longest LEAP
                    const longest = leaps[leaps.length - 1];
                    const leapChain = await getOptionsChain(sym, longest);
                    if (leapChain) {
                        setChainData(leapChain);
                        setSelectedExpiration(longest);
                    } else {
                        setChainData(chain);
                        setSelectedExpiration(leaps[leaps.length - 1]);
                    }
                } else {
                    setChainData(chain);
                    if (chain.expirationDates.length > 0) {
                        setSelectedExpiration(chain.expirationDates[chain.expirationDates.length - 1]);
                    }
                }
            }
        } catch {
            // silently fail
        } finally {
            setFetching(false);
            setChainLoading(false);
        }
    }, [symbol]);

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

    // Compute LEAP candidates
    const candidates = useMemo((): LeapCandidate[] => {
        if (!chainData || stockPrice <= 0 || daysToExpiry <= 0) return [];

        const r = 0.0425;
        const T = daysToYears(daysToExpiry);
        const minD = parseFloat(minDelta) || 0.70;

        return chainData.calls
            .filter((c) => c.strike < stockPrice)
            .map((contract) => {
                const premium = midPrice(contract);
                if (premium <= 0) return null;

                const iv = contract.impliedVolatility || 0.3;
                const bs = blackScholes({
                    stockPrice,
                    strikePrice: contract.strike,
                    timeToExpiry: T,
                    riskFreeRate: r,
                    volatility: iv,
                    optionType: "call",
                });

                if (bs.delta < minD) return null;

                const intrinsic = stockPrice - contract.strike;
                const extrinsic = Math.max(premium - intrinsic, 0);
                const extrinsicPct = premium > 0 ? (extrinsic / premium) * 100 : 0;
                const leverage = premium > 0 ? stockPrice / premium : 0;
                const annualizedCost = (extrinsic / stockPrice) / (daysToExpiry / 365) * 100;
                const breakEven = contract.strike + premium;
                const breakEvenPct = ((breakEven - stockPrice) / stockPrice) * 100;

                return {
                    strike: contract.strike,
                    premium,
                    intrinsic,
                    extrinsic,
                    extrinsicPct,
                    delta: bs.delta,
                    leverage,
                    annualizedCost,
                    breakEven,
                    breakEvenPct,
                    openInterest: contract.openInterest,
                } as LeapCandidate;
            })
            .filter((c): c is LeapCandidate => c !== null)
            .sort((a, b) => b.strike - a.strike);
    }, [chainData, stockPrice, daysToExpiry, minDelta]);

    // Sweet spot: delta 0.80-0.90, lowest annualized cost
    const sweetSpot = useMemo(() => {
        const eligible = candidates.filter((c) => c.delta >= 0.80 && c.delta <= 0.90);
        if (eligible.length === 0) return null;
        return eligible.reduce((best, c) => (c.annualizedCost < best.annualizedCost ? c : best));
    }, [candidates]);

    const trendColors = {
        green: "bg-green-500/10 border-green-500/20 text-green-400",
        red: "bg-red-500/10 border-red-500/20 text-red-400",
        yellow: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
    };

    const deltaColor = (d: number) => (d >= 0.80 ? "text-green-400" : "text-yellow-400");
    const annCostColor = (c: number) =>
        c < 4 ? "text-green-400" : c <= 6 ? "text-yellow-400" : "text-red-400";
    const bePctColor = (p: number) =>
        p <= 0 ? "text-green-400" : p <= 3 ? "text-yellow-400" : "text-red-400";

    return (
        <div className="space-y-6">
            {/* Row 1: Symbol, Stock Price, Expiration, Min Delta */}
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
                    {leapExpirations.length > 0 ? (
                        <select
                            value={selectedExpiration || ""}
                            onChange={(e) => handleExpirationChange(Number(e.target.value))}
                            className={inputClass}
                        >
                            {leapExpirations.map((ts) => {
                                const d = new Date(ts * 1000);
                                const now = new Date();
                                now.setHours(0, 0, 0, 0);
                                const days = Math.ceil((ts * 1000 - now.getTime()) / (1000 * 60 * 60 * 24));
                                const label = d.toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                });
                                return (
                                    <option key={ts} value={ts}>
                                        {label} ({days}d)
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
                    <label className="block text-xs text-gray-400 mb-1">Min Delta</label>
                    <input
                        type="number"
                        step="0.05"
                        min="0.50"
                        max="0.99"
                        value={minDelta}
                        onChange={(e) => setMinDelta(e.target.value)}
                        placeholder="0.70"
                        className={inputClass}
                    />
                </div>
            </div>

            {/* SMA Stats Bar */}
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

            {/* Results Table */}
            {candidates.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/10">
                                {["Strike", "Premium", "Intrinsic", "Extrinsic", "Ext%", "Delta", "Leverage", "Ann. Cost", "Break-Even", "B/E%", "OI"].map(
                                    (h) => (
                                        <th
                                            key={h}
                                            className="text-right text-xs text-gray-400 uppercase tracking-wider py-2 px-2 whitespace-nowrap first:text-left"
                                        >
                                            {h}
                                        </th>
                                    )
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {candidates.map((c) => {
                                const isSweet = sweetSpot?.strike === c.strike;
                                return (
                                    <tr
                                        key={c.strike}
                                        className={`border-b border-white/5 transition-colors ${
                                            isSweet
                                                ? "bg-teal-500/10 border-l-2 border-l-teal-400"
                                                : "hover:bg-white/[0.02]"
                                        }`}
                                    >
                                        <td className="py-2.5 px-2 text-left whitespace-nowrap font-medium text-white">
                                            ${c.strike.toFixed(0)}
                                            {isSweet && (
                                                <span className="ml-1.5 text-[10px] text-teal-400 font-semibold">
                                                    SWEET SPOT
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-2 text-right whitespace-nowrap text-gray-300">
                                            ${c.premium.toFixed(2)}
                                        </td>
                                        <td className="py-2.5 px-2 text-right whitespace-nowrap text-gray-400">
                                            ${c.intrinsic.toFixed(2)}
                                        </td>
                                        <td className="py-2.5 px-2 text-right whitespace-nowrap text-gray-400">
                                            ${c.extrinsic.toFixed(2)}
                                        </td>
                                        <td className="py-2.5 px-2 text-right whitespace-nowrap text-gray-400">
                                            {c.extrinsicPct.toFixed(1)}%
                                        </td>
                                        <td className={`py-2.5 px-2 text-right whitespace-nowrap font-medium ${deltaColor(c.delta)}`}>
                                            {c.delta.toFixed(2)}
                                        </td>
                                        <td className="py-2.5 px-2 text-right whitespace-nowrap text-gray-300">
                                            {c.leverage.toFixed(1)}x
                                        </td>
                                        <td className={`py-2.5 px-2 text-right whitespace-nowrap font-medium ${annCostColor(c.annualizedCost)}`}>
                                            {c.annualizedCost.toFixed(2)}%
                                        </td>
                                        <td className="py-2.5 px-2 text-right whitespace-nowrap text-gray-300">
                                            ${c.breakEven.toFixed(2)}
                                        </td>
                                        <td className={`py-2.5 px-2 text-right whitespace-nowrap ${bePctColor(c.breakEvenPct)}`}>
                                            {c.breakEvenPct >= 0 ? "+" : ""}
                                            {c.breakEvenPct.toFixed(1)}%
                                        </td>
                                        <td className="py-2.5 px-2 text-right whitespace-nowrap text-gray-500">
                                            {c.openInterest.toLocaleString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Recommendation Card */}
            {sweetSpot && (
                <div className="bg-teal-500/5 border border-teal-500/15 rounded-lg p-5">
                    <h4 className="text-xs text-teal-400 uppercase tracking-wider font-semibold mb-3">
                        Recommended Strike — Stock Replacement
                    </h4>
                    <div className="flex flex-wrap gap-x-8 gap-y-3">
                        <div>
                            <div className="text-[10px] text-gray-500">Strike</div>
                            <div className="text-lg text-white font-bold">${sweetSpot.strike.toFixed(0)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500">Premium</div>
                            <div className="text-lg text-white font-bold">${sweetSpot.premium.toFixed(2)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500">Delta</div>
                            <div className={`text-lg font-bold ${deltaColor(sweetSpot.delta)}`}>
                                {sweetSpot.delta.toFixed(2)}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500">Ann. Cost</div>
                            <div className={`text-lg font-bold ${annCostColor(sweetSpot.annualizedCost)}`}>
                                {sweetSpot.annualizedCost.toFixed(2)}%
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500">Leverage</div>
                            <div className="text-lg text-white font-bold">{sweetSpot.leverage.toFixed(1)}x</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500">Break-Even</div>
                            <div className="text-lg text-white font-bold">
                                ${sweetSpot.breakEven.toFixed(2)}{" "}
                                <span className={`text-sm ${bePctColor(sweetSpot.breakEvenPct)}`}>
                                    ({sweetSpot.breakEvenPct >= 0 ? "+" : ""}{sweetSpot.breakEvenPct.toFixed(1)}%)
                                </span>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-3">
                        Delta {sweetSpot.delta.toFixed(2)} captures {(sweetSpot.delta * 100).toFixed(0)}% of stock moves at {sweetSpot.leverage.toFixed(1)}x leverage, costing {sweetSpot.annualizedCost.toFixed(2)}% annualized — the lowest time-value cost in the 0.80-0.90 delta range.
                    </p>
                </div>
            )}

            {/* Empty state */}
            {candidates.length === 0 && stockPrice > 0 && !chainLoading && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center">
                    <p className="text-gray-500 text-sm">
                        {leapExpirations.length === 0
                            ? "No LEAP expirations found (>180 days). Try a different symbol."
                            : "No ITM calls meet the minimum delta threshold. Try lowering Min Delta."}
                    </p>
                </div>
            )}

            {chainLoading && stockPrice > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center">
                    <p className="text-gray-500 text-sm">Loading options chain...</p>
                </div>
            )}
        </div>
    );
}
