/**
 * Position Plan Rules Engine
 * Pure function: auditPositionPlan(input) → RulesAuditResult
 * 7 core trading discipline rules for drawdown prevention.
 */

export interface RulesEngineInput {
    plan: PositionPlanData;
    positions: PositionWithPriceData[];
    totalAccountValue: number; // positions market value + cash
    trades: TradeData[];
}

export function auditPositionPlan(input: RulesEngineInput): RulesAuditResult {
    const { plan, positions, totalAccountValue, trades } = input;
    const violations: RuleViolation[] = [];

    // Rule 1: Structure Audit (3+9 total ≤ 12)
    checkStructure(plan, violations);

    // Rule 2: Per-Position Max Drawdown 2%
    checkMaxDrawdown(plan, positions, totalAccountValue, violations);

    // Rule 3: Option Delta Exposure
    checkDeltaPenetration(plan, positions, totalAccountValue, violations);

    // Rule 4: Zombie Detection
    checkZombiePositions(plan, positions, totalAccountValue, violations);

    // Rule 5: Anti-Loser Averaging
    checkAntiLoserAveraging(positions, trades, violations);

    // Rule 6: Concentration Risk
    checkConcentrationRisk(positions, totalAccountValue, violations);

    // Rule 7: Cash Floor
    checkCashMinimum(plan, totalAccountValue, violations);

    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;

    // Score: start at 100, -15 per error, -7 per warning, -3 per info
    let totalScore = 100;
    for (const v of violations) {
        if (v.severity === 'error') totalScore -= 15;
        else if (v.severity === 'warning') totalScore -= 7;
        else totalScore -= 3;
    }
    totalScore = Math.max(0, Math.min(100, totalScore));

    const structureValid = !violations.some(v => v.ruleId === 'structure-audit' && v.severity === 'error');

    return {
        violations,
        structureValid,
        totalScore,
        timestamp: new Date().toISOString(),
    };
}

function checkStructure(plan: PositionPlanData, violations: RuleViolation[]) {
    const slots = plan.slots || [];
    const totalSlots = slots.length;
    const coreSlots = slots.filter(s => s.tier === 'core');
    const satSlots = slots.filter(s => s.tier === 'satellite');
    const specSlots = slots.filter(s => s.tier === 'speculative');

    if (totalSlots > 12) {
        violations.push({
            ruleId: 'structure-audit',
            ruleName: '3+9 Structure',
            severity: 'error',
            message: `Total positions (${totalSlots}) exceeds maximum of 12.`,
            affectedSymbols: slots.map(s => s.symbol),
            recommendation: `Reduce total positions to 12 or fewer. Consider liquidating weakest positions.`,
        });
    }

    if (coreSlots.length > 3) {
        violations.push({
            ruleId: 'structure-audit',
            ruleName: '3+9 Structure',
            severity: 'warning',
            message: `Core tier has ${coreSlots.length} positions (recommended max: 3).`,
            affectedSymbols: coreSlots.map(s => s.symbol),
            recommendation: `Core positions should be limited to 3 high-conviction holdings representing ~70% of portfolio.`,
        });
    }

    const tierTargets = plan.tierTargets || { core: 70, satellite: 25, speculative: 5 };
    const total = tierTargets.core + tierTargets.satellite + tierTargets.speculative;
    if (Math.abs(total - 100) > 0.5) {
        violations.push({
            ruleId: 'structure-audit',
            ruleName: '3+9 Structure',
            severity: 'warning',
            message: `Tier targets sum to ${total}% instead of 100%.`,
            affectedSymbols: [],
            recommendation: `Adjust tier targets to sum to 100%.`,
        });
    }
}

function checkMaxDrawdown(
    plan: PositionPlanData,
    positions: PositionWithPriceData[],
    totalAccountValue: number,
    violations: RuleViolation[]
) {
    if (totalAccountValue <= 0) return;
    const slots = plan.slots || [];

    for (const slot of slots) {
        const pos = positions.find(p => p.symbol === slot.symbol);
        if (!pos || pos.shares <= 0) continue;

        const maxDrawdownPct = slot.maxDrawdownPct || plan.maxDrawdownPctDefault || 2;

        if (!slot.stopLossPrice) {
            violations.push({
                ruleId: 'max-drawdown-2pct',
                ruleName: 'Per-Position Drawdown',
                severity: 'error',
                message: `${slot.symbol} has no stop loss set. Unlimited downside risk.`,
                affectedSymbols: [slot.symbol],
                recommendation: `Set a stop loss for ${slot.symbol}. Suggested: ${(pos.currentPrice * (1 - maxDrawdownPct / 100 * totalAccountValue / pos.marketValue)).toFixed(2)}`,
            });
            continue;
        }

        const potentialLoss = pos.shares * (pos.currentPrice - slot.stopLossPrice);
        const lossPctOfAccount = (potentialLoss / totalAccountValue) * 100;

        if (lossPctOfAccount > maxDrawdownPct) {
            violations.push({
                ruleId: 'max-drawdown-2pct',
                ruleName: 'Per-Position Drawdown',
                severity: 'error',
                message: `${slot.symbol}: potential loss $${potentialLoss.toFixed(0)} (${lossPctOfAccount.toFixed(1)}% of account) exceeds ${maxDrawdownPct}% max drawdown.`,
                affectedSymbols: [slot.symbol],
                recommendation: `Raise stop loss to ${(pos.currentPrice - (totalAccountValue * maxDrawdownPct / 100) / pos.shares).toFixed(2)} or reduce position size.`,
            });
        }
    }
}

function checkDeltaPenetration(
    plan: PositionPlanData,
    positions: PositionWithPriceData[],
    totalAccountValue: number,
    violations: RuleViolation[]
) {
    if (totalAccountValue <= 0) return;

    for (const pos of positions) {
        if (!pos.openOptions || pos.openOptions.length === 0) continue;

        const slot = plan.slots?.find(s => s.symbol === pos.symbol);
        if (!slot) continue;

        // Approximate delta: calls ≈ 0.5, puts ≈ -0.5 for simplicity
        let deltaEquivalentShares = pos.shares;
        for (const opt of pos.openOptions) {
            const delta = opt.contractType === 'CALL' ? 0.5 : -0.5;
            const direction = opt.direction === 'long' ? 1 : -1;
            deltaEquivalentShares += opt.netContracts * 100 * delta * direction;
        }

        const tierTarget = plan.tierTargets?.[slot.tier] || 25;
        const tierAllocationValue = totalAccountValue * (tierTarget / 100);
        const deltaNotional = Math.abs(deltaEquivalentShares) * pos.currentPrice;

        if (deltaNotional > tierAllocationValue * 1.5) {
            violations.push({
                ruleId: 'delta-penetration',
                ruleName: 'Option Delta Exposure',
                severity: 'warning',
                message: `${pos.symbol}: delta-equivalent notional ($${deltaNotional.toFixed(0)}) exceeds 1.5x ${slot.tier} tier allocation ($${tierAllocationValue.toFixed(0)}).`,
                affectedSymbols: [pos.symbol],
                recommendation: `Reduce option exposure or increase tier allocation for ${slot.tier}.`,
            });
        }
    }
}

function checkZombiePositions(
    plan: PositionPlanData,
    positions: PositionWithPriceData[],
    totalAccountValue: number,
    violations: RuleViolation[]
) {
    if (totalAccountValue <= 0) return;

    const zombies: string[] = [];
    for (const pos of positions) {
        if (pos.shares <= 0) continue;
        const weightPct = (pos.marketValue / totalAccountValue) * 100;
        const returnPct = pos.totalReturnPercent;
        const hasSlot = plan.slots?.some(s => s.symbol === pos.symbol);

        if (weightPct < 1 && returnPct < -20 && !hasSlot) {
            zombies.push(pos.symbol);
        }
    }

    if (zombies.length > 0) {
        violations.push({
            ruleId: 'zombie-detection',
            ruleName: 'Zombie Positions',
            severity: 'warning',
            message: `${zombies.length} zombie position(s) detected: < 1% weight, > 20% loss, no plan slot.`,
            affectedSymbols: zombies,
            recommendation: `Consider forced liquidation of: ${zombies.join(', ')}. These positions tie up capital with no recovery thesis.`,
        });
    }
}

function checkAntiLoserAveraging(
    positions: PositionWithPriceData[],
    trades: TradeData[],
    violations: RuleViolation[]
) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const violatingSymbols: string[] = [];
    for (const pos of positions) {
        if (pos.unrealizedPL >= 0) continue; // not a loser

        // Check for BUY trades in last 30 days on this losing position
        const recentBuys = trades.filter(t =>
            t.symbol === pos.symbol &&
            t.type === 'BUY' &&
            new Date(t.executedAt) >= thirtyDaysAgo
        );

        if (recentBuys.length > 0) {
            violatingSymbols.push(pos.symbol);
        }
    }

    if (violatingSymbols.length > 0) {
        violations.push({
            ruleId: 'anti-loser-avg',
            ruleName: 'Anti-Loser Averaging',
            severity: 'error',
            message: `BUY trades on losing positions in last 30 days: ${violatingSymbols.join(', ')}. Averaging down on losers is strictly forbidden.`,
            affectedSymbols: violatingSymbols,
            recommendation: `Do NOT add to losing positions. If the thesis is intact, set a re-entry plan at a lower level. Otherwise, cut losses.`,
        });
    }
}

function checkConcentrationRisk(
    positions: PositionWithPriceData[],
    totalAccountValue: number,
    violations: RuleViolation[]
) {
    if (totalAccountValue <= 0) return;

    const activePositions = positions.filter(p => p.shares > 0 && p.marketValue > 0);
    const sorted = [...activePositions].sort((a, b) => b.marketValue - a.marketValue);

    // Single position > 25%
    for (const pos of sorted) {
        const pct = (pos.marketValue / totalAccountValue) * 100;
        if (pct > 25) {
            violations.push({
                ruleId: 'concentration-risk',
                ruleName: 'Concentration Risk',
                severity: 'warning',
                message: `${pos.symbol} is ${pct.toFixed(1)}% of account (> 25% threshold).`,
                affectedSymbols: [pos.symbol],
                recommendation: `Consider trimming ${pos.symbol} to reduce single-name risk below 25%.`,
            });
        }
    }

    // Top 3 > 60%
    if (sorted.length >= 3) {
        const top3Pct = sorted.slice(0, 3).reduce((sum, p) => sum + (p.marketValue / totalAccountValue) * 100, 0);
        if (top3Pct > 60) {
            violations.push({
                ruleId: 'concentration-risk',
                ruleName: 'Concentration Risk',
                severity: 'warning',
                message: `Top 3 positions (${sorted.slice(0, 3).map(p => p.symbol).join(', ')}) represent ${top3Pct.toFixed(1)}% of account (> 60% threshold).`,
                affectedSymbols: sorted.slice(0, 3).map(p => p.symbol),
                recommendation: `Diversify: top 3 positions should ideally be under 60% of total account.`,
            });
        }
    }

    // Single sector > 40% (using plan slot sector data)
    // This is checked at a higher level where sector data is available
}

function checkCashMinimum(
    plan: PositionPlanData,
    totalAccountValue: number,
    violations: RuleViolation[]
) {
    if (totalAccountValue <= 0) return;

    const cashBalance = plan.cashBalance || 0;
    const cashPct = (cashBalance / totalAccountValue) * 100;

    if (cashPct < 5) {
        violations.push({
            ruleId: 'cash-minimum',
            ruleName: 'Cash Floor',
            severity: 'warning',
            message: `Cash ($${cashBalance.toFixed(0)}) is ${cashPct.toFixed(1)}% of account (< 5% floor).`,
            affectedSymbols: [],
            recommendation: `Maintain at least 5% cash reserve for opportunities and margin of safety. Consider trimming positions to raise cash.`,
        });
    }
}
