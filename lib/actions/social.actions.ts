'use server';

import { getHistoricalPrices, getSMA } from '@/lib/actions/finnhub.actions';

/* ── Types ───────────────────────────────────────────────────────────── */

export type SocialPost = {
    id: string;
    title: string;
    url: string;
    source: 'reddit' | 'hackernews' | 'news' | 'polymarket';
    author: string;
    timestamp: number;
    score: number;
    comments: number;
    subreddit?: string;
};

export type PolymarketEvent = {
    id: string;
    title: string;
    url: string;
    outcomes: { name: string; price: number }[];
    outcomesRemaining: number;
    priceMovement: string | null;
    volume24hr: number;
    liquidity: number;
    relevance: number;
    endDate: string | null;
};

export type SocialSentimentSummary = {
    totalPosts: number;
    totalEngagement: number;
    postsThisWeek: number;
    postsLastWeek: number;
    trending: boolean;
    bySource: Record<string, number>;
};

export type ChartDataPoint = {
    date: string;
    price: number;
    sma20: number | null;
    sma50: number | null;
};

export type HoldingTrend = {
    symbol: string;
    prices: number[];
    smaShort: number | null;
    smaLong: number | null;
    trend: 'up' | 'down' | 'mixed';
};

/* ── Search query helpers ─────────────────────────────────────────────── */

/**
 * Build search queries that disambiguate short tickers (e.g. "PL" vs "PLTR").
 * Uses "$SYMBOL" (stock convention on Reddit/finance forums) and company name.
 */
function buildSearchQueries(symbol: string, companyName?: string): string[] {
    const queries: string[] = [];
    // "$PL" is the stock-ticker convention — much more precise than bare "PL"
    queries.push(`$${symbol}`);
    // Also search "<symbol> stock" for broader coverage
    queries.push(`${symbol} stock`);
    // Add company name if available and distinct from symbol
    if (companyName) {
        const name = companyName.replace(/,?\s*(Inc\.?|Corp\.?|Ltd\.?|LLC|Co\.?|Group|Holdings|plc)$/i, '').trim();
        if (name.length > 2 && name.toLowerCase() !== symbol.toLowerCase()) {
            queries.push(name);
        }
    }
    return queries;
}

/* ── Reddit ──────────────────────────────────────────────────────────── */

async function fetchReddit(query: string): Promise<SocialPost[]> {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=month&limit=25`;
    const res = await fetch(url, {
        headers: { 'User-Agent': 'OpenStock/1.0' },
        cache: 'force-cache',
        next: { revalidate: 900 },
    } as any);

    if (!res.ok) return [];
    const data = await res.json();

    return (data?.data?.children ?? []).map((c: any) => {
        const d = c.data;
        return {
            id: d.id,
            title: d.title,
            url: `https://reddit.com${d.permalink}`,
            source: 'reddit' as const,
            author: d.author,
            timestamp: d.created_utc * 1000,
            score: d.score ?? 0,
            comments: d.num_comments ?? 0,
            subreddit: d.subreddit,
        };
    });
}

export async function getRedditPosts(symbol: string, companyName?: string): Promise<SocialPost[]> {
    try {
        const queries = buildSearchQueries(symbol, companyName);
        const results = await Promise.allSettled(queries.map(q => fetchReddit(q)));
        const seen = new Set<string>();
        const posts: SocialPost[] = [];
        for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            for (const p of r.value) {
                if (!seen.has(p.id)) { seen.add(p.id); posts.push(p); }
            }
        }
        return posts.sort((a, b) => b.timestamp - a.timestamp).slice(0, 25);
    } catch {
        return [];
    }
}

/* ── Hacker News ─────────────────────────────────────────────────────── */

async function fetchHN(query: string): Promise<SocialPost[]> {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=25`;
    const res = await fetch(url, {
        cache: 'force-cache',
        next: { revalidate: 900 },
    } as any);

    if (!res.ok) return [];
    const data = await res.json();

    return (data.hits ?? []).map((h: any) => ({
        id: h.objectID,
        title: h.title,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        source: 'hackernews' as const,
        author: h.author ?? '',
        timestamp: new Date(h.created_at).getTime(),
        score: h.points ?? 0,
        comments: h.num_comments ?? 0,
    }));
}

export async function getHNPosts(symbol: string, companyName?: string): Promise<SocialPost[]> {
    try {
        const queries = buildSearchQueries(symbol, companyName);
        const results = await Promise.allSettled(queries.map(q => fetchHN(q)));
        const seen = new Set<string>();
        const posts: SocialPost[] = [];
        for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            for (const p of r.value) {
                if (!seen.has(p.id)) { seen.add(p.id); posts.push(p); }
            }
        }
        return posts.sort((a, b) => b.timestamp - a.timestamp).slice(0, 25);
    } catch {
        return [];
    }
}

/* ── Finnhub News ────────────────────────────────────────────────────── */

export async function getFinnhubNews(symbol: string): Promise<SocialPost[]> {
    try {
        const key = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${key}`;

        const res = await fetch(url, {
            cache: 'force-cache',
            next: { revalidate: 300 },
        } as any);

        if (!res.ok) return [];
        const data = await res.json();

        return (data ?? []).slice(0, 25).map((n: any) => ({
            id: String(n.id),
            title: n.headline,
            url: n.url,
            source: 'news' as const,
            author: n.source ?? '',
            timestamp: n.datetime * 1000,
            score: 0,
            comments: 0,
        }));
    } catch {
        return [];
    }
}

/* ── Polymarket (Gamma API — public, no auth) ────────────────────────── */

const GAMMA_SEARCH_URL = 'https://gamma-api.polymarket.com/public-search';

async function polymarketSearch(query: string, page: number = 1): Promise<any> {
    try {
        const url = `${GAMMA_SEARCH_URL}?q=${encodeURIComponent(query)}&page=${page}`;
        const res = await fetch(url, {
            cache: 'force-cache',
            next: { revalidate: 900 },
        } as any);
        if (!res.ok) return { events: [] };
        return await res.json();
    } catch {
        return { events: [] };
    }
}

function parseOutcomePrices(market: any): { name: string; price: number }[] {
    const outcomes = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : (market.outcomes ?? []);
    const prices = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : (market.outcomePrices ?? []);
    const result: { name: string; price: number }[] = [];
    for (let i = 0; i < prices.length; i++) {
        const p = parseFloat(prices[i]);
        if (!isNaN(p)) result.push({ name: outcomes[i] ?? `Outcome ${i + 1}`, price: p });
    }
    return result;
}

function formatPriceMovement(market: any): string | null {
    const changes: [number, number, string][] = [
        [Math.abs(market.oneDayPriceChange ?? 0), market.oneDayPriceChange ?? 0, 'today'],
        [Math.abs(market.oneWeekPriceChange ?? 0), market.oneWeekPriceChange ?? 0, 'this week'],
        [Math.abs(market.oneMonthPriceChange ?? 0), market.oneMonthPriceChange ?? 0, 'this month'],
    ];
    changes.sort((a, b) => b[0] - a[0]);
    const [absChange, raw, period] = changes[0];
    if (absChange < 0.01) return null;
    return `${raw > 0 ? 'up' : 'down'} ${(absChange * 100).toFixed(1)}% ${period}`;
}

export async function getPolymarketEvents(symbol: string, companyName?: string): Promise<PolymarketEvent[]> {
    // Two-pass: search by symbol and company name for broader coverage
    const queries = [symbol];
    if (companyName && companyName.toLowerCase() !== symbol.toLowerCase()) {
        // Use first meaningful word of company name (e.g. "Apple" from "Apple Inc.")
        const firstWord = companyName.split(/[\s,]+/)[0];
        if (firstWord.length > 2) queries.push(firstWord);
    }

    const allEvents = new Map<string, any>();

    const searchResults = await Promise.allSettled(
        queries.flatMap(q => [1, 2].map(page => polymarketSearch(q, page)))
    );

    for (const r of searchResults) {
        if (r.status !== 'fulfilled') continue;
        for (const event of r.value.events ?? []) {
            if (!event.id || event.closed || !event.active) continue;
            if (!allEvents.has(event.id)) allEvents.set(event.id, event);
        }
    }

    const results: PolymarketEvent[] = [];

    for (const event of allEvents.values()) {
        const markets = (event.markets ?? []).filter(
            (m: any) => m.active && !m.closed && parseFloat(m.liquidity ?? '0') > 0
        );
        if (markets.length === 0) continue;

        markets.sort((a: any, b: any) => parseFloat(b.volume ?? '0') - parseFloat(a.volume ?? '0'));
        const top = markets[0];

        let outcomes = parseOutcomePrices(top);

        // For multi-market events with binary (Yes/No) sub-markets, synthesize outcomes
        const isBinary = outcomes.length === 2 &&
            new Set(outcomes.map(o => o.name.toLowerCase())).has('yes') &&
            new Set(outcomes.map(o => o.name.toLowerCase())).has('no');

        if (isBinary && markets.length > 1) {
            const synth: { name: string; price: number }[] = [];
            for (const m of markets) {
                const pairs = parseOutcomePrices(m);
                const yesPrice = pairs.find(p => p.name.toLowerCase() === 'yes')?.price;
                if (yesPrice && yesPrice > 0.005) {
                    // Shorten question to extract subject
                    const q = (m.question ?? '').replace(/\?$/, '');
                    const match = q.match(/^Will\s+(.+?)\s+(?:win|be|make|reach|have|lose|qualify|advance)\b/i);
                    synth.push({ name: match?.[1] ?? q.slice(0, 40), price: yesPrice });
                }
            }
            if (synth.length > 0) {
                synth.sort((a, b) => b.price - a.price);
                outcomes = synth;
            }
        }

        const slug = event.slug ?? event.id;
        const volume24hr = parseFloat(event.volume24hr ?? top.volume24hr ?? '0') || 0;
        const liquidity = parseFloat(event.liquidity ?? top.liquidity ?? '0') || 0;

        // Relevance scoring (adapted from last30days-skill)
        const titleLower = (event.title ?? '').toLowerCase();
        const symLower = symbol.toLowerCase();
        const textScore = titleLower.includes(symLower) ? 1.0 :
            (companyName && titleLower.includes(companyName.split(/[\s,]+/)[0].toLowerCase())) ? 0.85 : 0.3;
        const volScore = Math.min(1.0, Math.log1p(parseFloat(event.volume1mo ?? '0') || volume24hr) / 16);
        const liqScore = Math.min(1.0, Math.log1p(liquidity) / 14);
        const dayChange = Math.abs(top.oneDayPriceChange ?? 0) * 3;
        const weekChange = Math.abs(top.oneWeekPriceChange ?? 0) * 2;
        const monthChange = Math.abs(top.oneMonthPriceChange ?? 0);
        const moveScore = Math.min(1.0, Math.max(dayChange, weekChange, monthChange) * 5);

        const relevance = 0.30 * textScore + 0.30 * volScore + 0.15 * liqScore + 0.15 * moveScore + 0.10 * (event.competitive ?? 0);

        results.push({
            id: event.id,
            title: event.title,
            url: `https://polymarket.com/event/${slug}`,
            outcomes: outcomes.slice(0, 3),
            outcomesRemaining: Math.max(0, outcomes.length - 3),
            priceMovement: formatPriceMovement(top),
            volume24hr,
            liquidity,
            relevance: Math.round(relevance * 100) / 100,
            endDate: top.endDate?.slice(0, 10) ?? null,
        });
    }

    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, 10);
}

/* ── Merged Social Data ──────────────────────────────────────────────── */

export async function getSocialData(symbol: string, companyName?: string): Promise<{
    posts: SocialPost[];
    summary: SocialSentimentSummary;
}> {
    const results = await Promise.allSettled([
        getRedditPosts(symbol, companyName),
        getHNPosts(symbol, companyName),
        getFinnhubNews(symbol),
    ]);

    const posts: SocialPost[] = results
        .filter((r): r is PromiseFulfilledResult<SocialPost[]> => r.status === 'fulfilled')
        .flatMap(r => r.value)
        .sort((a, b) => b.timestamp - a.timestamp);

    const now = Date.now();
    const oneWeek = 7 * 86400000;
    const postsThisWeek = posts.filter(p => now - p.timestamp < oneWeek).length;
    const postsLastWeek = posts.filter(p => now - p.timestamp >= oneWeek && now - p.timestamp < 2 * oneWeek).length;

    const bySource: Record<string, number> = {};
    for (const p of posts) {
        bySource[p.source] = (bySource[p.source] ?? 0) + 1;
    }

    return {
        posts,
        summary: {
            totalPosts: posts.length,
            totalEngagement: posts.reduce((s, p) => s + p.score + p.comments, 0),
            postsThisWeek,
            postsLastWeek,
            trending: postsThisWeek > postsLastWeek * 1.5,
            bySource,
        },
    };
}

/* ── Historical + SMA chart data ─────────────────────────────────────── */

export async function getHistoricalWithSMA(
    symbol: string,
    range: '1M' | '3M' | '6M' | '1Y' = '3M'
): Promise<ChartDataPoint[]> {
    const rangeMap: Record<string, number> = {
        '1M': 30, '3M': 90, '6M': 180, '1Y': 365,
    };
    const days = rangeMap[range] ?? 90;
    // Fetch extra data for SMA computation
    const fromDate = new Date(Date.now() - (days + 60) * 86400000).toISOString().split('T')[0];

    const hist = await getHistoricalPrices(symbol, fromDate);
    if (!hist || hist.prices.length < 20) return [];

    const { dates, prices } = hist;

    const calcSMA = (idx: number, period: number): number | null => {
        if (idx < period - 1) return null;
        let sum = 0;
        for (let i = idx - period + 1; i <= idx; i++) sum += prices[i];
        return sum / period;
    };

    // Only return the last `days` worth of data
    const startIdx = Math.max(0, prices.length - days);
    const result: ChartDataPoint[] = [];

    for (let i = startIdx; i < prices.length; i++) {
        result.push({
            date: dates[i],
            price: prices[i],
            sma20: calcSMA(i, 20),
            sma50: calcSMA(i, 50),
        });
    }

    return result;
}

/* ── Batch Trends (for overview grid sparklines) ─────────────────────── */

export async function getBatchTrends(symbols: string[]): Promise<HoldingTrend[]> {
    const fromDate = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];

    const results = await Promise.allSettled(
        symbols.map(async (symbol): Promise<HoldingTrend> => {
            const [hist, sma] = await Promise.allSettled([
                getHistoricalPrices(symbol, fromDate),
                getSMA(symbol),
            ]);

            const histData = hist.status === 'fulfilled' ? hist.value : null;
            const smaData = sma.status === 'fulfilled' ? sma.value : null;

            const prices = histData?.prices?.slice(-30) ?? [];
            const smaShort = smaData?.smaShort ?? null;
            const smaLong = smaData?.smaLong ?? null;
            const price = prices.length > 0 ? prices[prices.length - 1] : null;

            let trend: 'up' | 'down' | 'mixed' = 'mixed';
            if (price && smaShort && smaLong) {
                if (price > smaShort && smaShort > smaLong) trend = 'up';
                else if (price < smaShort && smaShort < smaLong) trend = 'down';
            }

            return { symbol, prices, smaShort, smaLong, trend };
        })
    );

    return results
        .filter((r): r is PromiseFulfilledResult<HoldingTrend> => r.status === 'fulfilled')
        .map(r => r.value);
}
