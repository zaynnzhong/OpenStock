"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    AreaChart,
    Area,
    ComposedChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, ExternalLink, MessageSquare, ChevronDown, ChevronUp, BarChart3, Sparkles, Loader2, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPortfolioSummary } from "@/lib/actions/portfolio.actions";
import {
    getBatchTrends,
    getHistoricalWithSMA,
    getSocialData,
    getPolymarketEvents,
    type HoldingTrend,
    type ChartDataPoint,
    type SocialPost,
    type SocialSentimentSummary,
    type PolymarketEvent,
} from "@/lib/actions/social.actions";
import {
    analyzeDirection,
    analyzeEntry,
    analyzeOptions,
    analyzePosition,
    type AnalysisResult,
} from "@/lib/actions/gemini.actions";

/* ── Types ───────────────────────────────────────────────────────────── */

type Position = {
    symbol: string;
    company: string;
    currentPrice: number;
    marketValue: number;
    totalReturnPercent: number;
};

type ChartRange = '1M' | '3M' | '6M' | '1Y';
const RANGES: ChartRange[] = ['1M', '3M', '6M', '1Y'];

type SourceFilter = 'all' | 'reddit' | 'hackernews' | 'news';

type AIAnalysisType = 'direction' | 'entry' | 'options' | 'position';

/* ── Sparkline (tiny 30-day chart) ───────────────────────────────────── */

function Sparkline({ prices, trend }: { prices: number[]; trend: string }) {
    if (prices.length < 2) return <div className="h-[50px] w-full" />;

    const color = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#eab308';
    const data = prices.map((p, i) => ({ i, p }));

    return (
        <ResponsiveContainer width="100%" height={50}>
            <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                <defs>
                    <linearGradient id={`spark-${trend}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <Area
                    type="monotone"
                    dataKey="p"
                    stroke={color}
                    fill={`url(#spark-${trend})`}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}

/* ── Trend Badge ─────────────────────────────────────────────────────── */

function TrendBadge({ trend }: { trend: 'up' | 'down' | 'mixed' }) {
    const config = {
        up: { label: 'Uptrend', icon: TrendingUp, cls: 'bg-green-500/10 text-green-400 border-green-500/20' },
        down: { label: 'Downtrend', icon: TrendingDown, cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
        mixed: { label: 'Mixed', icon: Minus, cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    };
    const { label, icon: Icon, cls } = config[trend];

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${cls}`}>
            <Icon className="h-3 w-3" />
            {label}
        </span>
    );
}

/* ── Social Post Row ─────────────────────────────────────────────────── */

function PostRow({ post }: { post: SocialPost }) {
    const sourceBadge: Record<string, string> = {
        reddit: 'bg-orange-500/15 text-orange-400',
        hackernews: 'bg-amber-500/15 text-amber-400',
        news: 'bg-blue-500/15 text-blue-400',
    };
    const sourceLabel: Record<string, string> = {
        reddit: 'Reddit',
        hackernews: 'HN',
        news: 'News',
    };
    const age = Date.now() - post.timestamp;
    const days = Math.floor(age / 86400000);
    const hours = Math.floor(age / 3600000);
    const timeAgo = days > 0 ? `${days}d ago` : `${hours}h ago`;

    return (
        <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/[0.03] transition-colors group"
        >
            <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 group-hover:text-white transition-colors line-clamp-2">
                    {post.title}
                </p>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceBadge[post.source]}`}>
                        {sourceLabel[post.source]}
                    </span>
                    {post.subreddit && <span>r/{post.subreddit}</span>}
                    <span>{timeAgo}</span>
                    {post.score > 0 && <span>{post.score} pts</span>}
                    {post.comments > 0 && (
                        <span className="flex items-center gap-0.5">
                            <MessageSquare className="h-3 w-3" />
                            {post.comments}
                        </span>
                    )}
                </div>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-gray-600 group-hover:text-gray-400 mt-1 flex-shrink-0" />
        </a>
    );
}

/* ── Polymarket Event Row ─────────────────────────────────────────────── */

function PolymarketRow({ event }: { event: PolymarketEvent }) {
    const fmtVol = (v: number) => {
        if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
        if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
        return `$${v.toFixed(0)}`;
    };

    return (
        <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 rounded-lg hover:bg-white/[0.03] transition-colors group"
        >
            <p className="text-sm text-gray-200 group-hover:text-white transition-colors line-clamp-2">
                {event.title}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
                {event.outcomes.map((o, i) => (
                    <span
                        key={i}
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                            o.price >= 0.5
                                ? 'bg-green-500/15 text-green-400'
                                : 'bg-white/5 text-gray-400'
                        }`}
                    >
                        {o.name} {(o.price * 100).toFixed(0)}%
                    </span>
                ))}
                {event.outcomesRemaining > 0 && (
                    <span className="text-[10px] text-gray-600">+{event.outcomesRemaining} more</span>
                )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/15 text-violet-400">
                    Polymarket
                </span>
                <span>Vol {fmtVol(event.volume24hr)}/24h</span>
                <span>Liq {fmtVol(event.liquidity)}</span>
                {event.priceMovement && (
                    <span className={event.priceMovement.startsWith('up') ? 'text-green-400' : 'text-red-400'}>
                        {event.priceMovement}
                    </span>
                )}
                {event.endDate && <span>Ends {event.endDate}</span>}
            </div>
        </a>
    );
}

/* ── Markdown Renderer ───────────────────────────────────────────────── */

export function AnalysisMarkdown({ content }: { content: string }) {
    return (
        <div className="prose prose-invert prose-sm max-w-none
            prose-headings:text-gray-100 prose-headings:font-semibold
            prose-h2:mt-6 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-teal-500/20
            prose-h3:mt-4 prose-h3:mb-2 prose-h3:text-teal-300
            prose-h4:mt-3 prose-h4:mb-1
            prose-p:text-gray-300 prose-p:leading-relaxed
            prose-strong:text-white
            prose-li:text-gray-300 prose-li:marker:text-teal-400
            prose-table:text-xs
            prose-thead:bg-white/5
            prose-th:text-gray-400 prose-th:font-medium prose-th:px-3 prose-th:py-2 prose-th:border-white/10
            prose-td:text-gray-300 prose-td:px-3 prose-td:py-1.5 prose-td:border-white/10
            prose-tr:border-white/5
            prose-blockquote:border-teal-500/40 prose-blockquote:text-gray-400 prose-blockquote:not-italic
            prose-code:text-teal-400 prose-code:bg-white/5 prose-code:px-1.5 prose-code:rounded prose-code:text-xs
            prose-a:text-teal-400 prose-a:no-underline hover:prose-a:underline
        ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
    );
}

/* ── AI Analysis Panel (per-holding) ─────────────────────────────────── */

function AIAnalysisPanel({ symbol, userId }: { symbol: string; userId: string }) {
    const [activeAnalysis, setActiveAnalysis] = useState<AIAnalysisType | null>(null);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [loading, setLoading] = useState(false);

    const runAnalysis = useCallback(async (type: AIAnalysisType) => {
        setActiveAnalysis(type);
        setResult(null);
        setLoading(true);
        try {
            let res: AnalysisResult;
            switch (type) {
                case 'direction':
                    res = await analyzeDirection(symbol);
                    break;
                case 'entry':
                    res = await analyzeEntry(symbol);
                    break;
                case 'options':
                    res = await analyzeOptions(symbol, userId);
                    break;
                case 'position':
                    res = await analyzePosition(symbol, userId);
                    break;
            }
            setResult(res);
        } catch (e: any) {
            setResult({ content: '', model: '', timestamp: Date.now(), error: e?.message || 'Analysis failed' });
        } finally {
            setLoading(false);
        }
    }, [symbol, userId]);

    const buttons: { type: AIAnalysisType; emoji: string; label: string }[] = [
        { type: 'direction', emoji: '\u{1F4CA}', label: '\u591A\u7A7A\u65B9\u5411' },
        { type: 'entry', emoji: '\u{1F3AF}', label: 'PO3 \u8FDB\u573A' },
        { type: 'options', emoji: '\u{1F4C8}', label: '\u671F\u6743\u5206\u6790' },
        { type: 'position', emoji: '\u{1F4BC}', label: '\u6301\u4ED3\u7BA1\u7406' },
    ];

    const analysisLabels: Record<AIAnalysisType, string> = {
        direction: 'Direction Analysis',
        entry: 'Entry Analysis',
        options: 'Options Analysis',
        position: 'Position Analysis',
    };

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {buttons.map(b => (
                    <button
                        key={b.type}
                        onClick={() => runAnalysis(b.type)}
                        disabled={loading}
                        className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                            activeAnalysis === b.type && loading
                                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                : activeAnalysis === b.type && result
                                ? 'bg-teal-500/15 text-teal-300 border border-teal-500/20'
                                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white'
                        } disabled:opacity-50`}
                    >
                        {b.emoji} {b.label}
                    </button>
                ))}
            </div>

            {loading && (
                <Card>
                    <CardContent className="py-6">
                        <div className="space-y-3 animate-pulse">
                            <div className="flex items-center gap-2 mb-2">
                                <Loader2 className="h-4 w-4 animate-spin text-teal-400" />
                                <span className="text-xs text-gray-500">Analyzing {symbol} with Gemini...</span>
                            </div>
                            <div className="h-2.5 bg-white/5 rounded w-3/4" />
                            <div className="h-2.5 bg-white/5 rounded w-full" />
                            <div className="h-2.5 bg-white/5 rounded w-5/6" />
                            <div className="h-2.5 bg-white/5 rounded w-2/3" />
                        </div>
                    </CardContent>
                </Card>
            )}

            {result && !loading && (
                <Card className={result.error ? 'border-red-500/20 bg-red-500/5' : ''}>
                    <CardContent className="pt-5">
                        {result.error ? (
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-red-400">{result.error}</p>
                                <button
                                    onClick={() => activeAnalysis && runAnalysis(activeAnalysis)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                                        bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                                >
                                    <RefreshCw className="h-3 w-3" /> Retry
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-2 mb-3">
                                    <Badge className="bg-teal-500/15 text-teal-400 border-teal-500/20">
                                        <Sparkles className="h-3 w-3 mr-1" />
                                        {activeAnalysis ? analysisLabels[activeAnalysis] : 'Analysis'}
                                    </Badge>
                                </div>
                                <div className="max-h-[500px] overflow-y-auto scrollbar-thin pr-1">
                                    <AnalysisMarkdown content={result.content} />
                                </div>
                                <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-600">
                                    <span>Model: {result.model}</span>
                                    <span>{new Date(result.timestamp).toLocaleTimeString()}</span>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {!loading && !result && (
                <p className="text-xs text-gray-600 text-center py-4">
                    Select an analysis type above to get AI-powered insights for {symbol}.
                </p>
            )}
        </div>
    );
}

/* ── Detail Panel ────────────────────────────────────────────────────── */

function DetailPanel({ symbol, companyName, userId, onClose }: { symbol: string; companyName?: string; userId: string; onClose: () => void }) {
    const [range, setRange] = useState<ChartRange>('3M');
    const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
    const [socialData, setSocialData] = useState<{ posts: SocialPost[]; summary: SocialSentimentSummary } | null>(null);
    const [polymarketEvents, setPolymarketEvents] = useState<PolymarketEvent[]>([]);
    const [polyLoading, setPolyLoading] = useState(true);
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
    const [chartLoading, setChartLoading] = useState(true);
    const [socialLoading, setSocialLoading] = useState(true);
    const [detailTab, setDetailTab] = useState<'social' | 'predictions' | 'ai'>('social');

    useEffect(() => {
        let cancelled = false;
        setChartLoading(true);
        getHistoricalWithSMA(symbol, range).then(data => {
            if (!cancelled) { setChartData(data); setChartLoading(false); }
        }).catch(() => { if (!cancelled) setChartLoading(false); });
        return () => { cancelled = true; };
    }, [symbol, range]);

    useEffect(() => {
        let cancelled = false;
        setSocialLoading(true);
        setPolyLoading(true);
        getSocialData(symbol, companyName).then(data => {
            if (!cancelled) { setSocialData(data); setSocialLoading(false); }
        }).catch(() => { if (!cancelled) setSocialLoading(false); });
        getPolymarketEvents(symbol, companyName).then(events => {
            if (!cancelled) { setPolymarketEvents(events); setPolyLoading(false); }
        }).catch(() => { if (!cancelled) setPolyLoading(false); });
        return () => { cancelled = true; };
    }, [symbol, companyName]);

    const filteredPosts = useMemo(() => {
        if (!socialData) return [];
        if (sourceFilter === 'all') return socialData.posts;
        return socialData.posts.filter(p => p.source === sourceFilter);
    }, [socialData, sourceFilter]);

    const latestPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null;

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const formatPrice = (v: number) => `$${v.toFixed(2)}`;

    const sourceTabs: { key: SourceFilter; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'reddit', label: 'Reddit' },
        { key: 'hackernews', label: 'HN' },
        { key: 'news', label: 'News' },
    ];

    return (
        <div className="mt-4 bg-black/30 border border-white/10 rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{symbol} Detail</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
                    <ChevronUp className="h-4 w-4" /> Collapse
                </button>
            </div>

            {/* Price Chart */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-400">Price & Moving Averages</span>
                    <div className="flex gap-1">
                        {RANGES.map(r => (
                            <button
                                key={r}
                                onClick={() => setRange(r)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                    range === r
                                        ? 'bg-white/15 text-white'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                </div>

                {chartLoading ? (
                    <div className="h-[280px] flex items-center justify-center text-gray-500 text-sm">
                        Loading chart...
                    </div>
                ) : chartData.length === 0 ? (
                    <div className="h-[280px] flex items-center justify-center text-gray-500 text-sm">
                        No chart data available.
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={280}>
                        <ComposedChart data={chartData}>
                            <defs>
                                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis
                                dataKey="date"
                                tickFormatter={formatDate}
                                stroke="#6b7280"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                tickFormatter={formatPrice}
                                stroke="#6b7280"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                width={65}
                                domain={['auto', 'auto']}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1f1f1f',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                }}
                                labelFormatter={(label: any) => formatDate(String(label))}
                                formatter={(value: any, name: any) => {
                                    const labels: Record<string, string> = {
                                        price: 'Price',
                                        sma20: 'SMA 20',
                                        sma50: 'SMA 50',
                                    };
                                    return [formatPrice(Number(value)), labels[String(name)] || String(name)];
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="price"
                                stroke="#14b8a6"
                                fill="url(#priceGradient)"
                                strokeWidth={2}
                                dot={false}
                            />
                            <Line
                                type="monotone"
                                dataKey="sma20"
                                stroke="#f97316"
                                strokeWidth={1.5}
                                strokeDasharray="4 3"
                                dot={false}
                                connectNulls
                            />
                            <Line
                                type="monotone"
                                dataKey="sma50"
                                stroke="#a855f7"
                                strokeWidth={1.5}
                                strokeDasharray="4 3"
                                dot={false}
                                connectNulls
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* SMA Stats Bar */}
            {latestPoint && (
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400">Price</p>
                        <p className="text-sm font-medium text-white">{formatPrice(latestPoint.price)}</p>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400">SMA 20</p>
                        <p className="text-sm font-medium text-orange-400">
                            {latestPoint.sma20 ? formatPrice(latestPoint.sma20) : '\u2014'}
                        </p>
                        {latestPoint.sma20 && (
                            <p className={`text-[10px] ${latestPoint.price >= latestPoint.sma20 ? 'text-green-400' : 'text-red-400'}`}>
                                {((latestPoint.price / latestPoint.sma20 - 1) * 100).toFixed(1)}%
                            </p>
                        )}
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400">SMA 50</p>
                        <p className="text-sm font-medium text-purple-400">
                            {latestPoint.sma50 ? formatPrice(latestPoint.sma50) : '\u2014'}
                        </p>
                        {latestPoint.sma50 && (
                            <p className={`text-[10px] ${latestPoint.price >= latestPoint.sma50 ? 'text-green-400' : 'text-red-400'}`}>
                                {((latestPoint.price / latestPoint.sma50 - 1) * 100).toFixed(1)}%
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Detail Tabs: Social & News / Prediction Markets / AI Analysis */}
            <div>
                <div className="flex items-center gap-4 mb-3 border-b border-white/10 pb-2">
                    <button
                        onClick={() => setDetailTab('social')}
                        className={`flex items-center gap-1.5 text-sm font-medium pb-1 border-b-2 transition-colors ${
                            detailTab === 'social'
                                ? 'border-teal-400 text-white'
                                : 'border-transparent text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Social & News
                        {socialData && <span className="text-[10px] text-gray-500 ml-1">({socialData.summary.totalPosts})</span>}
                    </button>
                    <button
                        onClick={() => setDetailTab('predictions')}
                        className={`flex items-center gap-1.5 text-sm font-medium pb-1 border-b-2 transition-colors ${
                            detailTab === 'predictions'
                                ? 'border-violet-400 text-white'
                                : 'border-transparent text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        <BarChart3 className="h-3.5 w-3.5" />
                        Predictions
                        {!polyLoading && <span className="text-[10px] text-gray-500 ml-1">({polymarketEvents.length})</span>}
                    </button>
                    <button
                        onClick={() => setDetailTab('ai')}
                        className={`flex items-center gap-1.5 text-sm font-medium pb-1 border-b-2 transition-colors ${
                            detailTab === 'ai'
                                ? 'border-amber-400 text-white'
                                : 'border-transparent text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        <Sparkles className="h-3.5 w-3.5" />
                        AI Analysis
                    </button>
                </div>

                {detailTab === 'social' && (
                    <>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs text-gray-500">Filter by source</span>
                            <div className="flex gap-1">
                                {sourceTabs.map(t => (
                                    <button
                                        key={t.key}
                                        onClick={() => setSourceFilter(t.key)}
                                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                                            sourceFilter === t.key
                                                ? 'bg-white/15 text-white'
                                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Sentiment Summary */}
                        {socialData && !socialLoading && (
                            <div className="grid grid-cols-4 gap-2 mb-3">
                                <div className="bg-white/5 rounded-lg p-2 text-center">
                                    <p className="text-[10px] text-gray-500 uppercase">Posts</p>
                                    <p className="text-sm font-medium text-white">{socialData.summary.totalPosts}</p>
                                </div>
                                <div className="bg-white/5 rounded-lg p-2 text-center">
                                    <p className="text-[10px] text-gray-500 uppercase">Engagement</p>
                                    <p className="text-sm font-medium text-white">{socialData.summary.totalEngagement.toLocaleString()}</p>
                                </div>
                                <div className="bg-white/5 rounded-lg p-2 text-center">
                                    <p className="text-[10px] text-gray-500 uppercase">This Week</p>
                                    <p className="text-sm font-medium text-white">{socialData.summary.postsThisWeek}</p>
                                </div>
                                <div className="bg-white/5 rounded-lg p-2 text-center">
                                    <p className="text-[10px] text-gray-500 uppercase">Trending</p>
                                    <p className={`text-sm font-medium ${socialData.summary.trending ? 'text-green-400' : 'text-gray-400'}`}>
                                        {socialData.summary.trending ? 'Yes' : 'No'}
                                    </p>
                                </div>
                            </div>
                        )}

                        {socialLoading ? (
                            <div className="h-[120px] flex items-center justify-center text-gray-500 text-sm">
                                Loading social data...
                            </div>
                        ) : filteredPosts.length === 0 ? (
                            <div className="h-[80px] flex items-center justify-center text-gray-500 text-sm">
                                No posts found.
                            </div>
                        ) : (
                            <div className="max-h-[320px] overflow-y-auto space-y-0.5 scrollbar-thin">
                                {filteredPosts.slice(0, 30).map(post => (
                                    <PostRow key={post.id} post={post} />
                                ))}
                            </div>
                        )}
                    </>
                )}

                {detailTab === 'predictions' && (
                    <>
                        {polyLoading ? (
                            <div className="h-[120px] flex items-center justify-center text-gray-500 text-sm">
                                Searching Polymarket...
                            </div>
                        ) : polymarketEvents.length === 0 ? (
                            <div className="h-[80px] flex items-center justify-center text-gray-500 text-sm">
                                No prediction markets found for {symbol}.
                            </div>
                        ) : (
                            <div className="max-h-[400px] overflow-y-auto space-y-0.5 scrollbar-thin">
                                {polymarketEvents.map(event => (
                                    <PolymarketRow key={event.id} event={event} />
                                ))}
                            </div>
                        )}
                    </>
                )}

                {detailTab === 'ai' && (
                    <AIAnalysisPanel symbol={symbol} userId={userId} />
                )}
            </div>
        </div>
    );
}

/* ── Main Component ──────────────────────────────────────────────────── */

export default function PortfolioTrendDashboard({ userId }: { userId: string }) {
    const [positions, setPositions] = useState<Position[]>([]);
    const [trends, setTrends] = useState<Map<string, HoldingTrend>>(new Map());
    const [loading, setLoading] = useState(true);
    const [trendsLoading, setTrendsLoading] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);

    // Load portfolio positions
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getPortfolioSummary(userId).then(summary => {
            if (cancelled) return;
            if (!summary || summary.positions.length === 0) {
                setPositions([]);
                setLoading(false);
                return;
            }
            const pos = summary.positions.map(p => ({
                symbol: p.symbol,
                company: p.company,
                currentPrice: p.currentPrice,
                marketValue: p.marketValue,
                totalReturnPercent: p.totalReturnPercent,
            }));
            setPositions(pos);
            setLoading(false);

            // Fetch trends
            setTrendsLoading(true);
            const symbols = pos.map(p => p.symbol);
            getBatchTrends(symbols).then(trendResults => {
                if (cancelled) return;
                const map = new Map<string, HoldingTrend>();
                for (const t of trendResults) map.set(t.symbol, t);
                setTrends(map);
                setTrendsLoading(false);
            }).catch(() => {
                if (!cancelled) setTrendsLoading(false);
            });
        }).catch(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [userId]);

    // Sort: strongest trend signal first, then by market value
    const sortedPositions = useMemo(() => {
        return [...positions].sort((a, b) => {
            const tA = trends.get(a.symbol)?.trend;
            const tB = trends.get(b.symbol)?.trend;
            const trendOrder = { up: 0, down: 1, mixed: 2 };
            const oA = tA ? trendOrder[tA] : 3;
            const oB = tB ? trendOrder[tB] : 3;
            if (oA !== oB) return oA - oB;
            return b.marketValue - a.marketValue;
        });
    }, [positions, trends]);

    const toggleExpand = useCallback((symbol: string) => {
        setExpanded(prev => prev === symbol ? null : symbol);
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 text-gray-500">
                <div className="text-center space-y-2">
                    <div className="animate-spin h-6 w-6 border-2 border-teal-400 border-t-transparent rounded-full mx-auto" />
                    <p className="text-sm">Loading portfolio holdings...</p>
                </div>
            </div>
        );
    }

    if (positions.length === 0) {
        return (
            <div className="bg-white/5 border border-white/10 rounded-lg p-8 text-center">
                <p className="text-gray-400">No portfolio holdings found.</p>
                <p className="text-xs text-gray-500 mt-1">Add trades in the Portfolio tab to see trends here.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <p className="text-xs text-gray-500">
                Monitoring {positions.length} holding{positions.length !== 1 ? 's' : ''}
                {trendsLoading && ' \u2014 loading trends...'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedPositions.map(pos => {
                    const trend = trends.get(pos.symbol);
                    const isExpanded = expanded === pos.symbol;

                    return (
                        <div key={pos.symbol} className={isExpanded ? 'sm:col-span-2 lg:col-span-3' : ''}>
                            <button
                                onClick={() => toggleExpand(pos.symbol)}
                                className={`w-full text-left bg-white/[0.03] border rounded-xl p-4 transition-all hover:bg-white/[0.05] ${
                                    isExpanded ? 'border-teal-500/30' : 'border-white/10'
                                }`}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <span className="text-sm font-semibold text-white">{pos.symbol}</span>
                                        <p className="text-xs text-gray-500 truncate max-w-[140px]">{pos.company}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium text-white">${pos.currentPrice.toFixed(2)}</p>
                                        <p className={`text-xs ${pos.totalReturnPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {pos.totalReturnPercent >= 0 ? '+' : ''}{pos.totalReturnPercent.toFixed(1)}%
                                        </p>
                                    </div>
                                </div>

                                {trend && <Sparkline prices={trend.prices} trend={trend.trend} />}

                                <div className="flex items-center justify-between mt-2">
                                    {trend ? <TrendBadge trend={trend.trend} /> : (
                                        <span className="text-xs text-gray-600">Loading...</span>
                                    )}
                                    <span className="text-[10px] text-gray-600 flex items-center gap-0.5">
                                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                        {isExpanded ? 'Collapse' : 'Details'}
                                    </span>
                                </div>
                            </button>

                            {isExpanded && (
                                <DetailPanel symbol={pos.symbol} companyName={pos.company} userId={userId} onClose={() => setExpanded(null)} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
