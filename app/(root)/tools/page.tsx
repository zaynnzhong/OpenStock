import { Calculator } from "lucide-react";
import OptionsCalculator from "@/components/tools/OptionsCalculator";

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
        </div>
    );
}
