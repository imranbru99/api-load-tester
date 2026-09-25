'use client';

import React, { useState, useEffect } from 'react';
import { Server, Plus, Trash2, Globe, Clock, Check, ExternalLink } from 'lucide-react';
import { fetchJson } from '../lib/api';

export const MockManager: React.FC = () => {
  const [mocks, setMocks] = useState<any[]>([]);
  const [method, setMethod] = useState<string>('GET');
  const [path, setPath] = useState<string>('/users');
  const [statusCode, setStatusCode] = useState<number>(200);
  const [delayMs, setDelayMs] = useState<number>(0);
  const [responseBody, setResponseBody] = useState<string>('{\n  "status": "success",\n  "users": [\n    {"id": 1, "name": "Alice"},\n    {"id": 2, "name": "Bob"}\n  ]\n}');

  useEffect(() => {
    loadMocks();
  }, []);

  const loadMocks = async () => {
    try {
      const data = await fetchJson('/api/mocks');
      setMocks(data);
    } catch {}
  };

  const handleCreateMock = async () => {
    try {
      await fetchJson('/api/mocks', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId: 'default',
          method,
          path,
          statusCode,
          delayMs,
          responseBody
        })
      });
      loadMocks();
    } catch (err: any) {
      alert(`Error creating mock: ${err.message}`);
    }
  };

  const handleDeleteMock = async (id: string) => {
    try {
      await fetchJson(`/api/mocks/${id}`, { method: 'DELETE' });
      loadMocks();
    } catch (err: any) {
      alert(`Error deleting mock: ${err.message}`);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2.5">
          <Server className="w-5 h-5 text-emerald-400" />
          Mock Servers & Contract Testing Engine
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Create mock HTTP responses with custom status codes, simulated delays, and payloads accessible at <code className="text-blue-400">/mock/default/*</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Creator Panel */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" /> Add Mock Endpoint
          </h2>

          <div className="flex gap-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-bold text-emerald-400"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>

            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/api/v1/items"
              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Status Code</label>
              <input
                type="number"
                value={statusCode}
                onChange={(e) => setStatusCode(parseInt(e.target.value, 10) || 200)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Simulated Latency (ms)</label>
              <input
                type="number"
                value={delayMs}
                onChange={(e) => setDelayMs(parseInt(e.target.value, 10) || 0)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Response Body (JSON)</label>
            <textarea
              rows={6}
              value={responseBody}
              onChange={(e) => setResponseBody(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-300"
            />
          </div>

          <button
            onClick={handleCreateMock}
            className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition"
          >
            Create Mock Endpoint
          </button>
        </div>

        {/* Existing Mocks */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Active Mock Endpoints ({mocks.length})
          </h2>

          <div className="space-y-2">
            {mocks.map((m) => (
              <div key={m.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {m.method}
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-200">{m.path}</span>
                    <span className="text-[11px] text-slate-400 font-mono">({m.status_code})</span>
                    {m.delay_ms > 0 && (
                      <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {m.delay_ms}ms
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-1">
                    Live URL: <code className="text-blue-400">/mock/default{m.path}</code>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/mock/default${m.path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-900"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => handleDeleteMock(m.id)}
                    className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-900"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {mocks.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                No mock endpoints created yet. Add one to mock third-party dependencies or contract APIs.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
