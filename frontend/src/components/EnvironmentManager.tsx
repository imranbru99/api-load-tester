'use client';

import React, { useState, useEffect } from 'react';
import { Settings2, Plus, Trash2, Key, Check } from 'lucide-react';
import { fetchJson } from '../lib/api';

export const EnvironmentManager: React.FC = () => {
  const [environments, setEnvironments] = useState<any[]>([]);
  const [selectedEnv, setSelectedEnv] = useState<any | null>(null);
  const [varKey, setVarKey] = useState<string>('');
  const [varValue, setVarValue] = useState<string>('');

  useEffect(() => {
    loadEnvs();
  }, []);

  const loadEnvs = async () => {
    try {
      const data = await fetchJson('/api/environments');
      setEnvironments(data);
      if (data.length > 0 && !selectedEnv) {
        setSelectedEnv(data[0]);
      }
    } catch {}
  };

  const handleAddVariable = async () => {
    if (!selectedEnv || !varKey.trim()) return;
    const updatedVars = { ...(selectedEnv.variables || {}), [varKey.trim()]: varValue };

    try {
      const updated = await fetchJson(`/api/environments/${selectedEnv.id}`, {
        method: 'PUT',
        body: JSON.stringify({ variables: updatedVars })
      });
      setSelectedEnv(updated);
      setVarKey('');
      setVarValue('');
      loadEnvs();
    } catch (err: any) {
      alert(`Error updating environment: ${err.message}`);
    }
  };

  const handleDeleteVariable = async (key: string) => {
    if (!selectedEnv) return;
    const updatedVars = { ...(selectedEnv.variables || {}) };
    delete updatedVars[key];

    try {
      const updated = await fetchJson(`/api/environments/${selectedEnv.id}`, {
        method: 'PUT',
        body: JSON.stringify({ variables: updatedVars })
      });
      setSelectedEnv(updated);
      loadEnvs();
    } catch (err: any) {
      alert(`Error updating environment: ${err.message}`);
    }
  };

  const handleCreateEnv = async () => {
    const name = prompt('Environment Name:', 'Staging Environment');
    if (!name) return;

    try {
      const res = await fetchJson('/api/environments', {
        method: 'POST',
        body: JSON.stringify({
          name,
          workspaceId: 'default',
          variables: { baseUrl: 'https://staging.example.com', apiKey: 'sec_123' },
          isActive: false
        })
      });
      await loadEnvs();
      setSelectedEnv(res);
    } catch (err: any) {
      alert(`Error creating environment: ${err.message}`);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2.5">
            <Settings2 className="w-5 h-5 text-cyan-400" />
            Environment Variables & Secret Vault
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Store workspace variables accessible as <code className="text-blue-400 font-mono">{'{{variableName}}'}</code> in requests and URLs.
          </p>
        </div>

        <button
          onClick={handleCreateEnv}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
        >
          <Plus className="w-4 h-4" /> New Environment
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Environment list */}
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase text-slate-400 mb-2">Environments</div>
          {environments.map((env) => (
            <button
              key={env.id}
              onClick={() => setSelectedEnv(env)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${
                selectedEnv?.id === env.id
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                  : 'text-slate-400 hover:bg-slate-900'
              }`}
            >
              {env.name}
            </button>
          ))}
        </div>

        {/* Variables Table */}
        <div className="md:col-span-3 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200">
              Variables in <span className="text-cyan-400">{selectedEnv?.name}</span>
            </h2>
          </div>

          <div className="space-y-2">
            {selectedEnv && selectedEnv.variables && Object.keys(selectedEnv.variables).length > 0 ? (
              Object.entries(selectedEnv.variables).map(([k, v]: any) => (
                <div key={k} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-cyan-400 font-bold">{`{{${k}}}`}</span>
                    <span className="text-slate-300 font-mono">{String(v)}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteVariable(k)}
                    className="p-1 rounded text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-slate-500 text-xs italic">
                No variables defined in this environment yet.
              </div>
            )}
          </div>

          {/* Add variable */}
          <div className="pt-3 border-t border-slate-800 flex gap-2">
            <input
              type="text"
              placeholder="Variable Key (e.g. baseUrl)"
              value={varKey}
              onChange={(e) => setVarKey(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200"
            />
            <input
              type="text"
              placeholder="Variable Value"
              value={varValue}
              onChange={(e) => setVarValue(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200"
            />
            <button
              onClick={handleAddVariable}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
