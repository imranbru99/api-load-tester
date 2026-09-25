'use client';

import React from 'react';
import {
  Activity,
  Layers,
  Zap,
  History,
  GitCompare,
  Server,
  Settings2,
  Terminal,
  Cpu
} from 'lucide-react';

export type TabType = 'dashboard' | 'collections' | 'load-studio' | 'live-monitor' | 'history' | 'compare' | 'mocks' | 'environments';

interface NavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  activeRunId?: string;
  isRunActive?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  activeRunId,
  isRunActive,
}) => {
  const navItems: Array<{ id: TabType; label: string; icon: React.ReactNode; badge?: string; pulse?: boolean }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <Activity className="w-4 h-4" /> },
    { id: 'collections', label: 'Collections & Tests', icon: <Layers className="w-4 h-4" /> },
    { id: 'load-studio', label: 'Load Test Studio', icon: <Zap className="w-4 h-4" /> },
    {
      id: 'live-monitor',
      label: 'Live Monitor',
      icon: <Cpu className="w-4 h-4" />,
      badge: isRunActive ? 'LIVE' : undefined,
      pulse: isRunActive,
    },
    { id: 'history', label: 'Runs History', icon: <History className="w-4 h-4" /> },
    { id: 'compare', label: 'Run Comparison', icon: <GitCompare className="w-4 h-4" /> },
    { id: 'mocks', label: 'Mock Servers', icon: <Server className="w-4 h-4" /> },
    { id: 'environments', label: 'Environments', icon: <Settings2 className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-[#090d16] flex flex-col justify-between p-4 select-none shrink-0 h-screen sticky top-0">
      <div>
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 py-3 mb-6 border-b border-slate-800/80">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-blue-600 via-cyan-500 to-indigo-600 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-blue-500/20">
            ⚡
          </div>
          <div>
            <div className="font-bold text-slate-100 tracking-tight flex items-center gap-1.5">
              API Load Tester
              <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                PRO
              </span>
            </div>
            <div className="text-xs text-slate-500 font-mono">alt-v1.0.0</div>
          </div>
        </div>

        {/* Workspace select */}
        <div className="mb-6 px-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Workspace
          </label>
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200">
            <span className="font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Default Workspace
            </span>
            <span className="text-slate-500">v1</span>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={isActive ? 'text-blue-400' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      item.pulse
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="border-t border-slate-800/80 pt-4 px-2 space-y-3">
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" /> CLI Ready
            </span>
            <span className="font-mono text-emerald-400 font-bold">alt run</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono break-all">
            alt run test.json --vus 1000
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            Distributed Mesh
          </span>
          <span className="font-mono text-slate-400">Dockerized</span>
        </div>
      </div>
    </aside>
  );
};
