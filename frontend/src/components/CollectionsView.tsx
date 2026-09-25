'use client';

import React, { useState, useEffect } from 'react';
import {
  Layers, Plus, Play, Upload, Download, Trash2, CheckCircle2,
  XCircle, Clock, Code, Terminal, FileCode, Check, Send
} from 'lucide-react';
import { fetchJson } from '../lib/api';

export const CollectionsView: React.FC = () => {
  const [collections, setCollections] = useState<any[]>([]);
  const [selectedCol, setSelectedCol] = useState<any | null>(null);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'auth' | 'body' | 'scripts' | 'assertions'>('body');
  const [responseResult, setResponseResult] = useState<any | null>(null);
  const [runningSingle, setRunningSingle] = useState<boolean>(false);
  const [runningSuite, setRunningSuite] = useState<boolean>(false);
  const [suiteReport, setSuiteReport] = useState<any | null>(null);
  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);
  const [importText, setImportText] = useState<string>('');
  const [importType, setImportType] = useState<'postman' | 'openapi'>('postman');

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    try {
      const list = await fetchJson('/api/collections');
      setCollections(list);
      if (list.length > 0 && !selectedCol) {
        loadCollectionDetails(list[0].id);
      }
    } catch {
      // ignore
    }
  };

  const loadCollectionDetails = async (id: string) => {
    try {
      const data = await fetchJson(`/api/collections/${id}`);
      setSelectedCol(data);
      if (data.data?.items?.length > 0) {
        setSelectedItem(data.data.items[0]);
      } else {
        setSelectedItem(null);
      }
    } catch (err: any) {
      alert(`Error loading collection: ${err.message}`);
    }
  };

  const handleCreateCollection = async () => {
    const name = prompt('Enter collection name:', 'New Test Suite');
    if (!name) return;

    try {
      const newCol = await fetchJson('/api/collections', {
        method: 'POST',
        body: JSON.stringify({
          name,
          workspaceId: 'default',
          data: {
            name,
            items: [
              {
                id: 'item-1',
                name: 'Get API Health',
                method: 'GET',
                url: '{{baseUrl}}/health',
                headers: { 'Accept': 'application/json' },
                assertions: [
                  { type: 'status_code', operator: 'equals', value: 200 },
                  { type: 'response_time', value: 500 }
                ]
              }
            ]
          }
        })
      });
      await loadCollections();
      loadCollectionDetails(newCol.id);
    } catch (err: any) {
      alert(`Error creating collection: ${err.message}`);
    }
  };

  const handleSaveCollection = async () => {
    if (!selectedCol) return;
    try {
      await fetchJson(`/api/collections/${selectedCol.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: selectedCol.name,
          data: selectedCol.data
        })
      });
      alert('Collection saved successfully.');
    } catch (err: any) {
      alert(`Error saving collection: ${err.message}`);
    }
  };

  const handleAddRequest = () => {
    if (!selectedCol) return;
    const newItem = {
      id: `req-${Date.now()}`,
      name: 'New Request',
      method: 'GET',
      url: '{{baseUrl}}/api/resource',
      headers: {},
      assertions: [{ type: 'status_code', operator: 'equals', value: 200 }]
    };

    const updated = { ...selectedCol };
    updated.data.items = [...(updated.data.items || []), newItem];
    setSelectedCol(updated);
    setSelectedItem(newItem);
  };

  // Run single request
  const handleRunSingle = async () => {
    if (!selectedItem) return;
    setRunningSingle(true);
    setResponseResult(null);

    try {
      const singleCol = {
        name: 'Single Request Runner',
        items: [selectedItem]
      };

      const res = await fetchJson('/api/runs/functional', {
        method: 'POST',
        body: JSON.stringify({
          collectionData: singleCol,
          environment: { baseUrl: 'http://localhost:4000' }
        })
      });

      // Poll for completion
      if (res.runId) {
        setTimeout(async () => {
          const detail = await fetchJson(`/api/runs/${res.runId}`);
          if (detail.results && detail.results.length > 0) {
            setResponseResult(detail.results[0]);
          }
          setRunningSingle(false);
        }, 800);
      }
    } catch (err: any) {
      setResponseResult({ error: err.message, passed: false });
      setRunningSingle(false);
    }
  };

  // Run Entire Collection
  const handleRunSuite = async () => {
    if (!selectedCol) return;
    setRunningSuite(true);
    setSuiteReport(null);

    try {
      const res = await fetchJson('/api/runs/functional', {
        method: 'POST',
        body: JSON.stringify({
          collectionId: selectedCol.id,
          name: `Suite Run: ${selectedCol.name}`,
          environment: { baseUrl: 'http://localhost:4000' }
        })
      });

      setTimeout(async () => {
        const detail = await fetchJson(`/api/runs/${res.runId}`);
        setSuiteReport(detail);
        setRunningSuite(false);
      }, 1200);
    } catch (err: any) {
      alert(`Error running suite: ${err.message}`);
      setRunningSuite(false);
    }
  };

  const handleImportSubmit = async () => {
    try {
      let parsed = null;
      try {
        parsed = JSON.parse(importText);
      } catch {
        parsed = importText; // YAML or string
      }

      const endpoint = importType === 'postman' ? '/api/import/postman' : '/api/import/openapi';
      const bodyPayload = importType === 'postman' ? { postmanJson: parsed } : { spec: parsed };

      const imported = await fetchJson(endpoint, {
        method: 'POST',
        body: JSON.stringify(bodyPayload)
      });

      setImportModalOpen(false);
      setImportText('');
      await loadCollections();
      loadCollectionDetails(imported.id);
      alert('Successfully imported collection!');
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    }
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] overflow-hidden">
      {/* Sidebar: Collections list */}
      <div className="w-72 border-r border-slate-800 bg-slate-950 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" /> Collections
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setImportModalOpen(true)}
                title="Import Postman / OpenAPI"
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleCreateCollection}
                title="Create Collection"
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Collection selector */}
          <div className="p-2 space-y-1 overflow-y-auto max-h-48 border-b border-slate-800">
            {collections.map((col) => (
              <button
                key={col.id}
                onClick={() => loadCollectionDetails(col.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${
                  selectedCol?.id === col.id
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                {col.name}
              </button>
            ))}
          </div>

          {/* Requests list within selected collection */}
          <div className="p-3">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-slate-400 mb-2">
              <span>Requests</span>
              <button
                onClick={handleAddRequest}
                className="text-blue-400 hover:text-blue-300 font-bold"
              >
                + Add
              </button>
            </div>

            <div className="space-y-1">
              {selectedCol?.data?.items?.map((item: any) => {
                const isSel = selectedItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedItem(item);
                      setResponseResult(null);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition flex items-center gap-2 ${
                      isSel ? 'bg-slate-800 text-slate-100 font-semibold' : 'text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    <span className={`text-[10px] font-mono font-bold uppercase w-10 ${
                      item.method === 'GET' ? 'text-emerald-400' :
                      item.method === 'POST' ? 'text-blue-400' :
                      item.method === 'PUT' ? 'text-amber-400' :
                      item.method === 'DELETE' ? 'text-rose-400' : 'text-cyan-400'
                    }`}>
                      {item.method}
                    </span>
                    <span className="truncate">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Collection Actions */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          <button
            onClick={handleRunSuite}
            disabled={runningSuite}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-600/20"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            {runningSuite ? 'Running Suite...' : 'Run Entire Suite'}
          </button>
          <button
            onClick={handleSaveCollection}
            className="w-full px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold"
          >
            Save Collection
          </button>
        </div>
      </div>

      {/* Main Request Editor & Response Panel */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#080c14]">
        {selectedItem ? (
          <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
            {/* Request Bar */}
            <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
              <select
                value={selectedItem.method}
                onChange={(e) => setSelectedItem({ ...selectedItem, method: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-blue-400 focus:outline-none"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>

              <input
                type="text"
                value={selectedItem.url}
                onChange={(e) => setSelectedItem({ ...selectedItem, url: e.target.value })}
                placeholder="http://localhost:4000/api/endpoint"
                className="flex-1 px-3 py-2 rounded-lg bg-transparent text-xs font-mono text-slate-200 focus:outline-none"
              />

              <button
                onClick={handleRunSingle}
                disabled={runningSingle}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-md shadow-blue-500/20"
              >
                <Send className="w-3.5 h-3.5" />
                {runningSingle ? 'Sending...' : 'Send'}
              </button>
            </div>

            {/* Request tabs: Headers, Body, Scripts, Assertions */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex border-b border-slate-800 bg-slate-900/40 px-4">
                {(['body', 'headers', 'scripts', 'assertions'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2.5 text-xs font-semibold capitalize border-b-2 transition ${
                      activeTab === tab
                        ? 'border-blue-500 text-blue-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="p-4">
                {activeTab === 'body' && (
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Request Body (JSON)</label>
                    <textarea
                      rows={5}
                      value={typeof selectedItem.body?.content === 'object' ? JSON.stringify(selectedItem.body.content, null, 2) : (selectedItem.body?.content || '')}
                      onChange={(e) => {
                        let parsed = e.target.value;
                        try { parsed = JSON.parse(e.target.value); } catch {}
                        setSelectedItem({
                          ...selectedItem,
                          body: { type: 'json', content: parsed }
                        });
                      }}
                      className="w-full p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none"
                      placeholder='{\n  "title": "Item",\n  "status": "active"\n}'
                    />
                  </div>
                )}

                {activeTab === 'headers' && (
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Headers (JSON)</label>
                    <textarea
                      rows={4}
                      value={JSON.stringify(selectedItem.headers || {}, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          setSelectedItem({ ...selectedItem, headers: parsed });
                        } catch {}
                      }}
                      className="w-full p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none"
                    />
                  </div>
                )}

                {activeTab === 'scripts' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Pre-Request Script (JS Sandbox)</label>
                      <textarea
                        rows={3}
                        value={selectedItem.preRequestScript || ''}
                        onChange={(e) => setSelectedItem({ ...selectedItem, preRequestScript: e.target.value })}
                        placeholder="// e.g. pm.environment.set('token', 'auth_123');"
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Post-Response Script & Tests</label>
                      <textarea
                        rows={4}
                        value={selectedItem.postResponseScript || ''}
                        onChange={(e) => setSelectedItem({ ...selectedItem, postResponseScript: e.target.value })}
                        placeholder="// e.g. pm.test('Status is 200', () => { pm.expect(pm.response.code).to.equal(200); });"
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-blue-400"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'assertions' && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">Rule Assertions</label>
                    {(selectedItem.assertions || []).map((ast: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-800 text-xs">
                        <span className="font-mono text-cyan-400">{ast.type}</span>
                        <span className="text-slate-400">{ast.operator || '='}</span>
                        <span className="font-bold text-slate-200">{String(ast.value)}</span>
                      </div>
                    ))}
                    <p className="text-[11px] text-slate-500">
                      Configure custom schema, JSONPath, or header assertions directly or use the Post-Response Script tab.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Response Viewer */}
            {responseResult && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Response</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                      responseResult.statusCode < 400 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {responseResult.statusCode || 'ERR'}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {responseResult.responseTimeMs || 0} ms
                    </span>
                  </div>
                  <span className={`text-xs font-bold uppercase ${responseResult.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {responseResult.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>

                {/* Assertions report */}
                {responseResult.assertions && responseResult.assertions.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase font-bold text-slate-400">Assertions</div>
                    {responseResult.assertions.map((a: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {a.passed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                        <span className={a.passed ? 'text-slate-300' : 'text-rose-400'}>{a.name}</span>
                        {a.error && <span className="text-[11px] text-rose-500 font-mono">({a.error})</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Response Body Preview */}
                <div>
                  <div className="text-[11px] uppercase font-bold text-slate-400 mb-1">Body</div>
                  <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto max-h-48">
                    {responseResult.response_body_sample || responseResult.responseBodyPreview || 'No response body'}
                  </pre>
                </div>
              </div>
            )}

            {/* Suite Run Report */}
            {suiteReport && (
              <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Suite Run Finished
                  </h3>
                  <span className="text-xs text-slate-400">
                    Duration: {suiteReport.summary?.durationMs ? `${suiteReport.summary.durationMs}ms` : ''}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-3 text-center">
                  <div className="p-2 rounded bg-slate-900">
                    <div className="text-xs text-slate-400">Total Steps</div>
                    <div className="text-lg font-bold text-slate-100">{suiteReport.summary?.totalSteps || 0}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-900">
                    <div className="text-xs text-slate-400">Passed</div>
                    <div className="text-lg font-bold text-emerald-400">{suiteReport.summary?.passedSteps || 0}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-900">
                    <div className="text-xs text-slate-400">Failed</div>
                    <div className="text-lg font-bold text-rose-400">{suiteReport.summary?.failedSteps || 0}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-900">
                    <div className="text-xs text-slate-400">Assertions</div>
                    <div className="text-lg font-bold text-blue-400">{suiteReport.summary?.passedAssertions || 0}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
            <Layers className="w-10 h-10 mb-3 opacity-30" />
            <p>Select a collection and request from the sidebar or click "+ Add"</p>
          </div>
        )}
      </div>

      {/* Import Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-400" /> Import Tests
              </h3>
              <button onClick={() => setImportModalOpen(false)} className="text-slate-500 hover:text-slate-300">
                ✕
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setImportType('postman')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                  importType === 'postman' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400'
                }`}
              >
                Postman Collection v2.1
              </button>
              <button
                onClick={() => setImportType('openapi')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                  importType === 'openapi' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400'
                }`}
              >
                OpenAPI / Swagger
              </button>
            </div>

            <textarea
              rows={10}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste JSON or YAML content here..."
              className="w-full p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setImportModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-900 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleImportSubmit}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
