import { Router } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/users - List all users
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, picture, allowed, created_at, last_login FROM users ORDER BY created_at DESC'
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users - Add a new user to allowlist
router.post('/', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO users (email, allowed) VALUES ($1, true)
       ON CONFLICT (email) DO UPDATE SET allowed = true
       RETURNING id, email, name, picture, allowed, created_at, last_login`,
      [email.toLowerCase().trim()]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding user:', error);
    return res.status(500).json({ error: 'Failed to add user' });
  }
});

// DELETE /api/users/:id - Remove user from allowlist
router.delete('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;

  // Prevent self-deletion
  if (req.user?.id === id) {
    return res.status(400).json({ error: 'You cannot delete yourself' });
  }

  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

// PATCH /api/users/:id/toggle - Toggle user's allowed status
router.patch('/:id/toggle', async (req: AuthRequest, res) => {
  const { id } = req.params;

  // Prevent self-blocking
  if (req.user?.id === id) {
    return res.status(400).json({ error: 'You cannot block yourself' });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET allowed = NOT allowed WHERE id = $1
       RETURNING id, email, name, picture, allowed, created_at, last_login`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error toggling user:', error);
    return res.status(500).json({ error: 'Failed to toggle user' });
  }
});

export default router;
