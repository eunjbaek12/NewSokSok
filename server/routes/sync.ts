import type { Express, Response } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/requireAuth';
import { validateBody } from '../middleware/validateBody';
import { validateQuery, type ValidatedRequest } from '../middleware/validateQuery';
import {
  SyncPullQuerySchema,
  SyncPushRequestSchema,
  type SyncPullQuery,
  type SyncPushRequest,
} from '@shared/contracts';
import { pullSince, pushUpsert } from '../services';

export function registerSyncRoutes(app: Express): void {
  app.get(
    '/api/sync/pull',
    requireAuth,
    validateQuery(SyncPullQuerySchema),
    async (req: AuthRequest & ValidatedRequest<SyncPullQuery>, res: Response) => {
      const userId = req.userId!;
      const { since } = req.validatedQuery!;
      try {
        const { lists, words, serverTime } = await pullSince(userId, since);
        res.json({
          lists,
          words,
          serverTime,
          hasMore: false,
        });
      } catch (error: any) {
        console.error('Sync pull error:', error?.message ?? error);
        res.status(500).json({ error: 'Failed to pull sync data' });
      }
    },
  );

  app.post(
    '/api/sync/push',
    requireAuth,
    validateBody(SyncPushRequestSchema),
    async (req: AuthRequest, res: Response) => {
      const userId = req.userId!;
      const { lists, words } = req.body as SyncPushRequest;
      try {
        const { serverTime } = await pushUpsert(userId, lists, words);
        res.json({ serverTime });
      } catch (error: any) {
        if (error?.code === 'UNAUTHORIZED_LIST') {
          return res.status(400).json({ error: 'UNAUTHORIZED_LIST', message: error.message });
        }
        console.error('Sync push error:', error?.message ?? error);
        res.status(500).json({ error: 'Failed to push sync data' });
      }
    },
  );
}
