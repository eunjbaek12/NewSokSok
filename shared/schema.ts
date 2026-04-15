import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const curated_themes = pgTable("curated_themes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  icon: text("icon"),
  category: text("category"),
  level: text("level"),
  isUserShared: boolean("is_user_shared").default(false),
  creatorName: text("creator_name"),
  creatorId: text("creator_id"),
  downloadCount: integer("download_count").default(0),
  sourceLanguage: text("source_language").default('en'),
  targetLanguage: text("target_language").default('ko'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const curated_words = pgTable("curated_words", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  themeId: varchar("theme_id").references(() => curated_themes.id, { onDelete: 'cascade' }),
  term: text("term").notNull(),
  definition: text("definition").notNull(),
  meaningKr: text("meaning_kr").notNull(),
  exampleEn: text("example_en").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});

export const cloud_users = pgTable("cloud_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  google_id: text("google_id").notNull().unique(),
  email: text("email").notNull(),
  display_name: text("display_name"),
  avatar_url: text("avatar_url"),
  is_admin: boolean("is_admin").notNull().default(false),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const cloud_vocab_data = pgTable("cloud_vocab_data", {
  user_id: varchar("user_id").primaryKey().references(() => cloud_users.id, { onDelete: "cascade" }),
  data_json: jsonb("data_json").notNull().default(sql`'[]'::jsonb`),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
