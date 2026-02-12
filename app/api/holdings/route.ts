import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/database/mongoose";

export async function PUT(req: NextRequest) {
    try {
        const { userId, symbol, shares, avgCost } = await req.json();

        if (!userId || !symbol) {
            return NextResponse.json({ error: "Missing userId or symbol" }, { status: 400 });
        }

        const mongoose = await connectToDatabase();
        const db = mongoose.connection.db;
        if (!db) {
            return NextResponse.json({ error: "DB not connected" }, { status: 500 });
        }

        const updateData = { shares: Number(shares) || 0, avgCost: Number(avgCost) || 0 };

        const result = await db.collection("watchlists").findOneAndUpdate(
            { userId, symbol: symbol.toUpperCase() },
            { $set: updateData },
            { returnDocument: "after" }
        );

        if (!result) {
            return NextResponse.json({ error: "Stock not found in watchlist" }, { status: 404 });
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
