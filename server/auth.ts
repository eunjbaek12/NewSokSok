import type { Express, Request, Response, NextFunction } from 'express';
import { pool } from './db';

export interface CloudUser {
  id: string;
  google_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
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

  await pool.query(
    "INSERT INTO cloud_vocab_data (user_id, data_json) VALUES ($1, '[]'::jsonb)",
    [result.rows[0].id],
  );

  return result.rows[0];
}

export function registerAuthRoutes(app: Express) {
  app.post('/api/auth/google', async (req: Request, res: Response) => {
    try {
      const { accessToken } = req.body;
      if (!accessToken) {
        return res.status(400).json({ error: 'accessToken is required' });
      }

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

      res.json({
        user: {
          id: user.id,
          googleId: user.google_id,
          email: user.email,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
        },
      });
    } catch (error: any) {
      console.error('Google auth error:', error?.message);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  app.get('/api/sync/data', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      const result = await pool.query(
        'SELECT data_json, updated_at FROM cloud_vocab_data WHERE user_id = $1',
        [userId],
      );

      if (result.rows.length === 0) {
        return res.json({ lists: [], updatedAt: null });
      }

      res.json({
        lists: result.rows[0].data_json,
        updatedAt: result.rows[0].updated_at,
      });
    } catch (error: any) {
      console.error('Sync get error:', error?.message);
      res.status(500).json({ error: 'Failed to fetch data' });
    }
  });

  app.post('/api/sync/data', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      const { lists } = req.body;
      if (!Array.isArray(lists)) {
        return res.status(400).json({ error: 'lists array is required' });
      }

      await pool.query(
        `INSERT INTO cloud_vocab_data (user_id, data_json, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET data_json = $2::jsonb, updated_at = NOW()`,
        [userId, JSON.stringify(lists)],
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error('Sync save error:', error?.message);
      res.status(500).json({ error: 'Failed to save data' });
    }
  });
}
