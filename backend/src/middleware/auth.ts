import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';

export { JWT_SECRET } from '../config/env.js';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
    email: string;
    role: 'host' | 'student';
  };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization token required' });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({ error: 'Authorization token required' });
      return;
    }
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      username: string;
      email: string;
      role?: 'host' | 'student';
    };

    req.user = { ...decoded, role: decoded.role || 'student' };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (role: 'host' | 'student') => (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== role) {
    res.status(403).json({ error: `Only ${role}s can perform this action` });
    return;
  }
  next();
};
