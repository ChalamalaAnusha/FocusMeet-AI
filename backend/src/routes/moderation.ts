import { Router, Response } from 'express';
import { Store, memoryStore } from '../services/store.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get moderation violations for a meeting
router.get('/:meetingId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meetingId = Array.isArray(req.params.meetingId) ? req.params.meetingId[0] : req.params.meetingId;
    const meeting = await Store.getMeetingById(meetingId);
    if (!meeting || meeting.host !== req.user!.userId) {
      res.status(meeting ? 403 : 404).json({ error: meeting ? 'Only the meeting host can view moderation events' : 'Meeting not found' });
      return;
    }
    const events = await Store.getMeetingModerationEvents(meetingId);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch moderation events' });
  }
});

// Host executes moderation action (warn, mute, kick, block)
router.post('/action', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { meetingId, targetUserId, action, reason } = req.body;
    const meeting = await Store.getMeetingById(meetingId);

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (meeting.host !== req.user!.userId) {
      res.status(403).json({ error: 'Only the meeting host can execute moderation actions' });
      return;
    }

    if (!['warn', 'mute', 'kick', 'block'].includes(action) || !targetUserId || targetUserId === meeting.host || !meeting.invitedUsers.includes(String(targetUserId))) {
      res.status(400).json({ error: 'Invalid moderation target or action' });
      return;
    }

    if (action === 'block') {
      memoryStore.blockedMeetingUsers.add(`${meetingId}:${String(targetUserId)}`);
    }

    // Broadcast host action via socket
    if ((global as any).io) {
      (global as any).io.to(meetingId).emit('moderation:host-action', {
        targetUserId,
        action, // 'warn' | 'mute' | 'kick' | 'block'
        reason: reason || 'Host moderation enforcement',
        timestamp: new Date(),
      });
    }

    res.json({ message: `Moderation action '${action}' dispatched successfully` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to execute moderation action' });
  }
});

export default router;
