import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, bigint, index } from "drizzle-orm/pg-core";

// Unix milliseconds via NOW(). SQLite `createdAt INTEGER` mirror, JS Number-safe.
const nowEpochMs = sql`(extract(epoch from now())*1000)::bigint`;

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

// ---------------------------------------------------------------------------
// Normalized sync schema (step 1b) — row-per-list / row-per-word.
// Enables delta sync and row-level last-write-wins.
// ---------------------------------------------------------------------------

export const cloud_lists = pgTable("cloud_lists", {
  id:              varchar("id").primaryKey(),
  userId:          varchar("user_id").notNull()
                     .references(() => cloud_users.id, { onDelete: 'cascade' }),
  title:           text("title").notNull(),
  isVisible:       boolean("is_visible").notNull().default(true),
  isCurated:       boolean("is_curated").notNull().default(false),
  icon:            text("icon"),
  position:        integer("position").notNull().default(0),
  planTotalDays:   integer("plan_total_days").notNull().default(0),
  planCurrentDay:  integer("plan_current_day").notNull().default(1),
  planWordsPerDay: integer("plan_words_per_day").notNull().default(10),
  planStartedAt:   bigint("plan_started_at", { mode: 'number' }),
  planUpdatedAt:   bigint("plan_updated_at", { mode: 'number' }),
  planFilter:      text("plan_filter").notNull().default('all'),
  sourceLanguage:  text("source_language").notNull().default('en'),
  targetLanguage:  text("target_language").notNull().default('ko'),
  lastResultMemorized: integer("last_result_memorized").notNull().default(0),
  lastResultTotal:     integer("last_result_total").notNull().default(0),
  lastResultPercent:   integer("last_result_percent").notNull().default(0),
  lastStudiedAt:   bigint("last_studied_at", { mode: 'number' }),
  isUserShared:    boolean("is_user_shared").notNull().default(false),
  creatorId:       text("creator_id"),
  creatorName:     text("creator_name"),
  downloadCount:   integer("download_count").notNull().default(0),
  createdAt:       bigint("created_at", { mode: 'number' }).notNull().default(nowEpochMs),
  updatedAt:       bigint("updated_at", { mode: 'number' }).notNull().default(nowEpochMs),
  deletedAt:       bigint("deleted_at", { mode: 'number' }),
}, (t) => ({
  userUpdated: index("cloud_lists_user_updated_idx").on(t.userId, t.updatedAt),
  userDeletedUpdated: index("cloud_lists_user_deleted_updated_idx").on(t.userId, t.deletedAt, t.updatedAt),
  userPosition: index("cloud_lists_user_position_idx").on(t.userId, t.position),
}));

export const cloud_words = pgTable("cloud_words", {
  id:             varchar("id").primaryKey(),
  listId:         varchar("list_id").notNull()
                    .references(() => cloud_lists.id, { onDelete: 'cascade' }),
  userId:         varchar("user_id").notNull()
                    .references(() => cloud_users.id, { onDelete: 'cascade' }),
  term:           text("term").notNull(),
  definition:     text("definition").notNull().default(''),
  phonetic:       text("phonetic"),
  pos:            text("pos"),
  exampleEn:      text("example_en").notNull().default(''),
  exampleKr:      text("example_kr"),
  meaningKr:      text("meaning_kr").notNull().default(''),
  isMemorized:    boolean("is_memorized").notNull().default(false),
  isStarred:      boolean("is_starred").notNull().default(false),
  tags:           text("tags"),
  position:       integer("position").notNull().default(0),
  wrongCount:     integer("wrong_count").notNull().default(0),
  assignedDay:    integer("assigned_day"),
  sourceLang:     text("source_lang").notNull().default('en'),
  targetLang:     text("target_lang").notNull().default('ko'),
  createdAt:      bigint("created_at", { mode: 'number' }).notNull().default(nowEpochMs),
  updatedAt:      bigint("updated_at", { mode: 'number' }).notNull().default(nowEpochMs),
  deletedAt:      bigint("deleted_at", { mode: 'number' }),
}, (t) => ({
  userUpdated: index("cloud_words_user_updated_idx").on(t.userId, t.updatedAt),
  userDeletedUpdated: index("cloud_words_user_deleted_updated_idx").on(t.userId, t.deletedAt, t.updatedAt),
  list: index("cloud_words_list_idx").on(t.listId),
  listDeletedPosition: index("cloud_words_list_deleted_position_idx").on(t.listId, t.deletedAt, t.position),
}));
