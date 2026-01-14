import { Router, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import pool from '../db/connection';
import { AuthRequest, AuthUser, createToken, requireAuth } from '../middleware/auth';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Helper to log login attempts
async function logLoginAttempt(
  email: string,
  name: string | undefined,
  picture: string | undefined,
  success: boolean,
  failureReason: string | null,
  req: any
) {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;
    await pool.query(
      `INSERT INTO login_attempts (email, name, picture, success, failure_reason, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [email, name, picture, success, failureReason, ip, userAgent]
    );
  } catch (err) {
    console.error('Failed to log login attempt:', err);
  }
}

// POST /api/auth/google - Exchange Google credential for JWT
router.post('/google', async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ error: 'Missing credential' });
  }

  try {
    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid token payload' });
    }

    const { email, name, picture } = payload;

    // Check if user exists and is allowed
    const userResult = await pool.query(
      'SELECT id, email, name, picture, allowed FROM users WHERE email = $1',
      [email]
    );

    let user: AuthUser;

    if (userResult.rows.length === 0) {
      // User doesn't exist - create with allowed=false
      await pool.query(
        `INSERT INTO users (email, name, picture, allowed)
         VALUES ($1, $2, $3, false)
         RETURNING id, email, name, picture`,
        [email, name, picture]
      );

      await logLoginAttempt(email, name, picture, false, 'not_in_allowlist', req);
      return res.status(403).json({
        error: 'Access denied. Your account is not on the allowlist.',
        email
      });
    }

    const dbUser = userResult.rows[0];

    if (!dbUser.allowed) {
      await logLoginAttempt(email, name, picture, false, 'not_allowed', req);
      return res.status(403).json({
        error: 'Access denied. Your account is not on the allowlist.',
        email
      });
    }

    // Update user info and last login
    await pool.query(
      `UPDATE users SET name = $1, picture = $2, last_login = CURRENT_TIMESTAMP WHERE id = $3`,
      [name, picture, dbUser.id]
    );

    user = {
      id: dbUser.id,
      email: dbUser.email,
      name: name || dbUser.name,
      picture: picture || dbUser.picture,
    };

    // Log successful login
    await logLoginAttempt(email, name, picture, true, null, req);

    // Create JWT
    const token = createToken(user);

    // Set httpOnly cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({ user });
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
});

// GET /api/auth/me - Get current user
router.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  return res.json({ user: req.user });
});

// POST /api/auth/logout - Clear auth cookie
router.post('/logout', (_req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  return res.json({ success: true });
});

export default router;
