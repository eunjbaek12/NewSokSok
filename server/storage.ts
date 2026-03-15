import { type User, type InsertUser, users, curated_themes, curated_words } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getCurations(): Promise<any[]>;
  createCuration(themeData: any, words: any[]): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const [user] = await db.insert(users).values({ ...insertUser, id }).returning();
    return user;
  }

  async getCurations(): Promise<any[]> {
    const themes = await db.select().from(curated_themes);
    const words = await db.select().from(curated_words);

    return themes.map(theme => ({
      ...theme,
      words: words.filter(w => w.themeId === theme.id)
    }));
  }

  async createCuration(themeData: any, wordsData: any[]): Promise<any> {
    const themeId = themeData.id || randomUUID();

    try {
      const [theme] = await db.insert(curated_themes).values({
        id: themeId,
        title: themeData.title,
        description: themeData.description || null,
        icon: themeData.icon || '✨',
        category: themeData.category || null,
        level: themeData.level || null,
        isUserShared: themeData.isUserShared ?? false,
        creatorName: themeData.creatorName || null,
        downloadCount: themeData.downloadCount ?? 0,
      }).returning();

      if (wordsData && wordsData.length > 0) {
        const wordsToInsert = wordsData.map(w => ({
          id: randomUUID(),
          themeId: theme.id,
          term: w.term,
          definition: w.definition || '',
          meaningKr: w.meaningKr || '',
          exampleEn: w.exampleEn || '',
        }));
        await db.insert(curated_words).values(wordsToInsert);
      }

      return {
        ...theme,
        words: wordsData
      };
    } catch (e: any) {
      console.error("Database insert failed in createCuration:", e);
      throw new Error(`DB Insert Failed: ${e.message || String(e)}`);
    }
  }
}

export const storage = new DatabaseStorage();
