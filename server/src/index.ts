import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import membersRouter from './routes/members';
import callingsRouter from './routes/callings';
import callingChangesRouter from './routes/calling-changes';
import organizationsRouter from './routes/organizations';
import tasksRouter from './routes/tasks';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/members', membersRouter);
app.use('/api/callings', callingsRouter);
app.use('/api/calling-changes', callingChangesRouter);
app.use('/api/organizations', organizationsRouter);
app.use('/api/tasks', tasksRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
