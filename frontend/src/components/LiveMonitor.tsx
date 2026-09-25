'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, StopCircle,
  Zap, Clock, ShieldAlert, Database, RefreshCw
} from 'lucide-react';
import { getWsUrl, fetchJson } from '../lib/api';

interface LiveMonitorProps {
  runId?: string;
  onRunFinished?: () => void;
}

export const LiveMonitor: React.FC<LiveMonitorProps> = ({ runId, onRunFinished }) => {
  const [activeRunId, setActiveRunId] = useState<string>(runId || '');
  const [status, setStatus] = useState<string>('idle');
  const [metricSeries, setMetricSeries] = useState<any[]>([]);
  const [latestMetric, setLatestMetric] = useState<any>(null);
  const [thresholds, setThresholds] = useState<any[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [stopping, setStopping] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-fetch latest run if none selected
  useEffect(() => {
    if (!activeRunId) {
      fetchJson('/api/runs?limit=1')
        .then((runs) => {
          if (runs && runs.length > 0) {
            setActiveRunId(runs[0].id);
            setStatus(runs[0].status);
            if (runs[0].thresholds) setThresholds(runs[0].thresholds);
          }
        })
        .catch(() => {});
    }
  }, [activeRunId]);

  // Connect WebSocket
  useEffect(() => {
    const wsUrl = getWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (activeRunId) {
        ws.send(JSON.stringify({ type: 'subscribe', runId: activeRunId }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'metrics' && msg.data) {
          const m = msg.data;
          setLatestMetric(m);
          setStatus('running');

          setMetricSeries((prev) => {
            const timeLabel = new Date(m.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' });
            const item = {
              time: timeLabel,
              rps: m.rps,
              vus: m.activeVUs,
              p50: m.p50,
              p90: m.p90,
              p95: m.p95,
              p99: m.p99,
              errorRate: Math.round(m.errorRate * 1000) / 10,
              requests: m.totalRequests,
            };
            return [...prev.slice(-30), item];
          });
        } else if (msg.type === 'status') {
          if (msg.data?.status) {
            setStatus(msg.data.status);
            if (msg.data.status === 'completed' || msg.data.status === 'failed' || msg.data.status === 'cancelled') {
              if (onRunFinished) onRunFinished();
            }
          }
        }
      } catch (err) {
        // ignore
      }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
    };
  }, [activeRunId, onRunFinished]);

  const handleStopRun = async () => {
    if (!activeRunId) return;
    setStopping(true);
    try {
      await fetchJson(`/api/runs/${activeRunId}/stop`, { method: 'POST' });
      setStatus('cancelled');
    } catch (e: any) {
      alert(`Failed to stop run: ${e.message}`);
    } finally {
      setStopping(false);
    }
  };

  const statusColor = status === 'running'
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : status === 'completed'
    ? 'text-blue-400 bg-blue-500/10 border-blue-500/30'
    : status === 'failed'
    ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
    : 'text-slate-400 bg-slate-800 border-slate-700';

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-xl p-5 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Activity className={`w-6 h-6 ${status === 'running' ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-100">Live Load Test Monitor</h1>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase border ${statusColor}`}>
                {status}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
              <span>Run ID: <code className="text-blue-400 font-mono">{activeRunId || 'None'}</code></span>
              <span>&bull;</span>
              <span className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                {connected ? 'WebSocket Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {status === 'running' && (
            <button
              onClick={handleStopRun}
              disabled={stopping}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition shadow-lg shadow-rose-600/20"
            >
              <StopCircle className="w-4 h-4" />
              {stopping ? 'Cancelling...' : 'Emergency Stop'}
            </button>
          )}

          <a
            href={`/api/export/${activeRunId}/html`}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition"
          >
            Export HTML Report
          </a>

          <a
            href={`/api/export/${activeRunId}/junit`}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition"
          >
            JUnit XML
          </a>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
            <span>Total Requests</span>
            <Database className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-slate-100 font-mono">
            {latestMetric?.totalRequests?.toLocaleString() || '0'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Success: <span className="text-emerald-400 font-bold">{latestMetric?.successfulRequests?.toLocaleString() || '0'}</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
            <span>Throughput (RPS)</span>
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-cyan-400 font-mono">
            {latestMetric?.rps || '0'} <span className="text-xs text-slate-500 font-normal">req/s</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Active VUs: <span className="text-slate-200 font-bold">{latestMetric?.activeVUs || '0'}</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
            <span>p95 Latency</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">
            {latestMetric?.p95 ? `${latestMetric.p95}ms` : '0ms'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            p99: <span className="text-slate-300 font-mono">{latestMetric?.p99 || 0}ms</span> &bull; p50: <span className="text-slate-300 font-mono">{latestMetric?.p50 || 0}ms</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
            <span>Error Rate</span>
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className={`text-2xl font-black font-mono ${(latestMetric?.errorRate || 0) > 0.01 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {latestMetric?.errorRate !== undefined ? `${(latestMetric.errorRate * 100).toFixed(2)}%` : '0.00%'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Failed: <span className="text-rose-400 font-bold">{latestMetric?.failedRequests?.toLocaleString() || '0'}</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
            <span>Data Transferred</span>
            <Database className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-slate-100 font-mono">
            {latestMetric?.bytesTransferred ? `${(latestMetric.bytesTransferred / (1024 * 1024)).toFixed(2)} MB` : '0.00 MB'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Zero-copy stream buffer
          </div>
        </div>
      </div>

      {/* Main Charts: Latency & RPS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latency Percentiles Curve */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
              Latency Percentiles (p50, p90, p95, p99)
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> p50</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400"></span> p90</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"></span> p95</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400"></span> p99</span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metricSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} unit="ms" />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }} />
                <Line type="monotone" dataKey="p50" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="p90" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="p95" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="p99" stroke="#f43f5e" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RPS & Virtual Users Stream */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
              Throughput (RPS) & Virtual Users (VUs)
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> RPS</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400"></span> Active VUs</span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metricSeries}>
                <defs>
                  <linearGradient id="rpsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="vuGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis yAxisId="left" stroke="#3b82f6" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" stroke="#06b6d4" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }} />
                <Area yAxisId="left" type="monotone" dataKey="rps" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#rpsGradient)" isAnimationActive={false} />
                <Area yAxisId="right" type="monotone" dataKey="vus" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#vuGradient)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Threshold Evaluation and Status Codes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Quality Gate Thresholds
          </h2>
          <div className="space-y-2">
            {thresholds && thresholds.length > 0 ? (
              thresholds.map((th, idx) => {
                let actualVal = 0;
                if (th.metric === 'p95') actualVal = latestMetric?.p95 || 0;
                if (th.metric === 'p99') actualVal = latestMetric?.p99 || 0;
                if (th.metric === 'error_rate') actualVal = latestMetric?.errorRate || 0;
                if (th.metric === 'rps') actualVal = latestMetric?.rps || 0;

                let passed = true;
                if (th.operator === '<') passed = actualVal < th.value;
                if (th.operator === '<=') passed = actualVal <= th.value;

                return (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs">
                    <span className="font-mono text-slate-200 font-semibold">
                      {th.metric} {th.operator} {th.value}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">Current: <b className="text-slate-200">{actualVal}</b></span>
                      <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${passed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                        {passed ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-slate-500 italic p-3">
                No custom threshold gates configured for this run.
              </div>
            )}
          </div>
        </div>

        {/* Status Codes */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-200 mb-3">HTTP Status Codes</h2>
          <div className="space-y-2 text-xs">
            {latestMetric?.statusCodes && Object.keys(latestMetric.statusCodes).length > 0 ? (
              Object.entries(latestMetric.statusCodes).map(([code, count]: any) => (
                <div key={code} className="flex items-center justify-between p-2 rounded bg-slate-800/40">
                  <span className={`font-mono font-bold ${code.startsWith('2') ? 'text-emerald-400' : code.startsWith('3') ? 'text-cyan-400' : 'text-rose-400'}`}>
                    HTTP {code}
                  </span>
                  <span className="font-mono text-slate-300 font-bold">{count.toLocaleString()}</span>
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-xs italic">Awaiting response codes...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
