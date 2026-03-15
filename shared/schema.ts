import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
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
  downloadCount: integer("download_count").default(0),
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

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
