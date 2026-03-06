'use client';

import React, { useState, useMemo } from 'react';
import WatchlistStockChip from './WatchlistStockChip';
import TradingViewWatchlist from './TradingViewWatchlist';
import WatchlistTable from './WatchlistTable';
import WatchlistGroupTabs from './WatchlistGroupTabs';
import { Button } from '@/components/ui/button';
import { ArrowDownAZ, ArrowUpZA, ArrowUpDown } from 'lucide-react';
import { WatchlistItem } from '@/database/models/watchlist.model';

interface WatchlistGroup {
    _id: string;
    name: string;
    color?: string;
    sortOrder: number;
}

interface WatchlistManagerProps {
    initialItems: WatchlistItem[];
    userId: string;
    tableData?: any[];
    initialGroups?: WatchlistGroup[];
}

export default function WatchlistManager({ initialItems, userId, tableData, initialGroups = [] }: WatchlistManagerProps) {
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [groups, setGroups] = useState<WatchlistGroup[]>(initialGroups);

    const toggleSort = () => {
        if (sortOrder === null) setSortOrder('asc');
        else if (sortOrder === 'asc') setSortOrder('desc');
        else setSortOrder(null);
    };

    // Filter by selected group
    const filteredItems = useMemo(() => {
        if (!selectedGroupId) return initialItems;
        return initialItems.filter((item: any) =>
            item.lists && item.lists.includes(selectedGroupId)
        );
    }, [initialItems, selectedGroupId]);

    const sortedItems = useMemo(() => {
        if (!sortOrder) return filteredItems;
        return [...filteredItems].sort((a, b) => {
            if (sortOrder === 'asc') return a.symbol.localeCompare(b.symbol);
            return b.symbol.localeCompare(a.symbol);
        });
    }, [filteredItems, sortOrder]);

    const filteredTableData = useMemo(() => {
        if (!tableData) return tableData;
        if (!selectedGroupId) {
            if (!sortOrder) return tableData;
            return [...tableData].sort((a, b) => {
                if (sortOrder === 'asc') return a.symbol.localeCompare(b.symbol);
                return b.symbol.localeCompare(a.symbol);
            });
        }

        // Filter table data to match items in the selected group
        const filteredSymbols = new Set(filteredItems.map(item => item.symbol));
        let filtered = tableData.filter((d: any) => filteredSymbols.has(d.symbol));

        if (sortOrder) {
            filtered = [...filtered].sort((a, b) => {
                if (sortOrder === 'asc') return a.symbol.localeCompare(b.symbol);
                return b.symbol.localeCompare(a.symbol);
            });
        }
        return filtered;
    }, [tableData, selectedGroupId, filteredItems, sortOrder]);

    const watchlistSymbols = sortedItems.map((item) => item.symbol);

    return (
        <div className="space-y-6">
            {/* Group Tabs */}
            <WatchlistGroupTabs
                groups={groups}
                userId={userId}
                selectedGroupId={selectedGroupId}
                onSelectGroup={setSelectedGroupId}
                onGroupsChange={setGroups}
            />

            <div className="bg-gray-900/30 rounded-xl border border-gray-800 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center">
                        <span className="mr-2">Manage Symbols</span>
                        <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">
                            {watchlistSymbols.length}
                        </span>
                    </h3>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleSort}
                        className="h-8 px-2 text-gray-400 hover:text-white hover:bg-white/10"
                        title={
                            sortOrder === 'asc'
                                ? 'Sorted A-Z'
                                : sortOrder === 'desc'
                                    ? 'Sorted Z-A'
                                    : 'Default Order'
                        }
                    >
                        {sortOrder === 'asc' && <ArrowDownAZ className="w-4 h-4 mr-2" />}
                        {sortOrder === 'desc' && <ArrowUpZA className="w-4 h-4 mr-2" />}
                        {sortOrder === null && <ArrowUpDown className="w-4 h-4 mr-2" />}
                        <span className="text-xs">
                            {sortOrder === 'asc'
                                ? 'A-Z'
                                : sortOrder === 'desc'
                                    ? 'Z-A'
                                    : 'Sort'}
                        </span>
                    </Button>
                </div>

                {watchlistSymbols.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {sortedItems.map((item) => (
                            <WatchlistStockChip
                                key={item.symbol}
                                symbol={item.symbol}
                                userId={userId}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500 italic">
                        {selectedGroupId ? "No stocks in this list." : "No stocks in watchlist."}
                    </p>
                )}
            </div>

            {filteredTableData && filteredTableData.length > 0 && (
                <WatchlistTable data={filteredTableData} userId={userId} groups={groups} />
            )}

            <div className="min-h-[550px]">
                <TradingViewWatchlist symbols={watchlistSymbols} />
            </div>
        </div>
    );
}
