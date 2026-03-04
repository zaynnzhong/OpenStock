"use client";

import { useState } from "react";
import { DollarSign, Plus, Minus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { setCashBalance, recordCashTransaction } from "@/lib/actions/position-plan.actions";

interface CashPanelProps {
    userId: string;
    cashBalance: number;
    cashTransactions: CashTransaction[];
    totalAccountValue: number;
    onUpdate: (plan: any) => void;
}

const TXN_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    DEPOSIT: { label: "Deposit", color: "text-green-400" },
    WITHDRAWAL: { label: "Withdrawal", color: "text-red-400" },
    TRADE_BUY: { label: "Buy", color: "text-red-400" },
    TRADE_SELL: { label: "Sell", color: "text-green-400" },
    OPTION_PREMIUM: { label: "Option", color: "text-blue-400" },
    DIVIDEND: { label: "Dividend", color: "text-green-400" },
};

export default function CashPanel({
    userId,
    cashBalance,
    cashTransactions,
    totalAccountValue,
    onUpdate,
}: CashPanelProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<"deposit" | "withdraw" | "set">("deposit");
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [saving, setSaving] = useState(false);

    const cashPct = totalAccountValue > 0 ? (cashBalance / totalAccountValue) * 100 : 0;
    const recentTxns = [...(cashTransactions || [])].reverse().slice(0, 20);

    const openDialog = (mode: "deposit" | "withdraw" | "set") => {
        setDialogMode(mode);
        setAmount("");
        setDescription("");
        setDialogOpen(true);
    };

    const [error, setError] = useState("");

    const handleSubmit = async () => {
        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0) return;
        setSaving(true);
        setError("");
        try {
            let result;
            if (dialogMode === "set") {
                result = await setCashBalance(userId, val);
            } else {
                result = await recordCashTransaction(userId, {
                    type: dialogMode === "deposit" ? "DEPOSIT" : "WITHDRAWAL",
                    amount: val,
                    description: description || (dialogMode === "deposit" ? "Manual deposit" : "Manual withdrawal"),
                });
            }
            if (result) onUpdate(result);
            setDialogOpen(false);
        } catch (e: any) {
            console.error("Cash operation failed:", e);
            setError(e?.message || "Operation failed. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Card className="border border-gray-800 bg-gray-900/50">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-green-400" />
                            Cash Management
                        </CardTitle>
                        <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-green-400 hover:text-green-300" onClick={() => openDialog("deposit")}>
                                <Plus className="h-3 w-3 mr-1" /> Deposit
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-300" onClick={() => openDialog("withdraw")}>
                                <Minus className="h-3 w-3 mr-1" /> Withdraw
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-400 hover:text-gray-300" onClick={() => openDialog("set")}>
                                Set
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex items-baseline gap-3 mb-3">
                        <span className="text-2xl font-bold text-gray-100">
                            ${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className={`text-xs font-medium ${cashPct < 5 ? "text-red-400" : "text-gray-500"}`}>
                            {cashPct.toFixed(1)}% of account
                        </span>
                    </div>

                    {/* Transaction Log */}
                    {recentTxns.length > 0 && (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Recent Transactions</div>
                            {recentTxns.map((txn, i) => {
                                const info = TXN_TYPE_LABELS[txn.type] || { label: txn.type, color: "text-gray-400" };
                                const isPositive = ["DEPOSIT", "TRADE_SELL", "DIVIDEND"].includes(txn.type);
                                return (
                                    <div key={i} className="flex items-center justify-between py-1 border-b border-gray-800/50 last:border-0">
                                        <div className="flex items-center gap-2">
                                            {isPositive ? (
                                                <ArrowUpRight className="h-3 w-3 text-green-500" />
                                            ) : (
                                                <ArrowDownRight className="h-3 w-3 text-red-500" />
                                            )}
                                            <div>
                                                <span className={`text-xs font-medium ${info.color}`}>{info.label}</span>
                                                {txn.relatedSymbol && (
                                                    <span className="text-[10px] text-gray-500 ml-1">{txn.relatedSymbol}</span>
                                                )}
                                                {txn.description && (
                                                    <span className="text-[10px] text-gray-600 ml-1 hidden sm:inline">— {txn.description}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-xs font-mono ${isPositive ? "text-green-400" : "text-red-400"}`}>
                                                {isPositive ? "+" : "-"}${Math.abs(txn.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <div className="text-[10px] text-gray-600">
                                                {new Date(txn.date).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Deposit/Withdraw/Set Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-gray-900 border-gray-700 text-gray-100 sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-gray-100 capitalize">
                            {dialogMode === "set" ? "Set Cash Balance" : dialogMode}
                        </DialogTitle>
                        <DialogDescription className="text-gray-500 text-xs">
                            {dialogMode === "set"
                                ? "Set your current cash balance directly."
                                : dialogMode === "deposit"
                                    ? "Add cash to your account."
                                    : "Withdraw cash from your account."}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-3">
                        <div>
                            <Label className="text-gray-400 text-xs">Amount ($)</Label>
                            <Input
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
                                }}
                                className="bg-gray-800 border-gray-700 text-gray-200 mt-1"
                                autoFocus
                            />
                        </div>
                        {dialogMode !== "set" && (
                            <div>
                                <Label className="text-gray-400 text-xs">Description (optional)</Label>
                                <Input
                                    placeholder="e.g. Monthly contribution"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="bg-gray-800 border-gray-700 text-gray-200 mt-1 text-xs"
                                />
                            </div>
                        )}
                        {error && (
                            <p className="text-xs text-red-400">{error}</p>
                        )}
                        <Button type="submit" disabled={saving || !amount} className="w-full">
                            {saving ? "Saving..." : "Confirm"}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
