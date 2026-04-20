import type { Express, Request, Response } from 'express';
import {
  getCurations,
  createCuration,
  findDuplicateCuration,
  updateCuration,
  deleteCuration,
  isUserAdmin,
} from '../services';
import { resolveRequester, type AuthRequest } from '../middleware/requireAuth';
import { validateBody } from '../middleware/validateBody';
import { CurationMutateBodySchema } from '@shared/contracts';

function paramId(id: string | string[]): string {
  return Array.isArray(id) ? id[0] : id;
}

export function registerCurationRoutes(app: Express): void {
  app.get('/api/curations', async (_req: Request, res: Response) => {
    try {
      const curations = await getCurations();
      res.json(curations);
    } catch (error) {
      console.error('Failed to fetch curations:', error);
      res.status(500).json({ error: 'Failed to fetch curations' });
    }
  });

  app.post('/api/curations', validateBody(CurationMutateBodySchema), async (req: Request, res: Response) => {
    try {
      const { theme, words } = req.body as { theme: any; words: any[] };

      const force = req.query.force === 'true';
      if (!force && theme.creatorId) {
        const existing = await findDuplicateCuration(theme.creatorId, theme.title);
        if (existing) {
          return res.status(409).json({
            error: 'DUPLICATE_CURATION',
            existingId: existing.id,
            existingTitle: existing.title,
            message: '같은 이름의 공유 단어장이 이미 존재합니다.',
          });
        }
      }

      const newCuration = await createCuration(theme, words || []);
      res.status(201).json(newCuration);
    } catch (error: any) {
      console.error('CURATION_CREATE_ERROR:', error);
      res.status(500).json({
        error: 'CURATION_CREATE_FAILURE',
        details: error?.message || String(error),
      });
    }
  });

  app.put('/api/curations/:id', validateBody(CurationMutateBodySchema), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { theme, words } = req.body as { theme: any; words: any[] };
      if (!theme.creatorId) {
        return res.status(400).json({ error: 'Theme creatorId is required' });
      }
      const updated = await updateCuration(paramId(id), theme.creatorId, theme, words || []);
      res.json(updated);
    } catch (error: any) {
      if (error.message === 'Unauthorized') {
        return res.status(403).json({ error: 'Not authorized to update this curation' });
      }
      if (error.message === 'Curation not found') {
        return res.status(404).json({ error: 'Curation not found' });
      }
      console.error('CURATION_UPDATE_ERROR:', error);
      res.status(500).json({ error: 'Failed to update curation' });
    }
  });

  app.delete('/api/curations/:id', resolveRequester, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const requesterId = req.userId!;

      const isAdmin = await isUserAdmin(requesterId);

      await deleteCuration(paramId(id), requesterId, isAdmin);
      res.status(200).json({ success: true });
    } catch (error: any) {
      if (error.message === 'Unauthorized') {
        return res.status(403).json({ error: 'Not authorized to delete this curation' });
      }
      if (error.message === 'Curation not found') {
        return res.status(404).json({ error: 'Curation not found' });
      }
      console.error('CURATION_DELETE_ERROR:', error);
      res.status(500).json({ error: 'Failed to delete curation' });
    }
  });
}
