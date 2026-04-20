import type { Express, Request, Response } from 'express';
import {
  isGeminiAvailable,
  analyzeWord,
  generateThemeList,
  generateMoreWords,
} from '../gemini';
import { validateBody } from '../middleware/validateBody';
import {
  AIAnalyzeRequestSchema,
  AIGenerateThemeRequestSchema,
  AIGenerateMoreRequestSchema,
} from '@shared/contracts';

export function registerAIRoutes(app: Express): void {
  app.get('/api/ai/status', (_req: Request, res: Response) => {
    res.json({ available: isGeminiAvailable() });
  });

  app.post('/api/ai/analyze', validateBody(AIAnalyzeRequestSchema), async (req: Request, res: Response) => {
    try {
      const { word, sourceLang, targetLang, apiKey } = req.body as {
        word: string;
        sourceLang?: string;
        targetLang?: string;
        apiKey?: string;
      };
      if (!isGeminiAvailable(apiKey)) {
        return res.status(503).json({ error: 'Gemini API key not configured' });
      }
      const result = await analyzeWord(word.trim(), sourceLang || 'en', targetLang || 'ko', apiKey);
      res.json(result);
    } catch (error: any) {
      console.error('AI analyze error:', error?.message);
      res.status(500).json({ error: 'Failed to analyze word' });
    }
  });

  app.post('/api/ai/generate-theme', validateBody(AIGenerateThemeRequestSchema), async (req: Request, res: Response) => {
    try {
      if (!isGeminiAvailable()) {
        return res.status(503).json({ error: 'Gemini API key not configured' });
      }
      const { theme, difficulty, count, existingWords } = req.body as {
        theme: string;
        difficulty: string;
        count: number;
        existingWords: string[];
      };
      const result = await generateThemeList(theme.trim(), difficulty, count, existingWords);
      res.json(result);
    } catch (error: any) {
      console.error('AI generate-theme error:', error?.message);
      res.status(500).json({ error: 'Failed to generate theme list' });
    }
  });

  app.post('/api/ai/generate-more', validateBody(AIGenerateMoreRequestSchema), async (req: Request, res: Response) => {
    try {
      if (!isGeminiAvailable()) {
        return res.status(503).json({ error: 'Gemini API key not configured' });
      }
      const { theme, difficulty, count, existingWords } = req.body as {
        theme: string;
        difficulty: string;
        count: number;
        existingWords: string[];
      };
      const result = await generateMoreWords(theme.trim(), difficulty, count, existingWords);
      res.json(result);
    } catch (error: any) {
      console.error('AI generate-more error:', error?.message);
      res.status(500).json({ error: 'Failed to generate more words' });
    }
  });
}
