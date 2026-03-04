import type { OptionsChainData, OptionContract } from '@/lib/actions/finnhub.actions';
import type { BlackScholesResult } from '@/lib/portfolio/options-pricing';

/* ── Types ─────────────────────────────────────────────────────────────── */

export type OHLCVBar = {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

export function formatOHLCVTable(bars: OHLCVBar[], label: string): string {
    if (bars.length === 0) return `\n### ${label}\nNo data available.\n`;
    const header = `| Date | Open | High | Low | Close | Volume |`;
    const sep = `|------|------|------|-----|-------|--------|`;
    const rows = bars.slice(-60).map(b =>
        `| ${b.date} | ${b.open.toFixed(2)} | ${b.high.toFixed(2)} | ${b.low.toFixed(2)} | ${b.close.toFixed(2)} | ${(b.volume / 1000).toFixed(0)}K |`
    );
    return `\n### ${label} (${bars.length} bars, showing last ${rows.length})\n${header}\n${sep}\n${rows.join('\n')}\n`;
}

export function formatOptionsTable(contracts: OptionContract[], type: 'CALL' | 'PUT'): string {
    if (contracts.length === 0) return `\n### ${type}s\nNo contracts.\n`;
    const header = `| Strike | Bid | Ask | Last | Vol | OI | IV |`;
    const sep = `|--------|-----|-----|------|-----|----|----|`;
    const rows = contracts.slice(0, 30).map(c =>
        `| ${c.strike.toFixed(2)} | ${c.bid.toFixed(2)} | ${c.ask.toFixed(2)} | ${c.lastPrice.toFixed(2)} | ${c.volume} | ${c.openInterest} | ${(c.impliedVolatility * 100).toFixed(1)}% |`
    );
    return `\n### ${type}s\n${header}\n${sep}\n${rows.join('\n')}\n`;
}

export function formatGreeksTable(
    contracts: OptionContract[],
    greeks: Map<string, BlackScholesResult>,
    type: 'CALL' | 'PUT'
): string {
    if (contracts.length === 0) return '';
    const header = `| Strike | Market | Theoretical | Delta | Gamma | Theta | Vega |`;
    const sep = `|--------|--------|-------------|-------|-------|-------|------|`;
    const rows = contracts.slice(0, 20).map(c => {
        const g = greeks.get(`${type}-${c.strike}`);
        if (!g) return `| ${c.strike.toFixed(2)} | ${c.lastPrice.toFixed(2)} | — | — | — | — | — |`;
        return `| ${c.strike.toFixed(2)} | ${c.lastPrice.toFixed(2)} | ${g.price.toFixed(2)} | ${g.delta.toFixed(3)} | ${g.gamma.toFixed(4)} | ${g.theta.toFixed(3)} | ${g.vega.toFixed(3)} |`;
    });
    return `\n### ${type} Greeks (BS Model)\n${header}\n${sep}\n${rows.join('\n')}\n`;
}

/* ── Prompt Builders ───────────────────────────────────────────────────── */

const BILINGUAL_INSTRUCTION = `
Use bilingual output: English ICT/SMC terminology with Chinese annotations (中文注释) for key concepts.
Format your response in Markdown with clear headers and sections.`;

export function buildDirectionPrompt(
    symbol: string,
    daily: OHLCVBar[],
    weekly: OHLCVBar[],
    monthly: OHLCVBar[],
    currentPrice: number
): string {
    return `You are an expert ICT/SMC (Inner Circle Trader / Smart Money Concepts) analyst.

## Task: Multi-Timeframe Directional Bias Analysis for ${symbol}
Current Price: $${currentPrice.toFixed(2)}

Analyze the following OHLCV data across Daily, Weekly, and Monthly timeframes to determine the directional bias.

${formatOHLCVTable(monthly, 'Monthly OHLCV')}
${formatOHLCVTable(weekly, 'Weekly OHLCV')}
${formatOHLCVTable(daily, 'Daily OHLCV')}

## Analysis Framework:
1. **Market Structure (市场结构)**: Identify BOS (Break of Structure / 结构突破) and CHOCH (Change of Character / 特征转变) on each timeframe
2. **Dealing Range (交易区间)**: Identify the current dealing range on D/W/M — premium zone (溢价区) vs discount zone (折价区)
3. **Order Blocks (订单块)**: Key bullish/bearish OBs on each timeframe with price levels
4. **Fair Value Gaps (公允价值缺口)**: Identify unfilled FVGs that may act as magnets
5. **Key Levels**: PWH/PWL (前周高低), PDH/PDL (前日高低), Monthly/Weekly opens
6. **Directional Verdict (方向判断)**: Clear bullish/bearish/neutral bias with confidence level

Provide specific price levels for all identified zones.
${BILINGUAL_INSTRUCTION}`;
}

export function buildEntryPrompt(
    symbol: string,
    fiveMin: OHLCVBar[],
    daily: OHLCVBar[],
    monthly: OHLCVBar[],
    currentPrice: number
): string {
    return `You are an expert ICT/SMC trader specializing in PO3 (Power of 3) entries.

## Task: PO3 + IFVG Entry Analysis for ${symbol}
Current Price: $${currentPrice.toFixed(2)}

${formatOHLCVTable(monthly, 'Monthly OHLCV (context)')}
${formatOHLCVTable(daily, 'Daily OHLCV (context)')}
${formatOHLCVTable(fiveMin, '5-Minute OHLCV (execution timeframe)')}

## Analysis Framework:
1. **PO3 Phase (三阶段分析)**:
   - Accumulation (积累阶段): Asian session range, initial balance
   - Manipulation (操纵阶段): Judas Swing / false breakout identification
   - Distribution (分配阶段): True directional move, target levels

2. **IFVG Zones (反转公允价值缺口)**:
   - Identify Inverse Fair Value Gaps on 5m that align with HTF bias
   - Mark entry zones where IFVG overlaps with HTF order blocks

3. **Volume Profile (成交量分析)**:
   - High volume nodes vs low volume gaps on 5m
   - Volume confirmation for directional bias

4. **Trade Setup (交易计划)**:
   - Specific Entry Price (入场价)
   - Stop Loss level (止损) with reasoning
   - Take Profit targets (目标价) — TP1, TP2, TP3
   - Risk:Reward ratio (风险回报比)

5. **Session Context**: Which session (Asian/London/NY) offers the best setup today?

Be specific with exact price levels.
${BILINGUAL_INSTRUCTION}`;
}

export function buildOptionAnalysisPrompt(
    symbol: string,
    currentPrice: number,
    chain: OptionsChainData,
    greeksMap: Map<string, BlackScholesResult>,
    position?: { shares: number; avgCost: number }
): string {
    const posCtx = position
        ? `\nCurrent stock position: ${position.shares} shares @ $${position.avgCost.toFixed(2)} avg cost`
        : '';

    return `You are an expert options strategist with deep knowledge of Greeks and volatility analysis.

## Task: Option Pricing & Strategy Analysis for ${symbol}
Current Price: $${currentPrice.toFixed(2)}${posCtx}
Available Expirations: ${chain.expirationDates.slice(0, 5).map(ts => new Date(ts * 1000).toISOString().split('T')[0]).join(', ')}

${formatOptionsTable(chain.calls, 'CALL')}
${formatOptionsTable(chain.puts, 'PUT')}
${formatGreeksTable(chain.calls, greeksMap, 'CALL')}
${formatGreeksTable(chain.puts, greeksMap, 'PUT')}

## Analysis Framework:
1. **IV Analysis (隐含波动率分析)**:
   - IV smile/skew pattern — what does it tell about market expectations?
   - Compare IV across strikes and expirations
   - Is IV relatively high or low vs historical context?

2. **Pricing Efficiency (定价效率)**:
   - Compare market prices to Black-Scholes theoretical values
   - Identify overpriced and underpriced contracts
   - Note any arbitrage-like opportunities

3. **Strategy Recommendations (策略建议)**:
   - Suggest 2-3 specific option strategies with exact strikes and expirations
   - For each strategy: max profit, max loss, breakeven, probability estimate
   - Consider current IV environment when choosing strategies
   ${position ? '- Factor in existing stock position for hedging strategies (对冲策略)' : ''}

4. **Risk Metrics (风险指标)**:
   - Portfolio-level Greeks impact
   - Key scenarios: +/- 5%, +/- 10% moves
   - Time decay impact over next week
${BILINGUAL_INSTRUCTION}`;
}

export function buildPositionAnalysisPrompt(
    symbol: string,
    position: PositionWithPriceData,
    trades: TradeData[],
    optionPrices: Record<string, { bid: number; ask: number; mid: number; lastPrice: number }>,
    ohlcv: OHLCVBar[]
): string {
    const openOptions = Object.entries(optionPrices)
        .filter(([key]) => key.startsWith(`${symbol}|`))
        .map(([key, price]) => {
            const [, type, strike, exp] = key.split('|');
            return `  - ${type} $${strike} exp ${exp}: Bid $${price.bid.toFixed(2)} / Ask $${price.ask.toFixed(2)} / Mid $${price.mid.toFixed(2)}`;
        }).join('\n');

    const allTrades = trades.map(t => {
        const optStr = t.optionDetails
            ? ` [${t.optionDetails.action} ${t.optionDetails.contracts}x ${t.optionDetails.contractType} $${t.optionDetails.strikePrice} exp ${t.optionDetails.expirationDate} @ $${t.optionDetails.premiumPerContract.toFixed(2)}/ct]`
            : '';
        const plStr = t.realizedPL ? ` (realized: $${t.realizedPL.toFixed(2)})` : '';
        return `  - ${t.executedAt.split('T')[0]} ${t.type} ${t.quantity} @ $${t.pricePerShare.toFixed(2)}${optStr}${plStr}`;
    }).join('\n');

    return `You are a portfolio management expert specializing in position sizing and risk management.

## Task: Position Analysis for ${symbol}
Current Price: $${position.currentPrice.toFixed(2)}

### Position Summary:
- Shares: ${position.shares}
- Avg Cost: $${position.avgCostPerShare.toFixed(2)}
- Cost Basis (stock): $${position.costBasis.toFixed(2)}
- Market Value: $${position.marketValue.toFixed(2)} (includes open option holdings)
- Stock Unrealized P/L: $${(position.shares > 0 ? position.shares * position.currentPrice - position.costBasis : 0).toFixed(2)}
- Stock Realized P/L: $${position.realizedPL.toFixed(2)}
- Closed Options P/L: $${(position.optionsClosedPL ?? position.optionsPremiumNet).toFixed(2)}
- Dividends: $${position.dividendsReceived.toFixed(2)}

### Open Option Holdings (these are NOT realized — they are active positions with live pricing):
${(position.openOptions?.length ?? 0) > 0
    ? position.openOptions!.map(o => {
        const dir = o.direction === 'long' ? 'BTO' : 'STO';
        const t = o.contractType === 'CALL' ? 'C' : 'P';
        const stockPrice = position.currentPrice;
        const itm = o.contractType === 'CALL' ? stockPrice - o.strikePrice : o.strikePrice - stockPrice;
        const moneyness = itm > stockPrice * 0.05 ? 'DEEP ITM' : itm > 0 ? 'ITM' : itm > -stockPrice * 0.05 ? 'ATM' : 'OTM';
        const intrinsic = Math.max(0, itm);
        const extrinsic = o.currentPrice > 0 ? Math.max(0, o.currentPrice - intrinsic) : 0;
        const equivShares = o.netContracts * 100;
        const leverageNote = moneyness.includes('ITM') && o.direction === 'long'
            ? ` | HIGH DELTA ~stock replacement for ${equivShares} shares, intrinsic $${intrinsic.toFixed(2)}, extrinsic $${extrinsic.toFixed(2)}`
            : '';
        return `  - ${dir} ${o.netContracts}x $${o.strikePrice}${t} exp ${o.expirationDate} [${moneyness}]: Cost $${o.totalCost.toFixed(2)}, Live Price $${o.currentPrice.toFixed(2)}/ct, Current Value $${o.currentValue.toFixed(2)}, Unrealized P/L $${o.unrealizedPL.toFixed(2)}${leverageNote}`;
    }).join('\n')
    : 'None'}

### Live Option Prices:
${openOptions || 'None'}

### Complete Trade History (chronological):
${allTrades || 'None'}

${formatOHLCVTable(ohlcv, 'Daily OHLCV')}

## Important: Understanding Open Option Positions
- An open option is a **holding with unrealized P/L**, NOT a realized loss. Do NOT treat the premium paid as a loss.
- **Deep ITM long calls/puts are stock-replacement strategies** — high delta, move largely dollar-for-dollar with the underlying, capital-efficient way to control shares. NOT speculative bets. Do NOT recommend immediately closing/selling them unless there is a specific strategic reason beyond "de-risking".
- LEAPS (long-dated options) naturally have more extrinsic value — this does NOT make them speculative. The long time horizon is the point.
- When an option is marked [DEEP ITM], treat it as equivalent share exposure. Factor it into total position sizing (shares + option-equivalent shares).
- Recently opened positions reflect current intent — do NOT recommend immediately reversing a trade the user just made.

## Analysis Framework:
1. **Position Sizing (仓位管理)**:
   - Count BOTH stock shares AND deep ITM option equivalent shares as total exposure
   - Assess if total exposure (shares + option-controlled shares) is appropriate
   - Suggested target size with reasoning

2. **Hedging Analysis (对冲分析)**:
   - Current downside exposure (including option positions)
   - Recommended hedging strategies using options
   - Cost of protection at various levels

3. **Options Management (期权管理)**:
   - For deep ITM options: assess intrinsic vs extrinsic, theta exposure, and roll timing — NOT immediate liquidation
   - For OTM/speculative options: hold, roll, or close?
   - New option opportunities: covered calls, protective puts, etc.
   - Premium income potential

4. **Action Plan (行动计划)**:
   - Prioritized list of recommended actions
   - Specific price levels for each action
   - Timeline for implementation
${BILINGUAL_INSTRUCTION}`;
}

export function buildPortfolioAnalysisPrompt(
    summary: PortfolioSummaryData,
    optionPrices: Record<string, { bid: number; ask: number; mid: number; lastPrice: number }>,
    trades: TradeData[]
): string {
    const positionList = summary.positions.map(p => {
        const weight = summary.totalValue > 0 ? (p.marketValue / summary.totalValue * 100).toFixed(1) : '0.0';
        let line = `  - ${p.symbol}: ${p.shares} shares @ $${p.currentPrice.toFixed(2)}, MV $${p.marketValue.toFixed(2)} (${weight}%), P/L ${p.totalReturnPercent >= 0 ? '+' : ''}${p.totalReturnPercent.toFixed(1)}%`;
        if (p.openOptions?.length > 0) {
            const optLines = p.openOptions.map(o => {
                const dir = o.direction === 'long' ? 'BTO' : 'STO';
                const t = o.contractType === 'CALL' ? 'C' : 'P';
                const itm = o.contractType === 'CALL' ? p.currentPrice - o.strikePrice : o.strikePrice - p.currentPrice;
                const moneyness = itm > p.currentPrice * 0.05 ? 'DEEP ITM' : itm > 0 ? 'ITM' : itm > -p.currentPrice * 0.05 ? 'ATM' : 'OTM';
                const intrinsic = Math.max(0, itm);
                const extrinsic = o.currentPrice > 0 ? Math.max(0, o.currentPrice - intrinsic) : 0;
                const equivShares = o.netContracts * 100;
                const leverageNote = moneyness.includes('ITM') && o.direction === 'long'
                    ? ` | stock replacement for ${equivShares} shares, intrinsic $${intrinsic.toFixed(2)}, extrinsic $${extrinsic.toFixed(2)}`
                    : '';
                return `    - ${dir} ${o.netContracts}x $${o.strikePrice}${t} exp ${o.expirationDate} [${moneyness}]: Value $${o.currentValue.toFixed(2)}, P/L $${o.unrealizedPL.toFixed(2)}${leverageNote}`;
            });
            line += '\n' + optLines.join('\n');
        }
        return line;
    }).join('\n');

    const openOpts = Object.entries(optionPrices).map(([key, price]) => {
        const [sym, type, strike, exp] = key.split('|');
        return `  - ${sym} ${type} $${strike} exp ${exp}: Mid $${price.mid.toFixed(2)}`;
    }).join('\n');

    const allTradeList = trades.map(t => {
        const optStr = t.optionDetails
            ? ` [${t.optionDetails.action} ${t.optionDetails.contracts}x ${t.optionDetails.contractType} $${t.optionDetails.strikePrice} exp ${t.optionDetails.expirationDate} @ $${t.optionDetails.premiumPerContract.toFixed(2)}/ct]`
            : '';
        const plStr = t.realizedPL ? ` (realized: $${t.realizedPL.toFixed(2)})` : '';
        return `  - ${t.executedAt.split('T')[0]} ${t.symbol} ${t.type} ${t.quantity} @ $${t.pricePerShare.toFixed(2)}${optStr}${plStr}`;
    }).join('\n');

    return `## Role: Chief Risk Officer (CRO) — Strategic Portfolio Oversight & Risk Mandate

You are acting as my Chief Risk Officer. Your objective is to audit my portfolio and enforce a strict **"3+9 Dynamic Position Control Plan"** to mitigate concentration risk and protect equity.

### Core Directives (Non-Negotiable):

1. **The 3+9 Structure** — Hard cap of 12 total tickers:
   - **Core (3 Slots / 70% Capital):** High-conviction positions — deep ITM options (Delta > 0.7) or mega-cap leaders.
   - **Satellite (9 Slots / 30% Capital):** High-beta growth, tactical swings, or speculative plays.

2. **Notional Exposure Audit (Delta 穿透):** Calculate "Stock-Equivalent" exposure for ALL options using Delta-adjusted notional. A single deep ITM LEAPS call ≈ 75–100 equivalent shares, NOT just 1 contract.

3. **Anti-Loser Averaging (反向加仓禁令):** Firmly prohibit adding capital to losing positions. If a position is underwater, the only valid actions are "Hold" or "Liquidate."

4. **Execution over Empathy:** Do NOT provide market commentary or encouragement. Provide Trade Instructions only.

---

### Portfolio Data:

**Account Overview:**
- Total Value: $${summary.totalValue.toFixed(2)} (includes open option holdings)
- Total Cost Basis: $${summary.totalCostBasis.toFixed(2)}
- Unrealized P/L: $${summary.totalUnrealizedPL.toFixed(2)} (stock + open options)
- Stock Realized P/L: $${summary.totalRealizedPL.toFixed(2)}
- Closed Options P/L: $${summary.totalOptionsClosedPL.toFixed(2)}
- Open Options Value: $${summary.totalOpenOptionsValue.toFixed(2)}
- Dividends: $${summary.totalDividends.toFixed(2)}
- Today's Return: $${summary.todayReturn.toFixed(2)} (${summary.todayReturnPercent.toFixed(2)}%)

**Positions:**
${positionList}

**Open Options (live pricing):**
${openOpts || 'None'}

**Complete Trade History (chronological):**
${allTradeList || 'None'}

---

### Option Position Rules:
- BUY_TO_OPEN / SELL_TO_OPEN creates an open position. BUY_TO_CLOSE / SELL_TO_CLOSE closes it.
- Open options have unrealized P/L — do NOT treat premium paid as a realized loss.
- Deep ITM long calls are **stock-replacement strategies (替代股票策略)** — high delta, dollar-for-dollar with underlying. They are capital-efficient exposure, NOT speculative bets.
- LEAPS are long-term holdings by design. For Core slots, deep ITM LEAPS are the preferred instrument.
- When analyzing deep ITM options: calculate delta-adjusted notional exposure and factor into total position sizing.

### CRITICAL — Weight Accuracy:
- The "weight" field MUST exactly match the MV% shown in parentheses in the Positions data (e.g. "(14.0%)"). Use THAT number.
- Do NOT inflate weight by combining stock MV with option value. Option exposure goes in "notionalExposure" field instead.

---

## Output Format:
Return ONLY valid JSON (no markdown, no code fences, no extra text) matching this schema:
{
  "structuralAudit": {
    "assessment": "2-3 sentence CRO verdict on portfolio structure compliance. Clinical tone. Bilingual (English with 中文注释).",
    "signal": "GREEN" | "YELLOW" | "RED",
    "totalSlots": 14,
    "surplusCount": 2,
    "coreSlots": [
      { "symbol": "TSLA", "weight": 14.0, "notionalExposure": "Stock: 10 shares + LEAPS: ~80 equivalent = ~90 shares total ($32,400 notional)", "note": "Deep ITM $340C, delta ~0.80" }
    ],
    "satelliteSlots": [
      { "symbol": "RKLB", "weight": 16.1, "note": "+71% unrealized, momentum intact" }
    ],
    "betaSensitivity": [
      { "scenario": "QQQ -10%", "impact": -5000, "description": "estimated portfolio drawdown" },
      { "scenario": "QQQ -20%", "impact": -12000, "description": "severe drawdown estimate" }
    ],
    "singlePointOfFailure": "TSLA — 14% direct weight + deep ITM LEAPS = ~26% notional exposure to a single name"
  },
  "liquidationList": {
    "analysis": "Paragraph identifying bloat, redundancies, and dead weight. Clinical, no empathy. Bilingual.",
    "zombiePositions": [
      { "symbol": "XYZ", "weight": 0.8, "pnlPct": -15.2, "reason": "Sub-3% weight, no catalyst, consuming mental bandwidth" }
    ],
    "redundancies": [
      { "keep": "USO", "kill": ["UCO"], "reason": "Correlated energy exposure — keep the less leveraged instrument" }
    ],
    "invalidTheses": [
      { "symbol": "ABC", "lossPct": -25.0, "reason": "Thesis broken, no recovery catalyst, opportunity cost" }
    ]
  },
  "deepDive": {
    "coreAnalysis": [
      {
        "symbol": "TSLA",
        "analysis": "Delta-adjusted exposure analysis. Bilingual.",
        "deltaExposure": "10 shares + 1x $340C LEAPS (delta ~0.80) = ~90 equivalent shares, $32,400 notional",
        "keyLevels": "Hard stop: $380 on underlying. Support: $340 (strike). Resistance: $420",
        "thetaRisk": "Theta burn: ~$X/day. Acceptable for LEAPS with 6+ months to expiry"
      }
    ],
    "satelliteAnalysis": [
      {
        "symbol": "RKLB",
        "analysis": "Momentum and profit-taking analysis. Bilingual.",
        "profitTranches": "Trim 25% at $75, another 25% at $85. Let remainder ride with trailing stop",
        "reentryLevel": "Pyramid re-entry at $65 support if pullback occurs"
      }
    ]
  },
  "executionOrders": {
    "sellOrders": [
      { "priority": 1, "symbol": "XYZ", "action": "MARKET SELL — full position at open", "reason": "Zombie cleanup to reach 12-ticker limit" },
      { "priority": 2, "symbol": "UCO", "action": "MARKET SELL — full position", "reason": "Redundancy with USO" },
      { "priority": 3, "symbol": "ABC", "action": "LIMIT SELL at $XX or MARKET if gap down", "reason": "Invalid thesis, free up capital" }
    ],
    "circuitBreaker": {
      "triggerValue": 35000,
      "description": "If total account value drops below $35,000, cease all trading and move to 100% cash. No exceptions."
    }
  }
}

## Analysis Mandate:

### I. Structural Audit (Red/Yellow/Green):
- Count total tickers. Identify surplus beyond 12-limit. Classify each as Core or Satellite.
- For Core positions: calculate delta-adjusted notional exposure for any options.
- Estimate portfolio drawdown if QQQ drops 10% and 20%.
- Identify the Single Point of Failure (highest concentration risk including notional).

### II. Mandatory Liquidation List:
- **Zombie Positions:** <3% weight, no clear thesis, consuming attention without contributing alpha.
- **Redundancy Cleanup:** Correlated overlaps (e.g., UCO/USO, multiple similar sector bets). "Keep the Best, Kill the Rest."
- **Invalid Theses:** Significant loss + no recovery catalyst = immediate disposal to free opportunity cost.

### III. Deep Dive on High-Conviction Slots:
- **Core slots:** Full delta-exposure analysis, key price levels (support/resistance/stop), theta decay assessment.
- **Satellite slots:** Profit-taking tranches, pyramid re-entry levels, momentum assessment.

### IV. Execution Orders:
- Top 3+ sell orders for next market open to reach the 12-ticker limit.
- Define the Equity Circuit Breaker: the total account value at which ALL trading ceases and portfolio moves to 100% cash.

### Tone: Professional, clinical, data-driven. Zero hope. Use "Market Order," "Stop-Loss," "Notional Value" terminology. Bilingual where it adds clarity (English with 中文注释).`;
}
