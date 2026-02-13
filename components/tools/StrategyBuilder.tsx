"use client";

import { useState, useMemo, useCallback } from "react";
import { Trash2, Plus } from "lucide-react";
import { daysToYears } from "@/lib/portfolio/options-pricing";
import {
    getQuote,
    getOptionsChain,
    type OptionContract,
    type OptionsChainData,
} from "@/lib/actions/finnhub.actions";
import {
    type StrategyLeg,
    type StrategyAnalysis,
    type PayoffPoint,
    STRATEGY_PRESETS,
    resolveStrikeOffset,
    analyzeStrategy,
} from "@/lib/portfolio/strategy-engine";

const PRESET_NAMES = Object.keys(STRATEGY_PRESETS);

let nextLegId = 1;
function genLegId() {
    return `leg-${nextLegId++}`;
}

const inputClass =
    "w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30";

export default function StrategyBuilder() {
    // Shared state
    const [symbol, setSymbol] = useState("");
    const [stockPrice, setStockPrice] = useState<number>(0);
    const [chainData, setChainData] = useState<OptionsChainData | null>(null);
    const [selectedExpiration, setSelectedExpiration] = useState<number | null>(null);
    const [riskFreeRate, setRiskFreeRate] = useState("4.25");
    const [fetching, setFetching] = useState(false);
    const [chainLoading, setChainLoading] = useState(false);

    // Strategy state
    const [preset, setPreset] = useState<string>("Custom");
    const [legs, setLegs] = useState<StrategyLeg[]>([]);

    // Derived
    const daysToExpiry = useMemo(() => {
        if (!selectedExpiration) return 0;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const exp = new Date(selectedExpiration * 1000);
        return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }, [selectedExpiration]);

    const analysis: StrategyAnalysis | null = useMemo(() => {
        if (legs.length === 0 || stockPrice <= 0) return null;
        const T = daysToYears(daysToExpiry);
        const r = parseFloat(riskFreeRate) / 100 || 0.0425;
        return analyzeStrategy(legs, stockPrice, T, r);
    }, [legs, stockPrice, daysToExpiry, riskFreeRate]);

    // --- Data fetching ---
    const handleSymbolBlur = useCallback(async () => {
        const sym = symbol.trim().toUpperCase();
        if (!sym) return;
        setFetching(true);
        setChainLoading(true);
        try {
            const [quote, chain] = await Promise.all([getQuote(sym), getOptionsChain(sym)]);
            if (quote?.c) setStockPrice(quote.c);
            if (chain) {
                setChainData(chain);
                if (chain.expirationDates.length > 0) {
                    setSelectedExpiration(chain.expirationDates[0]);
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

    // --- Helpers: look up contract from chain ---
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

    // --- Preset selection ---
    const handlePresetSelect = useCallback(
        (presetName: string) => {
            if (presetName === "Custom") {
                setPreset("Custom");
                return;
            }
            const p = STRATEGY_PRESETS[presetName];
            if (!p) return;

            const strikes = chainData?.strikes || [];
            const sp = stockPrice || 100;

            const newLegs: StrategyLeg[] = p.legs.map((tpl) => {
                const strike = resolveStrikeOffset(tpl.strikeOffset, tpl.optionType, sp, strikes);
                const contract = findContract(tpl.optionType, strike);
                return {
                    id: genLegId(),
                    side: tpl.side,
                    optionType: tpl.optionType,
                    strike,
                    quantity: tpl.quantity,
                    premium: Math.round(midPrice(contract) * 100) / 100,
                    iv: contract?.impliedVolatility || 0.3,
                };
            });

            setLegs(newLegs);
            setPreset(presetName);
        },
        [chainData, stockPrice, findContract]
    );

    // --- Leg mutations ---
    const addLeg = () => {
        const atmStrike = chainData?.strikes?.length
            ? chainData.strikes.reduce((best, s) =>
                  Math.abs(s - stockPrice) < Math.abs(best - stockPrice) ? s : best
              )
            : stockPrice || 100;

        const contract = findContract("call", atmStrike);
        setLegs((prev) => [
            ...prev,
            {
                id: genLegId(),
                side: "buy",
                optionType: "call",
                strike: atmStrike,
                quantity: 1,
                premium: Math.round(midPrice(contract) * 100) / 100,
                iv: contract?.impliedVolatility || 0.3,
            },
        ]);
        setPreset("Custom");
    };

    const removeLeg = (id: string) => {
        setLegs((prev) => prev.filter((l) => l.id !== id));
        setPreset("Custom");
    };

    const updateLeg = (id: string, updates: Partial<StrategyLeg>) => {
        setLegs((prev) =>
            prev.map((l) => {
                if (l.id !== id) return l;
                const updated = { ...l, ...updates };

                // If strike or optionType changed, re-lookup from chain
                if (
                    ("strike" in updates || "optionType" in updates) &&
                    chainData
                ) {
                    const contract = findContract(updated.optionType, updated.strike);
                    if (contract) {
                        updated.premium = Math.round(midPrice(contract) * 100) / 100;
                        updated.iv = contract.impliedVolatility || updated.iv;
                    }
                }

                return updated;
            })
        );
        setPreset("Custom");
    };

    return (
        <div className="space-y-6">
            {/* Row 1: Symbol + Expiration + Stock Price + Rate */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                            placeholder="Load symbol first"
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

            {/* Row 2: Preset buttons */}
            <div>
                <label className="block text-xs text-gray-400 mb-2">Strategy Preset</label>
                <div className="flex flex-wrap gap-2">
                    {PRESET_NAMES.map((name) => (
                        <button
                            key={name}
                            type="button"
                            onClick={() => handlePresetSelect(name)}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                preset === name
                                    ? "bg-teal-500/20 text-teal-400 border border-teal-500/40"
                                    : "bg-white/5 text-gray-400 border border-white/10 hover:border-white/20"
                            }`}
                        >
                            {name}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setPreset("Custom")}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            preset === "Custom"
                                ? "bg-teal-500/20 text-teal-400 border border-teal-500/40"
                                : "bg-white/5 text-gray-400 border border-white/10 hover:border-white/20"
                        }`}
                    >
                        Custom
                    </button>
                </div>
            </div>

            {/* Row 3: Legs table */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-400">Legs</label>
                    <button
                        type="button"
                        onClick={addLeg}
                        className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 transition-colors"
                    >
                        <Plus className="h-3 w-3" /> Add Leg
                    </button>
                </div>

                {legs.length === 0 ? (
                    <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center">
                        <p className="text-gray-500 text-sm">
                            {chainLoading
                                ? "Loading options chain..."
                                : "Select a preset or add legs manually to build a strategy."}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {/* Header */}
                        <div className="hidden md:grid md:grid-cols-[80px_80px_1fr_80px_100px_80px_40px] gap-2 text-[10px] text-gray-500 uppercase tracking-wider px-1">
                            <span>Side</span>
                            <span>Type</span>
                            <span>Strike</span>
                            <span>Qty</span>
                            <span>Premium</span>
                            <span>IV</span>
                            <span></span>
                        </div>
                        {legs.map((leg) => (
                            <LegRow
                                key={leg.id}
                                leg={leg}
                                strikes={chainData?.strikes || []}
                                onUpdate={(updates) => updateLeg(leg.id, updates)}
                                onRemove={() => removeLeg(leg.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Row 4+5+6: Analysis results */}
            {analysis && (
                <div className="space-y-6">
                    {/* Analysis cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <AnalysisCard
                            label="Net Debit/Credit"
                            value={
                                analysis.netDebitCredit >= 0
                                    ? `+$${analysis.netDebitCredit.toFixed(0)}`
                                    : `-$${Math.abs(analysis.netDebitCredit).toFixed(0)}`
                            }
                            color={analysis.netDebitCredit >= 0 ? "text-green-400" : "text-red-400"}
                            subtitle={analysis.netDebitCredit >= 0 ? "credit" : "debit"}
                        />
                        <AnalysisCard
                            label="Max Profit"
                            value={
                                analysis.maxProfitUnlimited
                                    ? "Unlimited"
                                    : `$${analysis.maxProfit.toFixed(0)}`
                            }
                            color="text-green-400"
                        />
                        <AnalysisCard
                            label="Max Loss"
                            value={
                                analysis.maxLossUnlimited
                                    ? "Unlimited"
                                    : `-$${Math.abs(analysis.maxLoss).toFixed(0)}`
                            }
                            color="text-red-400"
                        />
                        <AnalysisCard
                            label="Breakevens"
                            value={
                                analysis.breakevens.length > 0
                                    ? analysis.breakevens.map((b) => `$${b.toFixed(2)}`).join(", ")
                                    : "None"
                            }
                            color="text-yellow-400"
                        />
                    </div>

                    {/* Aggregated Greeks */}
                    <div>
                        <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                            Aggregated Greeks
                        </h4>
                        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                            <GreekCard
                                label="Delta"
                                value={analysis.greeks.delta.toFixed(2)}
                            />
                            <GreekCard
                                label="Gamma"
                                value={analysis.greeks.gamma.toFixed(4)}
                            />
                            <GreekCard
                                label="Theta"
                                value={analysis.greeks.theta.toFixed(2)}
                                subtitle="per day"
                            />
                            <GreekCard
                                label="Vega"
                                value={analysis.greeks.vega.toFixed(2)}
                                subtitle="per 1% vol"
                            />
                            <GreekCard
                                label="Rho"
                                value={analysis.greeks.rho.toFixed(2)}
                                subtitle="per 1% rate"
                            />
                        </div>
                    </div>

                    {/* Payoff diagram */}
                    <div>
                        <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                            Payoff at Expiration
                        </h4>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <PayoffChart
                                curve={analysis.payoffCurve}
                                breakevens={analysis.breakevens}
                                currentPrice={stockPrice}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Sub-components ---

function LegRow({
    leg,
    strikes,
    onUpdate,
    onRemove,
}: {
    leg: StrategyLeg;
    strikes: number[];
    onUpdate: (updates: Partial<StrategyLeg>) => void;
    onRemove: () => void;
}) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-[80px_80px_1fr_80px_100px_80px_40px] gap-2 items-center bg-white/5 border border-white/10 rounded-lg p-2">
            {/* Side toggle */}
            <div className="flex gap-1">
                <button
                    type="button"
                    onClick={() => onUpdate({ side: "buy" })}
                    className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
                        leg.side === "buy"
                            ? "bg-green-500/20 text-green-400 border border-green-500/40"
                            : "bg-white/5 text-gray-500 border border-white/10"
                    }`}
                >
                    Buy
                </button>
                <button
                    type="button"
                    onClick={() => onUpdate({ side: "sell" })}
                    className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
                        leg.side === "sell"
                            ? "bg-red-500/20 text-red-400 border border-red-500/40"
                            : "bg-white/5 text-gray-500 border border-white/10"
                    }`}
                >
                    Sell
                </button>
            </div>

            {/* Type toggle */}
            <div className="flex gap-1">
                <button
                    type="button"
                    onClick={() => onUpdate({ optionType: "call" })}
                    className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
                        leg.optionType === "call"
                            ? "bg-teal-500/20 text-teal-400 border border-teal-500/40"
                            : "bg-white/5 text-gray-500 border border-white/10"
                    }`}
                >
                    Call
                </button>
                <button
                    type="button"
                    onClick={() => onUpdate({ optionType: "put" })}
                    className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
                        leg.optionType === "put"
                            ? "bg-teal-500/20 text-teal-400 border border-teal-500/40"
                            : "bg-white/5 text-gray-500 border border-white/10"
                    }`}
                >
                    Put
                </button>
            </div>

            {/* Strike */}
            {strikes.length > 0 ? (
                <select
                    value={leg.strike}
                    onChange={(e) => onUpdate({ strike: parseFloat(e.target.value) })}
                    className={inputClass}
                >
                    {strikes.map((s) => (
                        <option key={s} value={s}>
                            ${s.toFixed(2)}
                        </option>
                    ))}
                </select>
            ) : (
                <input
                    type="number"
                    step="any"
                    value={leg.strike || ""}
                    onChange={(e) => onUpdate({ strike: parseFloat(e.target.value) || 0 })}
                    placeholder="Strike"
                    className={inputClass}
                />
            )}

            {/* Quantity */}
            <input
                type="number"
                min="1"
                value={leg.quantity}
                onChange={(e) => onUpdate({ quantity: parseInt(e.target.value) || 1 })}
                className={inputClass}
            />

            {/* Premium */}
            <input
                type="number"
                step="0.01"
                min="0"
                value={leg.premium || ""}
                onChange={(e) => onUpdate({ premium: parseFloat(e.target.value) || 0 })}
                placeholder="Mid"
                className={inputClass}
            />

            {/* IV display */}
            <span className="text-xs text-gray-400 text-center">
                {(leg.iv * 100).toFixed(1)}%
            </span>

            {/* Remove */}
            <button
                type="button"
                onClick={onRemove}
                className="text-gray-500 hover:text-red-400 transition-colors flex justify-center"
            >
                <Trash2 className="h-4 w-4" />
            </button>
        </div>
    );
}

function AnalysisCard({
    label,
    value,
    color,
    subtitle,
}: {
    label: string;
    value: string;
    color: string;
    subtitle?: string;
}) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-lg font-semibold ${color}`}>{value}</p>
            {subtitle && <p className="text-[10px] text-gray-600">{subtitle}</p>}
        </div>
    );
}

function GreekCard({
    label,
    value,
    subtitle,
}: {
    label: string;
    value: string;
    subtitle?: string;
}) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-lg font-semibold text-white">{value}</p>
            {subtitle && <p className="text-[10px] text-gray-600">{subtitle}</p>}
        </div>
    );
}

// --- Payoff Chart (SVG) ---

function PayoffChart({
    curve,
    breakevens,
    currentPrice,
}: {
    curve: PayoffPoint[];
    breakevens: number[];
    currentPrice: number;
}) {
    if (curve.length === 0) return null;

    const W = 700;
    const H = 300;
    const PAD_L = 60;
    const PAD_R = 20;
    const PAD_T = 20;
    const PAD_B = 40;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    const minX = curve[0].stockPrice;
    const maxX = curve[curve.length - 1].stockPrice;

    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of curve) {
        if (p.pnl < minY) minY = p.pnl;
        if (p.pnl > maxY) maxY = p.pnl;
    }

    // Ensure zero line is visible
    if (minY > 0) minY = 0;
    if (maxY < 0) maxY = 0;
    // Add 10% padding
    const rangeY = maxY - minY || 1;
    minY -= rangeY * 0.1;
    maxY += rangeY * 0.1;

    const sx = (v: number) => PAD_L + ((v - minX) / (maxX - minX)) * chartW;
    const sy = (v: number) => PAD_T + ((maxY - v) / (maxY - minY)) * chartH;

    // Build polyline points
    const linePoints = curve.map((p) => `${sx(p.stockPrice)},${sy(p.pnl)}`).join(" ");

    // Zero line Y
    const zeroY = sy(0);

    // Profit polygon (above zero): curve clipped to above zero
    const profitPoly = buildClippedPolygon(curve, sx, sy, zeroY, "above", PAD_L, chartW);
    const lossPoly = buildClippedPolygon(curve, sx, sy, zeroY, "below", PAD_L, chartW);

    // Breakeven positions
    const bePoints = breakevens.map((b) => ({ x: sx(b), y: zeroY }));

    // Current price line
    const cpx = sx(currentPrice);

    // Y-axis labels
    const yTicks = 5;
    const yLabels: { y: number; label: string }[] = [];
    for (let i = 0; i <= yTicks; i++) {
        const val = minY + ((maxY - minY) * i) / yTicks;
        yLabels.push({ y: sy(val), label: formatDollar(val) });
    }

    // X-axis labels
    const xTicks = 5;
    const xLabels: { x: number; label: string }[] = [];
    for (let i = 0; i <= xTicks; i++) {
        const val = minX + ((maxX - minX) * i) / xTicks;
        xLabels.push({ x: sx(val), label: `$${val.toFixed(0)}` });
    }

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
            {/* Profit fill (green) */}
            {profitPoly && (
                <polygon points={profitPoly} fill="rgba(16,185,129,0.15)" stroke="none" />
            )}
            {/* Loss fill (red) */}
            {lossPoly && (
                <polygon points={lossPoly} fill="rgba(239,68,68,0.15)" stroke="none" />
            )}

            {/* Zero line */}
            <line
                x1={PAD_L}
                y1={zeroY}
                x2={W - PAD_R}
                y2={zeroY}
                stroke="rgba(255,255,255,0.2)"
                strokeDasharray="4 4"
                strokeWidth={1}
            />

            {/* Current price vertical */}
            {currentPrice >= minX && currentPrice <= maxX && (
                <line
                    x1={cpx}
                    y1={PAD_T}
                    x2={cpx}
                    y2={H - PAD_B}
                    stroke="rgba(255,255,255,0.15)"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                />
            )}

            {/* P/L curve */}
            <polyline
                points={linePoints}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeLinejoin="round"
            />

            {/* Breakeven dots */}
            {bePoints.map((bp, i) => (
                <circle key={i} cx={bp.x} cy={bp.y} r={4} fill="#eab308" />
            ))}

            {/* Y-axis labels */}
            {yLabels.map((yl, i) => (
                <text
                    key={i}
                    x={PAD_L - 8}
                    y={yl.y + 4}
                    textAnchor="end"
                    fill="#6b7280"
                    fontSize={10}
                >
                    {yl.label}
                </text>
            ))}

            {/* X-axis labels */}
            {xLabels.map((xl, i) => (
                <text
                    key={i}
                    x={xl.x}
                    y={H - PAD_B + 16}
                    textAnchor="middle"
                    fill="#6b7280"
                    fontSize={10}
                >
                    {xl.label}
                </text>
            ))}

            {/* Current price label */}
            {currentPrice >= minX && currentPrice <= maxX && (
                <text
                    x={cpx}
                    y={H - PAD_B + 30}
                    textAnchor="middle"
                    fill="#9ca3af"
                    fontSize={9}
                >
                    Current
                </text>
            )}
        </svg>
    );
}

/** Build a polygon that represents the P/L curve clipped to above or below the zero line */
function buildClippedPolygon(
    curve: PayoffPoint[],
    sx: (v: number) => number,
    sy: (v: number) => number,
    zeroY: number,
    region: "above" | "below",
    padL: number,
    chartW: number
): string | null {
    // Collect segments where curve is in the desired region
    const points: string[] = [];
    let inRegion = false;

    for (let i = 0; i < curve.length; i++) {
        const x = sx(curve[i].stockPrice);
        const y = sy(curve[i].pnl);
        const isInRegion = region === "above" ? y <= zeroY : y >= zeroY;

        if (isInRegion && !inRegion) {
            // Entering region - interpolate entry point
            if (i > 0) {
                const prevX = sx(curve[i - 1].stockPrice);
                const prevY = sy(curve[i - 1].pnl);
                if (prevY !== y) {
                    const ratio = Math.abs(zeroY - prevY) / Math.abs(y - prevY);
                    const interpX = prevX + ratio * (x - prevX);
                    points.push(`${interpX},${zeroY}`);
                }
            }
            points.push(`${x},${y}`);
            inRegion = true;
        } else if (!isInRegion && inRegion) {
            // Leaving region - interpolate exit point
            const prevX = sx(curve[i - 1].stockPrice);
            const prevY = sy(curve[i - 1].pnl);
            if (prevY !== y) {
                const ratio = Math.abs(zeroY - prevY) / Math.abs(y - prevY);
                const interpX = prevX + ratio * (x - prevX);
                points.push(`${interpX},${zeroY}`);
            }
            inRegion = false;
        } else if (isInRegion) {
            points.push(`${x},${y}`);
        }
    }

    // Close at zero line if we ended in region
    if (inRegion && points.length > 0) {
        const lastPoint = points[points.length - 1];
        const lastX = parseFloat(lastPoint.split(",")[0]);
        points.push(`${lastX},${zeroY}`);
    }

    // Close the polygon along zero line
    if (points.length > 0) {
        const firstPoint = points[0];
        const firstX = parseFloat(firstPoint.split(",")[0]);
        points.push(`${firstX},${zeroY}`);
    }

    return points.length >= 3 ? points.join(" ") : null;
}

function formatDollar(v: number): string {
    if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
    return `$${v.toFixed(0)}`;
}
