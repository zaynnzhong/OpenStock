"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createAlert, createPctChangeAlert, createSMAAlert } from "@/lib/actions/alert.actions";
import { toast } from "sonner";

interface CreateAlertModalProps {
    userId: string;
    symbol: string;
    currentPrice: number;
    companyName?: string;
    onAlertCreated?: () => void;
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

type AlertTab = "price" | "pct_change" | "sma_cross";

export default function CreateAlertModal({
    userId,
    symbol,
    currentPrice,
    companyName = "",
    onAlertCreated,
    children,
    open: controlledOpen,
    onOpenChange: setControlledOpen
}: CreateAlertModalProps) {
    const [internalOpen, setInternalOpen] = useState(false);

    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? setControlledOpen : setInternalOpen;

    const [activeTab, setActiveTab] = useState<AlertTab>("price");
    const [loading, setLoading] = useState(false);

    // Price alert state
    const [targetPrice, setTargetPrice] = useState<string>(currentPrice.toString());
    const [condition, setCondition] = useState<"ABOVE" | "BELOW">("ABOVE");

    // Pct change state
    const [pctThreshold, setPctThreshold] = useState<string>("10");
    const [pctDirection, setPctDirection] = useState<"above" | "below">("above");

    // SMA cross state
    const [smaIndicator, setSmaIndicator] = useState<"sma200d" | "sma20w" | "sma50w">("sma200d");
    const [smaCrossDirection, setSmaCrossDirection] = useState<"above" | "below">("above");

    React.useEffect(() => {
        setTargetPrice(currentPrice.toString());
    }, [currentPrice]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (activeTab === "price") {
                await createAlert({
                    userId,
                    symbol,
                    targetPrice: parseFloat(targetPrice),
                    condition,
                });
            } else if (activeTab === "pct_change") {
                await createPctChangeAlert({
                    userId,
                    symbol,
                    threshold: parseFloat(pctThreshold),
                    direction: pctDirection,
                    basePrice: currentPrice,
                });
            } else if (activeTab === "sma_cross") {
                await createSMAAlert({
                    userId,
                    symbol,
                    indicator: smaIndicator,
                    crossDirection: smaCrossDirection,
                });
            }
            toast.success("Alert created successfully");
            setOpen?.(false);
            if (onAlertCreated) onAlertCreated();
        } catch (error) {
            console.error(error);
            toast.error("Failed to create alert");
        } finally {
            setLoading(false);
        }
    };

    const tabs: { key: AlertTab; label: string }[] = [
        { key: "price", label: "Price" },
        { key: "pct_change", label: "% Change" },
        { key: "sma_cross", label: "SMA Cross" },
    ];

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {children && (
                <DialogTrigger asChild>
                    {children}
                </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-[425px] bg-[#0A0A0A] border-gray-800 text-white shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold tracking-tight text-white mb-2">Create Alert</DialogTitle>
                </DialogHeader>

                {/* Stock Identifier */}
                <div className="grid gap-2 pb-2">
                    <Label className="text-gray-400 text-sm font-medium">Stock</Label>
                    <div className="relative">
                        <Input
                            disabled
                            value={`${companyName || symbol} (${symbol})`}
                            className="bg-[#1C1C1F] border-none text-gray-500 shadow-inner rounded-md h-10"
                        />
                    </div>
                </div>

                {/* Alert Type Tabs */}
                <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                activeTab === tab.key
                                    ? "bg-yellow-500/20 text-yellow-400"
                                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 py-2 relative z-10">
                    {activeTab === "price" && (
                        <>
                            <div className="grid gap-2">
                                <Label className="text-gray-400 text-sm font-medium">Condition</Label>
                                <Select value={condition} onValueChange={(val: any) => setCondition(val)}>
                                    <SelectTrigger className="bg-[#1C1C1F] border-gray-800 text-gray-200 hover:border-gray-700 transition-colors">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1C1C1F] border-gray-800 text-gray-200">
                                        <SelectItem value="ABOVE">Greater than {">"}</SelectItem>
                                        <SelectItem value="BELOW">Less than {"<"}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label className="text-gray-400 text-sm font-medium">Target Price</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500 font-semibold">$</span>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={targetPrice}
                                        onChange={(e) => setTargetPrice(e.target.value)}
                                        placeholder="eg: 140"
                                        className="pl-7 bg-[#1C1C1F] border-gray-800 text-white placeholder:text-gray-600 focus:border-yellow-500 focus:ring-yellow-500/20 transition-all rounded-md h-10 font-mono"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === "pct_change" && (
                        <>
                            <div className="grid gap-2">
                                <Label className="text-gray-400 text-sm font-medium">Direction</Label>
                                <Select value={pctDirection} onValueChange={(val: any) => setPctDirection(val)}>
                                    <SelectTrigger className="bg-[#1C1C1F] border-gray-800 text-gray-200 hover:border-gray-700 transition-colors">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1C1C1F] border-gray-800 text-gray-200">
                                        <SelectItem value="above">Gains above</SelectItem>
                                        <SelectItem value="below">Drops below</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label className="text-gray-400 text-sm font-medium">Threshold (%)</Label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        step="0.1"
                                        min="0.1"
                                        value={pctThreshold}
                                        onChange={(e) => setPctThreshold(e.target.value)}
                                        placeholder="eg: 10"
                                        className="bg-[#1C1C1F] border-gray-800 text-white placeholder:text-gray-600 focus:border-yellow-500 focus:ring-yellow-500/20 transition-all rounded-md h-10 font-mono"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                                </div>
                            </div>

                            <div className="bg-white/5 rounded-lg px-3 py-2 text-xs text-gray-400">
                                Base price: <span className="text-white font-mono">${currentPrice.toFixed(2)}</span>
                                <span className="text-gray-600 ml-2">
                                    (triggers at ${(currentPrice * (1 + (pctDirection === 'above' ? 1 : -1) * parseFloat(pctThreshold || '0') / 100)).toFixed(2)})
                                </span>
                            </div>
                        </>
                    )}

                    {activeTab === "sma_cross" && (
                        <>
                            <div className="grid gap-2">
                                <Label className="text-gray-400 text-sm font-medium">SMA Indicator</Label>
                                <Select value={smaIndicator} onValueChange={(val: any) => setSmaIndicator(val)}>
                                    <SelectTrigger className="bg-[#1C1C1F] border-gray-800 text-gray-200 hover:border-gray-700 transition-colors">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1C1C1F] border-gray-800 text-gray-200">
                                        <SelectItem value="sma200d">SMA 200 Day</SelectItem>
                                        <SelectItem value="sma20w">SMA 20 Week</SelectItem>
                                        <SelectItem value="sma50w">SMA 50 Week</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label className="text-gray-400 text-sm font-medium">Cross Direction</Label>
                                <Select value={smaCrossDirection} onValueChange={(val: any) => setSmaCrossDirection(val)}>
                                    <SelectTrigger className="bg-[#1C1C1F] border-gray-800 text-gray-200 hover:border-gray-700 transition-colors">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1C1C1F] border-gray-800 text-gray-200">
                                        <SelectItem value="above">Price crosses above SMA</SelectItem>
                                        <SelectItem value="below">Price crosses below SMA</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="bg-white/5 rounded-lg px-3 py-2 text-xs text-gray-400">
                                Continuous monitoring — re-alerts each time price crosses the SMA in the selected direction (24h cooldown).
                            </div>
                        </>
                    )}

                    {/* Expiry Note */}
                    <div className="pt-1">
                        <p className="text-xs text-gray-500 flex items-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/50 mr-2"></span>
                            {activeTab === "price"
                                ? "Alert expires automatically in 90 days"
                                : "Continuous alert — monitors until you delete it (90 day expiry)"
                            }
                        </p>
                    </div>

                    <div className="pt-4">
                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#FACC15] hover:bg-[#EAB308] text-black font-bold h-11 text-base transition-all shadow-[0_0_15px_rgba(250,204,21,0.2)]"
                        >
                            {loading ? "Creating Alert..." : "Create Alert"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
