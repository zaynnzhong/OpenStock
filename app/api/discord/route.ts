import { NextRequest, NextResponse } from "next/server";
import nacl from "tweetnacl";
import { connectToDatabase } from "@/database/mongoose";
import { Alert } from "@/database/models/alert.model";
import { getQuote, getTechnicalIndicator } from "@/lib/actions/finnhub.actions";

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

        // /sma <symbol> — show SMA20 & SMA50
        if (name === "sma") {
            const symbol = options?.find((o: any) => o.name === "symbol")?.value?.toUpperCase();
            if (!symbol) {
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Usage: `/sma AAPL`" },
                });
            }

            try {
                const [quote, sma20Data, sma50Data] = await Promise.all([
                    getQuote(symbol),
                    getTechnicalIndicator(symbol, "sma", 20),
                    getTechnicalIndicator(symbol, "sma", 50),
                ]);

                const price = quote?.c || 0;
                const sma20 = sma20Data?.sma?.slice(-1)[0] || null;
                const sma50 = sma50Data?.sma?.slice(-1)[0] || null;

                if (!price || (!sma20 && !sma50)) {
                    return NextResponse.json({
                        type: CHANNEL_MESSAGE,
                        data: { content: `Could not fetch SMA data for **${symbol}**.` },
                    });
                }

                const lines: string[] = [];
                lines.push(`📊 **${symbol}** — $${price.toFixed(2)}`);
                lines.push("");

                if (sma20 !== null) {
                    const aboveBelow20 = price >= sma20 ? "above" : "below";
                    const emoji20 = price >= sma20 ? "🟢" : "🔴";
                    const diff20 = ((price - sma20) / sma20 * 100).toFixed(2);
                    lines.push(`${emoji20} **SMA 20:** $${sma20.toFixed(2)} (price ${aboveBelow20}, ${diff20}%)`);
                }

                if (sma50 !== null) {
                    const aboveBelow50 = price >= sma50 ? "above" : "below";
                    const emoji50 = price >= sma50 ? "🟢" : "🔴";
                    const diff50 = ((price - sma50) / sma50 * 100).toFixed(2);
                    lines.push(`${emoji50} **SMA 50:** $${sma50.toFixed(2)} (price ${aboveBelow50}, ${diff50}%)`);
                }

                if (sma20 !== null && sma50 !== null) {
                    lines.push("");
                    if (sma20 > sma50) {
                        lines.push("⬆️ **Bullish** — SMA20 is above SMA50");
                    } else {
                        lines.push("⬇️ **Bearish** — SMA20 is below SMA50");
                    }
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
    }

    return NextResponse.json({ type: PONG });
}
