'use server';

import { getDateRange, validateArticle, formatArticle } from '@/lib/utils';
import { POPULAR_STOCK_SYMBOLS } from '@/lib/constants';
import { cache } from 'react';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const NEXT_PUBLIC_FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';

async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
    const options: RequestInit & { next?: { revalidate?: number } } = revalidateSeconds
        ? { cache: 'force-cache', next: { revalidate: revalidateSeconds } }
        : { cache: 'no-store' };

    const res = await fetch(url, options);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Fetch failed ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
}

export { fetchJSON };

export type OHLCVBar = {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

const ohlcvTfMap: Record<string, { interval: string; range: string }> = {
    "5": { interval: "5m", range: "5d" },
    "15": { interval: "15m", range: "5d" },
    "60": { interval: "60m", range: "30d" },
    "D": { interval: "1d", range: "1y" },
    "W": { interval: "1wk", range: "5y" },
    "M": { interval: "1mo", range: "10y" },
};

export async function getOHLCV(
    symbol: string,
    timeframe: string = "D",
    barCount: number = 100
): Promise<OHLCVBar[]> {
    try {
        const tf = ohlcvTfMap[timeframe] || ohlcvTfMap["D"];
        const isIntraday = ["5", "15", "60"].includes(timeframe);
        const revalidate = isIntraday ? 60 : 3600;

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${tf.range}&interval=${tf.interval}`;
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            cache: "force-cache",
            next: { revalidate },
        } as any);

        if (!res.ok) return [];
        const data = await res.json();

        const result = data?.chart?.result?.[0];
        if (!result) return [];

        const timestamps: number[] = result.timestamp || [];
        const quote = result.indicators?.quote?.[0];
        if (!quote) return [];

        const bars: OHLCVBar[] = [];
        for (let i = 0; i < timestamps.length; i++) {
            const o = quote.open?.[i];
            const h = quote.high?.[i];
            const l = quote.low?.[i];
            const c = quote.close?.[i];
            const v = quote.volume?.[i];
            if (c == null) continue;

            const dateStr = isIntraday
                ? new Date(timestamps[i] * 1000).toISOString().replace('T', ' ').slice(0, 16)
                : new Date(timestamps[i] * 1000).toISOString().split('T')[0];

            bars.push({
                date: dateStr,
                open: o ?? c,
                high: h ?? c,
                low: l ?? c,
                close: c,
                volume: v ?? 0,
            });
        }

        return bars.slice(-barCount);
    } catch (e) {
        console.error(`Error fetching OHLCV for`, symbol, timeframe, e);
        return [];
    }
}

export async function getSMA(symbol: string, shortPeriod: number = 20, longPeriod: number = 50, timeframe: string = "D") {
    try {
        // Map timeframe to Yahoo Finance interval/range
        const tfMap: Record<string, { interval: string; range: string }> = {
            "5": { interval: "5m", range: "5d" },
            "15": { interval: "15m", range: "5d" },
            "60": { interval: "60m", range: "30d" },
            "D": { interval: "1d", range: "1y" },
            "W": { interval: "1wk", range: "5y" },
            "M": { interval: "1mo", range: "10y" },
        };
        const tf = tfMap[timeframe] || tfMap["D"];
        const maxPeriod = Math.max(shortPeriod, longPeriod);

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${tf.range}&interval=${tf.interval}`;
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            cache: "force-cache",
            next: { revalidate: 3600 },
        } as any);

        if (!res.ok) return null;
        const data = await res.json();

        const closes: number[] = (data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [])
            .filter((c: any) => c !== null && c !== undefined);

        if (closes.length < maxPeriod) return null;

        const calcSMA = (period: number) => {
            const slice = closes.slice(-period);
            return slice.reduce((a: number, b: number) => a + b, 0) / period;
        };

        return {
            price: closes[closes.length - 1],
            smaShort: calcSMA(shortPeriod),
            smaLong: calcSMA(longPeriod),
            shortPeriod,
            longPeriod,
        };
    } catch (e) {
        console.error(`Error fetching SMA for`, symbol, e);
        return null;
    }
}

export async function getHistoricalPrices(symbol: string, fromDate: string) {
    try {
        const period1 = Math.floor(new Date(fromDate).getTime() / 1000);
        const period2 = Math.floor(Date.now() / 1000);

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            cache: "force-cache",
            next: { revalidate: 3600 },
        } as any);

        if (!res.ok) return null;
        const data = await res.json();

        const result = data?.chart?.result?.[0];
        if (!result) return null;

        const timestamps: number[] = result.timestamps || result.timestamp || [];
        const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];

        const dates: string[] = [];
        const prices: number[] = [];

        for (let i = 0; i < timestamps.length; i++) {
            if (closes[i] !== null && closes[i] !== undefined) {
                dates.push(new Date(timestamps[i] * 1000).toISOString().split('T')[0]);
                prices.push(closes[i] as number);
            }
        }

        return { dates, prices };
    } catch (e) {
        console.error(`Error fetching historical prices for`, symbol, e);
        return null;
    }
}

// Yahoo Finance crumb/cookie cache for options chain
let yahooCrumbCache: { crumb: string; cookie: string; ts: number } | null = null;

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string }> {
    // Reuse cached crumb for 30 minutes
    if (yahooCrumbCache && Date.now() - yahooCrumbCache.ts < 30 * 60 * 1000) {
        return yahooCrumbCache;
    }

    const cookieRes = await fetch("https://fc.yahoo.com", {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0" },
    });
    const setCookie = cookieRes.headers.get("set-cookie") || "";

    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
        headers: {
            "User-Agent": "Mozilla/5.0",
            Cookie: setCookie,
        },
    });
    const crumb = await crumbRes.text();

    yahooCrumbCache = { crumb, cookie: setCookie, ts: Date.now() };
    return yahooCrumbCache;
}

export interface OptionContract {
    contractSymbol: string;
    strike: number;
    lastPrice: number;
    bid: number;
    ask: number;
    volume: number;
    openInterest: number;
    impliedVolatility: number;
    inTheMoney: boolean;
    expiration: number;
}

export interface OptionsChainData {
    symbol: string;
    expirationDates: number[];       // unix timestamps
    strikes: number[];
    calls: OptionContract[];
    puts: OptionContract[];
    stockPrice: number;
}

export async function getOptionsChain(
    symbol: string,
    expirationTimestamp?: number
): Promise<OptionsChainData | null> {
    try {
        const { crumb, cookie } = await getYahooCrumb();
        const encodedCrumb = encodeURIComponent(crumb);
        let url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodedCrumb}`;
        if (expirationTimestamp) {
            url += `&date=${expirationTimestamp}`;
        }

        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                Cookie: cookie,
            },
            cache: "no-store",
        });

        if (!res.ok) return null;
        const data = await res.json();

        const result = data?.optionChain?.result?.[0];
        if (!result) return null;

        const options = result.options?.[0] || {};
        const stockPrice = result.quote?.regularMarketPrice || 0;

        return {
            symbol: symbol.toUpperCase(),
            expirationDates: result.expirationDates || [],
            strikes: result.strikes || [],
            calls: (options.calls || []).map(mapContract),
            puts: (options.puts || []).map(mapContract),
            stockPrice,
        };
    } catch (e) {
        console.error("Error fetching options chain for", symbol, e);
        return null;
    }
}

function mapContract(c: any): OptionContract {
    return {
        contractSymbol: c.contractSymbol || "",
        strike: c.strike || 0,
        lastPrice: c.lastPrice || 0,
        bid: c.bid || 0,
        ask: c.ask || 0,
        volume: c.volume || 0,
        openInterest: c.openInterest || 0,
        impliedVolatility: c.impliedVolatility || 0,
        inTheMoney: c.inTheMoney || false,
        expiration: c.expiration || 0,
    };
}

export async function getQuote(symbol: string) {
    try {
        const token = NEXT_PUBLIC_FINNHUB_API_KEY;
        const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
        // Cache for 15 seconds to avoid rate limit bursts across pages
        const data = await fetchJSON<any>(url, 15);
        // Finnhub free tier only supports US exchanges — if price is 0, fall back to Yahoo Finance
        if (data && data.c) return data;
        return await getQuoteFromYahoo(symbol);
    } catch (e) {
        console.error('Error fetching quote for', symbol, e);
        // Try Yahoo as last resort
        try { return await getQuoteFromYahoo(symbol); } catch { return null; }
    }
}

async function getQuoteFromYahoo(symbol: string) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=1d`;
    const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const quotes = data?.chart?.result?.[0]?.indicators?.quote?.[0];
    if (!meta?.regularMarketPrice) return null;

    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose || price;
    const change = price - prevClose;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;
    const highs: number[] = (quotes?.high || []).filter((v: any) => v != null);
    const lows: number[] = (quotes?.low || []).filter((v: any) => v != null);

    return {
        c: price,
        d: change,
        dp: changePct,
        h: highs.length ? highs[highs.length - 1] : price,
        l: lows.length ? lows[lows.length - 1] : price,
        pc: prevClose,
        o: meta.regularMarketOpen || price,
    };
}

export async function getCompanyProfile(symbol: string) {
    try {
        const token = NEXT_PUBLIC_FINNHUB_API_KEY;
        const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}`;
        // Cache profile for 24 hours
        const data = await fetchJSON<any>(url, 86400);
        // Finnhub free tier returns empty object for non-US stocks
        if (data && data.name) return data;
        return await getProfileFromYahoo(symbol);
    } catch (e) {
        console.error('Error fetching profile for', symbol, e);
        try { return await getProfileFromYahoo(symbol); } catch { return null; }
    }
}

// Map Finnhub industry names to standard sector categories
const FINNHUB_INDUSTRY_TO_SECTOR: Record<string, string> = {
    'Technology': 'Technology',
    'Media': 'Communication Services',
    'Automobiles': 'Consumer Cyclical',
    'Banks': 'Financial',
    'Insurance': 'Financial',
    'Financial Services': 'Financial',
    'REITs': 'Real Estate',
    'Real Estate': 'Real Estate',
    'Biotechnology': 'Healthcare',
    'Pharmaceuticals': 'Healthcare',
    'Healthcare': 'Healthcare',
    'Oil & Gas': 'Energy',
    'Energy': 'Energy',
    'Utilities': 'Utilities',
    'Metals & Mining': 'Basic Materials',
    'Chemicals': 'Basic Materials',
    'Basic Materials': 'Basic Materials',
    'Aerospace & Defense': 'Industrials',
    'Industrial Conglomerates': 'Industrials',
    'Machinery': 'Industrials',
    'Airlines': 'Industrials',
    'Construction': 'Industrials',
    'Semiconductors': 'Technology',
    'Software': 'Technology',
    'Hardware': 'Technology',
    'Retail': 'Consumer Cyclical',
    'Consumer Goods': 'Consumer Defensive',
    'Food & Beverage': 'Consumer Defensive',
    'Household Products': 'Consumer Defensive',
    'Telecommunications': 'Communication Services',
    'Entertainment': 'Communication Services',
};

export async function getYahooSectorIndustry(symbol: string): Promise<{ sector: string; industry: string } | null> {
    // Try Finnhub first (more reliable)
    try {
        const token = NEXT_PUBLIC_FINNHUB_API_KEY;
        const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}`;
        const data = await fetchJSON<any>(url, 86400);
        if (data?.finnhubIndustry) {
            const industry = data.finnhubIndustry;
            const sector = FINNHUB_INDUSTRY_TO_SECTOR[industry] || industry;
            return { sector, industry };
        }
    } catch { /* fall through to Yahoo */ }

    // Fallback to Yahoo quoteSummary
    try {
        const { crumb, cookie } = await getYahooCrumb();
        const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile&crumb=${encodeURIComponent(crumb)}`;
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0", Cookie: cookie },
            cache: "force-cache",
            next: { revalidate: 86400 },
        } as any);
        if (!res.ok) return null;
        const data = await res.json();
        const profile = data?.quoteSummary?.result?.[0]?.assetProfile;
        if (!profile) return null;
        return {
            sector: profile.sector || '',
            industry: profile.industry || '',
        };
    } catch (e) {
        console.error('Error fetching Yahoo sector for', symbol, e);
        return null;
    }
}

async function getProfileFromYahoo(symbol: string) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "force-cache",
        next: { revalidate: 86400 },
    } as any);
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    return {
        name: meta.longName || meta.shortName || symbol,
        ticker: meta.symbol || symbol,
        currency: meta.currency || 'USD',
        exchange: meta.exchangeName || meta.fullExchangeName || '',
        logo: undefined,
        marketCapitalization: undefined,
    };
}

export async function getWatchlistData(symbols: string[]) {
    if (!symbols || symbols.length === 0) return [];

    // Fetch in small batches of 4 to avoid bursting rate limit
    const batchSize = 4;
    const results: any[] = [];

    for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);

        const batchResults = await Promise.all(
            batch.map(async (sym) => {
                const [quote, profile] = await Promise.all([
                    getQuote(sym),
                    getCompanyProfile(sym)
                ]);

                return {
                    symbol: sym,
                    price: quote?.c || 0,
                    change: quote?.d || 0,
                    changePercent: quote?.dp || 0,
                    currency: profile?.currency || 'USD',
                    name: profile?.name || sym,
                    logo: profile?.logo,
                    marketCap: profile?.marketCapitalization,
                    peRatio: 0,
                };
            })
        );

        results.push(...batchResults);

        // Small delay between batches
        if (i + batchSize < symbols.length) {
            await new Promise((r) => setTimeout(r, 300));
        }
    }

    return results;
}


export async function getNews(symbols?: string[]): Promise<MarketNewsArticle[]> {
    try {
        const range = getDateRange(5);
        const token = NEXT_PUBLIC_FINNHUB_API_KEY;
        if (!token) {
            throw new Error('FINNHUB API key is not configured');
        }
        const cleanSymbols = (symbols || [])
            .map((s) => s?.trim().toUpperCase())
            .filter((s): s is string => Boolean(s));

        const maxArticles = 6;

        // If we have symbols, try to fetch company news per symbol and round-robin select
        if (cleanSymbols.length > 0) {
            const perSymbolArticles: Record<string, RawNewsArticle[]> = {};

            await Promise.all(
                cleanSymbols.map(async (sym) => {
                    try {
                        const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(sym)}&from=${range.from}&to=${range.to}&token=${token}`;
                        const articles = await fetchJSON<RawNewsArticle[]>(url, 300);
                        perSymbolArticles[sym] = (articles || []).filter(validateArticle);
                    } catch (e) {
                        console.error('Error fetching company news for', sym, e);
                        perSymbolArticles[sym] = [];
                    }
                })
            );

            const collected: MarketNewsArticle[] = [];
            // Round-robin up to 6 picks
            for (let round = 0; round < maxArticles; round++) {
                for (let i = 0; i < cleanSymbols.length; i++) {
                    const sym = cleanSymbols[i];
                    const list = perSymbolArticles[sym] || [];
                    if (list.length === 0) continue;
                    const article = list.shift();
                    if (!article || !validateArticle(article)) continue;
                    collected.push(formatArticle(article, true, sym, round));
                    if (collected.length >= maxArticles) break;
                }
                if (collected.length >= maxArticles) break;
            }

            if (collected.length > 0) {
                // Sort by datetime desc
                collected.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
                return collected.slice(0, maxArticles);
            }
            // If none collected, fall through to general news
        }

        // General market news fallback or when no symbols provided
        const generalUrl = `${FINNHUB_BASE_URL}/news?category=general&token=${token}`;
        const general = await fetchJSON<RawNewsArticle[]>(generalUrl, 300);

        const seen = new Set<string>();
        const unique: RawNewsArticle[] = [];
        for (const art of general || []) {
            if (!validateArticle(art)) continue;
            const key = `${art.id}-${art.url}-${art.headline}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(art);
            if (unique.length >= 20) break; // cap early before final slicing
        }

        const formatted = unique.slice(0, maxArticles).map((a, idx) => formatArticle(a, false, undefined, idx));
        return formatted;
    } catch (err) {
        console.error('getNews error:', err);
        throw new Error('Failed to fetch news');
    }
}

export const searchStocks = cache(async (query?: string): Promise<StockWithWatchlistStatus[]> => {
    try {
        const token = NEXT_PUBLIC_FINNHUB_API_KEY;
        if (!token) {
            // If no token, log and return empty to avoid throwing per requirements
            console.error('Error in stock search:', new Error('FINNHUB API key is not configured'));
            return [];
        }

        const trimmed = typeof query === 'string' ? query.trim() : '';

        let results: FinnhubSearchResult[] = [];

        if (!trimmed) {
            // Fetch top 10 popular symbols' profiles
            const top = POPULAR_STOCK_SYMBOLS.slice(0, 10);
            const profiles = await Promise.all(
                top.map(async (sym) => {
                    try {
                        const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${token}`;
                        // Revalidate every hour
                        const profile = await fetchJSON<any>(url, 3600);
                        return { sym, profile } as { sym: string; profile: any };
                    } catch (e) {
                        console.error('Error fetching profile2 for', sym, e);
                        return { sym, profile: null } as { sym: string; profile: any };
                    }
                })
            );

            results = profiles
                .map(({ sym, profile }) => {
                    const symbol = sym.toUpperCase();
                    const name: string | undefined = profile?.name || profile?.ticker || undefined;
                    const exchange: string | undefined = profile?.exchange || undefined;
                    if (!name) return undefined;
                    const r: FinnhubSearchResult = {
                        symbol,
                        description: name,
                        displaySymbol: symbol,
                        type: 'Common Stock',
                    };
                    // We don't include exchange in FinnhubSearchResult type, so carry via mapping later using profile
                    // To keep pipeline simple, attach exchange via closure map stage
                    // We'll reconstruct exchange when mapping to final type
                    (r as any).__exchange = exchange; // internal only
                    return r;
                })
                .filter((x): x is FinnhubSearchResult => Boolean(x));
        } else {
            const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(trimmed)}&token=${token}`;
            const data = await fetchJSON<FinnhubSearchResponse>(url, 1800);
            results = Array.isArray(data?.result) ? data.result : [];
        }

        const mapped: StockWithWatchlistStatus[] = results
            .map((r) => {
                const upper = (r.symbol || '').toUpperCase();
                const name = r.description || upper;
                const exchangeFromDisplay = (r.displaySymbol as string | undefined) || undefined;
                const exchangeFromProfile = (r as any).__exchange as string | undefined;
                const exchange = exchangeFromDisplay || exchangeFromProfile || 'US';
                const type = r.type || 'Stock';
                const item: StockWithWatchlistStatus = {
                    symbol: upper,
                    name,
                    exchange,
                    type,
                    isInWatchlist: false,
                };
                return item;
            })
            .slice(0, 15);

        return mapped;
    } catch (err) {
        console.error('Error in stock search:', err);
        return [];
    }
});
