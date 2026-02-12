"use client";

import { useState, useRef } from "react";
import { Upload, X, AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { previewCSVImport, confirmCSVImport } from "@/lib/actions/trade.actions";
import type { ParseResult, ParsedTrade } from "@/lib/portfolio/csv-parser";

interface CSVImportModalProps {
    userId: string;
    onImported?: () => void;
}

type Step = 'upload' | 'preview' | 'done';

export default function CSVImportModal({ userId, onImported }: CSVImportModalProps) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<Step>('upload');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ParseResult | null>(null);
    const [importCount, setImportCount] = useState(0);
    const [csvContent, setCsvContent] = useState("");
    const [format, setFormat] = useState<'csv_robinhood' | 'csv_schwab' | 'csv_generic' | ''>('');
    const fileRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setStep('upload');
        setResult(null);
        setError(null);
        setCsvContent("");
        setFormat('');
        setImportCount(0);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError(null);

        try {
            const content = await file.text();
            setCsvContent(content);
            const preview = await previewCSVImport(userId, content, format || undefined);
            setResult(preview);
            setStep('preview');
        } catch (err: any) {
            setError(err.message || 'Failed to parse CSV');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        if (!result || result.trades.length === 0) return;

        setLoading(true);
        setError(null);

        try {
            const res = await confirmCSVImport(userId, result.trades, result.format);
            setImportCount(res.count);
            setStep('done');
            onImported?.();
        } catch (err: any) {
            setError(err.message || 'Failed to import trades');
        } finally {
            setLoading(false);
        }
    };

    if (!open) {
        return (
            <Button variant="outline" onClick={() => setOpen(true)} className="gap-2 border-white/10 text-gray-300 hover:text-white">
                <Upload className="w-4 h-4" /> Import CSV
            </Button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl bg-gray-900 border border-white/10 rounded-xl shadow-2xl p-6 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-white">Import Trades from CSV</h2>
                    <button onClick={() => { reset(); setOpen(false); }} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Step 1: Upload */}
                {step === 'upload' && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-2">Broker Format (optional — auto-detected from headers)</label>
                            <select
                                value={format}
                                onChange={e => setFormat(e.target.value as any)}
                                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none"
                            >
                                <option value="">Auto-detect</option>
                                <option value="csv_robinhood">Robinhood</option>
                                <option value="csv_schwab">Schwab</option>
                                <option value="csv_generic">Generic</option>
                            </select>
                        </div>

                        <div
                            className="border-2 border-dashed border-white/10 rounded-lg p-8 text-center cursor-pointer hover:border-white/20 transition-colors"
                            onClick={() => fileRef.current?.click()}
                        >
                            <FileText className="w-10 h-10 mx-auto text-gray-500 mb-3" />
                            <p className="text-sm text-gray-400 mb-1">Click to upload or drag & drop</p>
                            <p className="text-xs text-gray-600">CSV files only</p>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                        </div>

                        {loading && <p className="text-sm text-gray-400 text-center">Parsing file...</p>}
                        {error && <p className="text-sm text-red-400 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</p>}
                    </div>
                )}

                {/* Step 2: Preview */}
                {step === 'preview' && result && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 text-sm">
                            <span className="text-green-400 flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4" /> {result.trades.length} trades parsed
                            </span>
                            {result.errors.length > 0 && (
                                <span className="text-yellow-400 flex items-center gap-1">
                                    <AlertCircle className="w-4 h-4" /> {result.errors.length} errors
                                </span>
                            )}
                            <Badge variant="outline">{result.format.replace('csv_', '').replace('_', ' ')}</Badge>
                        </div>

                        {/* Preview table */}
                        <div className="overflow-x-auto max-h-[300px] rounded-lg border border-white/10">
                            <table className="w-full text-xs">
                                <thead className="bg-white/5 text-gray-400 sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Date</th>
                                        <th className="px-3 py-2 text-left">Symbol</th>
                                        <th className="px-3 py-2 text-left">Type</th>
                                        <th className="px-3 py-2 text-left">Qty</th>
                                        <th className="px-3 py-2 text-left">Price</th>
                                        <th className="px-3 py-2 text-left">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {result.trades.slice(0, 100).map((t, i) => (
                                        <tr key={i} className="text-gray-300">
                                            <td className="px-3 py-1.5">{new Date(t.executedAt).toLocaleDateString()}</td>
                                            <td className="px-3 py-1.5 font-mono">{t.symbol}</td>
                                            <td className="px-3 py-1.5"><Badge variant={t.type === 'BUY' ? 'buy' : t.type === 'SELL' ? 'sell' : 'default'} className="text-[10px]">{t.type}</Badge></td>
                                            <td className="px-3 py-1.5">{t.quantity}</td>
                                            <td className="px-3 py-1.5">${t.pricePerShare.toFixed(2)}</td>
                                            <td className="px-3 py-1.5">${t.totalAmount.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {result.trades.length > 100 && (
                                <p className="text-xs text-gray-500 p-2 text-center">Showing first 100 of {result.trades.length}</p>
                            )}
                        </div>

                        {/* Errors */}
                        {result.errors.length > 0 && (
                            <div className="max-h-[100px] overflow-y-auto text-xs text-yellow-400 space-y-1 p-2 bg-yellow-500/5 rounded border border-yellow-500/20">
                                {result.errors.map((e, i) => (
                                    <p key={i}>Row {e.row}: {e.message}</p>
                                ))}
                            </div>
                        )}

                        {error && <p className="text-sm text-red-400">{error}</p>}

                        <div className="flex justify-end gap-3">
                            <Button variant="ghost" onClick={reset}>Back</Button>
                            <Button onClick={handleConfirm} disabled={loading || result.trades.length === 0}>
                                {loading ? 'Importing...' : `Import ${result.trades.length} Trades`}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step 3: Done */}
                {step === 'done' && (
                    <div className="text-center py-8">
                        <CheckCircle2 className="w-12 h-12 mx-auto text-green-400 mb-4" />
                        <h3 className="text-lg font-semibold text-white mb-2">Import Complete</h3>
                        <p className="text-gray-400 mb-6">{importCount} trades imported successfully.</p>
                        <Button onClick={() => { reset(); setOpen(false); }}>Close</Button>
                    </div>
                )}
            </div>
        </div>
    );
}
