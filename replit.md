# SokSok Voca (쏙쏙 보카)

## Overview
A Korean vocabulary learning mobile app built with Expo/React Native. Helps users create vocabulary lists, study with flashcards/quizzes/examples/shadowing, and track memorization progress.

## Architecture
- **Frontend**: Expo Router (file-based routing) with React Native
- **Backend**: Express server on port 5000 (serves landing page + API)
- **Database**: PostgreSQL (Replit) for cloud user data and vocab sync
- **Auth**: Google OAuth (expo-auth-session) + guest mode; AuthContext manages state
- **State**: AsyncStorage for local persistence, React Context for shared state
- **Cloud Sync**: Google users' vocab data synced to PostgreSQL (debounced 2s after changes)
- **AI**: Gemini AI (via backend, GEMINI_API_KEY) for word analysis + theme generation, with fallback to free APIs
- **Translation Fallback**: MyMemory Translation API + Free Dictionary API + Datamuse API (when no Gemini key)
- **TTS**: expo-speech for text-to-speech
- **Font**: Inter (Google Fonts)

## Data Model
- **VocaList**: { id, title, words: Word[], isVisible, createdAt, lastStudiedAt }
- **Word**: { id, term, definition, exampleEn, meaningKr, isMemorized }
- Words are embedded within lists (not separate storage)
- Storage key: `@soksok_lists_v2` (auto-migrates from v1 format)

## Key Files
- `app/_layout.tsx` - Root layout with providers (Auth, Theme, Vocab, QueryClient)
- `components/LoginScreen.tsx` - Login/welcome screen (Google login + guest mode)
- `contexts/AuthContext.tsx` - Auth state management (guest/google modes)
- `app/(tabs)/` - Tab navigation (Home, AI Theme, Settings)
- `app/(tabs)/theme.tsx` - AI Theme Generator tab
- `app/list/[id].tsx` - Vocabulary list detail view
- `app/add-word.tsx` - Add/edit word form (formSheet)
- `app/flashcards/[id].tsx` - Flashcard study mode
- `app/quiz/[id].tsx` - Multiple choice quiz mode
- `app/examples/[id].tsx` - Example sentence study mode
- `app/shadowing/[id].tsx` - Listen and repeat study mode
- `app/study-results.tsx` - Study session results
- `contexts/ThemeContext.tsx` - Dark/light mode management
- `contexts/VocabContext.tsx` - Vocabulary data CRUD + study results
- `lib/vocab-storage.ts` - AsyncStorage CRUD operations (embedded words)
- `server/db.ts` - PostgreSQL connection pool
- `server/auth.ts` - Google OAuth verification + cloud sync API
- `server/gemini.ts` - Gemini AI service (word analysis, theme generation, more words)
- `server/routes.ts` - API routes (auth, sync, AI endpoints)
- `lib/translation-api.ts` - Frontend API client (Gemini backend + free API fallback)
- `lib/tts.ts` - expo-speech wrapper
- `constants/colors.ts` - Theme colors (light/dark)

## Context API
- `createList(title)` - Create new list
- `deleteList(id)` - Delete list
- `renameList(id, newTitle)` - Rename list
- `toggleVisibility(id)` - Show/hide list
- `mergeLists(sourceId, targetId, deleteSource)` - Merge two lists
- `addWord(listId, { term, definition, exampleEn, meaningKr })` - Add word
- `addBatchWords(listId, aiWords[])` - Batch add words
- `updateWord(listId, wordId, updates)` - Edit word
- `deleteWord(listId, wordId)` - Delete word
- `deleteWords(listId, wordIds[])` - Batch delete words
- `toggleMemorized(listId, wordId, forceStatus?)` - Toggle memorization

## Features
- Vocabulary list CRUD with progress tracking
- Word management with memorization toggle
- AI auto-fill using free translation APIs
- Theme Generator: generates themed word lists (Datamuse + MyMemory + Dictionary)
- Flashcard study with flip animation
- Multiple choice quiz
- Example sentence learning
- Shadowing: listen and repeat study mode
- Dark/light mode (toggle in dashboard header)
- Hide/show lists on dashboard
- Data migration from v1 format
- Dashboard: greeting header, review status badges (New/Learned/Daily/3-Day/Weekly Review), relative time, context menu (merge/rename/hide/delete), popular theme shortcuts
- List Detail: filter tabs (All/Learning/Memorized), word detail modal editor, long-press batch delete mode, study buttons grid, progress bar in header
- Theme Generator: hero section, popular theme chips with refresh, initialTheme param support, difficulty (초급/중급/고급), word count (20-100 by 10), target wordbook selector with dedup
- Add Word: list selector dropdown with create option, Edit/Dictionary tabs, external dictionary links (Naver, Google)

## API Endpoints
- `POST /api/auth/google` - Google OAuth login (body: { accessToken }) → { user }
- `GET /api/sync/data` - Get cloud vocab data (header: x-user-id) → { lists, updatedAt }
- `POST /api/sync/data` - Save vocab data to cloud (header: x-user-id, body: { lists })
- `GET /api/ai/status` - Check if Gemini AI is available
- `POST /api/ai/analyze` - Analyze a word (body: { word }) → AIWordResult
- `POST /api/ai/generate-theme` - Generate themed vocabulary (body: { theme, difficulty?, count?, existingWords? }) → { title, words }
- `POST /api/ai/generate-more` - Generate additional words (body: { theme, difficulty, count, existingWords }) → AIWordResult[]

## Recent Changes
- 2026-02-25: Fixed runtime crashes: removed incompatible KeyboardProvider (react-native-keyboard-controller version mismatch), fixed ProgressBar animation (Reanimated withTiming can't animate string percentages on native - replaced with RN Animated.Value.interpolate), fixed ThemeProvider null-return blocking navigation, fixed invalid router.replace('/(tabs)/') routes, added GestureHandlerRootView flex:1, added ErrorBoundary console.error logging
- 2026-02-25: Added login screen (Google OAuth + guest mode), AuthContext, cloud sync for Google users, PostgreSQL backend, logout in Settings
- 2026-02-25: Added AI Theme tab in bottom toolbar (between Home and Settings)
- 2026-02-25: Theme Generator: always show difficulty (초급/중급/고급) & word count (20-100, 10단위), target wordbook selector with dedup, existingWords passed to backend
- 2026-02-25: Manage modal: visibility toggle (eye icon), long-press reorder mode, "Done Reordering" button
- 2026-02-25: Context menu Rename: replaced Alert.prompt with custom popup modal (TextInput + Cancel/Rename)
- 2026-02-25: Send to Wordbook: dropdown list (all workbooks incl. hidden) with radio select, Send/Close buttons
- 2026-02-25: Added Workbook Management modal (add/reorder/rename/delete from popup, Apply to save)
- 2026-02-25: Replaced settings icon with add icon next to "My Wordbooks" header
- 2026-02-25: Fixed theme generation fallback (Datamuse API: changed topics→ml+rel_trg params, dedup, up to 10 words)
- 2026-02-25: Replaced Alert.alert context menu with custom bottom sheet modal (close button, icons, slide-up)
- 2026-02-24: Integrated Gemini AI for word analysis and theme generation with difficulty/count options
- 2026-02-24: Major UI/UX redesign based on React web app patterns (dashboard, list detail, theme gen, add word)
- 2026-02-23: Major data model refactor (embedded words, new field names)
- 2026-02-23: Added Theme Generator, Shadowing study mode
- 2026-02-23: Added list merge, batch word addition, data migration
- 2026-02-22: Initial build of all features
