import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useSocket } from '../context/SocketContext.js';
import { api } from '../services/api.js';
import { WebRTCManager } from '../services/webrtc.js';
import { FocusDetectionEngine } from '../ai/focusEngine.js';
import { VoiceModerationEngine } from '../ai/speechModerator.js';
import {
  Meeting,
  ChatMessage,
  FocusMetric,
  AggregateFocusData,
  ModerationEvent,
} from '../types/index.js';
import { VideoTile } from '../components/VideoTile.js';
import { MeetingControls } from '../components/MeetingControls.js';
import { ChatDrawer } from '../components/ChatDrawer.js';
import { ParticipantsDrawer } from '../components/ParticipantsDrawer.js';
import { Shield, AlertTriangle, Users } from 'lucide-react';

interface MeetingRoomProps {
  meetingId: string;
  onLeave: (meetingId: string) => void;
}

interface PeerInfo {
  userId: string;
  username: string;
  socketId: string;
  stream: MediaStream | null;
  cameraBroadcast: boolean;
  cameraAvailable: boolean;
  micEnabled: boolean;
}

export const MeetingRoomPage: React.FC<MeetingRoomProps> = ({ meetingId, onLeave }) => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [studyMaterials, setStudyMaterials] = useState<Array<{ _id: string; originalName: string; size: number }>>([]);
  const [isHost, setIsHost] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  // Media states
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [isCameraBroadcasting, setIsCameraBroadcasting] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // WebRTC & Peers
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const [peers, setPeers] = useState<Map<string, PeerInfo>>(new Map());

  // Local AI Focus Engine
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const focusEngineRef = useRef<FocusDetectionEngine | null>(null);
  const localFocusMetricRef = useRef<FocusMetric | null>(null);
  const [localFocusMetric, setLocalFocusMetric] = useState<FocusMetric | null>(null);
  const [participantFocusScores, setParticipantFocusScores] = useState<Record<string, number>>({});

  // Voice STT Moderation Engine
  const voiceEngineRef = useRef<VoiceModerationEngine | null>(null);

  // Chat & Moderation
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [moderationEvents, setModerationEvents] = useState<ModerationEvent[]>([]);
  const [activeVoiceWarning, setActiveVoiceWarning] = useState<string | null>(null);
  const [attentionAlert, setAttentionAlert] = useState<{ message: string; lowAttentionCount: number; totalStudents: number } | null>(null);
  const [aggregateAttention, setAggregateAttention] = useState<{ totalStudents: number; lowAttentionCount: number; lowAttentionPercentage: number; status: 'low' | 'stable' } | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: string; reaction: string; username: string; left: number }>>([]);

  // Drawers & HUDs
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);

  // ============================================================
  // 1. INITIALIZE MEETING & ACCESS CONTROL
  // ============================================================
  useEffect(() => {
    const fetchMeeting = async () => {
      try {
        const m = await api.getMeeting(meetingId);
        setMeeting(m);
        setIsHost(m.isHost || m.host === user?.id);
        setStudyMaterials(await api.getStudyMaterials(meetingId));
      } catch (err: any) {
        setAccessError(
          err.message || 'Access Denied: This is a private meeting. You must be invited.'
        );
      }
    };

    fetchMeeting();
  }, [meetingId, user?.id]);

  // ============================================================
  // 2. SETUP WEBRTC & AI ENGINES
  // ============================================================
  useEffect(() => {
    if (!socket || !user || !meeting || accessError) return;

    const rtc = new WebRTCManager(socket);
    webrtcRef.current = rtc;

    // Stream & Leave callbacks
    rtc.setCallbacks(
      (remoteSocketId, stream) => {
        setPeers((prev) => {
          const next = new Map(prev);
          const p = next.get(remoteSocketId);
          if (p) {
            next.set(remoteSocketId, { ...p, stream });
          }
          return next;
        });
      },
      (remoteSocketId) => {
        setPeers((prev) => {
          const next = new Map(prev);
          next.delete(remoteSocketId);
          return next;
        });
      }
    );

    // Initialize Local Media
    const startMediaAndAI = async () => {
      const stream = await rtc.initLocalMedia(true, true);
      rtc.setMicEnabled(false);
      setLocalStream(stream);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Focus estimation is a student-only local signal.
      if (user.role === 'student' && !isHost) {
        const focusEngine = new FocusDetectionEngine();
        focusEngineRef.current = focusEngine;
        if (localVideoRef.current) {
          focusEngine.start(localVideoRef.current, (metric) => {
            localFocusMetricRef.current = metric;
            setLocalFocusMetric(metric);
          });
        }
      }

      // 2. Initialize Voice Moderation Engine (STT)
      const voiceEngine = new VoiceModerationEngine();
      voiceEngineRef.current = voiceEngine;
      if (voiceEngine.getSupported()) {
        voiceEngine.start((transcript) => {
          socket.emit('voice:transcription', { meetingId, transcript });
        });
      }

      // Join room via socket
      socket.emit('meeting:join', {
        meetingId,
        cameraBroadcast: true,
        cameraAvailable: stream.getVideoTracks().length > 0,
        micEnabled: false,
      });
    };

    startMediaAndAI();

    // ============================================================
    // 3. SOCKET LISTENERS FOR REAL-TIME CONFERENCING & AI
    // ============================================================
    socket.on('meeting:joined-success', ({ peers: initialPeers, isHost: hostFlag }: any) => {
      setIsHost(hostFlag);
      const peersMap = new Map<string, PeerInfo>();
      initialPeers.forEach((p: any) => {
        peersMap.set(p.socketId, {
          userId: p.userId,
          username: p.username,
          socketId: p.socketId,
          stream: null,
          cameraBroadcast: p.cameraBroadcast ?? true,
          cameraAvailable: p.cameraAvailable ?? true,
          micEnabled: p.micEnabled ?? false,
        });
        // Initiate peer connection
        rtc.connectToPeer(p.socketId);
      });
      setPeers(peersMap);
    });

    socket.on('meeting:peer-joined', ({ userId, username, socketId, cameraBroadcast, cameraAvailable, micEnabled }: any) => {
      setPeers((prev) => {
        const next = new Map(prev);
        next.set(socketId, {
          userId,
          username,
          socketId,
          stream: null,
          cameraBroadcast: cameraBroadcast ?? true,
          cameraAvailable: cameraAvailable ?? true,
          micEnabled: micEnabled ?? false,
        });
        return next;
      });
    });

    socket.on('meeting:peer-camera-broadcast-changed', ({ userId, cameraBroadcast }: any) => {
      setPeers((prev) => {
        const next = new Map(prev);
        for (const [sId, p] of next.entries()) {
          if (p.userId === userId) {
            next.set(sId, { ...p, cameraBroadcast });
          }
        }
        return next;
      });
    });

    socket.on('meeting:peer-mic-changed', ({ userId, micEnabled }: any) => {
      setPeers((prev) => {
        const next = new Map(prev);
        for (const [sId, p] of next.entries()) {
          if (p.userId === userId) {
            next.set(sId, { ...p, micEnabled });
          }
        }
        return next;
      });
    });

    // Chat Events
    socket.on('chat:message', (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('chat:blocked', ({ reason }: any) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          senderId: 'system',
          senderName: 'System',
          message: `🛡️ Message Blocked: ${reason}`,
          timestamp: new Date(),
          isSystem: true,
          isBlocked: true,
        },
      ]);
    });

    // Moderation Events & Warnings
    socket.on('moderation:alert', ({ event, message }: any) => {
      setModerationEvents((prev) => [event, ...prev]);
      // Show system notice to chat
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          senderId: 'system',
          senderName: 'Moderator Bot',
          message: `⚠️ Moderation Alert: ${message}`,
          timestamp: new Date(),
          isSystem: true,
        },
      ]);
    });

    socket.on('moderation:voice-warning', ({ message }: any) => {
      setActiveVoiceWarning(message);
      setTimeout(() => setActiveVoiceWarning(null), 8000);
    });

    socket.on('focus:distraction-alert', (alert: any) => {
        if (isHost) setAttentionAlert(alert);
    });

    socket.on('focus:aggregate-update', (aggregate: any) => {
      setAggregateAttention(aggregate);
    });

    socket.on('focus:participants-update', ({ participants }: any) => {
      if (!isHost) return;
      setParticipantFocusScores(
        Object.fromEntries(
          participants
            .filter((participant: any) => typeof participant.score === 'number')
            .map((participant: any) => [participant.userId, participant.score])
        )
      );
    });

    socket.on('focus:own-update', ({ score, category }: any) => {
      if (!isHost && typeof score === 'number') {
        setLocalFocusMetric((previous) => ({
          ...(previous || { faceDetected: false }),
          score,
          category,
        }));
      }
    });

    socket.on('meeting:reaction', ({ id, reaction, username }: any) => {
      setFloatingReactions((previous) => [...previous, { id, reaction, username, left: 12 + Math.random() * 76 }]);
      window.setTimeout(() => setFloatingReactions((previous) => previous.filter((item) => item.id !== id)), 3000);
    });

    // Host Moderation Actions (Mute, Kick, Block)
    socket.on('moderation:host-action', ({ targetUserId, action, reason }: any) => {
      if (targetUserId === user.id) {
        if (action === 'mute') {
          rtc.setMicEnabled(false);
          setIsMicMuted(true);
          setActiveVoiceWarning('You have been muted by the meeting host.');
        } else if (action === 'kick' || action === 'block') {
          alert(`You have been removed from the meeting by the host. Reason: ${reason}`);
          onLeave(meetingId);
        } else if (action === 'warn') {
          setActiveVoiceWarning(`Official Warning from Host: ${reason}`);
        }
      }
    });

    // Meeting ended by host
    socket.on('meeting:ended', () => {
      alert('The host has concluded this meeting.');
      onLeave(meetingId);
    });

    // Periodic telemetry loop: send local focus score to server every 4 seconds
    const telemetryInterval = setInterval(() => {
      const metric = localFocusMetricRef.current;
      if (user.role === 'student' && !isHost && focusEngineRef.current && metric && metric.faceDetected && metric.gazeDirection !== 'unavailable') {
        socket.emit('focus:telemetry', {
          meetingId,
          score: metric.score,
          category: metric.category,
          details: {
            faceDetected: metric.faceDetected,
            ear: metric.ear,
            headYaw: metric.headYaw,
            headPitch: metric.headPitch,
            gazeDirection: metric.gazeDirection,
          },
        });
      }
    }, 4000);

    return () => {
      clearInterval(telemetryInterval);
      focusEngineRef.current?.stop();
      voiceEngineRef.current?.stop();
      rtc.cleanup();
      socket.off('meeting:joined-success');
      socket.off('meeting:peer-joined');
      socket.off('chat:message');
      socket.off('chat:blocked');
      socket.off('moderation:alert');
      socket.off('moderation:voice-warning');
      socket.off('focus:distraction-alert');
      socket.off('focus:aggregate-update');
      socket.off('focus:participants-update');
      socket.off('focus:own-update');
      socket.off('meeting:reaction');
      socket.off('moderation:host-action');
      socket.off('meeting:ended');
    };
  }, [socket, user?.id, meetingId, meeting?._id, isHost, accessError]);

  // Handle Video Broadcast toggle (Privacy Camera Mode)
  const handleToggleCameraBroadcast = () => {
    const nextState = !isCameraBroadcasting;
    setIsCameraBroadcasting(nextState);
    if (webrtcRef.current) {
      webrtcRef.current.setCameraBroadcast(nextState);
    }
    socket?.emit('meeting:toggle-camera-broadcast', {
      meetingId,
      cameraBroadcast: nextState,
    });
  };

  // Handle Mic toggle
  const handleToggleMic = async () => {
    const nextState = !isMicMuted;
    if (webrtcRef.current) {
      await webrtcRef.current.setMicEnabled(!nextState);
      if (nextState && webrtcRef.current.getLocalStream()?.getAudioTracks().length === 0) return;
    }
    const hasAudio = !!webrtcRef.current?.getLocalStream()?.getAudioTracks().length;
    if (!nextState && !hasAudio) {
      setActiveVoiceWarning('Microphone permission is unavailable. Check your browser microphone settings.');
      return;
    }
    setIsMicMuted(nextState);
    socket?.emit('meeting:toggle-mic', {
      meetingId,
      micEnabled: !nextState,
    });
  };

  // Handle Screen Share
  const handleToggleScreenShare = async () => {
    if (webrtcRef.current) {
      const stream = await webrtcRef.current.toggleScreenShare();
      setIsScreenSharing(!!stream);
    }
  };

  // Send Chat message
  const handleSendMessage = (text: string) => {
    socket?.emit('chat:send', { meetingId, message: text });
  };

  const handleReaction = (reaction: string) => {
    socket?.emit('meeting:reaction', { meetingId, reaction });
  };

  // Host moderation action
  const handleHostAction = async (targetUserId: string, action: 'warn' | 'mute' | 'kick' | 'block') => {
    try {
      await api.takeModerationAction({
        meetingId,
        targetUserId,
        action,
        reason: `Host invoked ${action}`,
      });
    } catch (e) {
      console.error('Host action error:', e);
    }
  };

  // End or Leave meeting
  const handleLeaveMeeting = async () => {
    if (isHost) {
      const confirmEnd = window.confirm('Do you want to end this meeting for all participants?');
      if (confirmEnd) {
        try {
          await api.endMeeting(meetingId);
        } catch (e) {
          // ignore
        }
      }
    }
    onLeave(meetingId);
  };

  if (accessError) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center p-4">
        <div className="glass-panel p-8 rounded-3xl border border-rose-800/80 max-w-md text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-950/80 border border-rose-800 flex items-center justify-center text-rose-400">
            <Shield className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">Access Denied</h2>
          <p className="text-xs text-rose-300 leading-relaxed">{accessError}</p>
          <button
            onClick={() => onLeave(meetingId)}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Participants list for drawer
  const participantsList = [
    {
      userId: user?.id || '',
      username: user?.username || 'You',
      socketId: socket?.id || '',
      avatar: user?.avatar,
      isHost,
      score: user?.role === 'student' ? localFocusMetric?.score ?? 0 : 0,
      isMuted: isMicMuted,
      focusScore: isHost ? participantFocusScores[user?.id || ''] : user?.role === 'student' && localFocusMetric?.faceDetected ? localFocusMetric.score : undefined,
      videoOff: !localStream?.getVideoTracks().length,
      focusCategory: user?.role === 'student' && !isHost ? localFocusMetric?.category : undefined,
    },
    ...Array.from(peers.values()).map((p) => ({
      userId: p.userId,
      username: p.username,
      socketId: p.socketId,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${p.username}`,
      category: 'moderate',
      isMuted: !p.micEnabled,
      focusScore: isHost && p.cameraAvailable ? participantFocusScores[p.userId] : undefined,
      videoOff: !p.cameraAvailable,
      focusCategory: undefined,
    })),
  ];
  const liveFocusScores = Object.values(participantFocusScores);
  const averageParticipantFocus = liveFocusScores.length
    ? Math.round(liveFocusScores.reduce((sum, score) => sum + score, 0) / liveFocusScores.length)
    : undefined;

  return (
    <div className="h-[calc(100vh-65px)] flex flex-col bg-slate-100 relative overflow-hidden">
      {/* Hidden local video element used as media source for local Face Landmarks AI engine */}
      <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />

      {/* Top Meeting Header Bar - Clean Light Glass Panel */}
      <div className="h-14 px-6 border-b border-slate-200 glass-panel bg-white/95 flex items-center justify-between z-30 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              {meeting?.title || 'Meeting Room'}
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Zero-Link Secure
              </span>
            </h2>
          </div>
        </div>

        {studyMaterials.length > 0 && (
          <div className="flex items-center gap-2 max-w-[45%] overflow-x-auto">
            {studyMaterials.map((material) => (
              <button
                key={material._id}
                type="button"
                title={`Download ${material.originalName}`}
                onClick={() => api.downloadStudyMaterial(meetingId, material._id, material.originalName).catch((err) => setAccessError(err.message))}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] whitespace-nowrap hover:bg-emerald-100 transition cursor-pointer font-medium"
              >
                {material.originalName}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-medium">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span>{participantsList.length} In Call</span>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-24 z-50 h-64 overflow-hidden">
        {floatingReactions.map((item) => (
          <div key={item.id} className="absolute bottom-2 flex flex-col items-center text-3xl animate-reactionFloat" style={{ left: `${item.left}%` }}>
            <span>{item.reaction}</span><span className="mt-1 text-[9px] text-slate-500">{item.username}</span>
          </div>
        ))}
      </div>

      {/* Voice Warning Banner */}
      {activeVoiceWarning && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-50 p-3.5 rounded-2xl bg-rose-50 border border-rose-300 shadow-xl backdrop-blur-md flex items-center gap-2.5 text-xs text-rose-800 animate-slideDown">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-medium">{activeVoiceWarning}</span>
        </div>
      )}

      {/* 75% Low Attention Alert to Host (Requirement 3) */}
      {isHost && attentionAlert && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 max-w-xl p-4 rounded-2xl bg-amber-50 border border-amber-300 shadow-xl backdrop-blur-md text-xs text-amber-950 animate-slideDown">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-900 text-sm">Low Visual Attention Warning</div>
                <div className="mt-1 font-semibold text-amber-800">
                  More than 75% of students appear to have low visual attention. Consider changing the topic or engaging students.
                </div>
                <div className="mt-1.5 text-amber-700 text-[11px]">
                  {attentionAlert.lowAttentionCount} of {attentionAlert.totalStudents} students currently show low visual attention.
                </div>
              </div>
            </div>
            <button
              onClick={() => setAttentionAlert(null)}
              className="text-amber-700 hover:text-amber-900 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-amber-100 transition cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Host Aggregate Attention HUD (Requirement 2: Aggregate only, no individual scores) */}
      {isHost && aggregateAttention && (
        <div className="absolute top-16 right-4 z-30 px-3.5 py-2.5 rounded-2xl bg-white/95 border border-slate-200 shadow-lg text-[11px] text-slate-700">
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${aggregateAttention.status === 'low' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
            Aggregate Attention Status
          </div>
          <div className="mt-1 text-slate-600">
            {aggregateAttention.totalStudents} students · {aggregateAttention.lowAttentionPercentage}% low attention
          </div>
          <div className={aggregateAttention.status === 'low' ? 'text-amber-700 font-medium mt-0.5' : 'text-emerald-700 font-medium mt-0.5'}>
            {aggregateAttention.status === 'low' ? 'Topic adjustment recommended' : 'Attentive & stable'}
          </div>
        </div>
      )}

      {/* Main Video Conferencing Layout */}
      <div className="flex-1 p-4 md:p-6 overflow-hidden relative flex">
        {/* Responsive Video Grid */}
        <div
          className={`flex-1 grid gap-4 h-full transition-all ${
            peers.size === 0
              ? 'grid-cols-1'
              : peers.size === 1
              ? 'grid-cols-1 md:grid-cols-2'
              : peers.size <= 3
              ? 'grid-cols-2'
              : 'grid-cols-2 md:grid-cols-3'
          }`}
        >
          {/* Local User Tile */}
          <VideoTile
            stream={localStream}
            username={user?.username || 'You'}
            isLocal={true}
            isHost={isHost}
            isCameraBroadcasting={isCameraBroadcasting}
            isMicMuted={isMicMuted}
            focusMetric={localFocusMetric}
            showOwnFocusScore={user?.role === 'student' && !isHost}
            avatar={user?.avatar}
          />

          {/* Remote Peer Tiles */}
          {Array.from(peers.values()).map((peer) => (
            <VideoTile
              key={peer.socketId}
              stream={peer.stream}
              username={peer.username}
              isLocal={false}
              isCameraBroadcasting={peer.cameraBroadcast}
              isMicMuted={!peer.micEnabled}
              avatar={`https://api.dicebear.com/7.x/bottts/svg?seed=${peer.username}`}
            />
          ))}
        </div>

        {/* Chat Drawer */}
        <ChatDrawer
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          messages={messages}
          currentUserId={user?.id || ''}
          onSendMessage={handleSendMessage}
        />

        {/* Participants & Moderation Drawer */}
        <ParticipantsDrawer
          isOpen={isParticipantsOpen}
          onClose={() => setIsParticipantsOpen(false)}
          participants={participantsList}
          currentUserId={user?.id || ''}
          isHost={isHost}
          aggregateAttention={aggregateAttention}
          averageFocus={averageParticipantFocus}
          moderationEvents={moderationEvents}
          onHostAction={handleHostAction}
        />
      </div>

      {/* Bottom Floating Controls Bar */}
      <div className="p-4 shrink-0 z-30">
        <MeetingControls
          isMicMuted={isMicMuted}
          isCameraBroadcasting={isCameraBroadcasting}
          isScreenSharing={isScreenSharing}
          isChatOpen={isChatOpen}
          isParticipantsOpen={isParticipantsOpen}
          isHost={isHost}
          onToggleMic={handleToggleMic}
          onToggleCameraBroadcast={handleToggleCameraBroadcast}
          onToggleScreenShare={handleToggleScreenShare}
          onToggleChat={() => setIsChatOpen(!isChatOpen)}
          onToggleParticipants={() => setIsParticipantsOpen(!isParticipantsOpen)}
          onLeaveMeeting={handleLeaveMeeting}
          onReaction={handleReaction}
        />
      </div>
    </div>
  );
};
