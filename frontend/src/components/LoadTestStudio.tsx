'use client';

import React, { useState } from 'react';
import {
  Zap, Play, Plus, Trash2, Sliders, ShieldCheck, Flame, Layers, Clock, Globe
} from 'lucide-react';
import { fetchJson } from '../lib/api';

interface Stage {
  duration: number;
  targetVUs: number;
}

interface Threshold {
  metric: string;
  operator: string;
  value: number;
}

interface LoadTestStudioProps {
  onRunStarted: (runId: string) => void;
}

export const LoadTestStudio: React.FC<LoadTestStudioProps> = ({ onRunStarted }) => {
  const [name, setName] = useState<string>('Production API Stress Test');
  const [targetUrl, setTargetUrl] = useState<string>('http://localhost:4000/health');
  const [method, setMethod] = useState<string>('GET');
  const [protocol, setProtocol] = useState<string>('http1');
  const [maxRps, setMaxRps] = useState<string>('');
  const [headersJson, setHeadersJson] = useState<string>('{\n  "Accept": "application/json"\n}');
  const [bodyJson, setBodyJson] = useState<string>('');
  const [launching, setLaunching] = useState<boolean>(false);

  const [stages, setStages] = useState<Stage[]>([
    { duration: 10, targetVUs: 20 },
    { duration: 30, targetVUs: 100 },
    { duration: 10, targetVUs: 0 },
  ]);

  const [thresholds, setThresholds] = useState<Threshold[]>([
    { metric: 'p95', operator: '<', value: 500 },
    { metric: 'error_rate', operator: '<', value: 0.01 },
  ]);

  const applyProfile = (profile: string) => {
    switch (profile) {
      case 'constant':
        setStages([{ duration: 60, targetVUs: 50 }]);
        break;
      case 'ramp':
        setStages([
          { duration: 15, targetVUs: 20 },
          { duration: 30, targetVUs: 80 },
          { duration: 15, targetVUs: 0 },
        ]);
        break;
      case 'spike':
        setStages([
          { duration: 10, targetVUs: 10 },
          { duration: 5, targetVUs: 500 }, // sudden spike
          { duration: 10, targetVUs: 10 },
        ]);
        break;
      case 'stress':
        setStages([
          { duration: 15, targetVUs: 100 },
          { duration: 30, targetVUs: 500 },
          { duration: 30, targetVUs: 1000 },
          { duration: 15, targetVUs: 0 },
        ]);
        break;
      case 'soak':
        setStages([
          { duration: 15, targetVUs: 100 },
          { duration: 300, targetVUs: 100 }, // sustained for 5m
          { duration: 15, targetVUs: 0 },
        ]);
        break;
      case 'breakpoint':
        setStages([
          { duration: 20, targetVUs: 100 },
          { duration: 20, targetVUs: 300 },
          { duration: 20, targetVUs: 600 },
          { duration: 20, targetVUs: 1200 },
          { duration: 20, targetVUs: 2000 },
        ]);
        break;
    }
  };

  const handleAddStage = () => {
    setStages([...stages, { duration: 15, targetVUs: 50 }]);
  };

  const handleRemoveStage = (index: number) => {
    setStages(stages.filter((_, i) => i !== index));
  };

  const handleUpdateStage = (index: number, field: keyof Stage, val: number) => {
    const updated = [...stages];
    updated[index][field] = val;
    setStages(updated);
  };

  const handleAddThreshold = () => {
    setThresholds([...thresholds, { metric: 'p99', operator: '<', value: 1000 }]);
  };

  const handleRemoveThreshold = (index: number) => {
    setThresholds(thresholds.filter((_, i) => i !== index));
  };

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      let parsedHeaders = {};
      try {
        if (headersJson.trim()) parsedHeaders = JSON.parse(headersJson);
      } catch {
        alert('Invalid JSON in Headers');
        setLaunching(false);
        return;
      }

      let parsedBody = undefined;
      try {
        if (bodyJson.trim()) parsedBody = JSON.parse(bodyJson);
      } catch {
        parsedBody = bodyJson;
      }

      const config = {
        targetUrl,
        method,
        protocol,
        stages,
        maxRps: maxRps ? parseInt(maxRps, 10) : undefined,
        headers: parsedHeaders,
        body: parsedBody,
        thresholds,
        timeoutMs: 5000,
        keepAlive: true,
      };

      const res = await fetchJson('/api/runs/load', {
        method: 'POST',
        body: JSON.stringify({
          name,
          workspaceId: 'default',
          config,
        }),
      });

      if (res.runId) {
        onRunStarted(res.runId);
      }
    } catch (err: any) {
      alert(`Launch error: ${err.message}`);
    } finally {
      setLaunching(false);
    }
  };

  const totalDuration = stages.reduce((acc, s) => acc + (s.duration || 0), 0);
  const peakVUs = stages.reduce((acc, s) => Math.max(acc, s.targetVUs || 0), 0);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-amber-400" />
            Load Test Studio
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Configure distributed multi-stage load generation with automatic quality gate thresholds.
          </p>
        </div>

        <button
          onClick={handleLaunch}
          disabled={launching}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-blue-500/25 disabled:opacity-50"
        >
          <Play className="w-4 h-4 fill-white" />
          {launching ? 'Dispatching...' : 'Launch Load Test'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Target Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Target endpoint */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              1. Target Endpoint
            </h2>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Test Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 font-medium focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-bold text-blue-400 focus:outline-none focus:border-blue-500"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>

              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="http://localhost:4000/health"
                className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
              />

              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="http1">HTTP/1.1</option>
                <option value="http2">HTTP/2</option>
                <option value="ws">WebSocket</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-xs text-slate-400 block mb-1">RPS Throttle Limit (Optional)</label>
                <input
                  type="number"
                  value={maxRps}
                  onChange={(e) => setMaxRps(e.target.value)}
                  placeholder="e.g. 5000 (empty = unthrottled)"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Connection Pool Tuning</label>
                <div className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                  <span>TCP Keep-Alive</span>
                  <span className="text-emerald-400 font-bold">Enabled (50k Conns)</span>
                </div>
              </div>
            </div>

            {/* Headers & Body Accordion */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Request Headers (JSON)</label>
                <textarea
                  rows={4}
                  value={headersJson}
                  onChange={(e) => setHeadersJson(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Request Body (JSON / Raw)</label>
                <textarea
                  rows={4}
                  value={bodyJson}
                  onChange={(e) => setBodyJson(e.target.value)}
                  placeholder='{"key": "value"}'
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Staging & Ramp Visualizer */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                2. Load Stages & Ramp-Up Profile
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Total: <b className="text-slate-200">{totalDuration}s</b></span>
                <span>&bull;</span>
                <span className="text-xs text-slate-400">Peak VUs: <b className="text-blue-400">{peakVUs}</b></span>
              </div>
            </div>

            {/* Profile presets buttons */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'constant', label: 'Constant Load' },
                { id: 'ramp', label: 'Ramp Up / Down' },
                { id: 'spike', label: 'Spike Test' },
                { id: 'stress', label: 'Stress Test' },
                { id: 'soak', label: 'Soak (Endurance)' },
                { id: 'breakpoint', label: 'Breakpoint' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyProfile(p.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700/60 transition"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Stage Table */}
            <div className="space-y-2">
              {stages.map((stage, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-xs font-bold text-slate-500 w-16">
                    Stage {idx + 1}
                  </span>

                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-xs text-slate-400">Hold for:</span>
                    <input
                      type="number"
                      value={stage.duration}
                      onChange={(e) => handleUpdateStage(idx, 'duration', parseInt(e.target.value, 10) || 0)}
                      className="w-20 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200"
                    />
                    <span className="text-xs text-slate-500">sec</span>
                  </div>

                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-xs text-slate-400">Target VUs:</span>
                    <input
                      type="number"
                      value={stage.targetVUs}
                      onChange={(e) => handleUpdateStage(idx, 'targetVUs', parseInt(e.target.value, 10) || 0)}
                      className="w-24 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-400 font-bold"
                    />
                    <span className="text-xs text-slate-500">users</span>
                  </div>

                  <button
                    onClick={() => handleRemoveStage(idx)}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={handleAddStage}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              <Plus className="w-4 h-4" /> Add Stage
            </button>
          </div>
        </div>

        {/* Right Column: Threshold Quality Gates */}
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              3. Pass / Fail Quality Gates
            </h2>
            <p className="text-xs text-slate-400">
              CI/CD and test runs will fail automatically if any threshold is violated.
            </p>

            <div className="space-y-2">
              {thresholds.map((th, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <select
                    value={th.metric}
                    onChange={(e) => {
                      const updated = [...thresholds];
                      updated[idx].metric = e.target.value;
                      setThresholds(updated);
                    }}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                  >
                    <option value="p95">p95 Latency (ms)</option>
                    <option value="p99">p99 Latency (ms)</option>
                    <option value="p50">p50 Latency (ms)</option>
                    <option value="error_rate">Error Rate (0.01 = 1%)</option>
                    <option value="rps">Min Avg RPS</option>
                  </select>

                  <select
                    value={th.operator}
                    onChange={(e) => {
                      const updated = [...thresholds];
                      updated[idx].operator = e.target.value;
                      setThresholds(updated);
                    }}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                  >
                    <option value="<">&lt;</option>
                    <option value="<=">&le;</option>
                    <option value=">">&gt;</option>
                    <option value=">=">&ge;</option>
                  </select>

                  <input
                    type="number"
                    step="any"
                    value={th.value}
                    onChange={(e) => {
                      const updated = [...thresholds];
                      updated[idx].value = parseFloat(e.target.value) || 0;
                      setThresholds(updated);
                    }}
                    className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono"
                  />

                  <button
                    onClick={() => handleRemoveThreshold(idx)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={handleAddThreshold}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              <Plus className="w-4 h-4" /> Add Threshold Gate
            </button>
          </div>

          {/* Docker Scaling Tip Box */}
          <div className="bg-gradient-to-br from-blue-950/40 to-slate-900 border border-blue-900/40 rounded-xl p-4 text-xs text-slate-300 space-y-2">
            <div className="font-bold text-blue-400 flex items-center gap-1.5">
              <span>🐳 Horizontal Scaling Tip</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              To test massive scale (millions of concurrent requests), scale the load workers across multiple containers:
            </p>
            <div className="p-2 rounded bg-slate-950 font-mono text-[11px] text-cyan-300 border border-slate-800">
              docker compose up -d --scale load-worker=10
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
