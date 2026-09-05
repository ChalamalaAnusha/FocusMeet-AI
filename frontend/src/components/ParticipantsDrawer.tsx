import React, { useMemo, useState } from 'react';
import { X, ShieldAlert, VolumeX, AlertTriangle, UserX, Search, MicOff } from 'lucide-react';
import { ModerationEvent } from '../types/index.js';

interface ParticipantItem {
  userId: string;
  username: string;
  socketId: string;
  avatar?: string;
  isHost?: boolean;
  isMuted?: boolean;
  focusScore?: number;
  focusCategory?: 'focused' | 'moderate' | 'low' | 'distracted';
  videoOff?: boolean;
}

interface ParticipantsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  participants: ParticipantItem[];
  currentUserId: string;
  isHost: boolean;
  aggregateAttention?: {
    totalStudents: number;
    lowAttentionCount: number;
    lowAttentionPercentage: number;
    status: 'low' | 'stable';
  } | null;
  averageFocus?: number;
  moderationEvents: ModerationEvent[];
  onHostAction: (targetUserId: string, action: 'warn' | 'mute' | 'kick' | 'block') => void;
}

export const ParticipantsDrawer: React.FC<ParticipantsDrawerProps> = ({
  isOpen,
  onClose,
  participants,
  currentUserId,
  isHost,
  aggregateAttention,
  moderationEvents,
  onHostAction,
  averageFocus,
}) => {
  const [search, setSearch] = useState('');
  const visibleParticipants = useMemo(
    () => participants.filter((participant) => participant.username.toLowerCase().includes(search.toLowerCase().trim())),
    [participants, search]
  );

  if (!isOpen) return null;

  const getFocus = (score?: number, videoOff = false) => {
    if (videoOff) return { label: 'Attention unavailable', color: 'text-slate-500', badge: 'bg-slate-100 border-slate-200' };
    if (score === undefined) return { label: 'Analyzing attention...', color: 'text-slate-500', badge: 'bg-slate-100 border-slate-200' };
    if (score >= 80) return { label: 'Focused', color: 'text-emerald-700', badge: 'bg-emerald-50 border-emerald-200' };
    if (score >= 60) return { label: 'Moderate', color: 'text-amber-700', badge: 'bg-amber-50 border-amber-200' };
    return { label: 'Low Focus', color: 'text-rose-700', badge: 'bg-rose-50 border-rose-200' };
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 w-84 md:w-96 z-40 glass-panel border-l border-slate-200 bg-white shadow-2xl flex flex-col animate-slideLeft">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">
            Participants ({participants.length})
          </h3>
          <p className="text-[11px] text-slate-500">
            {isHost ? 'Host Meeting' : 'Meeting Attendees'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {isHost && (
          <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Average Focus</div>
            <div className="mt-1 text-3xl font-bold text-slate-900">{averageFocus !== undefined ? `${averageFocus}%` : 'Analyzing...'}</div>
            {aggregateAttention && <div className="mt-1 text-[11px] text-slate-600">{aggregateAttention.totalStudents - aggregateAttention.lowAttentionCount} of {aggregateAttention.totalStudents} students currently focused</div>}
          </div>
        )}

        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-400">
          <Search className="w-4 h-4" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search participants" className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400" />
        </label>
        {/* Host-only Aggregate Attention Overview (Requirement 2 & 3) */}
        {/* Participants List */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
            In Call ({participants.length})
          </h4>
          <div className="space-y-2">
            {visibleParticipants.map((p) => {
              const isMe = p.userId === currentUserId;

              return (
                <div
                  key={p.userId || p.socketId}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 overflow-hidden rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center font-bold text-xs text-indigo-700">
                        {p.avatar ? <img src={p.avatar} alt="" className="h-full w-full object-cover" /> : p.username.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                          {p.username}
                          {isMe && <span className="text-[10px] text-indigo-600 font-normal">(You)</span>}
                          {p.isHost && (
                            <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 font-bold">
                              Host
                            </span>
                          )}
                        </div>
                        {(!isHost && isMe && !p.isHost) && <div className={`text-[10px] mt-0.5 font-medium ${getFocus(p.focusScore).color}`}>Your Focus: {p.focusScore !== undefined ? `${p.focusScore}% ${getFocus(p.focusScore).label}` : getFocus().label}</div>}
                      </div>
                    </div>
                    {isHost && !p.isHost && <div className="text-right"><div className="text-lg font-bold text-slate-900">{p.videoOff ? 'Video Off' : p.focusScore !== undefined ? `${p.focusScore}%` : '—'}</div><div className={`text-[10px] font-medium ${getFocus(p.focusScore, p.videoOff).color}`}>{getFocus(p.focusScore, p.videoOff).label}</div></div>}
                  </div>

                  {isHost && p.isHost === false && !p.videoOff && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${p.focusScore === undefined ? 'bg-slate-300' : p.focusScore >= 80 ? 'bg-emerald-500' : p.focusScore >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${p.focusScore ?? 0}%` }} /></div>}

                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500"><span className={`h-1.5 w-1.5 rounded-full ${p.isMuted ? 'bg-rose-400' : 'bg-emerald-500'}`} />{p.isMuted ? <><MicOff className="w-3 h-3" /> Muted</> : 'Online'}</div>

                  {/* Host Moderation Quick Actions (Requirement 5: Warn, Mute, Block/Remove) */}
                  {isHost && !isMe && (
                    <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center gap-1.5 justify-end">
                      <button
                        onClick={() => onHostAction(p.userId, 'warn')}
                        title="Send Official Warning"
                        className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-medium flex items-center gap-1 transition cursor-pointer"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Warn
                      </button>
                      <button
                        onClick={() => onHostAction(p.userId, 'mute')}
                        title="Remotely Mute Microphone"
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[10px] font-medium flex items-center gap-1 transition cursor-pointer"
                      >
                        <VolumeX className="w-3 h-3" />
                        Mute
                      </button>
                      <button
                        onClick={() => onHostAction(p.userId, 'block')}
                        title="Remove and Block from Meeting"
                        className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-medium flex items-center gap-1 transition cursor-pointer"
                      >
                        <UserX className="w-3 h-3" />
                        Block/Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Moderation Evidence & Violation Audit Log */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
            Moderation Incident Log ({moderationEvents.length})
          </h4>

          {moderationEvents.length === 0 ? (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 text-center">
              No violations detected. Meeting behavior is clean.
            </div>
          ) : (
            <div className="space-y-2">
              {moderationEvents.map((evt) => (
                <div
                  key={evt._id || Math.random().toString()}
                  className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200 text-xs space-y-1 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-rose-800 flex items-center gap-1">
                      @{evt.username} ({evt.source.toUpperCase()})
                    </span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-bold">
                      {evt.violationType}
                    </span>
                  </div>
                  <p className="text-slate-700 text-[11px] italic bg-white p-1.5 rounded border border-rose-200">
                    "{evt.snippet}"
                  </p>
                  <div className="text-[9px] text-slate-500 flex items-center justify-between pt-0.5">
                    <span>Action: {evt.actionTaken}</span>
                    <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
