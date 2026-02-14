import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import nacl from "tweetnacl";
import mongoose from "mongoose";
import { connectToDatabase } from "@/database/mongoose";
import { Alert } from "@/database/models/alert.model";
import { getQuote, getSMA, getOptionsChain, type OptionContract } from "@/lib/actions/finnhub.actions";
import { createTrade, getUserTrades, getPositionSummary } from "@/lib/actions/trade.actions";
import { blackScholes, daysToYears } from "@/lib/portfolio/options-pricing";

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;
const DISCORD_APP_ID = process.env.DISCORD_APP_ID!;

// Resolve the web user ID from the database so Discord trades are stored
// under the same user as the web portfolio. DISCORD_BOT_USER_ID can be
// the Better Auth user id, MongoDB _id, or account email.
let cachedUserId: string | null = null;

async function resolveUserId(): Promise<string> {
    if (cachedUserId) return cachedUserId;

    await connectToDatabase();
    const db = mongoose.connection.db!;
    const configured = process.env.DISCORD_BOT_USER_ID || "";

    if (configured) {
        // Try matching by Better Auth id, MongoDB _id, or email
        const orConditions: Record<string, unknown>[] = [
            { id: configured },
            { email: configured },
        ];
        // Only query by _id if it looks like a valid 24-char hex ObjectId
        if (/^[a-f\d]{24}$/i.test(configured)) {
            orConditions.push({ _id: new mongoose.Types.ObjectId(configured) });
        }
        const user = await db.collection("user").findOne({ $or: orConditions });
        if (user) {
            cachedUserId = (user.id as string) || String(user._id);
            return cachedUserId;
        }
    }

    // Fallback: use the first user in the database
    const fallback = await db.collection("user").findOne({});
    if (fallback) {
        cachedUserId = (fallback.id as string) || String(fallback._id);
        return cachedUserId;
    }

    // Last resort: use the env var as-is
    cachedUserId = configured;
    return cachedUserId;
}

// Discord interaction types
const PING = 1;
const APPLICATION_COMMAND = 2;

// Discord response types
const PONG = 1;
const CHANNEL_MESSAGE = 4;
const DEFERRED_CHANNEL_MESSAGE = 5;

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
                const userId = await resolveUserId();
                await Alert.create({
                    userId,
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
                const userId = await resolveUserId();
                const alerts = await Alert.find({
                    userId,
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
                const userId = await resolveUserId();
                const totalAmount = quantity * price;
                const executedAt = date || new Date().toISOString().split("T")[0];

                await createTrade({
                    userId,
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
                const userId = await resolveUserId();
                const position = await getPositionSummary(userId, symbol);
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

        // /options <symbol> <strike> <expiration> <type> [volatility]
        if (name === "options") {
            const symbol = options.find((o: any) => o.name === "symbol")?.value?.toUpperCase();
            const strike = options.find((o: any) => o.name === "strike")?.value;
            const expiration = options.find((o: any) => o.name === "expiration")?.value;
            const optType = options.find((o: any) => o.name === "type")?.value?.toLowerCase();
            const vol = (options.find((o: any) => o.name === "volatility")?.value || 30) / 100;

            if (!symbol || !strike || !expiration || !optType) {
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Usage: `/options AAPL 200 2025-06-20 call`" },
                });
            }

            try {
                const quote = await getQuote(symbol);
                if (!quote?.c) {
                    return NextResponse.json({
                        type: CHANNEL_MESSAGE,
                        data: { content: `Could not fetch price for **${symbol}**.` },
                    });
                }

                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const exp = new Date(expiration + "T00:00:00");
                const days = Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

                if (days <= 0) {
                    return NextResponse.json({
                        type: CHANNEL_MESSAGE,
                        data: { content: "Expiration date must be in the future." },
                    });
                }

                const result = blackScholes({
                    stockPrice: quote.c,
                    strikePrice: strike,
                    timeToExpiry: daysToYears(days),
                    riskFreeRate: 0.0425,
                    volatility: vol,
                    optionType: optType as "call" | "put",
                });

                const typeLabel = optType === "call" ? "Call" : "Put";
                const lines = [
                    `📐 **${symbol} ${typeLabel}** — Strike $${strike} | Exp ${expiration} (${days}d)`,
                    `Stock: **$${quote.c.toFixed(2)}** | IV: **${(vol * 100).toFixed(0)}%**`,
                    "",
                    `💰 **Price: $${result.price.toFixed(4)}**`,
                    `Delta: ${result.delta.toFixed(4)} | Gamma: ${result.gamma.toFixed(4)}`,
                    `Theta: ${result.theta.toFixed(4)}/day | Vega: ${result.vega.toFixed(4)}`,
                    `Rho: ${result.rho.toFixed(4)}`,
                ];

                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: lines.join("\n") },
                });
            } catch (err) {
                console.error("Discord /options error:", err);
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Failed to calculate option price." },
                });
            }
        }

        // /trades [symbol] — show last 10 trades
        if (name === "trades") {
            const symbol = options?.find((o: any) => o.name === "symbol")?.value?.toUpperCase();

            try {
                const userId = await resolveUserId();
                const { trades } = await getUserTrades(userId, { symbol, limit: 10, sort: "desc" });

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

        // /target <symbol> — analyze bullish & bearish option strategies
        if (name === "target") {
            const symbol = options?.find((o: any) => o.name === "symbol")?.value?.toUpperCase();
            if (!symbol) {
                return NextResponse.json({
                    type: CHANNEL_MESSAGE,
                    data: { content: "Usage: `/target GOOG`" },
                });
            }

            const token = interaction.token as string;

            after(async () => {
                const followupUrl = `https://discord.com/api/v10/webhooks/${DISCORD_APP_ID}/${token}`;
                const sendFollowup = async (content: string) => {
                    await fetch(followupUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ content }),
                    });
                };

                try {
                    const [quote, sma, chain] = await Promise.all([
                        getQuote(symbol),
                        getSMA(symbol),
                        getOptionsChain(symbol),
                    ]);

                    if (!quote?.c) {
                        await sendFollowup(`Could not fetch price for **${symbol}**.`);
                        return;
                    }
                    if (!chain || chain.strikes.length === 0 || chain.calls.length === 0) {
                        await sendFollowup(`No options data available for **${symbol}**.`);
                        return;
                    }

                    const price = quote.c;
                    const strikes = chain.strikes;

                    // Helpers
                    const findNearest = (target: number, arr: number[]): number =>
                        arr.reduce((best, s) => Math.abs(s - target) < Math.abs(best - target) ? s : best);

                    const midPrice = (c: OptionContract | undefined): number => {
                        if (!c) return 0;
                        if (c.bid > 0 && c.ask > 0) return (c.bid + c.ask) / 2;
                        return c.lastPrice || 0;
                    };

                    const findContract = (type: "call" | "put", strike: number) => {
                        const contracts = type === "call" ? chain.calls : chain.puts;
                        return contracts.find((c) => Math.abs(c.strike - strike) < 0.01);
                    };

                    // Auto-suggest targets using SMA momentum
                    let bullTarget: number;
                    let bearTarget: number;
                    if (sma) {
                        const momentum = Math.abs(price - sma.smaLong);
                        let bullRaw = price + momentum;
                        if (bullRaw < price * 1.05) bullRaw = price * 1.05;
                        let bearRaw = price - momentum;
                        if (bearRaw > price * 0.95) bearRaw = price * 0.95;
                        if (bearRaw < 0) bearRaw = price * 0.9;
                        bullTarget = findNearest(bullRaw, strikes);
                        bearTarget = findNearest(bearRaw, strikes);
                    } else {
                        bullTarget = findNearest(price * 1.05, strikes);
                        bearTarget = findNearest(price * 0.95, strikes);
                    }

                    const atmStrike = findNearest(price, strikes);

                    // Expiration info
                    const expTs = chain.expirationDates[0] || 0;
                    const now = new Date();
                    now.setHours(0, 0, 0, 0);
                    const expDate = new Date(expTs * 1000);
                    const daysToExpiry = Math.max(0, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                    const r = 0.0425;

                    // Build strategies for a direction and evaluate at expiry
                    const buildAndEval = (direction: "bullish" | "bearish", target: number) => {
                        const optionType: "call" | "put" = direction === "bullish" ? "call" : "put";
                        const targetStrike = findNearest(target, strikes);

                        const atmC = findContract(optionType, atmStrike);
                        const targetC = findContract(optionType, targetStrike);
                        const atmPrem = midPrice(atmC);
                        const targetPrem = midPrice(targetC);
                        const atmIV = atmC?.impliedVolatility || 0.3;
                        const targetIV = targetC?.impliedVolatility || 0.3;

                        type Strat = {
                            name: string;
                            legs: { side: "buy" | "sell"; strike: number; premium: number; iv: number; optionType: "call" | "put" }[];
                        };

                        const strats: Strat[] = [
                            {
                                name: `Long $${atmStrike} ${optionType === "call" ? "Call" : "Put"}`,
                                legs: [{ side: "buy", strike: atmStrike, premium: atmPrem, iv: atmIV, optionType }],
                            },
                            {
                                name: `Long $${targetStrike} ${optionType === "call" ? "Call" : "Put"}`,
                                legs: [{ side: "buy", strike: targetStrike, premium: targetPrem, iv: targetIV, optionType }],
                            },
                        ];

                        if (direction === "bullish") {
                            strats.push({
                                name: `Bull Spread $${atmStrike}/$${targetStrike}`,
                                legs: [
                                    { side: "buy", strike: atmStrike, premium: atmPrem, iv: atmIV, optionType: "call" },
                                    { side: "sell", strike: targetStrike, premium: targetPrem, iv: targetIV, optionType: "call" },
                                ],
                            });
                        } else {
                            strats.push({
                                name: `Bear Spread $${atmStrike}/$${targetStrike}`,
                                legs: [
                                    { side: "buy", strike: atmStrike, premium: atmPrem, iv: atmIV, optionType: "put" },
                                    { side: "sell", strike: targetStrike, premium: targetPrem, iv: targetIV, optionType: "put" },
                                ],
                            });
                        }

                        // Evaluate each strategy at expiry (T=0 means intrinsic value)
                        return strats.map((strat) => {
                            const cost = strat.legs.reduce((s, l) => s + (l.side === "buy" ? l.premium : -l.premium) * 100, 0);
                            const valueAtExpiry = strat.legs.reduce((s, l) => {
                                const bs = blackScholes({
                                    stockPrice: target,
                                    strikePrice: l.strike,
                                    timeToExpiry: 0,
                                    riskFreeRate: r,
                                    volatility: l.iv,
                                    optionType: l.optionType,
                                });
                                return s + (l.side === "buy" ? bs.price : -bs.price) * 100;
                            }, 0);
                            const pl = valueAtExpiry - cost;
                            const ret = cost !== 0 ? (pl / Math.abs(cost)) * 100 : 0;
                            return { name: strat.name, cost, pl, ret };
                        });
                    };

                    const bullResults = buildAndEval("bullish", bullTarget);
                    const bearResults = buildAndEval("bearish", bearTarget);

                    // Find best pick per direction (highest return%)
                    const bestBull = bullResults.reduce((best, r) => r.ret > best.ret ? r : best);
                    const bestBear = bearResults.reduce((best, r) => r.ret > best.ret ? r : best);

                    // Build message
                    const lines: string[] = [];

                    // Header
                    lines.push(`🎯 **${symbol} Target Price Analysis**`);

                    // Price + SMA
                    let statsLine = `📊 **$${price.toFixed(2)}**`;
                    if (sma) {
                        statsLine += ` | SMA20: $${sma.smaShort.toFixed(2)} | SMA50: $${sma.smaLong.toFixed(2)}`;
                        if (price > sma.smaShort && sma.smaShort > sma.smaLong) {
                            statsLine += " | ⬆️ Uptrend";
                        } else if (price < sma.smaShort && sma.smaShort < sma.smaLong) {
                            statsLine += " | ⬇️ Downtrend";
                        } else {
                            statsLine += " | ↔️ Mixed";
                        }
                    }
                    lines.push(statsLine);

                    const expLabel = expDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                    lines.push(`📅 Exp: ${expLabel} (${daysToExpiry}d)`);
                    lines.push("");

                    // Bullish section
                    const bullPct = ((bullTarget - price) / price * 100).toFixed(1);
                    lines.push(`▲ **Bullish Target: $${bullTarget}** (+${bullPct}%)`);
                    for (const r of bullResults) {
                        const star = r === bestBull ? " ⭐" : "";
                        const plSign = r.pl >= 0 ? "+" : "";
                        lines.push(`  ${r.name}  $${Math.abs(r.cost).toFixed(0)} → ${plSign}$${r.pl.toFixed(0)} (${plSign}${r.ret.toFixed(1)}%)${star}`);
                    }

                    lines.push("");

                    // Bearish section
                    const bearPct = ((bearTarget - price) / price * 100).toFixed(1);
                    lines.push(`▼ **Bearish Target: $${bearTarget}** (${bearPct}%)`);
                    for (const r of bearResults) {
                        const star = r === bestBear ? " ⭐" : "";
                        const plSign = r.pl >= 0 ? "+" : "";
                        lines.push(`  ${r.name}  $${Math.abs(r.cost).toFixed(0)} → ${plSign}$${r.pl.toFixed(0)} (${plSign}${r.ret.toFixed(1)}%)${star}`);
                    }

                    await sendFollowup(lines.join("\n"));
                } catch (err) {
                    console.error("Discord /target error:", err);
                    await sendFollowup("Failed to analyze target price. Please try again.");
                }
            });

            return NextResponse.json({ type: DEFERRED_CHANNEL_MESSAGE });
        }
    }

    return NextResponse.json({ type: PONG });
}
