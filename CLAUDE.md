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

`pnpm test` runs Jest (`jest.config.js`, tests in `__tests__/`). ~980 tests, all passing.

⚠️ Three suites fail to *run* (not assertion failures) and have for a while:
`vocab-db` / `word-unique-target` need the `sqlite3` npm package (not installed);
`photo-import-pipeline` hits a Jest parse error. Migration tests use Node's built-in
`node:sqlite` instead and do run — see `__tests__/migration-018-review-seed.test.ts`
for the pattern (replay the 001→N ladder on a real engine).

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
2. Logged-in + `EXPO_PUBLIC_ENRICH_VIA_EDGE=1` → `lib/ai/edge-enrich.ts:enrichWordViaEdge` → Supabase Edge Function (`supabase/functions/enrich-word`) → Vertex AI Gemini. Quota-gated (Free 50단어/일, Pro 3,000단어/월·일일 제한 없음).
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
- **Never trigger an app-root global modal from inside another modal.** Same iOS
  constraint as above, but worse — and it cannot be fixed by nesting, because the
  global modal (`RewardedAdModal` / `ProLimitReachedModal` in `app/_layout.tsx`) is
  mounted at the root by design. RN marks it `_isPresented = YES` whether or not the
  present succeeded (`RCTModalHostViewComponentView.mm:156`), so after one failure it
  will never present *or* dismiss again: on iOS the app went untouchable until a force
  quit. Screens that run inside a modal register `inlineQuotaHandler`
  (`features/quota/store.ts`) and render the prompt inline instead — see the AI word
  generation banner in `features/curation/screen.tsx`. *(AdMob's own full-screen ads
  are fine over a modal — they present from the topmost VC. Only our modals break.)*
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
- **Animating an SVG works only through reanimated's `transform` array — and it fails
  silently.** RN's `Animated` cannot update `react-native-svg` props under New Arch: the
  value changes, nothing moves, no error. Moving to reanimated is not enough either — a
  `<G>` with `originX`/`originY` + an animated `rotation` still sits still; it must be a
  `transform` array (translate → rotate → translate), the form `CharacterAccessory`
  already uses. The one SVG animation that actually runs in this repo is
  `components/ui/TimerRing.tsx` (`useAnimatedProps`) — copy that. *(The character's wave
  had `AnimatedG` built but never attached to the arm, so `wave` did nothing for a year;
  once attached it hit both layers above. What separated them: **loop it forever and paint
  the moving part red** — red visible but coordinates frozen means the prop is the
  problem, not Fast Refresh. And an animation cannot be measured with screenshots —
  `screenrecord` → ffmpeg frames → judge by a pixel boundary. Careful which boundary:
  normalizing the arm tip by the character's own width gave a constant 1.0, because the
  arm **is** the right edge.)*
- **`ListHeaderComponent` must be given an *element*, not a function, if anything inside it
  holds state.** `VirtualizedList` renders a non-element as `<ListHeaderComponent />`
  (`VirtualizedList.js:939`), so a header render function defined inline in the screen body is
  a **new component type on every render** — React unmounts and remounts the whole header
  subtree, wiping its state. Pass `ListHeaderComponent={renderHeader()}` (called) instead.
  *(The fill-bare-words banner could never show its progress or result: every filled word
  re-rendered the list, which remounted the banner and reset its state. It hid well because
  the work itself ran in a closure and finished correctly — the screen lied, the DB told the
  truth. Verify list-header UI against stored state, not the screen.)*
- **A value that arrives asynchronously must not be frozen into state on first render.** The
  same feature shipped two bugs from this: the header above, and a pick screen that seeded its
  selection before the "unfillable" list loaded, then kept 3 selected items that were no longer
  selectable ("3/0", an enabled button that silently did nothing). Derive from the current
  value each render, or re-read on focus — don't snapshot on mount.
- **An inner view painting `colors.background` is invisible until a background exists —
  then it becomes an opaque stripe.** The vocab-lists search bar wrapper carried
  `backgroundColor: colors.background`, the same color as its container, so it did nothing
  for five skins. The moment `SkinBackdrop` (autumn/hangul) went in behind it, the pattern
  **cut out along that one band**. Nothing scrolled under it — the paint was pure redundancy.
  Before mounting a full-screen backdrop on a screen, grep it for `colors.background` and
  make every hit but the container transparent. *(Redundant paint reads as correct in review
  precisely because it changes nothing — until something is put behind it.)*
- **Only `DialogModal` pads its body. `ModalOverlay` does not.** The rule above about not
  double-padding applies to `DialogModal`; a `ModalOverlay` sheet gets no horizontal padding
  and its text will sit flush against the screen edge unless the caller adds
  `PopupTokens.padding.container` (see `WhatsNewSheet`).
- **Never `new DOMException(...)` — Hermes has no such global.** Use `abortError()`
  (`lib/abort-error.ts`) for cancellation. The old code threw
  `ReferenceError: Property 'DOMException' doesn't exist` *inside an abort listener*, so the
  promise was never rejected and every `e?.name === 'AbortError'` branch above it missed
  (`lib/enrich-queue-core.ts`, `lib/ai/edge-*.ts`, curation/study screens). It surfaced only
  when a **[Stop] button** finally existed to hit that path — search cancel, batch-import
  cancel and photo-scan cancel had been quietly broken the whole time.
- **A cancel/stop button cannot be verified against a cached path.** Filling 12 words finished
  in 3 seconds on cache hits, so [Stop] was never reachable — one attempt landed on the *done*
  banner's ✕ instead and looked like "stop doesn't work". Inject a delay into the request
  function to open the window. *(Related: uiautomator reported the banner's right-hand tap
  target 93px off in x — read coordinates off a screenshot, not the dump.)*

When you find a new instance of "the default made this easy to get wrong", prefer
fixing the default over adding a rule here.

### Community Curation

- Google login required to share. Both entry points (list ⋯ menu, and the box at the end of the
  공유 단어장 tab) send guests to Google sign-in before the share dialog opens (`useShareSignIn`).
- The share dialog (`features/curation/ShareListDialog.tsx`) is shared by both entry points. It previews
  the real card (`toSharedThemePreview` → `CurationCardView`) and requires a nickname — the Google
  account name is never used as a fallback (it used to publish the full real name).
- `features/vocab/api.ts` — `fetchCloudCurations`, `shareCuration`, `deleteCloudCuration` (all Supabase SDK calls).
- Admin accounts in `app_admins` table can delete any curation.

### Monetization (v1.1 planned)

3-tier model. Unit displayed to users is **"단어 수" (word count)**, not points.

> **This table is the live policy.** Switched on 2026-08-16, re-verified 2026-09-11:
> `ai_effective_plan` returns Free 50/day, first-24h 300, Pro 3,000/month, reward 20 x2,
> and no guest tier; Edge `enrich-word` (v48) charges cache hits and, on overage, returns
> basic-200 for `autocomplete` while `photo`/`generate` still get 429.
>
> History — the ordering rule this cost us: on 2026-08-13 the policy was pushed to the
> server *before* its app shipped, and `grant_rewarded_bonus` lost the 3-arg signature the
> store build called, so rewarded ads paid out 0 words for two days. It was reverted on
> 8/14 (`4f76395`) and switched back on 8/16 once 1.5.0 had reached both stores. See
> `supabase/migrations/20260814000000_revert_to_shipped_quota_policy.sql`.
>
> 🔴 **Ship the app before the server** whenever a quota/policy change touches both.
> 🔴 **Keep the 3-arg `grant_rewarded_bonus` alongside the new one** — store apps update on a lag.
> 🔴 **`db push` ships every unapplied migration, not just the one you mean.** To apply a
> single file: `db query --file <migration>`, then `migration repair --status applied <version>`.

| Tier | Price | Ads | AI quota | Key |
|---|---|---|---|---|
| Free | 0 | Banner (all screens) + rewarded on quota exceed | 50 단어/일 (+20 per ad view, max 2 views). **First 24h after signup: 300** | Operator (Vertex AI) |
| BYOK | 0 | Banner only | Unlimited (own key) | User's Gemini |
| Pro | ₩3,900/month · yearly ₩36,000 (Play) / ₩35,900 (App Store) — ~23% off vs 12× monthly | None | 3,000 단어/월, 일일 제한 없음 | Operator (Vertex AI) |
| Pro Lite (v1.2+) | ₩1,900/month or ₩17,900/year | None | Unlimited (own key) | BYOK |

**Word-count weighting** (for quota; operator/Edge path only — BYOK is uncharged).
The rule users are told is one sentence: **"you're charged for the words AI fills in for you."**
- Auto-complete 1 word = 1 단어 (`enrich-word`, mode `autocomplete`)
- AI word generation = 1 단어 per generated word (`generate-words`, e.g. 20-word set = 20). The
  over-generate buffer (+3~6, absorbed by the operator) is **not** charged; a short return refunds the gap.
- Photo scan = 1 단어 per recognized word (`enrich-word` mode `photo`). **No per-image overhead** —
  `scan-image` checks that quota remains but charges 0, so the count matches what the user receives.
- **Cache hits are charged too.** The user can neither see nor predict whether a word was cached, so
  free cache hits made usage unpredictable; charging keeps the rule above true and, since a hit costs
  nothing to serve, it is pure margin. This also keeps the daily limit meaningful after cache seeding.

**Quota exhaustion** differs by feature, on purpose:
- Auto-complete → still returns the **meaning only** (`enrichment_level: 'basic'`), so a single lookup
  never dead-ends. Examples/pronunciation are filled later via the word detail's AI auto-complete.
- Photo scan / AI generation → **hard stop at the limit** with a rewarded-ad prompt. These are bulk
  acquisition features; filling them past the limit would erase both the ad and the Pro incentive.

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
