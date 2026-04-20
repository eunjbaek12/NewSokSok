import type { Express, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { validateBody } from '../middleware/validateBody';
import { GoogleAuthRequestSchema } from '@shared/contracts';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '30d';

interface CloudUser {
  id: string;
  google_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
}

async function findOrCreateGoogleUser(
  googleId: string,
  email: string,
  displayName: string | null,
  avatarUrl: string | null,
): Promise<CloudUser> {
  const existing = await pool.query(
    'SELECT * FROM cloud_users WHERE google_id = $1',
    [googleId],
  );

  if (existing.rows.length > 0) {
    await pool.query(
      'UPDATE cloud_users SET email = $1, display_name = $2, avatar_url = $3, updated_at = NOW() WHERE google_id = $4',
      [email, displayName, avatarUrl, googleId],
    );
    return existing.rows[0];
  }

  const result = await pool.query(
    'INSERT INTO cloud_users (google_id, email, display_name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *',
    [googleId, email, displayName, avatarUrl],
  );

  return result.rows[0];
}

export function registerAuthRoutes(app: Express): void {
  app.post('/api/auth/google', validateBody(GoogleAuthRequestSchema), async (req: Request, res: Response) => {
    try {
      const { accessToken } = req.body as { accessToken: string };

      const userInfoRes = await fetch(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!userInfoRes.ok) {
        return res.status(401).json({ error: 'Invalid Google token' });
      }

      const userInfo = await userInfoRes.json() as any;
      const googleId = userInfo.sub;
      const email = userInfo.email;
      const displayName = userInfo.name || null;
      const avatarUrl = userInfo.picture || null;

      if (!googleId || !email) {
        return res.status(400).json({ error: 'Could not retrieve Google user info' });
      }

      const user = await findOrCreateGoogleUser(googleId, email, displayName, avatarUrl);
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

      res.json({
        user: {
          id: user.id,
          googleId: user.google_id,
          email: user.email,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
          isAdmin: user.is_admin ?? false,
        },
        token,
      });
    } catch (error: any) {
      console.error('Google auth error:', error?.message);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });
}
