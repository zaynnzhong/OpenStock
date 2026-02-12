import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/database/mongoose";
import { syncHoldingAlerts } from "@/lib/actions/alert.actions";
import { getQuote } from "@/lib/actions/finnhub.actions";
import { hasTradesForSymbol } from "@/lib/actions/trade.actions";

export async function PUT(req: NextRequest) {
    try {
        const { userId, symbol, shares, avgCost } = await req.json();

        if (!userId || !symbol) {
            return NextResponse.json({ error: "Missing userId or symbol" }, { status: 400 });
        }

        // Guard: if trades exist for this symbol, direct user to Portfolio page
        const hasTrades = await hasTradesForSymbol(userId, symbol.toUpperCase());
        if (hasTrades) {
            return NextResponse.json(
                { error: "This symbol is managed by trade log. Use the Portfolio page to manage trades." },
                { status: 409 }
            );
        }

        const mongoose = await connectToDatabase();
        const db = mongoose.connection.db;
        if (!db) {
            return NextResponse.json({ error: "DB not connected" }, { status: 500 });
        }

        const updateData: Record<string, number> = {};
        if (shares !== undefined) updateData.shares = Number(shares) || 0;
        if (avgCost !== undefined) updateData.avgCost = Number(avgCost) || 0;

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const result = await db.collection("watchlists").findOneAndUpdate(
            { userId, symbol: symbol.toUpperCase() },
            { $set: updateData },
            { returnDocument: "after" }
        );

        if (!result) {
            return NextResponse.json({ error: "Stock not found in watchlist" }, { status: 404 });
        }

        // Auto-sync holding alerts at ±25% of avg cost
        const finalAvgCost = result.avgCost || 0;
        if (finalAvgCost > 0) {
            try {
                const quote = await getQuote(symbol.toUpperCase());
                const currentPrice = quote?.c || 0;
                if (currentPrice > 0) {
                    await syncHoldingAlerts(userId, symbol, finalAvgCost, currentPrice);
                }
            } catch (err) {
                console.error("[API /holdings] Failed to sync alerts:", err);
            }
        }

        return NextResponse.json({
            symbol: result.symbol,
            shares: result.shares,
            avgCost: result.avgCost,
        });
    } catch (error) {
        console.error("[API /holdings PUT] error:", error);
        return NextResponse.json({ error: "Failed to update holdings" }, { status: 500 });
    }
}
