import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Store } from '../services/store.js';
import { authMiddleware, AuthRequest, JWT_SECRET } from '../middleware/auth.js';

const router = Router();

// Register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const displayName = typeof req.body.displayName === 'string' ? req.body.displayName.trim() : '';
    const studentId = typeof req.body.studentId === 'string' ? req.body.studentId.trim() : '';
    const hostCode = typeof req.body.hostCode === 'string' ? req.body.hostCode : '';

    if (!username || !email || !password) {
      res.status(400).json({ error: 'Username, email, and password are required' });
      return;
    }

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      res.status(400).json({ error: 'Username must be 3-30 characters using letters, numbers, or underscores' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Enter a valid email address' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const existing = await Store.findUserByUsernameOrEmail(username);
    const existingEmail = await Store.findUserByUsernameOrEmail(email);
    if (existing || existingEmail) {
      res.status(400).json({ error: 'Username or email already in use' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await Store.createUser({
      username,
      email,
      passwordHash,
      displayName: displayName || username,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`,
      studentId: studentId || undefined,
      role: hostCode && process.env.HOST_REGISTRATION_CODE && hostCode === process.env.HOST_REGISTRATION_CODE ? 'host' : 'student',
      status: 'online',
    });

    const token = jwt.sign(
      { userId: newUser._id, username: newUser.username, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        displayName: newUser.displayName,
        avatar: newUser.avatar,
        studentId: newUser.studentId,
        role: newUser.role,
      },
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      res.status(409).json({ error: 'Username, email, or student ID already in use' });
      return;
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const identifier = typeof req.body.identifier === 'string' ? req.body.identifier.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!identifier || !password) {
      res.status(400).json({ error: 'Identifier (username/email) and password are required' });
      return;
    }

    const user = await Store.findUserByUsernameOrEmail(identifier);
    if (!user) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        studentId: user.studentId,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Current User Profile
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await Store.findUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      studentId: user.studentId,
      role: user.role,
      status: user.status,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
