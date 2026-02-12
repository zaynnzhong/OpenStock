import { Suspense } from "react";
import TradingViewWidget from "@/components/TradingViewWidget";
import PortfolioHeatmapWrapper from "@/components/heatmap/PortfolioHeatmapWrapper";
import {
    HEATMAP_WIDGET_CONFIG,
    MARKET_DATA_WIDGET_CONFIG,
    MARKET_OVERVIEW_WIDGET_CONFIG,
    TOP_STORIES_WIDGET_CONFIG
} from "@/lib/constants";

const Home = async () => {
    const scriptUrl = `https://s3.tradingview.com/external-embedding/embed-widget-`;

    return (
        <div className="flex min-h-screen home-wrapper">
            <section className="grid w-full gap-8 home-section">
                <div className="md:col-span-1 xl:col-span-1">
                    <TradingViewWidget
                        title="Market Overview"
                        scriptUrl={`${scriptUrl}market-overview.js`}
                        config={MARKET_OVERVIEW_WIDGET_CONFIG}
                        className="custom-chart"
                        height={600}
                    />
                </div>
                <div className="md:col-span-1 xl:col-span-2">
                    <TradingViewWidget
                        title="Stock Heatmap"
                        scriptUrl={`${scriptUrl}stock-heatmap.js`}
                        config={HEATMAP_WIDGET_CONFIG}
                        height={600}
                    />
                </div>
            </section>
            <section className="w-full mt-8">
                <Suspense
                    fallback={
                        <div>
                            <h3 className="font-semibold text-2xl text-gray-100 mb-5">
                                Portfolio Heatmap
                            </h3>
                            <div className="w-full h-[500px] rounded-xl bg-gray-800 animate-pulse" />
                        </div>
                    }
                >
                    <PortfolioHeatmapWrapper />
                </Suspense>
            </section>
            <section className="grid w-full gap-8 home-section">
                <div className="h-full md:col-span-1 xl:col-span-2">
                    <TradingViewWidget
                        scriptUrl={`${scriptUrl}market-quotes.js`}
                        config={MARKET_DATA_WIDGET_CONFIG}
                        height={600}
                    />
                </div>
                <div className="h-full md:col-span-1 xl:col-span-1">
                    <TradingViewWidget
                        scriptUrl={`${scriptUrl}timeline.js`}
                        config={TOP_STORIES_WIDGET_CONFIG}
                        height={600}
                    />
                </div>
            </section>
            <div className="w-full flex flex-col items-center justify-center mt-8 gap-4">
                <h2 className="text-xl font-semibold text-gray-200">Upvote us on Peerlist 🚀</h2>
                <a href="https://peerlist.io/ravixalgorithm/project/openstock" target="_blank" rel="noreferrer">
                    <img
                        src="https://peerlist.io/api/v1/projects/embed/PRJH8OED7MBL9MGB9HRMKAKLM66KNN?showUpvote=true&theme=light"
                        alt="OpenStock"
                        style={{ width: "auto", height: "72px" }}
                    />
                </a>
            </div>
        </div>
    )
}

export default Home;
