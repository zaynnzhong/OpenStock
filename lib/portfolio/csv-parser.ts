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

type BrokerFormat = 'csv_robinhood' | 'csv_schwab' | 'csv_generic';

export function detectBrokerFormat(headerLine: string): BrokerFormat {
    const lower = headerLine.toLowerCase();

    if (lower.includes('activity date') && lower.includes('instrument') && lower.includes('trans code')) {
        return 'csv_robinhood';
    }

    if (lower.includes('date') && lower.includes('action') && lower.includes('symbol') && lower.includes('quantity') && lower.includes('price') && lower.includes('fees')) {
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

// Generic CSV format: Date, Symbol, Type (BUY/SELL/DIVIDEND), Quantity, Price, Fees, Total, Notes
function parseGeneric(lines: string[], format: TradeSource): ParseResult {
    const trades: ParsedTrade[] = [];
    const errors: ParseError[] = [];
    const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase().trim());

    const idx = {
        date: headers.findIndex(h => h.includes('date')),
        symbol: headers.findIndex(h => h.includes('symbol') || h.includes('ticker')),
        type: headers.findIndex(h => h.includes('type') || h.includes('action') || h.includes('side')),
        quantity: headers.findIndex(h => h.includes('quantity') || h.includes('shares') || h.includes('qty')),
        price: headers.findIndex(h => h.includes('price')),
        fees: headers.findIndex(h => h.includes('fee') || h.includes('commission')),
        total: headers.findIndex(h => h.includes('total') || h.includes('amount') || h.includes('proceeds')),
        notes: headers.findIndex(h => h.includes('note') || h.includes('memo') || h.includes('description')),
    };

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
            const typeStr = (idx.type >= 0 ? fields[idx.type] : 'BUY').toUpperCase();
            const quantity = Math.abs(parseNumber(idx.quantity >= 0 ? fields[idx.quantity] : '0'));
            const price = Math.abs(parseNumber(idx.price >= 0 ? fields[idx.price] : '0'));
            const fees = Math.abs(parseNumber(idx.fees >= 0 ? fields[idx.fees] : '0'));
            const total = parseNumber(idx.total >= 0 ? fields[idx.total] : '0');
            const notes = idx.notes >= 0 ? fields[idx.notes] : undefined;

            const executedAt = parseDate(dateStr);
            if (!executedAt || !symbol) {
                errors.push({ row: i + 1, message: 'Missing date or symbol', raw: line });
                continue;
            }

            let type: TradeType;
            if (typeStr.includes('BUY')) {
                type = 'BUY';
            } else if (typeStr.includes('SELL')) {
                type = 'SELL';
            } else if (typeStr.includes('DIV')) {
                type = 'DIVIDEND';
            } else if (typeStr.includes('OPTION') || typeStr.includes('PREMIUM')) {
                type = 'OPTION_PREMIUM';
            } else {
                type = 'BUY'; // Default
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
