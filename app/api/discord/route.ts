import { NextRequest, NextResponse } from "next/server";
import nacl from "tweetnacl";
import { connectToDatabase } from "@/database/mongoose";
import { Alert } from "@/database/models/alert.model";
import { getQuote, getSMA } from "@/lib/actions/finnhub.actions";
import { createTrade, getUserTrades, getPositionSummary } from "@/lib/actions/trade.actions";

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;
const USER_ID = process.env.DISCORD_BOT_USER_ID!;

// Discord interaction types
const PING = 1;
const APPLICATION_COMMAND = 2;

// Discord response types
const PONG = 1;
const CHANNEL_MESSAGE = 4;

function verify(req: NextRequest, body: string): boolean {
    const signature = req.headers.get("x-signature-ed25519");
    const timestamp = req.headers.get("x-signature-timestamp");
    if (!signature || !timestamp) return false;

    return nacl.sign.detached.verify(
        Buffer.from(timestamp + body),
        Buffer.from(signature, "hex"),
        Buffer.from(DISCORD_PUBLIC_KEY, "hex")
    );
}

export async function POST(req: NextRequest) {
    const body = await req.text();

    // Verify signature
    if (!verify(req, body)) {
        return new NextResponse("Invalid signature", { status: 401 });
    }

    const interaction = JSON.parse(body);

    // Handle Discord ping (required for endpoint verification)
    if (interaction.type === PING) {
        return NextResponse.json({ type: PONG });
    }

    if (interaction.type === APPLICATION_COMMAND) {
        const { name, options } = interaction.data;

        // /alert <symbol> <above|below> <price>
        if (name === "alert") {
            const symbol = options.find((o: any) => o.name === "symbol")?.value?.toUpperCase();
            const condition = options.find((o: any) => o.name === "condition")?.value?.toUpperCase();
            const price = options.find((o: any) => o.name === "price")?.value;

            if (!symbol || !condition || !price) {
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Missing required fields. Usage: `/alert AAPL above 250`" },
                });
            }

            try {
                await connectToDatabase();
                await Alert.create({
                    userId: USER_ID,
                    symbol,
                    targetPrice: price,
                    condition: condition as "ABOVE" | "BELOW",
                    source: "manual",
                    active: true,
                });

                const emoji = condition === "ABOVE" ? "🟢" : "🔴";
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: {
                        content: `${emoji} Alert created: **${symbol}** → notify when price goes **${condition.toLowerCase()}** **$${price.toFixed(2)}**`,
                    },
                });
            } catch (err) {
                console.error("Discord /alert error:", err);
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Failed to create alert. Please try again." },
                });
            }
        }

        // /alerts — list active alerts
        if (name === "alerts") {
            try {
                await connectToDatabase();
                const alerts = await Alert.find({
                    userId: USER_ID,
                    active: true,
                    triggered: false,
                }).sort({ createdAt: -1 }).limit(20).lean();

                if (alerts.length === 0) {
                    return NextResponse.json({
                        type: CHANNEL_MESSAGE,
                        data: { content: "No active alerts." },
                    });
                }

                const lines = alerts.map((a: any) => {
                    const emoji = a.condition === "ABOVE" ? "🟢" : "🔴";
                    const source = a.source === "holdings" ? " *(auto)*" : "";
                    return `${emoji} **${a.symbol}** — ${a.condition.toLowerCase()} $${a.targetPrice.toFixed(2)}${source}`;
                });

                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: `**Active Alerts (${alerts.length}):**\n${lines.join("\n")}` },
                });
            } catch (err) {
                console.error("Discord /alerts error:", err);
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Failed to fetch alerts." },
                });
            }
        }

        // /price <symbol> — check current price
        if (name === "price") {
            const symbol = options.find((o: any) => o.name === "symbol")?.value?.toUpperCase();
            if (!symbol) {
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Usage: `/price AAPL`" },
                });
            }

            try {
                const quote = await getQuote(symbol);
                if (!quote || !quote.c) {
                    return NextResponse.json({
                        type: CHANNEL_MESSAGE,
                        data: { content: `Could not fetch price for **${symbol}**.` },
                    });
                }

                const emoji = quote.dp >= 0 ? "🟢" : "🔴";
                const sign = quote.dp >= 0 ? "+" : "";
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: {
                        content: `${emoji} **${symbol}** — $${quote.c.toFixed(2)} (${sign}${quote.dp.toFixed(2)}%) | Day: $${quote.l.toFixed(2)} – $${quote.h.toFixed(2)}`,
                    },
                });
            } catch (err) {
                console.error("Discord /price error:", err);
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Failed to fetch price." },
                });
            }
        }

        // /sma <symbol> [short] [long] [timeframe] — show SMA with trend signal
        if (name === "sma") {
            const symbol = options?.find((o: any) => o.name === "symbol")?.value?.toUpperCase();
            const shortPeriod = options?.find((o: any) => o.name === "short")?.value || 20;
            const longPeriod = options?.find((o: any) => o.name === "long")?.value || 50;
            const timeframe = options?.find((o: any) => o.name === "timeframe")?.value || "D";
            if (!symbol) {
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Usage: `/sma AAPL`" },
                });
            }

            try {
                const smaData = await getSMA(symbol, shortPeriod, longPeriod, timeframe);

                if (!smaData) {
                    return NextResponse.json({
                        type: CHANNEL_MESSAGE,
                        data: { content: `Could not fetch SMA data for **${symbol}**.` },
                    });
                }

                const { price, smaShort, smaLong } = smaData;
                const tfLabel: Record<string, string> = { "5": "5min", "15": "15min", "60": "1hr", "D": "Daily", "W": "Weekly", "M": "Monthly" };
                const tf = tfLabel[timeframe] || timeframe;

                const lines: string[] = [];
                lines.push(`📊 **${symbol}** — $${price.toFixed(2)} *(${tf})*`);
                lines.push("");

                const abShort = price >= smaShort ? "above" : "below";
                const emojiShort = price >= smaShort ? "🟢" : "🔴";
                const diffShort = ((price - smaShort) / smaShort * 100).toFixed(2);
                lines.push(`${emojiShort} **SMA ${shortPeriod}:** $${smaShort.toFixed(2)} (price ${abShort}, ${diffShort}%)`);

                const abLong = price >= smaLong ? "above" : "below";
                const emojiLong = price >= smaLong ? "🟢" : "🔴";
                const diffLong = ((price - smaLong) / smaLong * 100).toFixed(2);
                lines.push(`${emojiLong} **SMA ${longPeriod}:** $${smaLong.toFixed(2)} (price ${abLong}, ${diffLong}%)`);

                lines.push("");
                if (smaShort > smaLong) {
                    lines.push(`⬆️ **Bullish** — SMA${shortPeriod} is above SMA${longPeriod}`);
                } else {
                    lines.push(`⬇️ **Bearish** — SMA${shortPeriod} is below SMA${longPeriod}`);
                }

                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: lines.join("\n") },
                });
            } catch (err) {
                console.error("Discord /sma error:", err);
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Failed to fetch SMA data." },
                });
            }
        }

        // /trade <type> <symbol> <quantity> <price> [date] [notes]
        if (name === "trade") {
            const type = options.find((o: any) => o.name === "type")?.value?.toUpperCase();
            const symbol = options.find((o: any) => o.name === "symbol")?.value?.toUpperCase();
            const quantity = options.find((o: any) => o.name === "quantity")?.value;
            const price = options.find((o: any) => o.name === "price")?.value;
            const date = options.find((o: any) => o.name === "date")?.value;
            const notes = options.find((o: any) => o.name === "notes")?.value;

            if (!type || !symbol || !quantity || !price) {
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Missing required fields. Usage: `/trade buy AAPL 10 150.00`" },
                });
            }

            if (type !== "BUY" && type !== "SELL") {
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Type must be `buy` or `sell`." },
                });
            }

            try {
                const totalAmount = quantity * price;
                const executedAt = date || new Date().toISOString().split("T")[0];

                await createTrade({
                    userId: USER_ID,
                    symbol,
                    type: type as TradeType,
                    quantity,
                    pricePerShare: price,
                    totalAmount,
                    executedAt,
                    source: "discord",
                    notes,
                });

                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: {
                        content: `✅ **${type} ${quantity} ${symbol}** @ $${price.toFixed(2)} = $${totalAmount.toFixed(2)} — logged`,
                    },
                });
            } catch (err) {
                console.error("Discord /trade error:", err);
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Failed to log trade. Please try again." },
                });
            }
        }

        // /position <symbol> — show position summary
        if (name === "position") {
            const symbol = options.find((o: any) => o.name === "symbol")?.value?.toUpperCase();
            if (!symbol) {
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Usage: `/position AAPL`" },
                });
            }

            try {
                const position = await getPositionSummary(USER_ID, symbol);
                if (!position || position.shares === 0) {
                    return NextResponse.json({
                        type: CHANNEL_MESSAGE,
                        data: { content: `No open position for **${symbol}**.` },
                    });
                }

                const lines = [
                    `📊 **${symbol}** Position`,
                    `Shares: **${position.shares}**`,
                    `Avg Cost: **$${position.avgCostPerShare.toFixed(2)}**`,
                    `Cost Basis: **$${position.costBasis.toFixed(2)}**`,
                    `Realized P/L: **$${position.realizedPL.toFixed(2)}**`,
                    `Adjusted Cost/Share: **$${(position.shares > 0 ? position.adjustedCostBasis / position.shares : 0).toFixed(2)}**`,
                ];

                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: lines.join("\n") },
                });
            } catch (err) {
                console.error("Discord /position error:", err);
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Failed to fetch position." },
                });
            }
        }

        // /trades [symbol] — show last 10 trades
        if (name === "trades") {
            const symbol = options?.find((o: any) => o.name === "symbol")?.value?.toUpperCase();

            try {
                const { trades } = await getUserTrades(USER_ID, { symbol, limit: 10, sort: "desc" });

                if (trades.length === 0) {
                    const msg = symbol ? `No trades found for **${symbol}**.` : "No trades found.";
                    return NextResponse.json({
                        type: CHANNEL_MESSAGE,
                        data: { content: msg },
                    });
                }

                const header = symbol ? `**Last ${trades.length} trades for ${symbol}:**` : `**Last ${trades.length} trades:**`;
                const lines = trades.map((t: TradeData) => {
                    const date = new Date(t.executedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    const emoji = t.type === "BUY" ? "🟢" : t.type === "SELL" ? "🔴" : "⚪";
                    return `${emoji} ${date} — **${t.type}** ${t.quantity} **${t.symbol}** @ $${t.pricePerShare.toFixed(2)}`;
                });

                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: `${header}\n${lines.join("\n")}` },
                });
            } catch (err) {
                console.error("Discord /trades error:", err);
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Failed to fetch trades." },
                });
            }
        }
    }

    return NextResponse.json({ type: PONG });
}
