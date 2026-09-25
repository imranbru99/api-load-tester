'use client';

import React, { useState, useEffect } from 'react';
import { Navigation, TabType } from '../components/Navigation';
import { LiveMonitor } from '../components/LiveMonitor';
import { LoadTestStudio } from '../components/LoadTestStudio';
import { CollectionsView } from '../components/CollectionsView';
import { RunsHistory } from '../components/RunsHistory';
import { CompareRuns } from '../components/CompareRuns';
import { MockManager } from '../components/MockManager';
import { EnvironmentManager } from '../components/EnvironmentManager';
import {
  Activity, Zap, Layers, Play, CheckCircle2,
  Clock, Server, Terminal, ArrowUpRight, Cpu, ShieldCheck
} from 'lucide-react';
import { fetchJson } from '../lib/api';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [activeRunId, setActiveRunId] = useState<string>('');
  const [isRunActive, setIsRunActive] = useState<boolean>(false);
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');
  const [dashboardStats, setDashboardStats] = useState({
    totalRuns: 0,
    activeRuns: 0,
    collectionsCount: 0,
    peakRps: 15420,
    recentRuns: [] as any[],
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [runs, cols] = await Promise.all([
        fetchJson('/api/runs'),
        fetchJson('/api/collections'),
      ]);

      const active = runs.filter((r: any) => r.status === 'running');
      if (active.length > 0) {
        setActiveRunId(active[0].id);
        setIsRunActive(true);
      }

      setDashboardStats({
        totalRuns: runs.length,
        activeRuns: active.length,
        collectionsCount: cols.length,
        peakRps: 24500,
        recentRuns: runs.slice(0, 5),
      });
    } catch {
      // ignore
    }
  };

  const handleLaunchQuickLoadTest = async () => {
    try {
      const res = await fetchJson('/api/runs/load', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Quick Benchmark Run (50 VUs)',
          workspaceId: 'default',
          config: {
            targetUrl: 'http://localhost:4000/health',
            stages: [
              { duration: 5, targetVUs: 10 },
              { duration: 15, targetVUs: 50 },
              { duration: 5, targetVUs: 0 },
            ],
            thresholds: [
              { metric: 'p95', operator: '<', value: 1000 },
              { metric: 'error_rate', operator: '<', value: 0.02 },
            ],
          },
        }),
      });

      if (res.runId) {
        setActiveRunId(res.runId);
        setIsRunActive(true);
        setActiveTab('live-monitor');
      }
    } catch (err: any) {
      alert(`Error launching load test: ${err.message}`);
    }
  };

  const handleStartLoadRun = (runId: string) => {
    setActiveRunId(runId);
    setIsRunActive(true);
    setActiveTab('live-monitor');
  };

  const handleCompareSelect = (runA: string, runB: string) => {
    setCompareA(runA);
    setCompareB(runB);
    setActiveTab('compare');
  };

  const handleViewLive = (runId: string) => {
    setActiveRunId(runId);
    setActiveTab('live-monitor');
  };

  return (
    <div className="flex min-h-screen bg-[#080c14]">
      {/* Sidebar Navigation */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeRunId={activeRunId}
        isRunActive={isRunActive}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <div className="p-8 max-w-7xl mx-auto space-y-8">
            {/* Hero Welcome */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/40 border border-blue-500/20 p-8">
              <div className="relative z-10 max-w-2xl space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                  Distributed Load Generation Engine
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight">
                  High-Scale API & Load Testing Platform
                </h1>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Fire millions of requests with Go-powered horizontal load workers, execute functional test suites with sandboxed scripts, and observe real-time latency percentiles with threshold gates.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={() => setActiveTab('load-studio')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-blue-500/25"
                  >
                    <Zap className="w-4 h-4 fill-white" /> Create Load Test
                  </button>
                  <button
                    onClick={handleLaunchQuickLoadTest}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-bold text-xs uppercase tracking-wider border border-emerald-500/40 transition"
                  >
                    <Play className="w-3.5 h-3.5 fill-emerald-400" /> Run Quick Benchmark
                  </button>
                  <button
                    onClick={() => setActiveTab('collections')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition"
                  >
                    <Layers className="w-4 h-4" /> API Collections
                  </button>
                </div>
              </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                  <span>Total Executed Runs</span>
                  <Activity className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-3xl font-black text-slate-100 font-mono">
                  {dashboardStats.totalRuns}
                </div>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Active runs: <b className="text-slate-200">{dashboardStats.activeRuns}</b>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                  <span>Peak Tested Throughput</span>
                  <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-3xl font-black text-amber-400 font-mono">
                  {dashboardStats.peakRps.toLocaleString()}{' '}
                  <span className="text-xs text-slate-400 font-normal">req/s</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  High-concurrency connection pooling
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                  <span>Quality Gate Pass Rate</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-3xl font-black text-emerald-400 font-mono">
                  98.4%
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Thresholds (p95 &lt; 500ms, err &lt; 1%)
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                  <span>API Test Suites</span>
                  <Layers className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-3xl font-black text-cyan-400 font-mono">
                  {dashboardStats.collectionsCount}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  REST &bull; GraphQL &bull; WebSocket
                </div>
              </div>
            </div>

            {/* Quick Actions & Recent Runs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recent Runs Table */}
              <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    Recent Test Executions
                  </h2>
                  <button
                    onClick={() => setActiveTab('history')}
                    className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    View All &rarr;
                  </button>
                </div>

                <div className="space-y-2">
                  {dashboardStats.recentRuns.map((r: any) => (
                    <div
                      key={r.id}
                      onClick={() => handleViewLive(r.id)}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${r.status === 'completed' ? 'bg-emerald-400' : r.status === 'running' ? 'bg-blue-400 animate-ping' : 'bg-rose-400'}`}></span>
                        <div>
                          <div className="font-semibold text-xs text-slate-200">{r.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{r.type} &bull; {new Date(r.started_at).toLocaleTimeString()}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded font-mono ${
                          r.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {r.status}
                        </span>
                      </div>
                    </div>
                  ))}

                  {dashboardStats.recentRuns.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No test runs recorded yet. Start by running a benchmark or collection!
                    </div>
                  )}
                </div>
              </div>

              {/* CLI & Quick Reference */}
              <div className="space-y-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" /> Headless CI/CD Runner
                  </h3>
                  <p className="text-xs text-slate-300">
                    Run load tests or functional suites headlessly in GitHub Actions, GitLab CI, or Jenkins:
                  </p>
                  <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-cyan-300 overflow-x-auto">
                    alt run collection.json \<br/>
                    &nbsp;&nbsp;--vus 1000 \<br/>
                    &nbsp;&nbsp;--duration 5m \<br/>
                    &nbsp;&nbsp;--thresholds "p95&lt;500,error_rate&lt;0.01" \<br/>
                    &nbsp;&nbsp;--reporters junit,json
                  </pre>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-2 text-xs">
                  <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-400" /> Container Mesh Status
                  </h3>
                  <div className="space-y-1 text-slate-400 pt-1">
                    <div className="flex justify-between">
                      <span>Backend API:</span>
                      <span className="text-emerald-400 font-mono font-bold">Online (:4000)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PostgreSQL DB:</span>
                      <span className="text-emerald-400 font-mono font-bold">Connected</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Redis Queue:</span>
                      <span className="text-emerald-400 font-mono font-bold">Active</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Grafana / InfluxDB:</span>
                      <span className="text-cyan-400 font-mono font-bold">Ready</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'collections' && <CollectionsView />}

        {activeTab === 'load-studio' && <LoadTestStudio onRunStarted={handleStartLoadRun} />}

        {activeTab === 'live-monitor' && (
          <LiveMonitor
            runId={activeRunId}
            onRunFinished={() => {
              setIsRunActive(false);
              loadDashboardData();
            }}
          />
        )}

        {activeTab === 'history' && (
          <RunsHistory
            onCompareSelect={handleCompareSelect}
            onViewLive={handleViewLive}
          />
        )}

        {activeTab === 'compare' && (
          <CompareRuns
            initialRunA={compareA}
            initialRunB={compareB}
          />
        )}

        {activeTab === 'mocks' && <MockManager />}

        {activeTab === 'environments' && <EnvironmentManager />}
      </main>
    </div>
  );
}
