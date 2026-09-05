import React from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Video, LogOut } from 'lucide-react';

export const Navbar: React.FC<{ onNavigate?: (page: string) => void }> = ({ onNavigate }) => {
  const { user, logout } = useAuth();

  return (
    <nav className="glass-panel sticky top-0 z-40 px-6 py-3 border-b border-slate-200 bg-white/85 shadow-xs">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div
          onClick={() => onNavigate && onNavigate('dashboard')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
            <Video className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-slate-800">
                FocusMeet AI
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                Zero-Link
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Attention-Aware & Secure Conferencing</p>
          </div>
        </div>

        {/* User profile */}
        {user && (
          <div className="flex items-center gap-4">
            {/* Profile Pill */}
            <div className="flex items-center gap-3 bg-slate-100/80 pl-2 pr-3.5 py-1.5 rounded-full border border-slate-200">
              <img
                src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`}
                alt={user.displayName}
                className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-300"
              />
              <div className="text-left">
                <div className="text-xs font-semibold text-slate-800 leading-tight">{user.displayName}</div>
                <div className="text-[10px] text-slate-500 leading-none flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                  @{user.username}
                </div>
                {user.studentId && <div className="text-[9px] text-slate-400 leading-none mt-0.5">ID: {user.studentId}</div>}
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              title="Logout"
              className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-slate-100 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};
