import type { TradeType, TradeSource, OptionAction } from '@/database/models/trade.model';

export interface ParsedTrade {
    symbol: string;
    type: TradeType;
    quantity: number;
    pricePerShare: number;
    totalAmount: number;
    fees: number;
    executedAt: Date;
    source: TradeSource;
    optionDetails?: {
        contractType: 'CALL' | 'PUT';
        action: OptionAction;
        strikePrice: number;
        expirationDate: Date;
        contracts: number;
        premiumPerContract: number;
    };
    notes?: string;
}

export interface ParseError {
    row: number;
    message: string;
    raw: string;
}

export interface ParseResult {
    trades: ParsedTrade[];
    errors: ParseError[];
    format: TradeSource;
}

type BrokerFormat = 'csv_robinhood' | 'csv_schwab' | 'csv_wealthsimple' | 'csv_generic';

export function detectBrokerFormat(headerLine: string): BrokerFormat {
    const lower = headerLine.toLowerCase();

    if (lower.includes('activity date') && lower.includes('instrument') && lower.includes('trans code')) {
        return 'csv_robinhood';
    }

    if (lower.includes('account_id') && lower.includes('activity_sub_type') && lower.includes('net_cash_amount')) {
        return 'csv_wealthsimple';
    }

    if (lower.includes('action') && lower.includes('symbol') && lower.includes('quantity') && lower.includes('price') && (lower.includes('fees') || lower.includes('commission'))) {
        return 'csv_schwab';
    }

    return 'csv_generic';
}

export function parseCSV(content: string, format?: BrokerFormat): ParseResult {
    const lines = content.trim().split('\n');
    if (lines.length < 2) {
        return { trades: [], errors: [{ row: 0, message: 'CSV must have a header row and at least one data row', raw: content }], format: format || 'csv_generic' };
    }

    const headerLine = lines[0];
    const detectedFormat = format || detectBrokerFormat(headerLine);

    switch (detectedFormat) {
        case 'csv_robinhood':
            return parseRobinhood(lines, detectedFormat);
        case 'csv_schwab':
            return parseSchwab(lines, detectedFormat);
        case 'csv_wealthsimple':
            return parseWealthsimple(lines, detectedFormat);
        default:
            return parseGeneric(lines, detectedFormat);
    }
}

function splitCSVLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    fields.push(current.trim());
    return fields;
}

function parseNumber(val: string): number {
    if (!val) return 0;
    // Remove $ signs, commas, parentheses (negative)
    let clean = val.replace(/[$,]/g, '').trim();
    const isNeg = clean.startsWith('(') && clean.endsWith(')');
    if (isNeg) clean = clean.slice(1, -1);
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : (isNeg ? -num : num);
}

function parseDate(val: string): Date | null {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

// Robinhood CSV format
function parseRobinhood(lines: string[], format: TradeSource): ParseResult {
    const trades: ParsedTrade[] = [];
    const errors: ParseError[] = [];
    const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase().trim());

    const idx = {
        date: headers.indexOf('activity date'),
        symbol: headers.findIndex(h => h === 'instrument' || h === 'symbol'),
        transCode: headers.indexOf('trans code'),
        quantity: headers.indexOf('quantity'),
        price: headers.indexOf('price'),
        amount: headers.indexOf('amount'),
    };

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
            const fields = splitCSVLine(line);
            const dateStr = fields[idx.date] || '';
            const symbol = (fields[idx.symbol] || '').toUpperCase();
            const transCode = (fields[idx.transCode] || '').toUpperCase();
            const quantity = Math.abs(parseNumber(fields[idx.quantity]));
            const price = Math.abs(parseNumber(fields[idx.price]));
            const amount = parseNumber(fields[idx.amount]);

            const executedAt = parseDate(dateStr);
            if (!executedAt || !symbol) {
                errors.push({ row: i + 1, message: 'Missing date or symbol', raw: line });
                continue;
            }

            let type: TradeType;
            if (transCode === 'BUY' || transCode === 'BCVR') {
                type = 'BUY';
            } else if (transCode === 'SELL' || transCode === 'SLD' || transCode === 'SHRT') {
                type = 'SELL';
            } else if (transCode === 'DIV' || transCode === 'CDIV') {
                type = 'DIVIDEND';
            } else if (transCode.includes('OASGN') || transCode.includes('OEXCS')) {
                // Option assignment/exercise - treat as buy or sell
                type = amount < 0 ? 'BUY' : 'SELL';
            } else {
                errors.push({ row: i + 1, message: `Unknown transaction code: ${transCode}`, raw: line });
                continue;
            }

            trades.push({
                symbol,
                type,
                quantity: quantity || 1,
                pricePerShare: price,
                totalAmount: Math.abs(amount),
                fees: 0,
                executedAt,
                source: format,
            });
        } catch {
            errors.push({ row: i + 1, message: 'Failed to parse row', raw: line });
        }
    }

    return { trades, errors, format };
}

// Schwab CSV format
function parseSchwab(lines: string[], format: TradeSource): ParseResult {
    const trades: ParsedTrade[] = [];
    const errors: ParseError[] = [];
    const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase().trim());

    const idx = {
        date: headers.indexOf('date'),
        action: headers.indexOf('action'),
        symbol: headers.indexOf('symbol'),
        quantity: headers.indexOf('quantity'),
        price: headers.indexOf('price'),
        fees: headers.indexOf('fees'),
        amount: headers.indexOf('amount'),
    };

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
            const fields = splitCSVLine(line);
            const dateStr = fields[idx.date] || '';
            const action = (fields[idx.action] || '').toUpperCase();
            const symbol = (fields[idx.symbol] || '').toUpperCase();
            const quantity = Math.abs(parseNumber(fields[idx.quantity]));
            const price = Math.abs(parseNumber(fields[idx.price]));
            const fees = Math.abs(parseNumber(fields[idx.fees]));
            const amount = parseNumber(fields[idx.amount]);

            const executedAt = parseDate(dateStr);
            if (!executedAt || !symbol) {
                errors.push({ row: i + 1, message: 'Missing date or symbol', raw: line });
                continue;
            }

            let type: TradeType;
            if (action.includes('BUY') || action.includes('REINVEST')) {
                type = 'BUY';
            } else if (action.includes('SELL')) {
                type = 'SELL';
            } else if (action.includes('DIVIDEND') || action.includes('DIV')) {
                type = 'DIVIDEND';
            } else {
                errors.push({ row: i + 1, message: `Unknown action: ${action}`, raw: line });
                continue;
            }

            trades.push({
                symbol,
                type,
                quantity: quantity || 1,
                pricePerShare: price,
                totalAmount: Math.abs(amount),
                fees,
                executedAt,
                source: format,
            });
        } catch {
            errors.push({ row: i + 1, message: 'Failed to parse row', raw: line });
        }
    }

    return { trades, errors, format };
}

// Wealthsimple CSV format — processes per-account to compute correct ACB
function parseWealthsimple(lines: string[], format: TradeSource): ParseResult {
    const trades: ParsedTrade[] = [];
    const errors: ParseError[] = [];
    const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase().trim());

    const idx = {
        date: headers.indexOf('transaction_date'),
        symbol: headers.findIndex(h => h === 'symbol'),
        type: headers.indexOf('activity_sub_type'),
        quantity: headers.indexOf('quantity'),
        price: headers.indexOf('unit_price'),
        fees: headers.indexOf('commission'),
        total: headers.indexOf('net_cash_amount'),
        accountId: headers.indexOf('account_id'),
        notes: headers.findIndex(h => h === 'name'),
    };

    if (idx.date === -1 || idx.symbol === -1) {
        return {
            trades: [],
            errors: [{ row: 1, message: 'CSV must have transaction_date and symbol columns', raw: lines[0] }],
            format,
        };
    }

    interface RawTrade {
        accountId: string;
        symbol: string;
        type: TradeType;
        quantity: number;
        price: number;
        fees: number;
        total: number;
        executedAt: Date;
        notes?: string;
    }

    const rawTrades: RawTrade[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
            const fields = splitCSVLine(line);
            const dateStr = fields[idx.date] || '';
            const symbol = (fields[idx.symbol] || '').toUpperCase();
            const rawType = idx.type >= 0 ? (fields[idx.type] || '') : '';
            const rawQuantity = parseNumber(idx.quantity >= 0 ? fields[idx.quantity] : '0');
            const quantity = Math.abs(rawQuantity);
            const price = Math.abs(parseNumber(idx.price >= 0 ? fields[idx.price] : '0'));
            const fees = Math.abs(parseNumber(idx.fees >= 0 ? fields[idx.fees] : '0'));
            const total = parseNumber(idx.total >= 0 ? fields[idx.total] : '0');
            const accountId = idx.accountId >= 0 ? (fields[idx.accountId] || 'default') : 'default';
            const notes = idx.notes >= 0 ? fields[idx.notes] : undefined;

            const executedAt = parseDate(dateStr);
            if (!executedAt || !symbol) {
                errors.push({ row: i + 1, message: 'Missing date or symbol', raw: line });
                continue;
            }

            const type = inferTradeType(rawType, rawQuantity, total);
            if (!type) {
                errors.push({ row: i + 1, message: `Cannot determine trade type from "${rawType}"`, raw: line });
                continue;
            }

            rawTrades.push({
                accountId,
                symbol,
                type,
                quantity: quantity || 1,
                price: price || (quantity > 0 ? Math.abs(total) / quantity : 0),
                fees,
                total: Math.abs(total) || (quantity * price),
                executedAt,
                notes,
            });
        } catch {
            errors.push({ row: i + 1, message: 'Failed to parse row', raw: line });
        }
    }

    // Group by (account, symbol) so sells only affect their own account's cost basis
    const groups = new Map<string, RawTrade[]>();
    for (const t of rawTrades) {
        const key = `${t.accountId}::${t.symbol}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(t);
    }

    for (const [, groupTrades] of groups) {
        groupTrades.sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime());

        const hasSells = groupTrades.some(t => t.type === 'SELL');

        if (!hasSells) {
            // No sells in this account — output all buys as-is
            for (const t of groupTrades) {
                trades.push({
                    symbol: t.symbol,
                    type: t.type,
                    quantity: t.quantity,
                    pricePerShare: t.price,
                    totalAmount: t.total,
                    fees: t.fees,
                    executedAt: t.executedAt,
                    source: format,
                    notes: t.notes,
                });
            }
        } else {
            // Has sells — compute per-account average cost, output net position
            let shares = 0;
            let costBasis = 0;
            let earliestDate = groupTrades[0].executedAt;
            const sym = groupTrades[0].symbol;

            for (const t of groupTrades) {
                if (t.type === 'BUY') {
                    costBasis += t.quantity * t.price + t.fees;
                    shares += t.quantity;
                } else if (t.type === 'SELL') {
                    if (shares > 0) {
                        const avg = costBasis / shares;
                        costBasis -= t.quantity * avg;
                        shares -= t.quantity;
                        if (shares <= 0) { shares = 0; costBasis = 0; }
                    }
                }
            }

            if (shares > 0) {
                const avgCost = costBasis / shares;
                trades.push({
                    symbol: sym,
                    type: 'BUY',
                    quantity: shares,
                    pricePerShare: avgCost,
                    totalAmount: costBasis,
                    fees: 0,
                    executedAt: earliestDate,
                    source: format,
                    notes: `Consolidated from Wealthsimple account`,
                });
            }
        }
    }

    return { trades, errors, format };
}

/**
 * Finds the best column index for trade type/action.
 * Prefers specific headers like 'activity_sub_type', 'trans code', 'action', 'side'
 * over ambiguous ones like 'type' (which may match 'account_type').
 */
function findTypeColumnIndex(headers: string[]): number {
    // Priority 1: Exact or very specific matches
    const specific = [
        'activity_sub_type', 'sub_type', 'subtype',
        'trans code', 'trans_code', 'transaction_type', 'transaction type',
        'trade_type', 'trade type', 'order_type', 'order type',
        'action', 'side', 'direction',
        'buy/sell', 'buy_sell', 'buysell',
    ];
    for (const name of specific) {
        const idx = headers.indexOf(name);
        if (idx !== -1) return idx;
    }

    // Priority 2: Columns that contain 'type' but NOT 'account_type' or 'activity_type' alone
    for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (h === 'type') return i;
        if (h.includes('type') && !h.startsWith('account') && !h.startsWith('activity_type') && h !== 'activity_type') {
            return i;
        }
    }

    return -1;
}

/**
 * Infers trade type from a string value.
 * Returns null if unable to determine.
 */
function inferTradeType(typeStr: string, quantity: number, cashAmount: number): TradeType | null {
    const upper = typeStr.toUpperCase().trim();

    if (upper === 'BUY' || upper === 'B' || upper === 'BOT' || upper === 'BOUGHT'
        || upper === 'BUY TO COVER' || upper === 'BCVR' || upper === 'LONG') {
        return 'BUY';
    }
    if (upper === 'SELL' || upper === 'S' || upper === 'SLD' || upper === 'SOLD'
        || upper === 'SHORT' || upper === 'SHRT' || upper === 'SS') {
        return 'SELL';
    }
    if (upper.includes('BUY')) return 'BUY';
    if (upper.includes('SELL') || upper.includes('SOLD')) return 'SELL';
    if (upper.includes('DIV')) return 'DIVIDEND';
    if (upper.includes('OPTION') || upper.includes('PREMIUM')) return 'OPTION_PREMIUM';

    // Fallback: infer from quantity sign or cash amount sign
    if (quantity < 0) return 'SELL';
    if (cashAmount > 0 && quantity !== 0) return 'SELL';
    if (cashAmount < 0 && quantity !== 0) return 'BUY';

    return null;
}

// Generic CSV format: flexible header matching
function parseGeneric(lines: string[], format: TradeSource): ParseResult {
    const trades: ParsedTrade[] = [];
    const errors: ParseError[] = [];
    const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase().trim());

    const idx = {
        date: headers.findIndex(h => h.includes('date') && !h.includes('settle') && !h.includes('expir')),
        symbol: headers.findIndex(h => h === 'symbol' || h === 'ticker' || h === 'instrument'),
        type: findTypeColumnIndex(headers),
        quantity: headers.findIndex(h => h.includes('quantity') || h.includes('shares') || h.includes('qty')),
        price: headers.findIndex(h => h === 'price' || h === 'unit_price' || h === 'unit price' || h === 'avg_price' || h === 'fill_price'),
        fees: headers.findIndex(h => h.includes('fee') || h.includes('commission')),
        total: headers.findIndex(h => h.includes('net_cash') || h.includes('net cash') || h.includes('total') || h.includes('amount') || h.includes('proceeds') || h.includes('net_amount')),
        notes: headers.findIndex(h => h.includes('note') || h.includes('memo') || h.includes('description') || h.includes('name')),
    };

    // Fallback: if date not found with exclusions, try any 'date' column
    if (idx.date === -1) {
        idx.date = headers.findIndex(h => h.includes('date'));
    }

    // Fallback: if symbol not found exactly, try contains
    if (idx.symbol === -1) {
        idx.symbol = headers.findIndex(h => h.includes('symbol') || h.includes('ticker'));
    }

    // Fallback: price column - try any header with 'price'
    if (idx.price === -1) {
        idx.price = headers.findIndex(h => h.includes('price') && !h.includes('strike'));
    }

    if (idx.date === -1 || idx.symbol === -1) {
        return {
            trades: [],
            errors: [{ row: 1, message: 'CSV must have Date and Symbol columns', raw: lines[0] }],
            format,
        };
    }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
            const fields = splitCSVLine(line);
            const dateStr = fields[idx.date] || '';
            const symbol = (fields[idx.symbol] || '').toUpperCase();
            const rawType = idx.type >= 0 ? (fields[idx.type] || '') : '';
            const rawQuantity = parseNumber(idx.quantity >= 0 ? fields[idx.quantity] : '0');
            const quantity = Math.abs(rawQuantity);
            const price = Math.abs(parseNumber(idx.price >= 0 ? fields[idx.price] : '0'));
            const fees = Math.abs(parseNumber(idx.fees >= 0 ? fields[idx.fees] : '0'));
            const total = parseNumber(idx.total >= 0 ? fields[idx.total] : '0');
            const notes = idx.notes >= 0 ? fields[idx.notes] : undefined;

            const executedAt = parseDate(dateStr);
            if (!executedAt || !symbol) {
                errors.push({ row: i + 1, message: 'Missing date or symbol', raw: line });
                continue;
            }

            const type = inferTradeType(rawType, rawQuantity, total);
            if (!type) {
                errors.push({ row: i + 1, message: `Cannot determine trade type from "${rawType}"`, raw: line });
                continue;
            }

            const totalAmount = Math.abs(total) || (quantity * price);

            trades.push({
                symbol,
                type,
                quantity: quantity || 1,
                pricePerShare: price || (quantity > 0 ? totalAmount / quantity : 0),
                totalAmount,
                fees,
                executedAt,
                source: format,
                notes,
            });
        } catch {
            errors.push({ row: i + 1, message: 'Failed to parse row', raw: line });
        }
    }

    return { trades, errors, format };
}
