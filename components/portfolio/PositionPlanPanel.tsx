"use client";

import { useState, useMemo, useEffect } from "react";
import { Trash2, Plus, Pencil, LayoutGrid, Tag, X, Target, ChevronDown, ChevronUp, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    upsertPositionPlanSlot,
    removePositionPlanSlot,
    updateTierTargets,
    updateTierMaxSlots,
    fetchSymbolSector,
    autoTagAllSlots,
    initializeAllSlotDefaults,
} from "@/lib/actions/position-plan.actions";
import PlanOverviewBar from "./plan/PlanOverviewBar";
import CashPanel from "./plan/CashPanel";
import ExitPlanEditor from "./plan/ExitPlanEditor";
import RulesAuditPanel from "./plan/RulesAuditPanel";
import SectorRotationPanel from "./plan/SectorRotationPanel";

const TIER_LABELS = {
    core: "Core",
    satellite: "Satellite",
    speculative: "Speculative",
} as const;

const DEFAULT_TIER_TARGETS: TierTargets = { core: 70, satellite: 25, speculative: 5 };
const DEFAULT_TIER_MAX_SLOTS: TierMaxSlots = { core: 3, satellite: 6, speculative: 3 };

const TIERS: PositionTier[] = ["core", "satellite", "speculative"];

const PREDEFINED_TOPICS = [
    "AI Foundation", "AI Infrastructure", "Space Rocket", "EV", "Fintech",
    "Energy", "Biotech", "Semiconductor", "Defense", "Consumer Tech",
    "Healthcare", "Crypto", "Commodities", "Software", "Cloud",
    "Robotics", "Real Estate", "Industrial",
];

const TIER_COLORS = {
    core: {
        bg: "bg-teal-500/10", border: "border-teal-500/30", text: "text-teal-400",
        badge: "bg-teal-500/20 text-teal-300 border-teal-500/30",
        bar: "bg-teal-500", barBg: "bg-teal-500/20",
    },
    satellite: {
        bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400",
        badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
        bar: "bg-blue-500", barBg: "bg-blue-500/20",
    },
    speculative: {
        bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400",
        badge: "bg-orange-500/20 text-orange-300 border-orange-500/30",
        bar: "bg-orange-500", barBg: "bg-orange-500/20",
    },
};

interface PositionPlanPanelProps {
    userId: string;
    positionPlan: PositionPlanData | null;
    positions: PositionWithPriceData[];
    summary: PortfolioSummaryData | null;
    trades: TradeData[];
}

export default function PositionPlanPanel({
    userId,
    positionPlan,
    positions,
    summary,
    trades,
}: PositionPlanPanelProps) {
    const [plan, setPlan] = useState<PositionPlanData | null>(positionPlan);
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [addTier, setAddTier] = useState<PositionTier>("core");
    const [viewMode, setViewMode] = useState<"tier" | "sector">("tier");

    const tierTargets: TierTargets = plan?.tierTargets ?? DEFAULT_TIER_TARGETS;
    const tierMaxSlots: TierMaxSlots = plan?.tierMaxSlots ?? DEFAULT_TIER_MAX_SLOTS;
    const cashBalance = plan?.cashBalance ?? 0;
    const cashTransactions = plan?.cashTransactions ?? [];
    const maxTotalSlots = tierMaxSlots.core + tierMaxSlots.satellite + tierMaxSlots.speculative;

    const totalPortfolioValue = useMemo(
        () => positions.reduce((sum, p) => sum + p.marketValue, 0),
        [positions]
    );

    const totalAccountValue = totalPortfolioValue + cashBalance;

    const enrichedSlots: EnrichedPlanSlot[] = useMemo(() => {
        if (!plan?.slots) return [];
        return plan.slots.map((slot) => {
            const pos = positions.find((p) => p.symbol === slot.symbol);
            const actualAmount = pos ? pos.marketValue : 0;
            const actualPct = totalAccountValue > 0 ? (actualAmount / totalAccountValue) * 100 : 0;
            const targetPct = slot.targetPct ?? 0;
            const currentPrice = pos?.currentPrice ?? 0;
            const shares = pos?.shares ?? 0;

            let maxLossAmount: number | undefined;
            let stopLossDistance: number | undefined;
            if (slot.stopLossPrice && currentPrice > 0) {
                maxLossAmount = shares * (currentPrice - slot.stopLossPrice);
                stopLossDistance = ((currentPrice - slot.stopLossPrice) / currentPrice) * 100;
            }

            return {
                ...slot,
                stagedTargets: slot.stagedTargets || [],
                maxDrawdownPct: slot.maxDrawdownPct ?? 2,
                topics: slot.topics?.length ? slot.topics : [],
                actualPct,
                actualAmount,
                deltaPct: actualPct - targetPct,
                hasPosition: !!pos,
                currentPrice,
                maxLossAmount,
                stopLossDistance,
            };
        });
    }, [plan, positions, totalAccountValue]);

    const slotsByTier = useMemo(() => {
        const grouped: Record<PositionTier, EnrichedPlanSlot[]> = { core: [], satellite: [], speculative: [] };
        enrichedSlots.forEach((s) => grouped[s.tier].push(s));
        return grouped;
    }, [enrichedSlots]);

    const tierAggregates = useMemo(() => {
        const agg: Record<PositionTier, { actualPct: number; count: number }> = {
            core: { actualPct: 0, count: 0 }, satellite: { actualPct: 0, count: 0 }, speculative: { actualPct: 0, count: 0 },
        };
        enrichedSlots.forEach((s) => {
            agg[s.tier].actualPct += s.actualPct;
            agg[s.tier].count++;
        });
        return agg;
    }, [enrichedSlots]);

    // Group by sector
    const sectorGroups = useMemo(() => {
        const groups: Record<string, EnrichedPlanSlot[]> = {};
        enrichedSlots.forEach((s) => {
            const sector = s.sector || "Uncategorized";
            if (!groups[sector]) groups[sector] = [];
            groups[sector].push(s);
        });
        return groups;
    }, [enrichedSlots]);

    const [healthScore, setHealthScore] = useState(plan?.lastAuditResult?.totalScore ?? 100);

    const updatePlan = (result: unknown) => {
        if (result) setPlan(result as PositionPlanData);
    };

    const handleAdd = async (data: {
        symbol: string;
        tier: PositionTier;
        topics: string[];
        targetPct: number | null;
    }) => {
        try {
            updatePlan(await upsertPositionPlanSlot(userId, {
                symbol: data.symbol,
                tier: data.tier,
                topics: data.topics,
                targetPct: data.targetPct,
                targetAmount: null,
                notes: "",
            }));
            setAddDialogOpen(false);
        } catch (e: any) {
            alert(e.message || "Failed to add slot");
        }
    };

    const handleRemove = async (symbol: string) => {
        updatePlan(await removePositionPlanSlot(userId, symbol));
    };

    const handleUpdateTarget = async (slot: EnrichedPlanSlot, newPct: number | null) => {
        updatePlan(await upsertPositionPlanSlot(userId, {
            symbol: slot.symbol,
            tier: slot.tier,
            topics: slot.topics,
            targetPct: newPct,
            targetAmount: slot.targetAmount,
            notes: slot.notes,
            stagedTargets: slot.stagedTargets,
            stopLossPrice: slot.stopLossPrice,
            trailingStopPct: slot.trailingStopPct,
            maxDrawdownPct: slot.maxDrawdownPct,
            sector: slot.sector,
            industry: slot.industry,
        }));
    };

    const handleUpdateTopics = async (slot: EnrichedPlanSlot, newTopics: string[]) => {
        updatePlan(await upsertPositionPlanSlot(userId, {
            symbol: slot.symbol,
            tier: slot.tier,
            topics: newTopics,
            targetPct: slot.targetPct,
            targetAmount: slot.targetAmount,
            notes: slot.notes,
            stagedTargets: slot.stagedTargets,
            stopLossPrice: slot.stopLossPrice,
            trailingStopPct: slot.trailingStopPct,
            maxDrawdownPct: slot.maxDrawdownPct,
            sector: slot.sector,
            industry: slot.industry,
        }));
    };

    const handleTierTargetChange = async (tier: PositionTier, value: number) => {
        try {
            updatePlan(await updateTierTargets(userId, { ...tierTargets, [tier]: value }));
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleTierMaxSlotsChange = async (tier: PositionTier, value: number) => {
        try {
            updatePlan(await updateTierMaxSlots(userId, { ...tierMaxSlots, [tier]: value }));
        } catch (e: any) {
            alert(e.message);
        }
    };

    const [autoTagging, setAutoTagging] = useState(false);
    const [initializing, setInitializing] = useState(false);
    const hasUntagged = enrichedSlots.some((s) => !s.sector);
    const hasMissingStopLoss = enrichedSlots.some((s) => !s.stopLossPrice && s.hasPosition);
    const needsInit = hasUntagged || hasMissingStopLoss;

    const handleAutoTagAll = async () => {
        setAutoTagging(true);
        try {
            updatePlan(await autoTagAllSlots(userId));
        } finally {
            setAutoTagging(false);
        }
    };

    const handleInitializeAll = async () => {
        setInitializing(true);
        try {
            updatePlan(await initializeAllSlotDefaults(userId, positions));
        } finally {
            setInitializing(false);
        }
    };

    function getStatusColor(diff: number) {
        const abs = Math.abs(diff);
        if (abs <= 5) return "text-green-400";
        if (abs <= 15) return "text-amber-400";
        return "text-red-400";
    }

    return (
        <div className="space-y-6">
            {/* Overview Bar */}
            <PlanOverviewBar
                cashBalance={cashBalance}
                totalAccountValue={totalAccountValue}
                totalSlots={enrichedSlots.length}
                maxSlots={Math.min(maxTotalSlots, 12)}
                healthScore={healthScore}
            />

            {/* View toggle + auto-tag */}
            <div className="flex items-center gap-2">
                <Button
                    variant={viewMode === "tier" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("tier")}
                    className="gap-1.5"
                >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    By Tier
                </Button>
                <Button
                    variant={viewMode === "sector" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("sector")}
                    className="gap-1.5"
                >
                    <Building2 className="h-3.5 w-3.5" />
                    By Sector
                </Button>
                {needsInit && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleInitializeAll}
                        disabled={initializing}
                        className="gap-1.5 ml-auto text-gray-400 hover:text-gray-200"
                    >
                        <Tag className="h-3.5 w-3.5" />
                        {initializing ? "Initializing..." : "Auto-setup all slots"}
                    </Button>
                )}
            </div>

            {/* Tier Health Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {TIERS.map((tier) => (
                    <TierHealthCard
                        key={tier}
                        tier={tier}
                        tierTargets={tierTargets}
                        tierMaxSlots={tierMaxSlots}
                        agg={tierAggregates[tier]}
                        onTargetChange={handleTierTargetChange}
                        onMaxSlotsChange={handleTierMaxSlotsChange}
                        getStatusColor={getStatusColor}
                    />
                ))}
            </div>

            {viewMode === "tier" ? (
                /* Tier Columns */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {TIERS.map((tier) => {
                        const colors = TIER_COLORS[tier];
                        const slots = slotsByTier[tier];
                        const maxSlots = tierMaxSlots[tier];
                        const isFull = slots.length >= maxSlots;

                        return (
                            <Card key={tier} className="border border-gray-800 bg-gray-900/50">
                                <CardHeader className="pb-3">
                                    <CardTitle className={`text-sm font-semibold ${colors.text}`}>
                                        {TIER_LABELS[tier]}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {slots.length === 0 && (
                                        <p className="text-xs text-gray-600 py-4 text-center">No slots yet</p>
                                    )}
                                    {slots.map((slot) => (
                                        <SlotRow
                                            key={slot.symbol}
                                            userId={userId}
                                            slot={slot}
                                            totalAccountValue={totalAccountValue}
                                            onRemove={handleRemove}
                                            onUpdateTarget={handleUpdateTarget}
                                            onUpdateTopics={handleUpdateTopics}
                                            onPlanUpdate={updatePlan}
                                            getStatusColor={getStatusColor}
                                        />
                                    ))}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={isFull || enrichedSlots.length >= 12}
                                        className="w-full text-gray-500 hover:text-gray-300 border border-dashed border-gray-700 hover:border-gray-600"
                                        onClick={() => { setAddTier(tier); setAddDialogOpen(true); }}
                                    >
                                        <Plus className="h-3.5 w-3.5 mr-1" />
                                        Add {isFull ? `(${maxSlots}/${maxSlots})` : `(${slots.length}/${maxSlots})`}
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                /* Sector View */
                <div className="space-y-4">
                    {Object.entries(sectorGroups).length === 0 && (
                        <Card className="border border-gray-800 bg-gray-900/50">
                            <CardContent className="py-8 text-center text-gray-600 text-sm">
                                No slots yet. Add symbols to get started.
                            </CardContent>
                        </Card>
                    )}
                    {Object.entries(sectorGroups)
                        .sort((a, b) => {
                            const totalA = a[1].reduce((s, sl) => s + sl.actualPct, 0);
                            const totalB = b[1].reduce((s, sl) => s + sl.actualPct, 0);
                            return totalB - totalA;
                        })
                        .map(([sector, slots]) => {
                            const totalPct = slots.reduce((s, sl) => s + sl.actualPct, 0);
                            return (
                                <Card key={sector} className="border border-gray-800 bg-gray-900/50">
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-sm font-semibold text-gray-200">{sector}</CardTitle>
                                            <span className="text-xs text-gray-400">{totalPct.toFixed(1)}% of account</span>
                                        </div>
                                        <div className="flex gap-0.5 h-3 rounded overflow-hidden bg-gray-800 mt-1">
                                            {slots.map((sl) => {
                                                const widthPct = totalAccountValue > 0 ? (sl.actualAmount / totalAccountValue) * 100 : 0;
                                                return (
                                                    <div
                                                        key={sl.symbol}
                                                        className={`${TIER_COLORS[sl.tier].bar} relative group`}
                                                        style={{ width: `${Math.max(widthPct, 0.5)}%` }}
                                                        title={`${sl.symbol}: ${sl.actualPct.toFixed(1)}%`}
                                                    >
                                                        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity truncate px-0.5">
                                                            {sl.symbol}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        {slots.map((slot) => (
                                            <SlotRow
                                                key={slot.symbol}
                                                userId={userId}
                                                slot={slot}
                                                totalAccountValue={totalAccountValue}
                                                onRemove={handleRemove}
                                                onUpdateTarget={handleUpdateTarget}
                                                onUpdateTopics={handleUpdateTopics}
                                                onPlanUpdate={updatePlan}
                                                getStatusColor={getStatusColor}
                                            />
                                        ))}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={enrichedSlots.length >= 12}
                        className="w-full text-gray-500 hover:text-gray-300 border border-dashed border-gray-700 hover:border-gray-600"
                        onClick={() => { setAddTier("satellite"); setAddDialogOpen(true); }}
                    >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Symbol
                    </Button>
                </div>
            )}

            {/* Cash Management */}
            <CashPanel
                userId={userId}
                cashBalance={cashBalance}
                cashTransactions={cashTransactions}
                totalAccountValue={totalAccountValue}
                onUpdate={updatePlan}
            />

            {/* Rules Audit */}
            <RulesAuditPanel userId={userId} positions={positions} trades={trades} lastAuditResult={plan?.lastAuditResult} onScoreChange={setHealthScore} />

            {/* Sector Rotation */}
            <SectorRotationPanel slots={plan?.slots || []} positions={positions} />

            <AddSlotDialog
                open={addDialogOpen}
                onOpenChange={setAddDialogOpen}
                tier={addTier}
                positions={positions}
                existingSymbols={enrichedSlots.map((s) => s.symbol)}
                onAdd={handleAdd}
            />
        </div>
    );
}

// ---------- Tier Health Card ----------
function TierHealthCard({
    tier,
    tierTargets,
    tierMaxSlots,
    agg,
    onTargetChange,
    onMaxSlotsChange,
    getStatusColor,
}: {
    tier: PositionTier;
    tierTargets: TierTargets;
    tierMaxSlots: TierMaxSlots;
    agg: { actualPct: number; count: number };
    onTargetChange: (tier: PositionTier, value: number) => void;
    onMaxSlotsChange: (tier: PositionTier, value: number) => void;
    getStatusColor: (diff: number) => string;
}) {
    const colors = TIER_COLORS[tier];
    const target = tierTargets[tier];
    const maxSlots = tierMaxSlots[tier];
    const diff = agg.actualPct - target;
    const fillPct = target > 0 ? Math.min((agg.actualPct / target) * 100, 100) : 0;

    const [editingTarget, setEditingTarget] = useState(false);
    const [editTargetVal, setEditTargetVal] = useState(target.toString());
    const [editingSlots, setEditingSlots] = useState(false);
    const [editSlotsVal, setEditSlotsVal] = useState(maxSlots.toString());

    return (
        <Card className={`${colors.bg} ${colors.border} border bg-gray-900/50`}>
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                    <span className={`font-semibold ${colors.text}`}>{TIER_LABELS[tier]}</span>
                    {editingSlots ? (
                        <input
                            type="number"
                            className="w-10 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs text-gray-200 text-center"
                            value={editSlotsVal}
                            autoFocus
                            onChange={(e) => setEditSlotsVal(e.target.value)}
                            onBlur={() => {
                                const parsed = parseInt(editSlotsVal);
                                if (!isNaN(parsed) && parsed >= 1) onMaxSlotsChange(tier, parsed);
                                setEditingSlots(false);
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        />
                    ) : (
                        <button
                            className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-0.5"
                            onClick={() => { setEditSlotsVal(maxSlots.toString()); setEditingSlots(true); }}
                        >
                            {agg.count}/{maxSlots} slots
                            <Pencil className="h-2.5 w-2.5" />
                        </button>
                    )}
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-lg font-bold text-gray-100">{agg.actualPct.toFixed(1)}%</span>
                    <span className="text-xs text-gray-500">/ </span>
                    {editingTarget ? (
                        <input
                            type="number"
                            className="w-12 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs text-gray-200"
                            value={editTargetVal}
                            autoFocus
                            onChange={(e) => setEditTargetVal(e.target.value)}
                            onBlur={() => {
                                const parsed = parseFloat(editTargetVal);
                                if (!isNaN(parsed) && parsed >= 0) onTargetChange(tier, parsed);
                                setEditingTarget(false);
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        />
                    ) : (
                        <button
                            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-0.5"
                            onClick={() => { setEditTargetVal(target.toString()); setEditingTarget(true); }}
                        >
                            {target}% target
                            <Pencil className="h-2.5 w-2.5" />
                        </button>
                    )}
                    <span className={`text-xs font-medium ${getStatusColor(diff)}`}>
                        {diff >= 0 ? "+" : ""}{diff.toFixed(1)}%
                    </span>
                </div>
                <div className={`h-2 rounded-full ${colors.barBg}`}>
                    <div className={`h-2 rounded-full ${colors.bar} transition-all`} style={{ width: `${fillPct}%` }} />
                </div>
            </CardContent>
        </Card>
    );
}

// ---------- Enhanced Slot Row ----------
function SlotRow({
    userId,
    slot,
    totalAccountValue,
    onRemove,
    onUpdateTarget,
    onUpdateTopics,
    onPlanUpdate,
    getStatusColor,
}: {
    userId: string;
    slot: EnrichedPlanSlot;
    totalAccountValue: number;
    onRemove: (symbol: string) => void;
    onUpdateTarget: (slot: EnrichedPlanSlot, pct: number | null) => void;
    onUpdateTopics: (slot: EnrichedPlanSlot, topics: string[]) => void;
    onPlanUpdate: (plan: any) => void;
    getStatusColor: (diff: number) => string;
}) {
    const colors = TIER_COLORS[slot.tier];
    const [editingTarget, setEditingTarget] = useState(false);
    const [targetVal, setTargetVal] = useState(slot.targetPct?.toString() ?? "");
    const [topicOpen, setTopicOpen] = useState(false);
    const [customTopic, setCustomTopic] = useState("");
    const [exitPlanOpen, setExitPlanOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const targetPct = slot.targetPct ?? 0;
    const maxBar = Math.max(slot.actualPct, targetPct, 1);

    // Drawdown gauge
    const maxDrawdownPct = slot.maxDrawdownPct || 2;
    const maxDrawdownAmount = totalAccountValue * (maxDrawdownPct / 100);
    const drawdownFill = slot.maxLossAmount && maxDrawdownAmount > 0
        ? Math.min((slot.maxLossAmount / maxDrawdownAmount) * 100, 150)
        : 0;

    const toggleTopic = (topic: string) => {
        const current = slot.topics || [];
        const newTopics = current.includes(topic)
            ? current.filter((t) => t !== topic)
            : [...current, topic];
        onUpdateTopics(slot, newTopics);
    };

    const addCustomTopic = () => {
        const trimmed = customTopic.trim();
        if (!trimmed) return;
        const current = slot.topics || [];
        if (!current.includes(trimmed)) onUpdateTopics(slot, [...current, trimmed]);
        setCustomTopic("");
    };

    const removeTopic = (topic: string) => {
        onUpdateTopics(slot, (slot.topics || []).filter((t) => t !== topic));
    };

    return (
        <>
            <div className="p-2.5 rounded-lg bg-gray-800/50 border border-gray-700/50 space-y-1.5">
                {/* Row 1: Symbol + Market Value + Actions */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-gray-300">
                            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                        <span className={`font-mono font-bold text-sm ${slot.hasPosition ? "text-gray-100" : "text-gray-500"}`}>
                            {slot.symbol}
                        </span>
                        <span className={`text-[10px] px-1 py-0.5 rounded ${colors.badge} opacity-60`}>
                            {slot.tier}
                        </span>
                        {slot.sector && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-gray-700/50 text-gray-400">
                                {slot.sector}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        {slot.hasPosition && (
                            <span className="text-xs text-gray-300 font-mono">
                                ${slot.actualAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                        )}
                        <span className={`text-xs font-medium ${getStatusColor(slot.deltaPct)}`}>
                            {slot.deltaPct >= 0 ? "+" : ""}{slot.deltaPct.toFixed(1)}%
                        </span>
                        <button onClick={() => setExitPlanOpen(true)} className="text-gray-600 hover:text-blue-400 transition-colors" title="Exit Plan">
                            <Target className="h-3 w-3" />
                        </button>
                        <button onClick={() => onRemove(slot.symbol)} className="text-gray-600 hover:text-red-400 transition-colors">
                            <Trash2 className="h-3 w-3" />
                        </button>
                    </div>
                </div>

                {/* Row 2: Progress bar + stop loss + targets indicators */}
                <div className="relative h-3 rounded bg-gray-700/50">
                    <div
                        className={`absolute inset-y-0 left-0 rounded ${colors.bar} opacity-60`}
                        style={{ width: `${(slot.actualPct / maxBar) * 100}%` }}
                    />
                    {targetPct > 0 && (
                        <div
                            className="absolute top-0 bottom-0 w-0.5 bg-white/60"
                            style={{ left: `${(targetPct / maxBar) * 100}%` }}
                            title={`Target: ${targetPct}%`}
                        />
                    )}
                    {/* Staged target markers */}
                    {slot.stagedTargets && slot.stagedTargets.length > 0 && slot.currentPrice && slot.currentPrice > 0 && (
                        slot.stagedTargets.map((t, i) => {
                            if (!t.price) return null;
                            return (
                                <div
                                    key={i}
                                    className={`absolute top-0 w-1.5 h-1.5 rounded-full ${t.reached ? "bg-green-400" : "bg-blue-400"}`}
                                    style={{ left: `${Math.min((i + 1) / (slot.stagedTargets.length + 1) * 100, 95)}%`, top: "-1px" }}
                                    title={`${t.label}: $${t.price}`}
                                />
                            );
                        })
                    )}
                </div>

                {/* Row 3: Stop loss + Drawdown gauge */}
                <div className="flex items-center gap-3 text-[10px]">
                    <div className="flex items-center gap-1 text-gray-500">
                        <span>Actual: {slot.actualPct.toFixed(1)}%</span>
                        <span className="mx-0.5">|</span>
                        {editingTarget ? (
                            <input
                                type="number"
                                className="w-14 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-[10px] text-gray-200"
                                value={targetVal}
                                autoFocus
                                onChange={(e) => setTargetVal(e.target.value)}
                                onBlur={() => {
                                    const parsed = parseFloat(targetVal);
                                    onUpdateTarget(slot, isNaN(parsed) ? null : parsed);
                                    setEditingTarget(false);
                                }}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            />
                        ) : (
                            <button
                                className="hover:text-gray-300 flex items-center gap-0.5"
                                onClick={() => { setTargetVal(slot.targetPct?.toString() ?? ""); setEditingTarget(true); }}
                            >
                                Target: {slot.targetPct != null ? `${slot.targetPct}%` : "—"}
                                <Pencil className="h-2.5 w-2.5" />
                            </button>
                        )}
                    </div>

                    {/* Stop Loss indicator */}
                    {slot.stopLossPrice && (
                        <span className="text-red-400">
                            SL: ${slot.stopLossPrice.toFixed(2)}
                            {slot.stopLossDistance != null && ` (-${slot.stopLossDistance.toFixed(1)}%)`}
                        </span>
                    )}

                    {/* Drawdown gauge */}
                    {slot.maxLossAmount != null && slot.maxLossAmount > 0 && (
                        <div className="flex items-center gap-1 ml-auto">
                            <span className={drawdownFill > 100 ? "text-red-400" : "text-gray-500"}>
                                Risk: ${slot.maxLossAmount.toFixed(0)}
                            </span>
                            <div className="w-12 h-1.5 rounded-full bg-gray-700">
                                <div
                                    className={`h-1.5 rounded-full transition-all ${drawdownFill > 100 ? "bg-red-500" : drawdownFill > 70 ? "bg-yellow-500" : "bg-green-500"}`}
                                    style={{ width: `${Math.min(drawdownFill, 100)}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Expanded: tags */}
                {expanded && (
                    <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-gray-700/30">
                        {(slot.topics || []).map((t) => (
                            <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-0.5 ${colors.badge}`}>
                                {t}
                                <button onClick={() => removeTopic(t)} className="hover:text-white">
                                    <X className="h-2 w-2" />
                                </button>
                            </span>
                        ))}
                        <Popover open={topicOpen} onOpenChange={setTopicOpen}>
                            <PopoverTrigger asChild>
                                <button className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-gray-600 text-gray-500 hover:text-gray-300 hover:border-gray-500">
                                    <Plus className="h-2.5 w-2.5 inline" /> tag
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-52 p-2 bg-gray-900 border-gray-700" align="start">
                                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                                    {PREDEFINED_TOPICS.map((t) => {
                                        const isActive = (slot.topics || []).includes(t);
                                        return (
                                            <button
                                                key={t}
                                                className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-800 ${isActive ? "text-white bg-gray-800 font-medium" : "text-gray-400"}`}
                                                onClick={() => toggleTopic(t)}
                                            >
                                                {isActive ? "✓ " : ""}{t}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="flex gap-1 mt-2">
                                    <Input
                                        placeholder="Custom..."
                                        value={customTopic}
                                        onChange={(e) => setCustomTopic(e.target.value)}
                                        className="bg-gray-800 border-gray-700 text-gray-200 text-xs h-7 flex-1"
                                        onKeyDown={(e) => { if (e.key === "Enter") addCustomTopic(); }}
                                    />
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={addCustomTopic}>+</Button>
                                </div>
                            </PopoverContent>
                        </Popover>

                        {slot.industry && (
                            <span className="text-[10px] text-gray-600 ml-auto">{slot.industry}</span>
                        )}
                    </div>
                )}
            </div>

            {/* Exit Plan Editor */}
            <ExitPlanEditor
                userId={userId}
                slot={slot}
                open={exitPlanOpen}
                onOpenChange={setExitPlanOpen}
                onUpdate={onPlanUpdate}
            />
        </>
    );
}

// ---------- Add Slot Dialog ----------
function AddSlotDialog({
    open,
    onOpenChange,
    tier,
    positions,
    existingSymbols,
    onAdd,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tier: PositionTier;
    positions: PositionWithPriceData[];
    existingSymbols: string[];
    onAdd: (data: { symbol: string; tier: PositionTier; topics: string[]; targetPct: number | null }) => void;
}) {
    const [symbol, setSymbol] = useState("");
    const [topics, setTopics] = useState<string[]>([]);
    const [targetPct, setTargetPct] = useState("");
    const [selectedTier, setSelectedTier] = useState<PositionTier>(tier);
    const [loadingIndustry, setLoadingIndustry] = useState(false);
    const [customTopic, setCustomTopic] = useState("");

    const availablePositions = positions.filter((p) => !existingSymbols.includes(p.symbol));

    useEffect(() => {
        if (!symbol.trim()) return;
        const sym = symbol.trim().toUpperCase();
        let cancelled = false;

        const timer = setTimeout(async () => {
            setLoadingIndustry(true);
            try {
                const { sector, industry } = await fetchSymbolSector(sym);
                if (cancelled) return;
                const newTags: string[] = [];
                if (sector && !topics.includes(sector)) newTags.push(sector);
                if (industry && industry !== sector && !topics.includes(industry)) newTags.push(industry);
                if (newTags.length > 0) {
                    setTopics((prev) => [...newTags.filter((t) => !prev.includes(t)), ...prev]);
                }
            } finally {
                if (!cancelled) setLoadingIndustry(false);
            }
        }, 300);

        return () => { cancelled = true; clearTimeout(timer); };
    }, [symbol]);

    const handleSubmit = () => {
        const sym = symbol.trim().toUpperCase();
        if (!sym) return;
        const parsed = parseFloat(targetPct);
        onAdd({ symbol: sym, tier: selectedTier, topics, targetPct: isNaN(parsed) ? null : parsed });
        setSymbol(""); setTopics([]); setTargetPct(""); setCustomTopic("");
    };

    const handleOpenChange = (val: boolean) => {
        if (val) { setSelectedTier(tier); setSymbol(""); setTopics([]); setTargetPct(""); setCustomTopic(""); }
        onOpenChange(val);
    };

    const toggleTopic = (t: string) => {
        setTopics((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
    };

    const addCustom = () => {
        const trimmed = customTopic.trim();
        if (trimmed && !topics.includes(trimmed)) setTopics((prev) => [...prev, trimmed]);
        setCustomTopic("");
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="bg-gray-900 border-gray-700 text-gray-100 sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-gray-100">Add Symbol to Plan</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label className="text-gray-400 text-xs">Symbol</Label>
                        {availablePositions.length > 0 && (
                            <Select value={symbol} onValueChange={setSymbol}>
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 mt-1">
                                    <SelectValue placeholder="Select from positions..." />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                    {availablePositions.map((p) => (
                                        <SelectItem key={p.symbol} value={p.symbol} className="text-gray-200">
                                            {p.symbol} — {p.company}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <Input
                            placeholder="Or type symbol manually..."
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                            className="bg-gray-800 border-gray-700 text-gray-200 mt-1.5 text-xs"
                        />
                    </div>

                    <div>
                        <Label className="text-gray-400 text-xs">Tier</Label>
                        <Select value={selectedTier} onValueChange={(v) => setSelectedTier(v as PositionTier)}>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700">
                                {TIERS.map((t) => (
                                    <SelectItem key={t} value={t} className="text-gray-200">{TIER_LABELS[t]}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label className="text-gray-400 text-xs">
                            Topics {loadingIndustry && <span className="text-gray-600 ml-1">(fetching...)</span>}
                        </Label>
                        {topics.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                                {topics.map((t) => (
                                    <span key={t} className="text-xs px-2 py-0.5 rounded bg-gray-800 border border-gray-600 text-gray-300 inline-flex items-center gap-1">
                                        {t}
                                        <button onClick={() => toggleTopic(t)}><X className="h-2.5 w-2.5 hover:text-red-400" /></button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {PREDEFINED_TOPICS.filter((t) => !topics.includes(t)).map((t) => (
                                <button
                                    key={t}
                                    className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500"
                                    onClick={() => toggleTopic(t)}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-1 mt-1.5">
                            <Input
                                placeholder="Custom topic..."
                                value={customTopic}
                                onChange={(e) => setCustomTopic(e.target.value)}
                                className="bg-gray-800 border-gray-700 text-gray-200 text-xs h-7 flex-1"
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                            />
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={addCustom}>+</Button>
                        </div>
                    </div>

                    <div>
                        <Label className="text-gray-400 text-xs">Target %</Label>
                        <Input
                            type="number"
                            placeholder="e.g. 15"
                            value={targetPct}
                            onChange={(e) => setTargetPct(e.target.value)}
                            className="bg-gray-800 border-gray-700 text-gray-200 mt-1"
                        />
                    </div>

                    <Button onClick={handleSubmit} disabled={!symbol.trim()} className="w-full">
                        Add to Plan
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
