import React from 'react';
import { useSocket, IncomingCallData } from '../context/SocketContext.js';
import { PhoneCall, PhoneOff, Video, Shield } from 'lucide-react';
import { api } from '../services/api.js';

export const IncomingCallModal: React.FC<{ onJoinMeeting: (meetingId: string) => void }> = ({
  onJoinMeeting,
}) => {
  const { incomingCall, clearIncomingCall } = useSocket();

  if (!incomingCall) return null;

  const handleAccept = async () => {
    try {
      if (incomingCall.invitationId) {
        await api.respondInvitation(incomingCall.invitationId, 'accepted');
      }
    } catch (e) {
      console.warn('Accept call api notice:', e);
    }
    const mId = incomingCall.meetingId;
    clearIncomingCall();
    onJoinMeeting(mId);
  };

  const handleDecline = async () => {
    try {
      if (incomingCall.invitationId) {
        await api.respondInvitation(incomingCall.invitationId, 'declined');
      }
    } catch (e) {
      console.warn('Decline call api notice:', e);
    }
    clearIncomingCall();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div className="glass-panel-glow w-full max-w-md p-6 rounded-2xl border border-indigo-200 bg-white text-center relative overflow-hidden shadow-2xl">
        {/* Animated ambient backdrop */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-200/30 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-200/30 rounded-full blur-3xl pointer-events-none"></div>

        {/* Pulsing Call Icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-5 relative">
          <span className="absolute inset-0 rounded-full animate-ping bg-indigo-500/20"></span>
          <PhoneCall className="w-9 h-9 text-white animate-bounce" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold mb-3 shadow-2xs">
          <Shield className="w-3.5 h-3.5" />
          Direct App-to-App Meeting Invite
        </div>

        <h3 className="text-xl font-bold text-slate-900 mb-1">{incomingCall.title}</h3>
        <p className="text-sm text-slate-600 mb-6">
          <span className="font-semibold text-indigo-600">@{incomingCall.host.username}</span> is inviting you to join this meeting directly.
        </p>

        {/* Zero link notice */}
        <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 mb-6 text-left flex items-start gap-2.5">
          <Video className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            <strong>Zero Public Link Security:</strong> Only invited users with authenticated profiles can access this room.
          </span>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={handleDecline}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-semibold transition border border-slate-200 cursor-pointer"
          >
            <PhoneOff className="w-4 h-4" />
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-600/20 transition transform hover:-translate-y-0.5 cursor-pointer"
          >
            <PhoneCall className="w-4 h-4" />
            Accept & Join
          </button>
        </div>
      </div>
    </div>
  );
};
