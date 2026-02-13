import { Calculator, Layers, Target } from "lucide-react";
import OptionsCalculator from "@/components/tools/OptionsCalculator";
import StrategyBuilder from "@/components/tools/StrategyBuilder";
import TargetPriceAnalyzer from "@/components/tools/TargetPriceAnalyzer";

export const metadata = {
    title: "Tools | OpenStock",
    description: "Options pricing calculator and other trading tools.",
};

export default function ToolsPage() {
    return (
        <div className="max-w-5xl mx-auto space-y-10 pb-20">
            <section className="pt-10 space-y-2">
                <h1 className="text-3xl font-bold text-white">Tools</h1>
                <p className="text-gray-400">Trading calculators and utilities.</p>
            </section>

            <section className="space-y-6">
                <div className="flex items-center gap-3">
                    <Calculator className="text-teal-400 h-6 w-6" />
                    <h2 className="text-xl font-semibold text-white">Options Price Calculator</h2>
                </div>
                <p className="text-sm text-gray-400">
                    Black-Scholes model — computes theoretical option price and Greeks (Delta, Gamma, Theta, Vega, Rho).
                </p>

                <div className="bg-gray-900 border border-white/10 rounded-xl p-6">
                    <OptionsCalculator />
                </div>
            </section>

            <section className="space-y-6">
                <div className="flex items-center gap-3">
                    <Layers className="text-teal-400 h-6 w-6" />
                    <h2 className="text-xl font-semibold text-white">Options Strategy Builder</h2>
                </div>
                <p className="text-sm text-gray-400">
                    Build multi-leg strategies — spreads, straddles, iron condors — with real-time P/L analysis, Greeks, and payoff diagrams.
                </p>

                <div className="bg-gray-900 border border-white/10 rounded-xl p-6">
                    <StrategyBuilder />
                </div>
            </section>

            <section className="space-y-6">
                <div className="flex items-center gap-3">
                    <Target className="text-teal-400 h-6 w-6" />
                    <h2 className="text-xl font-semibold text-white">Target Price Analyzer</h2>
                </div>
                <p className="text-sm text-gray-400">
                    Enter a target price to instantly compare strategies — naked calls/puts vs spreads — across multiple time horizons.
                </p>

                <div className="bg-gray-900 border border-white/10 rounded-xl p-6">
                    <TargetPriceAnalyzer />
                </div>
            </section>
        </div>
    );
}
