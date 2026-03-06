"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Trash2, Bell, RefreshCw, TrendingUp, TrendingDown, Percent, Activity } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { deleteAlert, getUserAlerts } from "@/lib/actions/alert.actions";

interface AlertsPanelProps {
    alerts: any[];
    userId: string;
}

function AlertTypeBadge({ alert }: { alert: any }) {
    const alertType = alert.alertType || 'price';

    if (alertType === 'sma_cross' && alert.smaConfig) {
        const label = alert.smaConfig.indicator === 'sma200d' ? 'SMA 200D'
            : alert.smaConfig.indicator === 'sma20w' ? 'SMA 20W'
            : 'SMA 50W';
        return (
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
                <Activity className="w-2.5 h-2.5" />
                {label} · {alert.smaConfig.crossDirection}
            </span>
        );
    }

    if (alertType === 'pct_change' && alert.pctConfig) {
        return (
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">
                <Percent className="w-2.5 h-2.5" />
                {alert.pctConfig.threshold}% {alert.pctConfig.direction} · base ${alert.pctConfig.basePrice?.toFixed(2)}
            </span>
        );
    }

    return null;
}

function AlertStateIndicator({ alert }: { alert: any }) {
    const alertType = alert.alertType || 'price';
    if (alertType !== 'sma_cross' && alertType !== 'pct_change') return null;
    if (!alert.lastState) return null;

    const isAbove = alert.lastState === 'above';
    return (
        <div className="flex items-center gap-1 mt-1">
            {isAbove ? (
                <TrendingUp className="w-3 h-3 text-green-400" />
            ) : (
                <TrendingDown className="w-3 h-3 text-red-400" />
            )}
            <span className={`text-[10px] ${isAbove ? "text-green-500" : "text-red-500"}`}>
                Currently {alert.lastState}
            </span>
        </div>
    );
}

export default function AlertsPanel({ alerts: initialAlerts, userId }: AlertsPanelProps) {
    const [alerts, setAlerts] = useState(initialAlerts);
    const [refreshing, setRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const fresh = await getUserAlerts(userId);
            setAlerts(fresh);
        } catch (err) {
            console.error("Failed to refresh alerts:", err);
        } finally {
            setRefreshing(false);
        }
    }, [userId]);

    useEffect(() => {
        const interval = setInterval(refresh, 30000);
        return () => clearInterval(interval);
    }, [refresh]);

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this alert?")) {
            await deleteAlert(id);
            setAlerts((curr) => curr.filter((a: any) => a._id !== id));
        }
    };

    return (
        <div className="bg-gray-900/30 rounded-lg border border-gray-800 p-4 h-full">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center">
                    <Bell className="w-5 h-5 mr-2 text-yellow-500" />
                    Alerts
                    {alerts.length > 0 && (
                        <span className="ml-2 text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                            {alerts.length}
                        </span>
                    )}
                </h2>
                <button
                    onClick={refresh}
                    disabled={refreshing}
                    className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                    title="Refresh alerts"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="space-y-3">
                {alerts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">
                        No active alerts. Use the bell icon on any stock to create one.
                    </div>
                ) : (
                    alerts.map((alert: any) => {
                        const alertType = alert.alertType || 'price';
                        return (
                            <div key={alert._id} className="bg-gray-800/40 rounded-lg p-3 border border-gray-800 relative group">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center font-bold text-xs text-white">
                                                {alert.symbol[0]}
                                            </div>
                                            <div>
                                                <div className="font-bold text-white text-sm">{alert.symbol}</div>
                                                {alertType === 'price' && (
                                                    <div className="text-xs text-gray-400">Target: {formatCurrency(alert.targetPrice)}</div>
                                                )}
                                            </div>
                                        </div>
                                        {alertType === 'price' && (
                                            <div className="mt-2 text-xs text-yellow-500 font-medium">
                                                Condition: Price {alert.condition.toLowerCase()} {formatCurrency(alert.targetPrice)}
                                            </div>
                                        )}
                                        <AlertTypeBadge alert={alert} />
                                        <AlertStateIndicator alert={alert} />
                                        <div className="text-[10px] text-gray-500 mt-1">
                                            {alertType === 'price' ? (
                                                <>Active until {new Date(new Date(alert.createdAt).getTime() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString()}</>
                                            ) : (
                                                <>Continuous · expires {new Date(alert.expiresAt).toLocaleDateString()}</>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col space-y-2">
                                        <button
                                            onClick={() => handleDelete(alert._id)}
                                            className="text-gray-500 hover:text-red-500 transition-colors p-1"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
