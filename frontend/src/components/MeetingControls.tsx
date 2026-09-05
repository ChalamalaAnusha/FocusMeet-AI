import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Share2,
  MessageSquare,
  Users,
  PhoneOff,
  Shield,
} from 'lucide-react';

interface MeetingControlsProps {
  isMicMuted: boolean;
  isCameraBroadcasting: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  isParticipantsOpen: boolean;
  isHost: boolean;
  onToggleMic: () => void;
  onToggleCameraBroadcast: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onLeaveMeeting: () => void;
  onReaction: (reaction: string) => void;
}

export const MeetingControls: React.FC<MeetingControlsProps> = ({
  isMicMuted,
  isCameraBroadcasting,
  isScreenSharing,
  isChatOpen,
  isParticipantsOpen,
  isHost,
  onToggleMic,
  onToggleCameraBroadcast,
  onToggleScreenShare,
  onToggleChat,
  onToggleParticipants,
  onLeaveMeeting,
  onReaction,
}) => {
  return (
    <div className="glass-panel-glow px-5 py-3 rounded-2xl border border-slate-200 bg-white/95 shadow-lg flex items-center justify-center gap-3 md:gap-4 max-w-fit mx-auto">
      {/* Microphone */}
      <button
        onClick={onToggleMic}
        title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        className={`p-3.5 rounded-xl transition font-medium flex items-center justify-center cursor-pointer ${
          isMicMuted
            ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
        }`}
      >
        {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>

      {/* Video / Privacy Camera Broadcast */}
      <div className="relative group">
        <button
          onClick={onToggleCameraBroadcast}
          title={
            isCameraBroadcasting
              ? 'Switch to Privacy Camera Mode (Hide Video from Peers, Keep AI Focus)'
              : 'Broadcast Video to Room'
          }
          className={`p-3.5 rounded-xl transition font-medium flex items-center justify-center cursor-pointer ${
            !isCameraBroadcasting
              ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
          }`}
        >
          {!isCameraBroadcasting ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>
        {/* Tooltip helper */}
        <span className="absolute -top-10 left-1/2 transform -translate-x-1/2 whitespace-nowrap bg-slate-800 border border-slate-700 text-slate-100 text-[11px] px-2 py-1 rounded shadow-md pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
          {!isCameraBroadcasting ? 'Privacy Mode (Video Hidden)' : 'Broadcasting Video'}
        </span>
      </div>

      {/* Screen Share */}
      <button
        onClick={onToggleScreenShare}
        title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
        className={`p-3.5 rounded-xl transition font-medium flex items-center justify-center cursor-pointer ${
          isScreenSharing
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
        }`}
      >
        <Share2 className="w-5 h-5" />
      </button>

      <div className="h-6 w-[1px] bg-slate-200 my-auto"></div>

      {/* In-Meeting Chat */}
      <button
        onClick={onToggleChat}
        title="In-Meeting Chat"
        className={`p-3.5 rounded-xl transition font-medium flex items-center justify-center cursor-pointer ${
          isChatOpen
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
        }`}
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      {/* Reactions */}
      <div className="relative group">
        <button
          type="button"
          title="Send a reaction"
          className="p-3.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 transition cursor-pointer"
        >
          <span className="text-lg leading-none">😊</span>
        </button>
        <div className="pointer-events-none absolute bottom-14 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-2xl border border-slate-200 bg-white p-2 opacity-0 shadow-xl transition group-hover:pointer-events-auto group-hover:opacity-100">
          {['👍', '❤️', '😂', '👏', '🎉', '😮', '😢', '🔥'].map((reaction) => (
            <button
              key={reaction}
              type="button"
              onClick={() => onReaction(reaction)}
              title={`Send ${reaction}`}
              className="rounded-lg p-2 text-lg transition hover:bg-indigo-50 hover:scale-110 cursor-pointer"
            >
              {reaction}
            </button>
          ))}
        </div>
      </div>

      {/* Participants & Moderation */}
      <button
        onClick={onToggleParticipants}
        title="Participants & Moderation Console"
        className={`p-3.5 rounded-xl transition font-medium flex items-center justify-center cursor-pointer ${
          isParticipantsOpen
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
        }`}
      >
        <Users className="w-5 h-5" />
      </button>

      <div className="h-6 w-[1px] bg-slate-200 my-auto"></div>

      {/* Leave / End Meeting */}
      <button
        onClick={onLeaveMeeting}
        title={isHost ? 'End Meeting for All' : 'Leave Meeting'}
        className="p-3.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-semibold transition shadow-md shadow-rose-600/20 flex items-center gap-2 cursor-pointer"
      >
        <PhoneOff className="w-5 h-5" />
        <span className="hidden md:inline text-xs font-bold">{isHost ? 'End Meeting' : 'Leave'}</span>
      </button>
    </div>
  );
};
