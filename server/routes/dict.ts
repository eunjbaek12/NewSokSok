import type { Express, Request, Response } from 'express';
import { validateQuery, type ValidatedRequest } from '../middleware/validateQuery';
import { DictQuerySchema } from '@shared/contracts';

type DictQuery = { query: string; dictCode?: string };

function subdomainForDictCode(code: string): string {
  if (code.startsWith('ja') || code === 'koja') return 'ja';
  if (code.startsWith('zh') || code === 'kozh') return 'zh';
  if (code.startsWith('ko')) return 'korean';
  return 'en';
}

export function registerDictRoutes(app: Express): void {
  app.get('/api/dict/naver', validateQuery(DictQuerySchema), async (req: ValidatedRequest<DictQuery>, res: Response) => {
    try {
      const { query, dictCode } = req.validatedQuery!;
      const code = dictCode || 'enko';
      const subdomain = subdomainForDictCode(code);

      const url = `https://${subdomain}.dict.naver.com/api3/${code}/search?query=${encodeURIComponent(query.trim())}&m=pc&lang=ko`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Referer': `https://${subdomain}.dict.naver.com/`,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Alldict-Locale': 'ko',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`Naver API error: ${response.status} ${response.statusText}`, text);
        return res.status(response.status).json({ error: `Naver API error: ${response.statusText}` });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error('Naver proxy error:', error?.message);
      res.status(500).json({ error: 'Failed to fetch from Naver' });
    }
  });

  app.get('/api/dict/autocomplete', async (req: Request, res: Response) => {
    try {
      const { query, dictCode } = req.query;
      if (!query || typeof query !== 'string') {
        return res.json({ items: [] });
      }
      const code = (typeof dictCode === 'string' && dictCode) || 'enko';
      const url = `https://ac.dict.naver.com/${code}/ac?q=${encodeURIComponent(query.trim())}&q_enc=UTF-8&st=11&r_enc=UTF-8&r_format=json&t_korlex=1`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Referer': 'https://en.dict.naver.com/',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
        },
      });
      if (!response.ok) return res.json({ items: [] });
      const data = await response.json();
      res.json(data);
    } catch {
      res.json({ items: [] });
    }
  });
}
