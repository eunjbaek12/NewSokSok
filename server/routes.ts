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

      const newCuration = await storage.createCuration(theme, words || []);
      console.log("Successfully created curation:", newCuration.id);
      res.json(newCuration);
    } catch (error: any) {
      console.error("CURATION_CREATE_ERROR:", error);
      res.status(500).json({
        error: "CURATION_CREATE_FAILURE",
        details: error?.message || String(error)
      });
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
