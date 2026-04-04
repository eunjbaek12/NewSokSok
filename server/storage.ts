import { type User, type InsertUser, users, curated_themes, curated_words } from "@shared/schema";
import { db } from "./db";
import { eq, and, ilike } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getCurations(): Promise<any[]>;
  createCuration(themeData: any, words: any[]): Promise<any>;
  findDuplicateCuration(creatorId: string, title: string): Promise<any | null>;
  updateCuration(id: string, creatorId: string, themeData: any, words: any[]): Promise<any>;
  deleteCuration(id: string, requesterId: string, isAdmin: boolean): Promise<void>;
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
        creatorId: themeData.creatorId || null,
        downloadCount: themeData.downloadCount ?? 0,
        sourceLanguage: themeData.sourceLanguage || 'en',
        targetLanguage: themeData.targetLanguage || 'ko',
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
  async findDuplicateCuration(creatorId: string, title: string): Promise<any | null> {
    const [existing] = await db.select().from(curated_themes).where(
      and(
        eq(curated_themes.creatorId, creatorId),
        ilike(curated_themes.title, title)
      )
    );
    return existing || null;
  }

  async updateCuration(id: string, creatorId: string, themeData: any, wordsData: any[]): Promise<any> {
    const [existing] = await db.select().from(curated_themes).where(eq(curated_themes.id, id));
    if (!existing) throw new Error('Curation not found');
    if (existing.creatorId !== creatorId) throw new Error('Unauthorized');

    const [theme] = await db.update(curated_themes).set({
      title: themeData.title,
      description: themeData.description || null,
      icon: themeData.icon || '✨',
      category: themeData.category || null,
      level: themeData.level || null,
      sourceLanguage: themeData.sourceLanguage || 'en',
      targetLanguage: themeData.targetLanguage || 'ko',
      updatedAt: new Date(),
    }).where(eq(curated_themes.id, id)).returning();

    await db.delete(curated_words).where(eq(curated_words.themeId, id));

    if (wordsData && wordsData.length > 0) {
      const wordsToInsert = wordsData.map(w => ({
        id: randomUUID(),
        themeId: id,
        term: w.term,
        definition: w.definition || '',
        meaningKr: w.meaningKr || '',
        exampleEn: w.exampleEn || '',
      }));
      await db.insert(curated_words).values(wordsToInsert);
    }

    return { ...theme, words: wordsData };
  }

  async deleteCuration(id: string, requesterId: string, isAdmin: boolean): Promise<void> {
    const [existing] = await db.select().from(curated_themes).where(eq(curated_themes.id, id));
    if (!existing) throw new Error('Curation not found');
    if (!isAdmin && existing.creatorId !== requesterId) throw new Error('Unauthorized');

    await db.delete(curated_themes).where(eq(curated_themes.id, id));
  }
}

export const storage = new DatabaseStorage();
