# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev              # Run frontend (Expo) + backend (Express) concurrently
pnpm start            # Frontend only (Expo)
pnpm run server:dev   # Backend only (Express on port 5000)

# Linting
pnpm run lint         # Run ESLint
pnpm run lint:fix     # Auto-fix lint issues

# Building
pnpm run server:build # Compile backend with esbuild
pnpm run expo:static:build  # Static Expo web build

# Database
pnpm run db:push      # Apply Drizzle ORM migrations to PostgreSQL
```

There is no configured test script. Jest and ts-jest are in devDependencies with test files in `__tests__/`.

## Architecture Overview

**SokSok Voca (쏙쏙 보카)** is a Korean/English vocabulary learning app with multiple study modes: flashcards, quiz, examples, autoplay/shadowing.

### Stack

- **Frontend:** React Native + Expo ~54, React 19, TypeScript ~5.9
- **Routing:** expo-router v6 (file-based, similar to Next.js)
- **State:** React Context API (no Redux/Zustand)
- **Local DB:** Expo SQLite (`soksok_voca.db`) with manual migration system (5 versions in `lib/db/`)
- **Cloud DB:** PostgreSQL via Drizzle ORM (Supabase) — shared schema in `shared/schema.ts`
- **Backend:** Express.js 5 server (`server/`)
- **AI:** Google Gemini API (`lib/gemini-api.ts`, `server/gemini.ts`)

### Key Architectural Decisions

**Dual-database strategy:** All data is stored locally in SQLite first (offline-first). Google-authenticated users also sync to PostgreSQL with a 2-second debounce via `POST /api/sync/data`. Guest mode is fully local-only.

**State management contexts** (`contexts/`):
- `VocabContext` — vocabulary lists, words, study results, cloud sync logic
- `AuthContext` — Google OAuth / guest mode, persisted to AsyncStorage
- `SettingsContext` — input settings, study settings, autoplay settings (3 AsyncStorage keys under `@soksok_*`)
- `ThemeContext` — light/dark theme

**Path aliases** in `tsconfig.json`: `@/*` → project root, `@shared/*` → `./shared/`

**Web platform caveat:** Expo SQLite is mocked/unavailable on web. The `lib/vocab-storage.ts` handles this platform split.

### Environment Variables

```
EXPO_PUBLIC_GEMINI_API_KEY   # Google Gemini API key (client-accessible)
DATABASE_URL                 # PostgreSQL connection string (server only)
```

### SQLite Schema Migrations

Migrations are manually versioned in `lib/db/`. When modifying the local schema, increment the migration version and add a migration step — do not alter existing migration steps.
