import { Router, Response } from 'express';
import { Store } from '../services/store.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get pending meeting invitations for current user
router.get('/pending', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invites = await Store.getUserPendingInvitations(req.user!.userId);
    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// Respond to an invitation (Accept or Decline)
router.post('/:id/respond', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.body;
    if (!['accepted', 'declined'].includes(status)) {
      res.status(400).json({ error: 'Status must be accepted or declined' });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const success = await Store.respondToInvitation(id, req.user!.userId, status);
    if (!success) {
      res.status(404).json({ error: 'Invitation not found or not authorized' });
      return;
    }

    res.json({ message: `Invitation ${status} successfully` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to respond to invitation' });
  }
});

export default router;
