'use client';

import React, { useState, useEffect } from 'react';
import {
  History, Download, CheckCircle2, XCircle, Clock, Zap, ArrowRight,
  GitCompare, RefreshCw, FileText
} from 'lucide-react';
import { fetchJson } from '../lib/api';

interface RunsHistoryProps {
  onCompareSelect: (runA: string, runB: string) => void;
  onViewLive: (runId: string) => void;
}

export const RunsHistory: React.FC<RunsHistoryProps> = ({ onCompareSelect, onViewLive }) => {
  const [runs, setRuns] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadRuns();
  }, [filterType]);

  const loadRuns = async () => {
    setLoading(true);
    try {
      const url = filterType === 'all' ? '/api/runs' : `/api/runs?type=${filterType}`;
      const data = await fetchJson(url);
      setRuns(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const toggleCompare = (runId: string) => {
    if (selectedForCompare.includes(runId)) {
      setSelectedForCompare(selectedForCompare.filter(id => id !== runId));
    } else {
      if (selectedForCompare.length >= 2) {
        setSelectedForCompare([selectedForCompare[1], runId]);
      } else {
        setSelectedForCompare([...selectedForCompare, runId]);
      }
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2.5">
            <History className="w-5 h-5 text-blue-400" />
            Runs History & Performance Archive
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Historical logs of functional test executions and distributed load runs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {selectedForCompare.length === 2 && (
            <button
              onClick={() => onCompareSelect(selectedForCompare[0], selectedForCompare[1])}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-blue-500/20"
            >
              <GitCompare className="w-4 h-4" /> Compare 2 Selected Runs
            </button>
          )}

          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {(['all', 'load', 'functional'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition ${
                  filterType === t ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <button
            onClick={loadRuns}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Runs Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 uppercase text-[10px] tracking-wider">
              <th className="py-3 px-4 w-10">Diff</th>
              <th className="py-3 px-4">Test Run</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Status & Gate</th>
              <th className="py-3 px-4">Total Requests</th>
              <th className="py-3 px-4">Avg RPS</th>
              <th className="py-3 px-4">p95 Latency</th>
              <th className="py-3 px-4">Started At</th>
              <th className="py-3 px-4 text-right">Reports</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {runs.map((r) => {
              const summary = r.summary || {};
              const isSelected = selectedForCompare.includes(r.id);
              const passed = r.status === 'completed' && r.threshold_passed !== false;

              return (
                <tr key={r.id} className="hover:bg-slate-900/40 transition">
                  <td className="py-3 px-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCompare(r.id)}
                      className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => onViewLive(r.id)}
                      className="font-bold text-slate-200 hover:text-blue-400 text-left block"
                    >
                      {r.name}
                    </button>
                    <span className="text-[10px] text-slate-500 font-mono">{r.id.substring(0, 8)}...</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                      r.type === 'load' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    }`}>
                      {r.type}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      r.status === 'running' ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' :
                      passed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      {r.status} {r.threshold_passed === false ? '(Gate Failed)' : ''}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono">
                    {(summary.totalRequests || summary.totalSteps || 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">
                    {summary.avgRps ? `${summary.avgRps} req/s` : '-'}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">
                    {summary.p95Ms ? `${summary.p95Ms} ms` : '-'}
                  </td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                    {new Date(r.started_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <a
                        href={`/api/export/${r.id}/html`}
                        target="_blank"
                        rel="noreferrer"
                        title="HTML Report"
                        className="p-1 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-800"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </a>
                      <a
                        href={`/api/export/${r.id}/junit`}
                        target="_blank"
                        rel="noreferrer"
                        title="JUnit XML"
                        className="p-1 rounded text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
            {runs.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-slate-500 text-xs">
                  No test runs found. Launch a load test or functional collection to see results here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
