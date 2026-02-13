"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { blackScholes, daysToYears, type BlackScholesResult } from "@/lib/portfolio/options-pricing";
import { getQuote, getOptionsChain, type OptionContract, type OptionsChainData } from "@/lib/actions/finnhub.actions";

export default function OptionsCalculator() {
    const [symbol, setSymbol] = useState("");
    const [stockPrice, setStockPrice] = useState("");
    const [strikePrice, setStrikePrice] = useState("");
    const [expDate, setExpDate] = useState("");
    const [volatility, setVolatility] = useState("30");
    const [riskFreeRate, setRiskFreeRate] = useState("4.25");
    const [optionType, setOptionType] = useState<"call" | "put">("call");
    const [fetching, setFetching] = useState(false);

    // Market data state
    const [chainData, setChainData] = useState<OptionsChainData | null>(null);
    const [chainLoading, setChainLoading] = useState(false);
    const [selectedExpiration, setSelectedExpiration] = useState<number | null>(null);

    // Auto-fill stock price + load options chain on symbol blur
    const handleSymbolBlur = async () => {
        const sym = symbol.trim().toUpperCase();
        if (!sym) return;
        setFetching(true);
        setChainLoading(true);
        try {
            const [quote, chain] = await Promise.all([
                getQuote(sym),
                getOptionsChain(sym),
            ]);
            if (quote?.c) {
                setStockPrice(quote.c.toFixed(2));
            }
            if (chain) {
                setChainData(chain);
                if (!selectedExpiration && chain.expirationDates.length > 0) {
                    setSelectedExpiration(chain.expirationDates[0]);
                }
            }
        } catch {
            // silently fail
        } finally {
            setFetching(false);
            setChainLoading(false);
        }
    };

    // When user picks an expiration from the chain, reload that expiration's contracts
    const handleExpirationChange = useCallback(async (ts: number) => {
        setSelectedExpiration(ts);
        // Set the date input to match
        const d = new Date(ts * 1000);
        setExpDate(d.toISOString().split("T")[0]);

        if (!symbol.trim()) return;
        setChainLoading(true);
        try {
            const chain = await getOptionsChain(symbol.trim().toUpperCase(), ts);
            if (chain) setChainData(chain);
        } catch {} finally {
            setChainLoading(false);
        }
    }, [symbol]);

    const daysToExpiry = useMemo(() => {
        if (!expDate) return 0;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const exp = new Date(expDate + "T00:00:00");
        return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }, [expDate]);

    const result: BlackScholesResult | null = useMemo(() => {
        const S = parseFloat(stockPrice);
        const K = parseFloat(strikePrice);
        const vol = parseFloat(volatility) / 100;
        const rate = parseFloat(riskFreeRate) / 100;

        if (!S || S <= 0 || !K || K <= 0 || !vol || vol <= 0 || daysToExpiry <= 0) return null;

        return blackScholes({
            stockPrice: S,
            strikePrice: K,
            timeToExpiry: daysToYears(daysToExpiry),
            riskFreeRate: rate,
            volatility: vol,
            optionType,
        });
    }, [stockPrice, strikePrice, daysToExpiry, volatility, riskFreeRate, optionType]);

    // Find matching market contract
    const marketContract: OptionContract | null = useMemo(() => {
        if (!chainData) return null;
        const K = parseFloat(strikePrice);
        if (!K) return null;
        const contracts = optionType === "call" ? chainData.calls : chainData.puts;
        return contracts.find((c) => Math.abs(c.strike - K) < 0.01) || null;
    }, [chainData, strikePrice, optionType]);

    // Auto-fill IV from market when a contract is matched
    useEffect(() => {
        if (marketContract && marketContract.impliedVolatility > 0) {
            setVolatility((marketContract.impliedVolatility * 100).toFixed(1));
        }
    }, [marketContract]);

    const inputClass =
        "w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30";

    return (
        <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-8">
                {/* Inputs */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Parameters</h3>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Symbol</label>
                        <input
                            type="text"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                            onBlur={handleSymbolBlur}
                            placeholder="AAPL"
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">
                            Stock Price {fetching && <span className="text-gray-500">(loading...)</span>}
                        </label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            value={stockPrice}
                            onChange={(e) => setStockPrice(e.target.value)}
                            placeholder="150.00"
                            className={inputClass}
                        />
                    </div>

                    {/* Expiration selector from chain */}
                    {chainData && chainData.expirationDates.length > 0 && (
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Expiration (from chain)</label>
                            <select
                                value={selectedExpiration || ""}
                                onChange={(e) => handleExpirationChange(Number(e.target.value))}
                                className={inputClass}
                            >
                                {chainData.expirationDates.map((ts) => {
                                    const d = new Date(ts * 1000);
                                    const label = d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
                                    return <option key={ts} value={ts}>{label}</option>;
                                })}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">
                            Strike Price
                        </label>
                        {chainData && chainData.strikes.length > 0 ? (
                            <select
                                value={strikePrice}
                                onChange={(e) => setStrikePrice(e.target.value)}
                                className={inputClass}
                            >
                                <option value="">Select strike...</option>
                                {chainData.strikes.map((s) => (
                                    <option key={s} value={s}>${s.toFixed(2)}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type="number"
                                step="any"
                                min="0"
                                value={strikePrice}
                                onChange={(e) => setStrikePrice(e.target.value)}
                                placeholder="155.00"
                                className={inputClass}
                            />
                        )}
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">
                            Expiration Date {daysToExpiry > 0 && <span className="text-gray-500">({daysToExpiry} days)</span>}
                        </label>
                        <input
                            type="date"
                            value={expDate}
                            onChange={(e) => setExpDate(e.target.value)}
                            className={inputClass}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">
                                Volatility (%)
                                {marketContract ? (
                                    <span className="text-teal-500 ml-1">IV</span>
                                ) : null}
                            </label>
                            <input
                                type="number"
                                step="any"
                                min="0"
                                value={volatility}
                                onChange={(e) => setVolatility(e.target.value)}
                                placeholder="30"
                                className={inputClass}
                            />
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

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Option Type</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setOptionType("call")}
                                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                                    optionType === "call"
                                        ? "bg-green-500/20 text-green-400 border border-green-500/40"
                                        : "bg-white/5 text-gray-400 border border-white/10 hover:border-white/20"
                                }`}
                            >
                                Call
                            </button>
                            <button
                                type="button"
                                onClick={() => setOptionType("put")}
                                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                                    optionType === "put"
                                        ? "bg-red-500/20 text-red-400 border border-red-500/40"
                                        : "bg-white/5 text-gray-400 border border-white/10 hover:border-white/20"
                                }`}
                            >
                                Put
                            </button>
                        </div>
                    </div>
                </div>

                {/* Results */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Results</h3>

                    {result ? (
                        <div className="space-y-3">
                            {/* Market vs Theoretical price comparison */}
                            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Theoretical Price</p>
                                <p className="text-3xl font-bold text-white">${result.price.toFixed(4)}</p>

                                {marketContract && (
                                    <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-500">Market Bid/Ask</span>
                                            <span className="text-white">
                                                ${marketContract.bid.toFixed(2)} / ${marketContract.ask.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-500">Last Price</span>
                                            <span className="text-white">${marketContract.lastPrice.toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-500">Volume / OI</span>
                                            <span className="text-white">
                                                {marketContract.volume.toLocaleString()} / {marketContract.openInterest.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-500">Implied Vol</span>
                                            <span className="text-teal-400">
                                                {(marketContract.impliedVolatility * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <GreekCard label="Delta" value={result.delta.toFixed(4)} />
                                <GreekCard label="Gamma" value={result.gamma.toFixed(4)} />
                                <GreekCard label="Theta" value={result.theta.toFixed(4)} subtitle="per day" />
                                <GreekCard label="Vega" value={result.vega.toFixed(4)} subtitle="per 1% vol" />
                                <GreekCard label="Rho" value={result.rho.toFixed(4)} subtitle="per 1% rate" />
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
                            <p className="text-gray-500 text-sm">
                                {chainLoading
                                    ? "Loading options chain..."
                                    : "Enter a symbol, strike price, and expiration date to calculate option pricing."}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function GreekCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-lg font-semibold text-white">{value}</p>
            {subtitle && <p className="text-[10px] text-gray-600">{subtitle}</p>}
        </div>
    );
}
