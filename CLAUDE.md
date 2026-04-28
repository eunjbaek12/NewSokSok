# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm start            # Run Expo (frontend only — no backend)

# Linting
pnpm run lint         # Run ESLint
pnpm run lint:fix     # Auto-fix lint issues

# Building
pnpm run expo:static:build  # Static Expo web build
```

There is no configured test script. Jest and ts-jest are in devDependencies with test files in `__tests__/`.

## Architecture Overview

**SokSok Voca (쏙쏙 보카)** is a Korean/English vocabulary learning app with multiple study modes: flashcards, quiz, examples, autoplay/shadowing.

### Stack

- **Frontend:** React Native + Expo ~54, React 19, TypeScript ~5.9
- **Routing:** expo-router v6 (file-based, similar to Next.js)
- **State:** Zustand + React Context API
- **Local DB:** Expo SQLite (`soksok_voca.db`) with manual migration system (`lib/db/`)
- **Cloud:** Supabase (Auth + Postgres) — `lib/supabase/client.ts`
- **AI:** Google Gemini API (`lib/ai/gemini-client.ts`)

### Key Architectural Decisions

**Offline-first dual-database:** All data is stored locally in SQLite first. Google-authenticated users sync to Supabase Postgres with a 2-second debounce (`features/sync/engine.ts`). Guest mode is local-only.

**Supabase Auth:** Google Sign-In via `@react-native-google-signin/google-signin` → `idToken` → `supabase.auth.signInWithIdToken`. Session is managed automatically by the Supabase SDK. See `features/auth/store.ts`.

**RLS security:** Supabase Row Level Security enforces that users can only read/write their own rows. `user_id` column defaults to `auth.uid()` on insert. No server needed.

**No backend server:** The Express backend has been removed. All data operations go directly to Supabase via `@supabase/supabase-js`. Hosting cost: $0 (Supabase free tier).

**State management stores** (Zustand via `features/*/store.ts`):
- `useAuthStore` — Google / guest mode, Supabase session
- `useSyncStore` — dirty-set, lastPulledAt, isSyncing

**State management contexts** (`contexts/`):
- `VocabContext` — vocabulary lists, words, study results
- `SettingsContext` — input/study/autoplay settings (AsyncStorage under `@soksok_*`)
- `ThemeContext` — light/dark theme

**Path aliases** in `tsconfig.json`: `@/*` → project root, `@shared/*` → `./shared/`

**Web platform caveat:** Expo SQLite is mocked/unavailable on web. The `lib/vocab-storage.ts` handles this platform split.

### Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL        # Supabase project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY   # Supabase anon/public key
EXPO_PUBLIC_GOOGLE_CLIENT_ID    # Google Web Client ID (webClientId for GoogleSignin + Supabase)
EXPO_PUBLIC_GEMINI_API_KEY      # Optional — dev scripts/tests only. Production uses user-entered key.
```

### AI Calls

AI features (Gemini) are called **directly from the client** using the user's own API key (entered in settings). See `lib/ai/gemini-client.ts` for the SDK wrapper and `lib/translation-api.ts` / `features/curation/screen.tsx` for the call sites.

### SQLite Schema Migrations

Migrations are manually versioned in `lib/db/`. When modifying the local schema, increment the migration version and add a migration step — do not alter existing migration steps.

### Community Curation

- Google login required to share. Guests see the share button disabled with a login prompt.
- `features/vocab/api.ts` — `fetchCloudCurations`, `shareCuration`, `deleteCloudCuration` (all Supabase SDK calls).
- Admin accounts in `app_admins` table can delete any curation.
