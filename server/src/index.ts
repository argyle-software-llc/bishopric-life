import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import cron from 'node-cron';
import membersRouter from './routes/members';
import callingsRouter from './routes/callings';
import callingChangesRouter from './routes/calling-changes';
import organizationsRouter from './routes/organizations';
import tasksRouter from './routes/tasks';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import syncRouter, { triggerScheduledSync } from './routes/sync';
import interviewsRouter from './routes/interviews';
import { requireAuth } from './middleware/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (for AWS ALB / nginx)
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Auth routes (public)
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/members', requireAuth, membersRouter);
app.use('/api/callings', requireAuth, callingsRouter);
app.use('/api/calling-changes', requireAuth, callingChangesRouter);
app.use('/api/organizations', requireAuth, organizationsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/sync', requireAuth, syncRouter);
app.use('/api/interviews', requireAuth, interviewsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Schedule daily sync at 2 AM
const SYNC_CRON = process.env.SYNC_CRON || '0 2 * * *';
cron.schedule(SYNC_CRON, () => {
  console.log('Running scheduled sync...');
  triggerScheduledSync();
});
console.log(`Scheduled sync configured: ${SYNC_CRON}`);
