import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import {
  isGeminiAvailable,
  analyzeWord,
  generateThemeList,
  generateMoreWords,
} from "./gemini";
import { registerAuthRoutes } from "./auth";

export async function registerRoutes(app: Express): Promise<Server> {
  registerAuthRoutes(app);

  app.get("/api/ai/status", (_req: Request, res: Response) => {
    res.json({ available: isGeminiAvailable() });
  });

  app.post("/api/ai/analyze", async (req: Request, res: Response) => {
    try {
      if (!isGeminiAvailable()) {
        return res.status(503).json({ error: "Gemini API key not configured" });
      }
      const { word } = req.body;
      if (!word || typeof word !== "string") {
        return res.status(400).json({ error: "word is required" });
      }
      const result = await analyzeWord(word.trim());
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

  const httpServer = createServer(app);
  return httpServer;
}
