import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import './config/env.js';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import meetingRoutes from './routes/meetings.js';
import invitationRoutes from './routes/invitations.js';
import moderationRoutes from './routes/moderation.js';
import { setupSocketHandlers } from './socket/handler.js';

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';
const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Enable CORS for frontend Vite dev server (5173) and any local network access
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());

// Setup Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Expose io globally for route controllers
(global as any).io = io;

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/moderation', moderationRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'FocusMeet AI Backend',
    timestamp: new Date(),
  });
});

// Initialize Socket.IO handlers
setupSocketHandlers(io);

// Start server
async function start() {
  await connectDB();
  server.listen(PORT, HOST, () => {
    console.log(`=================================================`);
    console.log(`🚀 FocusMeet AI Backend running on port ${PORT}`);
    console.log(`🔗 API Base: http://${HOST}:${PORT}/api`);
    console.log(`⚡ Socket.IO Ready`);
    console.log(`=================================================`);
  });
}

start();
