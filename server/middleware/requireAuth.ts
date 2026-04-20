import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { JwtPayloadSchema } from '@shared/contracts';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET = process.env.JWT_SECRET;
export const JWT_EXPIRES_IN = '30d';

export interface AuthRequest extends Request {
  userId?: string;
}

/** Decode + verify a JWT and Zod-parse the payload claims. */
function decodeAndValidate(token: string): { userId: string } | null {
  try {
    const raw = jwt.verify(token, JWT_SECRET);
    const parsed = JwtPayloadSchema.safeParse(raw);
    if (!parsed.success) return null;
    return { userId: parsed.data.userId };
  } catch {
    return null;
  }
}

/** Strict JWT auth for /api/sync/* and other protected routes. */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  const decoded = decodeAndValidate(authHeader.slice(7));
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  req.userId = decoded.userId;
  next();
}

/**
 * For curation routes: accepts either a JWT (google users) or `x-user-id`
 * (guest/device). Kept for parity with server/auth.ts::resolveRequesterId.
 */
export function resolveRequester(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    const decoded = decodeAndValidate(authHeader.slice(7));
    if (!decoded) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    req.userId = decoded.userId;
    return next();
  }

  const headerUserId = req.headers['x-user-id'];
  if (!headerUserId || typeof headerUserId !== 'string') {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.userId = headerUserId;
  next();
}
