import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../middleware/auth.js';
import { Store, memoryStore } from '../services/store.js';
import { analyzeToxicity } from '../services/toxicity.js';

interface AuthenticatedSocket extends Socket {
  user?: {
    userId: string;
    username: string;
    email: string;
    role: 'host' | 'student';
  };
  cameraAvailable?: boolean;
  cameraBroadcast?: boolean;
  micEnabled?: boolean;
}

export function setupSocketHandlers(io: SocketIOServer) {
  // Authentication middleware for Socket.IO
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token as string, JWT_SECRET) as {
        userId: string;
        username: string;
        email: string;
        role?: 'host' | 'student';
      };
        socket.user = { ...decoded, role: decoded.role || 'student' };
      next();
    } catch (err) {
      next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user!;
    console.log(`[Socket] User connected: ${user.username} (${socket.id})`);

    // Register active user socket for direct push notifications
    memoryStore.userSockets.set(user.userId, socket.id);
    memoryStore.socketUsers.set(socket.id, user.userId);

    // ==========================================
    // 1. MEETING ROOM JOIN & VERIFICATION
    // ==========================================
    socket.on('meeting:join', async ({ meetingId, cameraBroadcast = true, cameraAvailable = true, micEnabled = true }) => {
      try {
        socket.cameraAvailable = cameraAvailable;
        socket.cameraBroadcast = cameraBroadcast;
        socket.micEnabled = micEnabled;
        const meeting = await Store.getMeetingById(meetingId);
        if (!meeting) {
          socket.emit('meeting:error', { message: 'Meeting not found' });
          return;
        }

        if (meeting.status === 'ended') {
          socket.emit('meeting:error', { message: 'This meeting has ended' });
          return;
        }

        const isHost = meeting.host === user.userId;
        const isInvited = meeting.invitedUsers.includes(user.userId);
        if (memoryStore.blockedMeetingUsers.has(`${meetingId}:${user.userId}`)) {
          socket.emit('meeting:error', { message: 'You are blocked from this meeting' });
          return;
        }
        const hasAcceptedInvite = isInvited && await Store.hasAcceptedInvitation(meetingId, user.userId);

        if (!isHost && !hasAcceptedInvite) {
          socket.emit('meeting:error', {
            message: 'Access Denied: Accept the meeting notification before joining.',
          });
          return;
        }

        socket.join(meetingId);
        await Store.addActiveParticipant(meetingId, user.userId);
        await Store.updateMeetingStatus(meetingId, 'live');

        // Track user focus state in room
        if (!memoryStore.roomFocusScores.has(meetingId)) {
          memoryStore.roomFocusScores.set(meetingId, new Map());
        }
        memoryStore.roomFocusScores.get(meetingId)!.set(user.userId, 100);

        console.log(`[Meeting] ${user.username} joined meeting ${meetingId} (Host: ${isHost})`);

        // Notify other room participants
        socket.to(meetingId).emit('meeting:peer-joined', {
          userId: user.userId,
          username: user.username,
          socketId: socket.id,
          isHost,
          cameraBroadcast,
          cameraAvailable: cameraAvailable !== false,
          micEnabled,
        });

        // Send confirmation & current participant list
        const roomSockets = await io.in(meetingId).fetchSockets();
        const peers = roomSockets
          .filter((s) => s.id !== socket.id)
          .map((s) => {
            const authS = s as unknown as AuthenticatedSocket;
            return {
              userId: authS.user?.userId,
              username: authS.user?.username,
              socketId: s.id,
              cameraAvailable: authS.cameraAvailable !== false,
              cameraBroadcast: authS.cameraBroadcast !== false,
              micEnabled: authS.micEnabled === true,
            };
          });

        socket.emit('meeting:joined-success', {
          meetingId,
          isHost,
          peers,
        });
      } catch (err) {
        console.error('Join room error:', err);
        socket.emit('meeting:error', { message: 'Failed to join meeting room' });
      }
    });

    // ==========================================
    // 2. WEBRTC MESH SIGNALING
    // ==========================================
    socket.on('webrtc:offer', ({ toSocketId, offer }) => {
      const target = io.sockets.sockets.get(toSocketId) as AuthenticatedSocket | undefined;
      if (!target || ![...socket.rooms].some((room) => room !== socket.id && target.rooms.has(room))) return;
      io.to(toSocketId).emit('webrtc:offer', {
        fromSocketId: socket.id,
        fromUserId: user.userId,
        offer,
      });
    });

    socket.on('webrtc:answer', ({ toSocketId, answer }) => {
      const target = io.sockets.sockets.get(toSocketId) as AuthenticatedSocket | undefined;
      if (!target || ![...socket.rooms].some((room) => room !== socket.id && target.rooms.has(room))) return;
      io.to(toSocketId).emit('webrtc:answer', {
        fromSocketId: socket.id,
        answer,
      });
    });

    socket.on('webrtc:ice-candidate', ({ toSocketId, candidate }) => {
      const target = io.sockets.sockets.get(toSocketId) as AuthenticatedSocket | undefined;
      if (!target || ![...socket.rooms].some((room) => room !== socket.id && target.rooms.has(room))) return;
      io.to(toSocketId).emit('webrtc:ice-candidate', {
        fromSocketId: socket.id,
        candidate,
      });
    });

    // Toggle camera broadcast (Privacy Camera Mode)
    socket.on('meeting:toggle-camera-broadcast', ({ meetingId, cameraBroadcast }) => {
      if (!socket.rooms.has(meetingId)) return;
      socket.cameraBroadcast = cameraBroadcast;
      socket.to(meetingId).emit('meeting:peer-camera-broadcast-changed', {
        userId: user.userId,
        cameraBroadcast,
      });
    });

    // Toggle microphone state
    socket.on('meeting:toggle-mic', ({ meetingId, micEnabled }) => {
      if (!socket.rooms.has(meetingId)) return;
      socket.micEnabled = micEnabled;
      socket.to(meetingId).emit('meeting:peer-mic-changed', {
        userId: user.userId,
        micEnabled,
      });
    });

    socket.on('meeting:reaction', ({ meetingId, reaction }) => {
      if (!socket.rooms.has(meetingId) || typeof reaction !== 'string' || reaction.length > 8) return;
      io.to(meetingId).emit('meeting:reaction', {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        reaction,
        userId: user.userId,
        username: user.username,
      });
    });

    // ==========================================
    // 3. AI FOCUS TELEMETRY & DISTRACTION ALERTS
    // ==========================================
    socket.on('focus:telemetry', async ({ meetingId, score, category, details }) => {
      try {
        if (!socket.rooms.has(meetingId)) return;
        const meeting = await Store.getMeetingById(meetingId);
        if (!meeting || user.role !== 'student' || meeting.host === user.userId || !meeting.settings.aiFocusTracking) return;
        const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

        // Record in room focus tracker (kept strictly on server for aggregate computation)
        const roomScores = memoryStore.roomFocusScores.get(meetingId);
        if (roomScores) {
          const previousScore = roomScores.get(user.userId) ?? clampedScore;
          roomScores.set(user.userId, Math.round(previousScore * 0.7 + clampedScore * 0.3));
        }

        // Host must NOT see individual student focus scores (Requirement 2).
        // Only aggregate attention information is computed and broadcast.
        const hostRoomSockets = await io.in(meetingId).fetchSockets();
        const hostSocket = hostRoomSockets.find((roomSocket) => (roomSocket as unknown as AuthenticatedSocket).user?.userId === meeting.host);

        const studentScores = meeting.invitedUsers
          .filter((studentId) => roomScores?.has(studentId))
          .map((studentId) => roomScores!.get(studentId)!);
        const lowAttentionCount = studentScores.filter((studentScore) => studentScore < 60).length;
        const lowAttentionPercentage = studentScores.length ? (lowAttentionCount / studentScores.length) * 100 : 0;
        const now = Date.now();
        const attentionHistory = memoryStore.roomAttentionHistory.get(meetingId) || [];
        attentionHistory.push({ timestamp: now, lowAttentionPercentage });
        const recentAttentionHistory = attentionHistory.filter((sample) => now - sample.timestamp <= 30_000);
        memoryStore.roomAttentionHistory.set(meetingId, recentAttentionHistory);

        // Broadcast aggregate attention metrics only
        io.to(meetingId).emit('focus:aggregate-update', {
          totalStudents: studentScores.length,
          lowAttentionCount,
          lowAttentionPercentage: Math.round(lowAttentionPercentage),
          status: lowAttentionPercentage >= 75 ? 'low' : 'stable',
        });

        // Individual scores are private: only the host receives the room roster,
        // while the reporting participant receives only their own current score.
        const roomParticipants = await io.in(meetingId).fetchSockets();
        const participantScores = roomParticipants.map((roomSocket) => {
          const participant = roomSocket as unknown as AuthenticatedSocket;
          const participantScore = roomScores?.get(participant.user?.userId || '') ?? null;
          return {
            userId: participant.user?.userId,
            username: participant.user?.username,
            score: participantScore,
            isHost: participant.user?.userId === meeting.host,
          };
        });
        if (hostSocket) {
          hostSocket.emit('focus:participants-update', { participants: participantScores });
        }
        socket.emit('focus:own-update', {
          score: roomScores?.get(user.userId) ?? clampedScore,
          category: (roomScores?.get(user.userId) ?? clampedScore) >= 80 ? 'focused' : (roomScores?.get(user.userId) ?? clampedScore) >= 60 ? 'moderate' : 'low',
        });

        // 75% Low-Focus Alert to Host (Requirement 3)
        const lastAlert = memoryStore.roomDistractionAlertSent.get(meetingId) || 0;
        const sustainedLowAttention = recentAttentionHistory.filter((sample) => sample.lowAttentionPercentage >= 75);
        const sustainedForMs = sustainedLowAttention.length > 1
          ? sustainedLowAttention[sustainedLowAttention.length - 1].timestamp - sustainedLowAttention[0].timestamp
          : 0;
        // Debounce & smoothing: requires at least 3 consecutive samples spanning >= 10s and avg >= 75%
        const rollingLowAttention = sustainedLowAttention.length >= 3 && sustainedForMs >= 10_000 &&
          sustainedLowAttention.reduce((sum, sample) => sum + sample.lowAttentionPercentage, 0) / sustainedLowAttention.length >= 75;

        if (studentScores.length > 0 && rollingLowAttention && now - lastAlert >= 60_000) {
          memoryStore.roomDistractionAlertSent.set(meetingId, Date.now());
          await Store.incrementDistractionAlert(meetingId);
          hostSocket?.emit('focus:distraction-alert', {
            totalStudents: studentScores.length,
            lowAttentionCount,
            distractionRate: Math.round(lowAttentionPercentage),
            message: 'More than 75% of students appear to have low visual attention. Consider changing the topic or engaging students.',
          });
        }

        // Store periodic telemetry sample in database
        await Store.saveFocusRecord({
          meeting: meetingId,
          user: user.userId,
          timestamp: new Date(),
          focusScore: clampedScore,
          category,
          details,
        });
      } catch (err) {
        console.error('Focus telemetry error:', err);
      }
    });

    // ==========================================
    // 4. CHAT & ABUSE MODERATION
    // ==========================================
    socket.on('chat:send', async ({ meetingId, message }) => {
      try {
        if (!socket.rooms.has(meetingId)) return;
        const meeting = await Store.getMeetingById(meetingId);
        if (!meeting || !meeting.settings.allowChat) return;
        if (!message || !message.trim()) return;

        // Run toxicity analysis
        const tox = analyzeToxicity(message);

        if (tox.isAbusive) {
          console.warn(`[Moderation] Abusive chat blocked from ${user.username}: "${message}"`);

          // 1. Notify sender that their message was blocked
          socket.emit('chat:blocked', {
            reason: `Your message was blocked for ${tox.violationType}. Please maintain professional communication.`,
            originalMessage: message,
          });

          // 2. Save moderation event
          const event = await Store.saveModerationEvent({
            meeting: meetingId,
            user: user.userId,
            username: user.username,
            source: 'chat',
            violationType: tox.violationType || 'profanity',
            snippet: message,
            confidence: tox.confidence,
            actionTaken: 'warned',
            timestamp: new Date(),
          });

          // 3. Notify host of moderation violation
          io.to(meetingId).emit('moderation:alert', {
            event,
            message: `Flagged chat from @${user.username} (${tox.violationType})`,
          });

          return;
        }

        // Safe message: broadcast to all participants in meeting room
        io.to(meetingId).emit('chat:message', {
          id: Math.random().toString(36).substring(2, 9),
          senderId: user.userId,
          senderName: user.username,
          message,
          timestamp: new Date(),
        });
      } catch (err) {
        console.error('Chat error:', err);
      }
    });

    // ==========================================
    // 5. VOICE SPEECH-TO-TEXT MODERATION
    // ==========================================
    socket.on('voice:transcription', async ({ meetingId, transcript }) => {
      try {
        if (!socket.rooms.has(meetingId)) return;
        const meeting = await Store.getMeetingById(meetingId);
        if (!meeting || !meeting.settings.toxicityModeration) return;
        if (!transcript || !transcript.trim()) return;

        const tox = analyzeToxicity(transcript);

        if (tox.isAbusive) {
          console.warn(`[Moderation] Abusive voice detected from ${user.username}: "${transcript}"`);

          // 1. Save moderation event
          const event = await Store.saveModerationEvent({
            meeting: meetingId,
            user: user.userId,
            username: user.username,
            source: 'voice',
            violationType: tox.violationType || 'profanity',
            snippet: transcript,
            confidence: tox.confidence,
            actionTaken: 'warned',
            timestamp: new Date(),
          });

          // 2. Direct warning to the offending participant
          socket.emit('moderation:voice-warning', {
            message: `Warning: Inappropriate spoken language detected. Further violations will result in automatic muting or removal.`,
            detectedSnippet: transcript,
          });

          // 3. Alert host with evidence snippet
          io.to(meetingId).emit('moderation:alert', {
            event,
            message: `Spoken abuse detected from @${user.username} (${tox.violationType})`,
          });
        }
      } catch (err) {
        console.error('Voice moderation error:', err);
      }
    });

    // ==========================================
    // 6. DISCONNECTION & CLEANUP
    // ==========================================
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          // Remove from room focus scores
          const roomScores = memoryStore.roomFocusScores.get(room);
          if (roomScores) {
            roomScores.delete(user.userId);
          }

          socket.to(room).emit('meeting:peer-left', {
            userId: user.userId,
            username: user.username,
            socketId: socket.id,
          });
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] User disconnected: ${user.username}`);
      memoryStore.userSockets.delete(user.userId);
      memoryStore.socketUsers.delete(socket.id);
    });
  });
}
