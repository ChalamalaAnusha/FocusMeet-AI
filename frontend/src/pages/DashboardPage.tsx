import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../services/api.js';
import { Meeting, Invitation, User } from '../types/index.js';
import { ScheduleMeetingModal } from '../components/ScheduleMeetingModal.js';
import {
  Video,
  Plus,
  Calendar,
  Clock,
  ShieldCheck,
  Sparkles,
  Users,
  ChevronRight,
  BarChart2,
  AlertCircle,
  PhoneCall,
  Check,
  X,
} from 'lucide-react';

interface DashboardPageProps {
  onJoinMeeting: (meetingId: string) => void;
  onViewSummary: (meetingId: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onJoinMeeting, onViewSummary }) => {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [contacts, setContacts] = useState<User[]>([]);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    try {
      const [mRes, invRes, cRes] = await Promise.all([
        api.getMyMeetings(),
        api.getPendingInvitations(),
        api.getContacts(),
      ]);
      setMeetings(mRes);
      setInvitations(invRes);
      setContacts(cRes);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRespondInvitation = async (invId: string, status: 'accepted' | 'declined') => {
    try {
      await api.respondInvitation(invId, status);
      await loadData();
    } catch (err) {
      console.error('Respond invite error:', err);
    }
  };

  const handleMeetingCreated = (newMeeting: Meeting) => {
    setMeetings((prev) => [newMeeting, ...prev]);
    // Automatically join if scheduled for right now
    onJoinMeeting(newMeeting._id);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8 animate-fadeIn">
      {/* Welcome Banner */}
      <div className="glass-panel-glow p-8 rounded-3xl border border-indigo-200/80 relative overflow-hidden bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/50 shadow-sm">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-indigo-200/20 via-purple-200/20 to-transparent rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold mb-3 shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              Protected by Zero-Public-Link Security
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Welcome back, {user?.displayName || user?.username}!
            </h1>
            <p className="text-slate-600 text-sm mt-1 max-w-2xl">
              Host and join meetings with confidence. Our AI monitors real-time attention, protects participant privacy with local camera processing, and enforces abuse moderation.
            </p>
          </div>

          <button
            onClick={() => setIsScheduleOpen(true)}
            className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold text-sm shadow-lg shadow-indigo-500/20 transition transform hover:-translate-y-0.5 flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            Schedule / Start Meeting
          </button>
        </div>
      </div>

      {/* Pending Direct Invitations */}
      {invitations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-emerald-600" />
            Pending Meeting Invitations ({invitations.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {invitations.map((inv) => (
              <div
                key={inv._id}
                className="glass-panel p-5 rounded-2xl border border-emerald-200 bg-emerald-50/30 flex items-center justify-between gap-4 shadow-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{inv.meeting?.title}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold border border-emerald-200">
                      Direct Invite
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Invited by <strong className="text-indigo-600">@{inv.host?.username}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRespondInvitation(inv._id, 'declined')}
                    className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition border border-slate-200"
                    title="Decline"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async () => {
                      await handleRespondInvitation(inv._id, 'accepted');
                      onJoinMeeting(inv.meeting._id);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition"
                  >
                    <Check className="w-4 h-4" />
                    Join Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid: Meetings & Contacts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Meetings List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              Your Meetings ({meetings.length})
            </h2>
            <span className="text-xs text-slate-500">Authenticated Access Only</span>
          </div>

          {meetings.length === 0 ? (
            <div className="glass-panel p-10 rounded-3xl border border-slate-200 bg-white text-center space-y-3 shadow-xs">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                <Video className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-slate-800">No scheduled meetings yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Create an invitation-only meeting and select attendees. No links to copy or leak!
              </p>
              <button
                onClick={() => setIsScheduleOpen(true)}
                className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition"
              >
                Schedule First Meeting
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {meetings.map((m) => {
                const isHost = m.host === user?.id;
                const isLive = m.status === 'live';
                const isEnded = m.status === 'ended';

                return (
                  <div
                    key={m._id}
                    className={`glass-panel p-5 rounded-2xl border transition flex items-center justify-between gap-4 bg-white shadow-xs ${
                      isLive ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-sm">{m.title}</h3>
                        {isLive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 text-[10px] font-bold uppercase animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Live Now
                          </span>
                        )}
                        {isEnded && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold border border-slate-200">
                            Ended
                          </span>
                        )}
                      </div>

                      {m.description && (
                        <p className="text-xs text-slate-600 line-clamp-1">{m.description}</p>
                      )}

                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(m.scheduledAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {m.invitedUsers.length} Invited
                        </span>
                        {isHost ? (
                          <span className="text-indigo-600 font-semibold">You are Host</span>
                        ) : (
                          <span>Host: @{m.hostName || 'Organizer'}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isEnded ? (
                        <button
                          onClick={() => onViewSummary(m._id)}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition"
                        >
                          <BarChart2 className="w-3.5 h-3.5 text-indigo-600" />
                          View Report
                        </button>
                      ) : (
                        <button
                          onClick={() => onJoinMeeting(m._id)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition"
                        >
                          <Video className="w-3.5 h-3.5" />
                          Join Meeting
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Contacts & System Directory Sidebar */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              Direct Contacts Directory
            </h2>
          </div>

          <div className="glass-panel p-4 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-3">
            <p className="text-xs text-slate-500 leading-relaxed">
              Users you can directly invite to meetings without generating insecure links:
            </p>

            <div className="space-y-2">
              {contacts.map((c) => (
                <div
                  key={c.id || (c as any)._id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/30 transition text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src={c.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${c.username}`}
                      alt=""
                      className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-200"
                    />
                    <div>
                      <div className="font-semibold text-slate-800">{c.displayName}</div>
                      <div className="text-[10px] text-slate-500">@{c.username}</div>
                    </div>
                  </div>

                  <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Ready
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Modal */}
      <ScheduleMeetingModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        onMeetingCreated={handleMeetingCreated}
      />
    </div>
  );
};
