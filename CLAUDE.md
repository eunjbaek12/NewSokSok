# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Git branch discipline (multiple sessions share ONE working tree)

The operator often runs several Claude sessions against this single checkout at
the same time. The repo can only have one branch checked out, and uncommitted
changes follow a branch switch — so if one session switches branches, every other
session's working tree changes underfoot and it becomes impossible to tell which
work belongs to which branch. This has already caused a session's edits to appear
lost. Therefore, unless the user explicitly asks in this session:

- **Do NOT switch branches** (`git switch`/`checkout`), create branches, or
  `git stash`. Work on — and commit to — whatever branch is currently checked
  out. If a change really belongs on a different branch, ask the user; don't move
  it yourself.
- **Never `git add -A`/`git add .`/`git commit -a`.** Other sessions' uncommitted
  work is sitting in the same tree. Stage only the explicit file paths you
  changed (`git commit <path> -m …`).
- Before committing, run `git status` and confirm every path you're staging is
  yours. Leave everything else alone.

## Commands

```bash
# Development
pnpm start            # Run Expo (frontend only — no backend)

# Linting
pnpm run lint         # Run ESLint
pnpm run lint:fix     # Auto-fix lint issues
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

**Offline-first dual-database:** All data is stored locally in SQLite first. Google-authenticated users sync to Supabase Postgres with a 30-second debounce (`features/sync/engine.ts`, `DEBOUNCE_MS = 30000`). Guest mode is local-only.

**Supabase Auth:** Google Sign-In via `@react-native-google-signin/google-signin` → `idToken` → `supabase.auth.signInWithIdToken`. Session is managed automatically by the Supabase SDK. See `features/auth/store.ts`.

**RLS security:** Supabase Row Level Security enforces that users can only read/write their own rows. `user_id` column defaults to `auth.uid()` on insert.

**Backend strategy:** No long-running server. Data operations go directly to Supabase via `@supabase/supabase-js`. AI enrich proxy uses **Supabase Edge Functions** (planned v1.1) with operator's Agent Platform (= Vertex AI, rebranded 2026-04) service-account key — fits BaaS/serverless model, not Express revival. Hosting cost: $0 (Supabase free tier) until DAU scale. **verify-purchase** Edge supports Android (Google Play Developer API) and iOS (App Store Server API JWS) — Apple credentials in `APPLE_KEY_ID/ISSUER_ID/BUNDLE_ID/PRIVATE_KEY` Supabase secrets, see `supabase/functions/verify-purchase/README.md`.

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

> Secret storage/rotation policy (5-tier registry, "where does a new secret go?" decision rule, pre-commit hook): **`docs/secrets-management.md`**. Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `VERTEX_SA_*`, `PLAY_SA_*`, `APPLE_*`) live in Supabase Edge Secrets, never the bundle.

```
EXPO_PUBLIC_SUPABASE_URL              # Supabase project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY         # Supabase anon/public key
EXPO_PUBLIC_GOOGLE_CLIENT_ID          # Google Web Client ID (webClientId for GoogleSignin + Supabase)
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS      # Google iOS Client ID (iosClientId, required for iOS Google Sign-In)
EXPO_PUBLIC_ENRICH_VIA_EDGE           # "1" to route non-BYOK enrich calls through Supabase Edge Function
EXPO_PUBLIC_ADMOB_ANDROID_APP_ID      # AdMob Android App ID. Unset = test App ID
EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID   # AdMob banner unit. Unset = TestIds.BANNER
EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID # AdMob rewarded unit. Unset = TestIds.REWARDED
EXPO_PUBLIC_ADMOB_IOS_APP_ID          # AdMob iOS App ID. Required for iOS production.
EXPO_PUBLIC_ADMOB_IOS_BANNER_ID
EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID
EXPO_PUBLIC_PRO_MONTHLY_SKU           # Play subscription SKU (defaults to 'pro_monthly')
EXPO_PUBLIC_PRO_YEARLY_SKU            # Play subscription SKU (defaults to 'pro_yearly')
GEMINI_API_KEY                        # Optional — dev scripts only. Production uses user-entered key (SecureStore). Do NOT add EXPO_PUBLIC_ prefix.
```

### AI Calls

**Current (v1.1):** Three paths in `lib/translation-api.ts:enrichWord` (priority order):
1. User has Gemini key (BYOK) → `lib/ai/gemini-client.ts:analyzeWord` (direct client → Google). No quota; user's own key.
2. Logged-in + `EXPO_PUBLIC_ENRICH_VIA_EDGE=1` → `lib/ai/edge-enrich.ts:enrichWordViaEdge` → Supabase Edge Function (`supabase/functions/enrich-word`) → Vertex AI Gemini. Quota-gated (Free 100단어/일, Pro 1,000단어/일, KST midnight reset).
3. Source = English → `dictionaryapi.dev` fallback (definition + example, no Korean).
4. Other source language → empty result.

Edge Function uses operator's GCP Agent Platform service account key (stored in Supabase Secrets, never in app bundle). See `supabase/functions/enrich-word/README.md` for deploy steps and `supabase/migrations/20260518000000_ai_quota.sql` for `user_subscriptions` / `ai_usage_daily` / RPC definitions.

**Removed (2026-05-17):** Naver dict unofficial API (`lib/naver-dict-api.ts`) — browser-impersonating scraper, ToS/DB-rights risk. External "Naver 사전" links via `WebBrowser.openBrowserAsync` in `app/add-word.tsx` and `components/WordDetailModal.tsx` remain (legal).

**Datamuse** autocomplete (English-only) lives in `lib/datamuse-api.ts`. Used for typing suggestions in add-word search field.

### SQLite Schema Migrations

Migrations are manually versioned in `lib/db/`. When modifying the local schema, increment the migration version and add a migration step — do not alter existing migration steps.

### UI checklist — run this whenever you add or review a screen/modal/component

These are mistakes that actually shipped in this repo, each from a default that was
easy to forget. Check them **before** saying a UI change is done — most are invisible
in code review and only show up on a device.

- **Modal body padding is automatic — don't add it again.** `DialogModal` pads the
  body by default (`bodyPadding`), matching the header/footer alignment line. Adding
  `paddingHorizontal` in the caller double-pads it. Only when body items must reach
  the modal edge (full-width highlight rows, dividers) set `bodyPadding={false}` and
  pad the inner elements instead. *(Before the default existed, callers hand-rolled
  it and the magic number `20` spread by copy-paste — three modals shipped 4px off
  the header, and one shipped with no body padding at all.)*
- **A modal containing a `TextInput` needs `scrollable={true}`.** `DialogModal` only
  dismisses the keyboard on background tap when scrollable; with `false` the iOS
  keyboard traps the user.
- **Nest modal-over-modal as children, never siblings.** Two sibling RN `Modal`s
  shown at once leave the second invisible on iOS. Render a picker inside the parent
  modal's `children`.
- **Colors come from tokens.** Inline hex is blocked by lint (`no-restricted-syntax`);
  use `colors.X` from `@/features/theme`.
- **A View with `backgroundColor` + `borderRadius` can still render square on Android (New
  Arch/Fabric).** The style is correct — printed on-device with `console.log(StyleSheet.flatten(...))`
  the value was `borderRadius: 19, w=h=38, bg set`, yet Android drew a square. **`borderWidth`
  does NOT fix it** (1px and 2px both stayed square — an earlier "fix" that claimed a same-color
  border switches Android to a rounded path was wrong). The fix is **`overflow: 'hidden'`**,
  which forces rounded clipping of the background. A same-View border with *no* background
  (e.g. today's ring) is unaffected — it draws round without help, which is exactly why the
  two cases diverged. *(The calendar's memorized-day markers were "fixed" FIVE times — `999`
  → `'50%'` → `onLayout` → explicit `Dimensions` px → `borderWidth` — each confidently wrong,
  because none of them printed the value; every attempt only changed how the size was
  computed. The sixth fix landed only after a `flatten` log proved `borderRadius` was already
  19 and the bug was one layer down in the native renderer. **Before changing a value, print
  the value.** Check what the value *is* before theorizing about why it's wrong.)*
- **SVG copied from a design tool needs its leading zeros restored.** Illustrator/Figma
  export `offset=".2135"`; `react-native-svg` cannot parse that form and **discards the
  value**. It is not just console noise — 27 gradient stops were being dropped on the
  avocado character, flattening its gradient. Write `"0.2135"`.

When you find a new instance of "the default made this easy to get wrong", prefer
fixing the default over adding a rule here.

### Community Curation

- Google login required to share. Guests see the share button disabled with a login prompt.
- `features/vocab/api.ts` — `fetchCloudCurations`, `shareCuration`, `deleteCloudCuration` (all Supabase SDK calls).
- Admin accounts in `app_admins` table can delete any curation.

### Monetization (v1.1 planned)

3-tier model. Unit displayed to users is **"단어 수" (word count)**, not points.

| Tier | Price | Ads | AI quota (per day) | Key |
|---|---|---|---|---|
| Free | 0 | Banner (all screens) + rewarded on quota exceed | 100 단어 (+50 per ad view, hard cap 300). **First 24h after signup: 300** | Operator (Vertex AI) |
| BYOK | 0 | Banner only | Unlimited (own key) | User's Gemini |
| Pro | ₩3,900/month or ₩35,900/year (~23% off vs 12× monthly) | None | 1,000 단어 | Operator (Vertex AI) |
| Pro Lite (v1.2+) | ₩1,900/month or ₩17,900/year | None | Unlimited (own key) | BYOK |

**Word-count weighting** (for quota; operator/Edge path only — BYOK is uncharged):
- Auto-complete 1 word = 1 단어 (`enrich-word`, mode `autocomplete`)
- AI word generation = 1 단어 per generated word, charged by requested count (`generate-words`, e.g. 20-word set = 20)
- Photo scan = 5 단어 extraction overhead per image (`scan-image`) + 1 단어 per enriched word (`enrich-word` mode `photo`, cache hits free)

**Free trial:** store offer only (Play/ASC), applied at checkout — **not** granted on signup.
The server-side 7-day signup trial was removed 2026-07-27
(`supabase/migrations/20260727000000_signup_boost_replaces_trial.sql`) because it ran on top of the
store offer (up to 14 free days) and produced 0 paid conversions out of 48 trials. New users instead
get a **300-word quota for their first 24 hours** — this exists solely to stop first-session photo
scans from hitting the 100-word wall, which is the one thing the signup trial was actually doing.

Trials granted before that date are untouched and keep Pro until `trial_ends_at` passes; the UI still
distinguishes trial from paid via `getProMode` (`features/quota/store.ts`). `trial_history` /
`email_hash()` are retained (unused) so a server trial could be reintroduced without losing the
re-acquisition guard. **Trial length is never hardcoded in the app** — `trialDaysFor`
(`features/billing/usePurchaseFlow.ts`) reads it from the store product, so no offer = no trial copy.

**Age/ads policy:** App is targeted at ages 14+ and does not collect age. Ads (banner + rewarded) are shown to all non-Pro users — there is no per-user under-14 ad gating. `initAdMob` deliberately omits `tagForChildDirectedTreatment` / `tagForUnderAgeOfConsent` and sets `maxAdContentRating: PG` (`lib/ads/admob.ts`).

**BYOK location:** Settings → 고급 설정 (hidden by default; not advertised to general users to avoid confusion).

### Curation Licensing

Built-in curated lists (`constants/curationData.ts`):
- NGSL / BSL / NAWL / TSL by Browne & Culligan — **CC BY-SA 4.0**, attribution in `description`.
- Theme decks (Alice, Sherlock, Little Prince, etc.) — copyright review pending. Some works (e.g. Le Petit Prince) still under copyright in some jurisdictions.

Per CC BY-SA 4.0 ShareAlike: in-app license/attribution page required for derivative redistribution (see Task #9, #12 in v1.1 work).
