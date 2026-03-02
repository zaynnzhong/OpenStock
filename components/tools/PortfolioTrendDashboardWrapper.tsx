import { auth } from "@/lib/better-auth/auth";
import { headers } from "next/headers";
import PortfolioTrendDashboard from "./PortfolioTrendDashboard";

export default async function PortfolioTrendDashboardWrapper() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user) {
        return null;
    }

    return (
        <div>
            <h3 className="font-semibold text-2xl text-gray-100 mb-5">
                Portfolio Trends
            </h3>
            <div className="bg-gray-900 border border-white/10 rounded-xl p-6">
                <PortfolioTrendDashboard userId={session.user.id} />
            </div>
        </div>
    );
}
