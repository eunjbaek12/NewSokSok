import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { createServer, type Server } from 'node:http';

import { registerAuthRoutes } from './routes/auth';
import { registerSyncRoutes } from './routes/sync';
import { registerCurationRoutes } from './routes/curations';
import { registerAIRoutes } from './routes/ai';
import { registerDictRoutes } from './routes/dict';

export async function registerRoutes(app: Express): Promise<Server> {
  registerAuthRoutes(app);
  registerSyncRoutes(app);
  registerCurationRoutes(app);
  registerAIRoutes(app);
  registerDictRoutes(app);

  app.get('/api/db-check', async (_req: Request, res: Response) => {
    try {
      const { db } = await import('./db');
      await db.execute(sql`SELECT 1`);
      res.json({ status: 'ok', message: 'Database connected' });
    } catch (error: any) {
      console.error('Database check failed:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
