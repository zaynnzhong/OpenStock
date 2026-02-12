"use client";
import React, { useMemo, useState } from "react";
import { addToWatchlist, removeFromWatchlist } from "@/lib/actions/watchlist.actions";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface WatchlistButtonProps {
    symbol: string;
    company: string;
    isInWatchlist: boolean;
    showTrashIcon?: boolean;
    type?: "button" | "icon";
    userId?: string;
    onWatchlistChange?: (symbol: string, added: boolean) => void;
}

const WatchlistButton = ({
    symbol,
    company,
    isInWatchlist,
    showTrashIcon = false,
    type = "button",
    userId,
    onWatchlistChange,
}: WatchlistButtonProps) => {
    const [added, setAdded] = useState<boolean>(!!isInWatchlist);
    const [loading, setLoading] = useState(false);
    const [showHoldingsDialog, setShowHoldingsDialog] = useState(false);
    const [shares, setShares] = useState("");
    const [avgCost, setAvgCost] = useState("");

    const label = useMemo(() => {
        if (type === "icon") return added ? "" : "";
        return added ? "Remove from Watchlist" : "Add to Watchlist";
    }, [added, type]);

    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();

        if (!userId && !onWatchlistChange) {
            console.error("WatchlistButton: userId or onWatchlistChange is required");
            toast.error("Please sign in to modify watchlist");
            return;
        }

        if (added) {
            // Remove flow — no dialog needed
            setAdded(false);
            setLoading(true);
            try {
                if (userId) {
                    await removeFromWatchlist(userId, symbol);
                    toast.success(`${symbol} removed from watchlist`);
                }
                onWatchlistChange?.(symbol, false);
            } catch (error) {
                console.error("Watchlist action failed:", error);
                setAdded(true);
                toast.error("Failed to update watchlist");
            } finally {
                setLoading(false);
            }
        } else {
            // Add flow — show holdings dialog
            setShares("");
            setAvgCost("");
            setShowHoldingsDialog(true);
        }
    };

    const handleAddWithHoldings = async () => {
        setShowHoldingsDialog(false);
        setAdded(true);
        setLoading(true);

        const sharesNum = parseFloat(shares) || 0;
        const avgCostNum = parseFloat(avgCost) || 0;

        try {
            if (userId) {
                // First create the watchlist entry
                await addToWatchlist(userId, symbol, company);
                // Then set shares/avgCost via API (bypasses Mongoose model cache)
                if (sharesNum > 0 || avgCostNum > 0) {
                    await fetch("/api/holdings", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            userId,
                            symbol,
                            shares: sharesNum,
                            avgCost: avgCostNum,
                        }),
                    });
                }
                toast.success(`${symbol} added to watchlist`);
            }
            onWatchlistChange?.(symbol, true);
        } catch (error) {
            console.error("Watchlist action failed:", error);
            setAdded(false);
            toast.error("Failed to add to watchlist");
        } finally {
            setLoading(false);
        }
    };

    const handleSkipHoldings = async () => {
        setShowHoldingsDialog(false);
        setAdded(true);
        setLoading(true);

        try {
            if (userId) {
                await addToWatchlist(userId, symbol, company);
                toast.success(`${symbol} added to watchlist`);
            }
            onWatchlistChange?.(symbol, true);
        } catch (error) {
            console.error("Watchlist action failed:", error);
            setAdded(false);
            toast.error("Failed to add to watchlist");
        } finally {
            setLoading(false);
        }
    };

    const holdingsDialog = (
        <Dialog open={showHoldingsDialog} onOpenChange={setShowHoldingsDialog}>
            <DialogContent className="bg-gray-950 border-white/10">
                <DialogHeader>
                    <DialogTitle className="text-gray-100">
                        Add {symbol} to Watchlist
                    </DialogTitle>
                    <DialogDescription>
                        Optionally enter your holdings to see them in the portfolio heatmap.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="shares" className="text-gray-300">
                            Number of Shares
                        </Label>
                        <Input
                            id="shares"
                            type="number"
                            min="0"
                            step="any"
                            placeholder="e.g. 50"
                            value={shares}
                            onChange={(e) => setShares(e.target.value)}
                            className="form-input"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="avgCost" className="text-gray-300">
                            Average Cost per Share (USD)
                        </Label>
                        <Input
                            id="avgCost"
                            type="number"
                            min="0"
                            step="any"
                            placeholder="e.g. 25.50"
                            value={avgCost}
                            onChange={(e) => setAvgCost(e.target.value)}
                            className="form-input"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={handleSkipHoldings}
                        className="text-gray-400"
                    >
                        Skip
                    </Button>
                    <Button
                        onClick={handleAddWithHoldings}
                        className="bg-white text-black hover:bg-gray-200"
                    >
                        Add to Watchlist
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );

    if (type === "icon") {
        return (
            <>
                <button
                    type="button"
                    title={added ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
                    aria-label={added ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
                    className={`flex items-center justify-center p-2 rounded-full transition-all ${added ? "text-yellow-400 hover:bg-yellow-400/10" : "text-gray-400 hover:text-white hover:bg-white/10"} ${loading ? "opacity-50 cursor-wait" : ""}`}
                    onClick={handleClick}
                    disabled={loading}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill={added ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="w-6 h-6"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557L3.04 10.385a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345l2.125-5.111z"
                        />
                    </svg>
                </button>
                {holdingsDialog}
            </>
        );
    }

    return (
        <>
            <button
                type="button"
                className={`watchlist-btn ${added ? "watchlist-remove" : ""} ${loading ? "opacity-70 cursor-wait" : ""}`}
                onClick={handleClick}
                disabled={loading}
            >
                {showTrashIcon && added ? (
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-5 h-5 mr-2"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-7 4v6m4-6v6m4-6v6" />
                    </svg>
                ) : null}
                <span>{loading ? "Updating..." : label}</span>
            </button>
            {holdingsDialog}
        </>
    );
};

export default WatchlistButton;
