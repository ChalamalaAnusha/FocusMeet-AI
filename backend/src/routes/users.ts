import { Router, Response } from 'express';
import { Store } from '../services/store.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Search users by username, display name, or email
router.get('/search', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const currentUserId = req.user!.userId;
    const users = await Store.searchUsers(q, currentUserId);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// List suggested participants
router.get('/contacts', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user!.userId;
    const users = await Store.searchUsers('', currentUserId);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list contacts' });
  }
});

export default router;
