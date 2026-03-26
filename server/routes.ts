import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { createServer, type Server } from "node:http";
import {
  isGeminiAvailable,
  analyzeWord,
  generateThemeList,
  generateMoreWords,
} from "./gemini";
import { registerAuthRoutes } from "./auth";
import { storage } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  registerAuthRoutes(app);

  app.get("/api/db-check", async (_req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      await db.execute(sql`SELECT 1`);
      res.json({ status: "ok", message: "Database connected" });
    } catch (error: any) {
      console.error("Database check failed:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.get("/api/curations", async (_req: Request, res: Response) => {
    try {
      const curations = await storage.getCurations();
      res.json(curations);
    } catch (error) {
      console.error("Failed to fetch curations:", error);
      res.status(500).json({ error: "Failed to fetch curations" });
    }
  });

  app.post("/api/curations", async (req: Request, res: Response) => {
    try {
      console.log("Creating curation with body:", JSON.stringify(req.body, null, 2));
      const { theme, words } = req.body;
      if (!theme || !theme.title) {
        console.warn("Missing theme or title");
        return res.status(400).json({ error: "Theme title is required" });
      }

      const force = req.query.force === 'true';
      if (!force && theme.creatorId) {
        const existing = await storage.findDuplicateCuration(theme.creatorId, theme.title);
        if (existing) {
          return res.status(409).json({
            error: 'DUPLICATE_CURATION',
            existingId: existing.id,
            existingTitle: existing.title,
            message: '같은 이름의 공유 단어장이 이미 존재합니다.',
          });
        }
      }

      const newCuration = await storage.createCuration(theme, words || []);
      console.log("Successfully created curation:", newCuration.id);
      res.status(201).json(newCuration);
    } catch (error: any) {
      console.error("CURATION_CREATE_ERROR:", error);
      res.status(500).json({
        error: "CURATION_CREATE_FAILURE",
        details: error?.message || String(error)
      });
    }
  });

  app.put("/api/curations/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { theme, words } = req.body;
      if (!theme || !theme.creatorId) {
        return res.status(400).json({ error: "Theme and creatorId are required" });
      }
      const updated = await storage.updateCuration(id, theme.creatorId, theme, words || []);
      res.json(updated);
    } catch (error: any) {
      if (error.message === 'Unauthorized') {
        return res.status(403).json({ error: "Not authorized to update this curation" });
      }
      if (error.message === 'Curation not found') {
        return res.status(404).json({ error: "Curation not found" });
      }
      console.error("CURATION_UPDATE_ERROR:", error);
      res.status(500).json({ error: "Failed to update curation" });
    }
  });

  app.get("/api/ai/status", (_req: Request, res: Response) => {
    res.json({ available: isGeminiAvailable() });
  });

  app.post("/api/ai/analyze", async (req: Request, res: Response) => {
    try {
      if (!isGeminiAvailable()) {
        return res.status(503).json({ error: "Gemini API key not configured" });
      }
      const { word, sourceLang, targetLang } = req.body;
      if (!word || typeof word !== "string") {
        return res.status(400).json({ error: "word is required" });
      }
      const result = await analyzeWord(word.trim(), sourceLang || 'en', targetLang || 'ko');
      res.json(result);
    } catch (error: any) {
      console.error("AI analyze error:", error?.message);
      res.status(500).json({ error: "Failed to analyze word" });
    }
  });

  app.post("/api/ai/generate-theme", async (req: Request, res: Response) => {
    try {
      if (!isGeminiAvailable()) {
        return res.status(503).json({ error: "Gemini API key not configured" });
      }
      const { theme, difficulty = "Intermediate", count = 20, existingWords = [] } = req.body;
      if (!theme || typeof theme !== "string") {
        return res.status(400).json({ error: "theme is required" });
      }
      const result = await generateThemeList(
        theme.trim(),
        difficulty,
        Math.min(Math.max(count, 5), 100),
        Array.isArray(existingWords) ? existingWords : [],
      );
      res.json(result);
    } catch (error: any) {
      console.error("AI generate-theme error:", error?.message);
      res.status(500).json({ error: "Failed to generate theme list" });
    }
  });

  app.post("/api/ai/generate-more", async (req: Request, res: Response) => {
    try {
      if (!isGeminiAvailable()) {
        return res.status(503).json({ error: "Gemini API key not configured" });
      }
      const {
        theme,
        difficulty = "Intermediate",
        count = 10,
        existingWords = [],
      } = req.body;
      if (!theme || typeof theme !== "string") {
        return res.status(400).json({ error: "theme is required" });
      }
      const result = await generateMoreWords(
        theme.trim(),
        difficulty,
        Math.min(Math.max(count, 1), 50),
        existingWords,
      );
      res.json(result);
    } catch (error: any) {
      console.error("AI generate-more error:", error?.message);
      res.status(500).json({ error: "Failed to generate more words" });
    }
  });

  app.get("/api/dict/naver", async (req: Request, res: Response) => {
    try {
      const { query, dictCode } = req.query;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "query is required" });
      }

      const code = (typeof dictCode === 'string' && dictCode) || 'enko';
      // Determine subdomain based on dict code
      let subdomain = 'en';
      if (code.startsWith('ja') || code === 'koja') subdomain = 'ja';
      else if (code.startsWith('zh') || code === 'kozh') subdomain = 'zh';
      else if (code.startsWith('ko')) subdomain = 'korean';

      const url = `https://${subdomain}.dict.naver.com/api3/${code}/search?query=${encodeURIComponent(query.trim())}&m=pc&lang=ko`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Referer': `https://${subdomain}.dict.naver.com/`,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Alldict-Locale': 'ko'
        }
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`Naver API error: ${response.status} ${response.statusText}`, text);
        return res.status(response.status).json({ error: `Naver API error: ${response.statusText}` });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Naver proxy error:", error?.message);
      res.status(500).json({ error: "Failed to fetch from Naver" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
