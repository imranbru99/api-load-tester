'use client';

import React, { useState, useEffect } from 'react';
import { GitCompare, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { fetchJson } from '../lib/api';

interface CompareRunsProps {
  initialRunA?: string;
  initialRunB?: string;
}

export const CompareRuns: React.FC<CompareRunsProps> = ({ initialRunA, initialRunB }) => {
  const [runs, setRuns] = useState<any[]>([]);
  const [runAId, setRunAId] = useState<string>(initialRunA || '');
  const [runBId, setRunBId] = useState<string>(initialRunB || '');
  const [diffData, setDiffData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchJson('/api/runs?limit=30')
      .then((data) => {
        setRuns(data);
        if (!runAId && data.length > 0) setRunAId(data[0].id);
        if (!runBId && data.length > 1) setRunBId(data[1].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (runAId && runBId && runAId !== runBId) {
      setLoading(true);
      fetchJson(`/api/runs/compare/${runAId}/${runBId}`)
        .then((res) => {
          setDiffData(res);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }
  }, [runAId, runBId]);

  const renderDelta = (delta: number, unit: string = '', inverted: boolean = false) => {
    if (delta === 0) return <span className="text-slate-400 font-mono flex items-center"><Minus className="w-3 h-3 inline mr-1" /> 0 {unit}</span>;
    const isPositive = delta > 0;
    // For latency and error rate, positive delta is BAD (higher latency)
    const isGood = inverted ? !isPositive : isPositive;
    const color = isGood ? 'text-emerald-400' : 'text-rose-400';
    const Icon = isPositive ? ArrowUpRight : ArrowDownRight;

    return (
      <span className={`font-mono font-bold flex items-center ${color}`}>
        <Icon className="w-3.5 h-3.5 inline mr-0.5" />
        {isPositive ? '+' : ''}{delta} {unit}
      </span>
    );
  };

  const aSummary = diffData?.runA?.summary || {};
  const bSummary = diffData?.runB?.summary || {};
  const diffs = diffData?.metricsDiff || {};

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2.5">
          <GitCompare className="w-5 h-5 text-indigo-400" />
          Side-by-Side Run Comparison & Regression Diff
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Compare latency regressions, throughput improvements, and failure deltas between two load tests.
        </p>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase block mb-1">Baseline Run (A)</label>
          <select
            value={runAId}
            onChange={(e) => setRunAId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200"
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({new Date(r.started_at).toLocaleTimeString()}) - {r.id.substring(0, 8)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase block mb-1">Target Run (B)</label>
          <select
            value={runBId}
            onChange={(e) => setRunBId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200"
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({new Date(r.started_at).toLocaleTimeString()}) - {r.id.substring(0, 8)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison Grid */}
      {diffData && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-5">Metric</th>
                <th className="py-3 px-5">Baseline Run A</th>
                <th className="py-3 px-5">Target Run B</th>
                <th className="py-3 px-5">Difference (Delta)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              <tr>
                <td className="py-3 px-5 font-sans font-semibold text-slate-300">Total Requests</td>
                <td className="py-3 px-5 text-slate-200">{(aSummary.totalRequests || 0).toLocaleString()}</td>
                <td className="py-3 px-5 text-slate-200">{(bSummary.totalRequests || 0).toLocaleString()}</td>
                <td className="py-3 px-5">{renderDelta(diffs.totalRequestsDelta || 0, 'reqs')}</td>
              </tr>
              <tr>
                <td className="py-3 px-5 font-sans font-semibold text-slate-300">Average Throughput (RPS)</td>
                <td className="py-3 px-5 text-cyan-400 font-bold">{aSummary.avgRps || 0} req/s</td>
                <td className="py-3 px-5 text-cyan-400 font-bold">{bSummary.avgRps || 0} req/s</td>
                <td className="py-3 px-5">{renderDelta(diffs.rpsDelta || 0, 'req/s')}</td>
              </tr>
              <tr>
                <td className="py-3 px-5 font-sans font-semibold text-slate-300">p95 Latency</td>
                <td className="py-3 px-5 text-slate-200">{aSummary.p95Ms || 0} ms</td>
                <td className="py-3 px-5 text-slate-200">{bSummary.p95Ms || 0} ms</td>
                <td className="py-3 px-5">{renderDelta(diffs.p95Delta || 0, 'ms', true)}</td>
              </tr>
              <tr>
                <td className="py-3 px-5 font-sans font-semibold text-slate-300">p99 Latency</td>
                <td className="py-3 px-5 text-slate-200">{aSummary.p99Ms || 0} ms</td>
                <td className="py-3 px-5 text-slate-200">{bSummary.p99Ms || 0} ms</td>
                <td className="py-3 px-5">{renderDelta(diffs.p99Delta || 0, 'ms', true)}</td>
              </tr>
              <tr>
                <td className="py-3 px-5 font-sans font-semibold text-slate-300">Error Rate</td>
                <td className="py-3 px-5 text-slate-200">{aSummary.errorRatePercent || 0}%</td>
                <td className="py-3 px-5 text-slate-200">{bSummary.errorRatePercent || 0}%</td>
                <td className="py-3 px-5">{renderDelta(diffs.errorRateDelta || 0, '%', true)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
