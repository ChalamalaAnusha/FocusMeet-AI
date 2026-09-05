import React, { useRef, useEffect } from 'react';
import { Mic, MicOff, Eye, EyeOff, Shield, Sparkles, User as UserIcon } from 'lucide-react';
import { FocusMetric } from '../types/index.js';
import { FOCUS_THRESHOLDS, getFocusStatusLabel } from '../ai/focusConfig.js';

interface VideoTileProps {
  stream: MediaStream | null;
  username: string;
  isLocal?: boolean;
  isHost?: boolean;
  isCameraBroadcasting?: boolean;
  isMicMuted?: boolean;
  focusMetric?: FocusMetric | null;
  avatar?: string;
  isSpeaking?: boolean;
  showOwnFocusScore?: boolean;
}

export const VideoTile: React.FC<VideoTileProps> = ({
  stream,
  username,
  isLocal = false,
  isHost = false,
  isCameraBroadcasting = true,
  isMicMuted = false,
  focusMetric,
  avatar,
  isSpeaking = false,
  showOwnFocusScore = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasUsableFocus = !!focusMetric && focusMetric.faceDetected && focusMetric.gazeDirection !== 'unavailable';
  const displayScore = focusMetric?.score ?? 0;

  const getScoreColor = (sc: number) => {
    if (sc >= FOCUS_THRESHOLDS.focused) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    if (sc >= FOCUS_THRESHOLDS.moderate) return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    if (sc >= 0) return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  };

  const getScoreLabel = (sc: number) => getFocusStatusLabel(sc);

  return (
    <div
      className={`relative w-full h-full min-h-[220px] rounded-2xl overflow-hidden glass-panel border ${
        isSpeaking ? 'border-indigo-500 ring-2 ring-indigo-500/40' : 'border-slate-800'
      } flex items-center justify-center bg-slate-900/90 shadow-xl group transition-all`}
    >
      {/* Video Element (Active when stream available & broadcasting, OR local stream for AI engine) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // Mute local video to prevent audio feedback
        className={`w-full h-full object-cover transform ${isLocal ? 'scale-x-[-1]' : ''} ${
          !isCameraBroadcasting && !isLocal ? 'hidden' : 'block'
        }`}
      />

      {/* Privacy Camera Mode / Camera Off Placeholder for Peers */}
      {(!isCameraBroadcasting || (!stream && !isLocal)) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-900 z-10">
          <div className="relative mb-3">
            <div className="w-20 h-20 rounded-full bg-indigo-950/80 border-2 border-indigo-500/40 flex items-center justify-center shadow-lg">
              {avatar ? (
                <img src={avatar} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <UserIcon className="w-10 h-10 text-indigo-300" />
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-slate-800 border border-slate-700 text-indigo-300">
              <Shield className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-semibold text-sm text-slate-200">{username}</p>
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-300">
            <EyeOff className="w-3 h-3 text-indigo-400" />
            <span>Privacy Camera Mode Active</span>
          </div>
          {isLocal && (
            <span className="text-[10px] text-slate-400 mt-1 max-w-[200px] text-center">
              (AI calculates attention locally. Video is hidden from others)
            </span>
          )}
        </div>
      )}

      {isLocal && showOwnFocusScore && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
          <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold backdrop-blur-md shadow-md ${hasUsableFocus ? getScoreColor(displayScore) : 'bg-white/95 text-slate-600 border-slate-200'}`}>
            <Sparkles className="w-3 h-3" />
            <span>{hasUsableFocus ? `${displayScore}%` : 'Analyzing attention...'}</span>
            {hasUsableFocus && <span className="hidden sm:inline font-normal text-[10px] opacity-80">({getScoreLabel(displayScore)})</span>}
          </div>
        </div>
      )}

      {/* Participant Identity & Mic Status (Bottom Bar) */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 shadow-md">
          <span className="text-xs font-medium text-slate-100 flex items-center gap-1.5">
            {username}
            {isLocal && <span className="text-[10px] text-indigo-400 font-normal">(You)</span>}
            {showOwnFocusScore && (
              <span className="text-[10px] text-emerald-300 font-medium">
                — Focus: {hasUsableFocus ? `${displayScore}% — ${getScoreLabel(displayScore)}` : 'Analyzing attention...'}
              </span>
            )}
            {isHost && (
              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                Host
              </span>
            )}
          </span>
        </div>

        {/* Mic Indicator */}
        <div
          className={`p-1.5 rounded-lg backdrop-blur-md border ${
            isMicMuted
              ? 'bg-rose-500/20 border-rose-500/30 text-rose-300'
              : 'bg-slate-950/80 border-slate-800 text-emerald-400'
          }`}
        >
          {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </div>
      </div>
    </div>
  );
};
