"use client";

import React, { useState } from "react";
import { Plus, X, Pencil, Palette } from "lucide-react";
import { createWatchlistGroup, updateWatchlistGroup, deleteWatchlistGroup } from "@/lib/actions/watchlist.actions";
import { toast } from "sonner";

interface WatchlistGroup {
    _id: string;
    name: string;
    color?: string;
    sortOrder: number;
}

interface WatchlistGroupTabsProps {
    groups: WatchlistGroup[];
    userId: string;
    selectedGroupId: string | null;
    onSelectGroup: (groupId: string | null) => void;
    onGroupsChange: (groups: WatchlistGroup[]) => void;
}

const GROUP_COLORS = [
    "#3b82f6", "#22c55e", "#eab308", "#ef4444", "#a855f7",
    "#ec4899", "#06b6d4", "#f97316",
];

export default function WatchlistGroupTabs({
    groups,
    userId,
    selectedGroupId,
    onSelectGroup,
    onGroupsChange,
}: WatchlistGroupTabsProps) {
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [loading, setLoading] = useState(false);

    const handleCreate = async () => {
        const name = newName.trim();
        if (!name) return;
        setLoading(true);
        try {
            const color = GROUP_COLORS[groups.length % GROUP_COLORS.length];
            const newGroup = await createWatchlistGroup(userId, name, color);
            onGroupsChange([...groups, newGroup]);
            setNewName("");
            setCreating(false);
            toast.success(`Created list "${name}"`);
        } catch {
            toast.error("Failed to create list");
        } finally {
            setLoading(false);
        }
    };

    const handleRename = async (groupId: string) => {
        const name = editName.trim();
        if (!name) return;
        setLoading(true);
        try {
            const updated = await updateWatchlistGroup(userId, groupId, { name });
            onGroupsChange(groups.map(g => g._id === groupId ? { ...g, name: updated.name } : g));
            setEditingId(null);
            toast.success("List renamed");
        } catch {
            toast.error("Failed to rename list");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (groupId: string) => {
        if (!confirm("Delete this list? Stocks won't be removed from your watchlist.")) return;
        setLoading(true);
        try {
            await deleteWatchlistGroup(userId, groupId);
            onGroupsChange(groups.filter(g => g._id !== groupId));
            if (selectedGroupId === groupId) onSelectGroup(null);
            toast.success("List deleted");
        } catch {
            toast.error("Failed to delete list");
        } finally {
            setLoading(false);
        }
    };

    const handleColorChange = async (groupId: string, color: string) => {
        try {
            await updateWatchlistGroup(userId, groupId, { color });
            onGroupsChange(groups.map(g => g._id === groupId ? { ...g, color } : g));
        } catch {
            toast.error("Failed to update color");
        }
    };

    return (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {/* All tab */}
            <button
                onClick={() => onSelectGroup(null)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                    selectedGroupId === null
                        ? "bg-white text-black"
                        : "bg-white/10 text-gray-400 hover:bg-white/15 hover:text-gray-200"
                }`}
            >
                All
            </button>

            {/* Group tabs */}
            {groups.map((group) => (
                <div key={group._id} className="relative group/tab flex items-center">
                    {editingId === group._id ? (
                        <div className="flex items-center gap-1">
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleRename(group._id);
                                    if (e.key === "Escape") setEditingId(null);
                                }}
                                onBlur={() => handleRename(group._id)}
                                autoFocus
                                className="bg-white/10 border border-white/20 rounded-full px-3 py-1 text-sm text-white outline-none focus:border-blue-500 w-32"
                                disabled={loading}
                            />
                        </div>
                    ) : (
                        <button
                            onClick={() => onSelectGroup(selectedGroupId === group._id ? null : group._id)}
                            className={`pl-4 pr-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2 ${
                                selectedGroupId === group._id
                                    ? "bg-white/20 text-white"
                                    : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200"
                            }`}
                        >
                            {group.color && (
                                <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: group.color }}
                                />
                            )}
                            {group.name}

                            {/* Inline actions on hover */}
                            <span className="hidden group-hover/tab:flex items-center gap-0.5 ml-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingId(group._id);
                                        setEditName(group.name);
                                    }}
                                    className="p-0.5 rounded hover:bg-white/20 transition-colors"
                                    title="Rename"
                                >
                                    <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const nextColor = GROUP_COLORS[(GROUP_COLORS.indexOf(group.color || '') + 1) % GROUP_COLORS.length];
                                        handleColorChange(group._id, nextColor);
                                    }}
                                    className="p-0.5 rounded hover:bg-white/20 transition-colors"
                                    title="Change color"
                                >
                                    <Palette className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(group._id);
                                    }}
                                    className="p-0.5 rounded hover:bg-red-500/30 text-red-400 transition-colors"
                                    title="Delete list"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        </button>
                    )}
                </div>
            ))}

            {/* Create new tab */}
            {creating ? (
                <div className="flex items-center gap-1">
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreate();
                            if (e.key === "Escape") { setCreating(false); setNewName(""); }
                        }}
                        autoFocus
                        placeholder="List name..."
                        className="bg-white/10 border border-white/20 rounded-full px-3 py-1 text-sm text-white outline-none focus:border-blue-500 w-32 placeholder:text-gray-600"
                        disabled={loading}
                    />
                    <button
                        onClick={handleCreate}
                        disabled={loading || !newName.trim()}
                        className="p-1 rounded-full bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => { setCreating(false); setNewName(""); }}
                        className="p-1 rounded-full bg-white/10 text-gray-400 hover:bg-white/20 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => setCreating(true)}
                    className="px-3 py-1.5 rounded-full text-sm font-medium bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-all flex items-center gap-1.5"
                >
                    <Plus className="w-3.5 h-3.5" />
                    New List
                </button>
            )}
        </div>
    );
}
