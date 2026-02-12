import type { TradeType, OptionAction } from '@/database/models/trade.model';

export type CostBasisMethod = 'FIFO' | 'AVERAGE';

export interface TradeInput {
    type: TradeType;
    quantity: number;
    pricePerShare: number;
    totalAmount: number;
    fees: number;
    executedAt: Date | string;
    optionDetails?: {
        action: OptionAction;
        contracts: number;
        premiumPerContract: number;
    };
}

export interface Lot {
    shares: number;
    costPerShare: number;
    date: Date;
}

export interface PositionSummary {
    shares: number;
    costBasis: number;
    avgCostPerShare: number;
    realizedPL: number;
    unrealizedPL: number;
    optionsPremiumNet: number;
    adjustedCostBasis: number;
    dividendsReceived: number;
    lots: Lot[];
}

export function computePosition(trades: TradeInput[], method: CostBasisMethod): PositionSummary {
    // Sort trades chronologically
    const sorted = [...trades].sort(
        (a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
    );

    if (method === 'FIFO') {
        return computeFIFO(sorted);
    }
    return computeAverage(sorted);
}

function computeFIFO(trades: TradeInput[]): PositionSummary {
    const lots: Lot[] = [];
    let realizedPL = 0;
    let optionsPremiumNet = 0;
    let dividendsReceived = 0;

    for (const trade of trades) {
        switch (trade.type) {
            case 'BUY': {
                const costPerShare = trade.pricePerShare + (trade.fees / Math.max(trade.quantity, 1));
                lots.push({
                    shares: trade.quantity,
                    costPerShare,
                    date: new Date(trade.executedAt),
                });
                break;
            }
            case 'SELL': {
                let remaining = trade.quantity;
                const sellPricePerShare = trade.pricePerShare;
                const feePerShare = trade.fees / Math.max(trade.quantity, 1);

                while (remaining > 0 && lots.length > 0) {
                    const oldest = lots[0];
                    const consumed = Math.min(remaining, oldest.shares);
                    realizedPL += consumed * (sellPricePerShare - feePerShare - oldest.costPerShare);
                    oldest.shares -= consumed;
                    remaining -= consumed;
                    if (oldest.shares <= 0) {
                        lots.shift();
                    }
                }
                break;
            }
            case 'OPTION_PREMIUM': {
                if (trade.optionDetails) {
                    const premiumTotal = trade.optionDetails.contracts * trade.optionDetails.premiumPerContract * 100;
                    const action = trade.optionDetails.action;
                    if (action === 'SELL_TO_OPEN' || action === 'SELL_TO_CLOSE') {
                        optionsPremiumNet += premiumTotal;
                    } else {
                        optionsPremiumNet -= premiumTotal;
                    }
                } else {
                    // Fallback: positive totalAmount = premium received
                    optionsPremiumNet += trade.totalAmount;
                }
                break;
            }
            case 'DIVIDEND': {
                dividendsReceived += trade.totalAmount;
                break;
            }
        }
    }

    const shares = lots.reduce((sum, lot) => sum + lot.shares, 0);
    const costBasis = lots.reduce((sum, lot) => sum + lot.shares * lot.costPerShare, 0);
    const avgCostPerShare = shares > 0 ? costBasis / shares : 0;
    const adjustedCostBasis = costBasis - optionsPremiumNet;

    return {
        shares,
        costBasis,
        avgCostPerShare,
        realizedPL,
        unrealizedPL: 0, // Caller must compute with current price
        optionsPremiumNet,
        adjustedCostBasis,
        dividendsReceived,
        lots: lots.filter(l => l.shares > 0),
    };
}

function computeAverage(trades: TradeInput[]): PositionSummary {
    let shares = 0;
    let costBasis = 0;
    let realizedPL = 0;
    let optionsPremiumNet = 0;
    let dividendsReceived = 0;

    for (const trade of trades) {
        switch (trade.type) {
            case 'BUY': {
                const totalCost = trade.quantity * trade.pricePerShare + trade.fees;
                costBasis += totalCost;
                shares += trade.quantity;
                break;
            }
            case 'SELL': {
                if (shares <= 0) break;
                const avgCost = costBasis / shares;
                const sellProceeds = trade.quantity * trade.pricePerShare - trade.fees;
                const costOfSold = trade.quantity * avgCost;
                realizedPL += sellProceeds - costOfSold;
                costBasis -= costOfSold;
                shares -= trade.quantity;
                if (shares <= 0) {
                    shares = 0;
                    costBasis = 0;
                }
                break;
            }
            case 'OPTION_PREMIUM': {
                if (trade.optionDetails) {
                    const premiumTotal = trade.optionDetails.contracts * trade.optionDetails.premiumPerContract * 100;
                    const action = trade.optionDetails.action;
                    if (action === 'SELL_TO_OPEN' || action === 'SELL_TO_CLOSE') {
                        optionsPremiumNet += premiumTotal;
                    } else {
                        optionsPremiumNet -= premiumTotal;
                    }
                } else {
                    optionsPremiumNet += trade.totalAmount;
                }
                break;
            }
            case 'DIVIDEND': {
                dividendsReceived += trade.totalAmount;
                break;
            }
        }
    }

    const avgCostPerShare = shares > 0 ? costBasis / shares : 0;
    const adjustedCostBasis = costBasis - optionsPremiumNet;

    // For average method, represent as single lot
    const lots: Lot[] = shares > 0
        ? [{ shares, costPerShare: avgCostPerShare, date: new Date() }]
        : [];

    return {
        shares,
        costBasis,
        avgCostPerShare,
        realizedPL,
        unrealizedPL: 0,
        optionsPremiumNet,
        adjustedCostBasis,
        dividendsReceived,
        lots,
    };
}
