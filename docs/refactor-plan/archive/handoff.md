# SokSok 리팩터 핸드오프 노트 (Step 0 → 13 완료, 10b 본 스윕만 남음)

> 원문 계획: `docs/refactor-plan/refactor-plan.md` — 전체 17단계 로드맵.
> 이 문서: 지금까지 완료된 내용 + 다음 세션에서 바로 이어갈 수 있는 상태/주의점 정리.

## 현재 상태 한 줄 요약

**Step 13 완료 — 레거시 Postgres 청소**. 제거된 코드: (1) `server/routes/sync.ts`의 `GET /api/sync/data`(빈 배열 스텁) + `POST /api/sync/data`(410 Gone) 두 핸들러, (2) `migrateLegacyIfNeeded` import + pull 핸들러의 호출, (3) `server/routes/auth.ts::findOrCreateGoogleUser`에서 신규 유저 생성 시 `INSERT INTO cloud_vocab_data (...) VALUES ($1, '[]'::jsonb)` 구문, (4) `server/services.ts`의 `migrateLegacyIfNeeded()` + `markMigrationFailed()` 함수 전체(~110줄) + `cloud_vocab_data`/`VocaListSchema`/`ZodError`/`fromZodError` import, (5) `shared/schema.ts`의 `cloud_vocab_data` pgTable 정의 + `cloud_users.legacy_migration_status` 컬럼 + `jsonb` drizzle-orm import. `VocaListSchema`는 `shared/contracts.ts`에 그대로 유지(도메인 스키마, 레거시와 무관). tsc 통과, Jest 95/103(회귀 0). **사용자가 Supabase에 반영할 작업**: `pnpm db:push` 실행 시 drizzle-kit이 `DROP TABLE cloud_vocab_data` + `ALTER TABLE cloud_users DROP COLUMN legacy_migration_status` 프롬프트를 띄움 → "truncate and drop" 선택. 남은 작업: **Step 10b 본 스윕**(UI 리뷰 동반)만.

**Step 11 완료 — SQLite 마이그레이션 분리**. `lib/db/schema.ts` 삭제 + `lib/db/migrations/NNN_<slug>.ts` 13개 파일 + `migrations/index.ts` registry(`MIGRATIONS` 배열 + `SCHEMA_VERSION = MIGRATIONS.length` + `assertContiguous()`). `lib/db/index.ts` 러너 ~230줄 → ~80줄. fresh install / 기존 v13 DB / 중간 버전 업그레이드 3경로 모두 기존 최종 shape와 열/인덱스 단위 동일함 교차 검증.

**Step 10b 가드 설치** — 본 스윕(457개 치환) 미진행. `eslint.config.js` `no-restricted-syntax` + hex 리터럴 정규식 ERROR (데이터/로직 레이어만). UI 레이어 제외.

## 완료된 Step

| # | 범위 | 주요 산출물 |
|---|------|-------------|
| 0  | 기반 설치 | `zustand` 추가, `jest.config.js`에 `@shared/*` 매핑 |
| 1  | 기반 인프라 | `shared/contracts.ts`(Zod 전수), `shared/types.ts`, `lib/api/{client,errors}.ts`, `lib/storage/persisted.ts`, `lib/theme/tokens.ts`, `server/middleware/{validateBody,validateQuery,requireAuth}.ts` |
| 1b | DB 스키마 | `users` 제거, `cloud_lists`/`cloud_words` 신설(인덱스+default `now epoch ms`), `cloud_users.legacy_migration_status` 추가. `pnpm db:push` 이미 적용됨 |
| 2  | 서버 라우터 분리 | `server/routes/{auth,sync,curations,ai,dict}.ts` + `server/services.ts`. `server/auth.ts`·`server/storage.ts` 삭제. `validateBody` 관대 모드 적용 |
| 3  | AI 응답 Zod parse | `server/gemini.ts` 3곳, `lib/gemini-api.ts`(이미지 OCR), `app/(tabs)/curation.tsx`(직접 호출) 모두 스키마 검증 |
| 4  | features/auth | Zustand 스토어 + `persisted()` + `apiFetch`. `contexts/AuthContext.tsx` 제거, `useAuth`는 `features/auth`에서 export |
| 5  | features/settings | 6개 AsyncStorage 키 전부 `persisted()` 래핑. `fieldOrder` 수동 보정 로직은 `InputSettingsSchema.default().transform()`으로 대체. `SettingsContext` 제거 |
| 6a | 서버 sync 재작성 | `POST /api/sync/push`, `GET /api/sync/pull`, `migrateLegacyIfNeeded`(advisory lock + `legacy_migration_status` 플래그). **`POST /api/sync/data` → 410 Gone**, GET은 빈 배열(step 13에서 제거). 권한 검증(`word.listId` 소유자 확인) 포함 |
| 6b | SQLite 마이그 013 | `lists.updatedAt`·`lists.deletedAt`·`words.deletedAt` 컬럼 추가, `SCHEMA_VERSION` 12→13. 기존 러너에 v12→v13 블록 추가. `vocab-storage.ts` SELECT 7곳에 `WHERE deletedAt IS NULL`, DELETE 5곳 → soft-delete. `clearAllData`는 의도적으로 hard-delete 유지 |
| 6c-1 | sync 엔진 신설(미활성) | `features/sync/{engine,mapping,store,index}.ts`. 매핑은 `__tests__/sync-mapping.test.ts`로 검증(6/6 pass) |
| 6c-2 | push 전환 | VocabContext의 `syncToCloud`/`debouncedSync` 제거 → `features/sync`의 `schedulePush` + dirty set(`markWrittenLists/Words`, `markAllWordsInList`, `cascadeSoftDelete`) |
| 6c-3 | pull 전환 | `loadCloudData`를 완전히 새 구현으로 교체 — `lastPulledAt===0`에서만 merge/cloud 분기, 그 외엔 `pullChanges()` 증분. "합치기" 경로는 **로컬 id 전수 remap**(새 uuid) 후 dirty 마킹 + flush |
| 7a | vocab-storage 이동 | `lib/vocab-storage.ts` → `features/vocab/db.ts`. `features/vocab/index.ts` 배럴 추가. row → domain 조립에 `rowToWord`/`rowToVocaList` 헬퍼 추출(defaults 적용 — mid-migration undefined 방어). tags JSON 파싱은 `safeJsonParseTags`로 try/catch 감쌈(이전엔 malformed시 크래시). 테스트는 `__tests__/vocab-db.test.ts`로 git mv |
| 7b | 읽기·curation 이관 | `features/vocab/queries.ts`(fetchAllLists + selectWordsForList/selectListProgress/selectPlanStatus 순수 셀렉터) + `features/vocab/api.ts`(apiFetch + Zod로 curation REST 3개 — fetchCloudCurations/deleteCloudCuration/shareCuration) 신설. contracts에 `CuratedThemeWithWordsSchema`/`CurationMutationResponseSchema`/`CurationDeleteResponseSchema`/`CurationDuplicateBodySchema` 추가. 409 응답은 `DuplicateCurationError` 클래스로 변환. VocabContext는 셀렉터·API 위임하는 얇은 어댑터가 되고 **raw `fetch` + `API_BASE` + `expo-constants` 완전 제거**. 기존 consumer(`ListContextMenu`)의 `e.message === 'DUPLICATE_SHARE'` 계약은 VocabContext가 번역 레이어로 유지(7c 이후 consumer가 `instanceof DuplicateCurationError`로 이행하면 제거) |
| 7c-1 | writes 이관 | `features/vocab/mutations.ts` 신설 — 28개 write 함수 모두 (createList/createCuratedList/update*/delete*/toggle*/add*/…/mergeLists/reorderLists/copyWords/moveWords/set*/increment*/reset*/updateStudyTime/saveLastResult/setupPlan/rechunkPlan/clearPlan/updatePlanProgress/resetPlanForReStudy). React 훅 아님 — 순수 async. 내부에서 `useAuthStore.getState()` 읽어 auth 게이팅 후 `markListsDirty/markWordsDirty` + `schedulePush` 자동 실행. `markAllWordsInListDirty` helper는 mergeLists/copyWords/plan ops가 사용 (deletedAt 필터 없이 전수 조회해 soft-delete row도 재마킹 — 레거시와 동일). `assertTitleUnique`로 DUPLICATE_LIST 체크 내재화. `features/vocab/index.ts` 배럴은 **mutations을 우선 노출**하고 db.* 저수준은 `generateId/initSeedDataIfEmpty/clearAllData`만 선택 re-export(이름 충돌 방지 + 쓰기는 항상 mutations 경유 강제). VocabContext는 mutation 호출 → `refreshData()`만 하는 35줄짜리 래퍼로 축소. `markWrittenLists`/`markWrittenWords`/`markAllWordsInList`/`queuePush`/`PlanEngine` import 제거. **loadCloudData·remapLocalIdsAndMarkDirty·markAllLocalDirty·shareList는 아직 VocabContext 안** (7c-3에서 이동) |
| 7c-2 | TanStack Query 도입 | `features/vocab/queries.ts`에 `useListsQuery()` + `invalidateLists()` + `LISTS_QUERY_KEY` 추가. `useQuery<VocaList[], Error>({ queryKey: ['vocab','lists'], queryFn: fetchAllLists, staleTime: Infinity })`. VocabContext는 `useState<VocaList[]>([])` 제거 — `lists = useListsQuery().data ?? []`로 derived. **`loading` state는 유지** — TanStack Query의 `isPending`이 SQLite 첫 읽기 직후 flip되어 cloud pull 중 stale 로컬 데이터가 번쩍이는 걸 방지. 26개 write wrapper의 `await refreshData()` → `await invalidateLists()`로 일괄 치환, `useCallback` deps도 `[refreshData]` → `[]`로 정리. `refreshData`는 호환성 위해 `invalidateLists` 래퍼로 잠시 유지 (3곳 consumer: `app/list/[id]`, `app/(tabs)/vocab-lists`, `components/ManageModal`) — **7c-4c/d에서 consumer 이행 후 VocabContext와 함께 완전 제거됨** |
| 7c-3 | Alert 추방 + 헬퍼 추출 | `features/study/store.ts`(Zustand) 신설 — `studyResults` 비영속 store. VocabContext는 store 구독하는 wrapper로 축소. `features/sync/first-login.ts` 신설 — `probeFirstLoginState`(GET /api/sync/pull?since=0 + 로컬 카운트) → `'both-empty' \| 'cloud-only' \| 'local-only' \| 'conflict'` 반환, `applyFirstLoginMerge`(in-transaction id remap + FK toggle), `applyFirstLoginCloudReset`(clearAllData + resetAll), `markAllLocalDirty`. **데이터 레이어 Alert 완전 제거** — VocabContext의 `loadCloudData`는 probe → Alert → apply-\* 디스패치 → pullChanges → 조건부 flush만 하는 얇은 orchestrator로 축소. `features/vocab/api.ts`에 `buildShareRequest(list, identity, description?)` + `ShareIdentity` 타입 추가 — shareList 조립 로직 제거. VocabContext는 `getDeviceId`+`profileSettings.nickname` 해석 후 buildShareRequest 호출만. 코드 길이 ~549 → ~432줄. `DuplicateCurationError → DUPLICATE_SHARE` translation은 ListContextMenu 이행 전까지 유지 |
| 7c-4a | mutations에 commit 내장 | `features/vocab/mutations.ts`의 `queuePush()` 헬퍼 제거하고 `async function commit()` 도입 — `if (isGoogleAuthed()) schedulePush(); await invalidateLists();`를 한 번에 처리. 28개 mutation 모두 `await commit()`로 끝맺음. **이제 consumer가 mutation을 직접 호출해도(VocabContext 우회 시) UI가 자동으로 invalidateLists를 받음** — 7c-4c/7c-4d의 consumer 이행이 안전해짐. VocabContext wrapper의 redundant `invalidateLists()` 호출은 유지(같은 queryKey 중복 호출은 TanStack Query가 dedupe) |
| 7c-4b | useBootstrap 추출 | `features/vocab/use-bootstrap.ts` 신설 — `useVocabBootstrap()` hook이 (1) auth 식별자 변화 감지, (2) google → `AsyncStorage.setItem(LAST_GOOGLE_ID_KEY)` + `hydrateLastPulled` + `loadCloudData`(Alert까지 여기 내장, 데이터 레이어는 그대로 Alert-free), (3) guest → `initSeedDataIfEmpty`, (4) 공통으로 `invalidateLists` + `setLoading(false)`. `useEffect` cleanup에 `cancelled` 플래그 — 빠른 signin/signout 연타에서 stale setState 방지. VocabContext는 `useVocabBootstrap()` 구독만 하면 됨. **VocabContext에서 `useEffect`/`loadCloudData`/`Alert`/`pullChanges`/`flushPush`/`useSyncStore`/`ApiError`/`probeFirstLoginState`/`applyFirstLoginMerge`/`applyFirstLoginCloudReset`/`markAllLocalDirty`/`LAST_GOOGLE_ID_KEY` 전부 제거** — context는 cache subscriber + mutation wrapper + curation REST 스코프만 남음 |
| 7c-4c | studyResults/refreshData consumer 이행 + bootstrap을 _layout으로 | `useVocabBootstrap`을 Zustand `useBootstrapStore`(`loading` flag) + `useBootstrapLoading` selector로 리팩터 — 여러 곳에서 hook 호출 시 하나의 effect만 실행되도록. `app/_layout.tsx`에 `VocabBootstrapper` 컴포넌트 추가 + `useVocabBootstrap()` 호출. VocabContext는 `useBootstrapLoading` 구독으로 전환. **studyResults 3곳**(quiz/flashcards/examples) `setStudyResults` → `useStudyResultsStore(s => s.setResults)`. **study-results 화면**은 `useVocab()` 제거 후 직접 store 구독. **refreshData 3곳**(list/[id], (tabs)/vocab-lists, ManageModal via prop) → `invalidateLists` 직접 호출 |
| 7c-4d | 나머지 consumer 이행 + VocabContext 삭제 | `features/vocab/hooks.ts` 신설 — `useLists`/`useListWords`/`useListProgress`/`usePlanStatus`/`useShareList`/`useDeleteCloudCuration`/`useFetchCloudCurations` drop-in hook들. `useShareList`는 기존 `DUPLICATE_SHARE` 에러 계약을 그대로 유지(ListContextMenu 호환). **15개 남은 useVocab() 소비자 전부 이행** — hooks + direct mutation imports로. curation.tsx의 `fetchCloudCurations` 반환을 `VocaList[]`로 cast(passthrough 필드 보전). `contexts/VocabContext.tsx` **삭제**. `app/_layout.tsx`에서 `VocabProvider` 래핑 제거 — `VocabBootstrapper`가 유일한 provider 역할 |
| 8 | features/study 묶음 이동 | `lib/plan-engine.ts` → `features/study/plan/engine.ts`로 git mv (8개 importer 경로 일괄 갱신: `app/plan/[id]`, `app/list/[id]`, `app/(tabs)/index`, `features/vocab/queries.ts`, `features/vocab/mutations.ts`, `components/ListCard`, `components/ListDayPicker`, `__tests__/plan-engine.test.ts`). engine.ts 내부 `./types` → `@/lib/types` 절대 경로로 수정. 5개 study 화면(`flashcards`/`quiz`/`examples`/`autoplay`/`plan`) → `features/study/{mode}/screen.tsx` git mv, `app/{mode}/[id].tsx`는 `export { default } from '@/features/study/{mode}/screen';` 한 줄짜리 expo-router shim으로 재작성. study 전용 컴포넌트 3개(`StudySettingsModal`/`CustomStudyModal`/`BatchResultOverlay`) → `features/study/components/` git mv, 4개 importer 경로 갱신(`app/(tabs)/index`, `app/quiz/[id]`, `app/flashcards/[id]`, `app/examples/[id]`, `app/autoplay/[id]`). 이동된 컴포넌트의 `./ListDayPicker` / `./ui/ModalOverlay` 상대 import는 `@/components/ListDayPicker` / `@/components/ui/ModalOverlay` 절대 경로로 교정. tsc 통과, Jest 95/103(회귀 0). `features/study/index.ts`는 `useStudyResultsStore`만 유지 — screen은 shim이 직접 path import하므로 배럴 제외 |
| 9 | features/onboarding + features/curation 이동 | **Onboarding**: `app/onboarding.tsx` → `features/onboarding/screen.tsx`. `components/onboarding/{OnboardingDots,AvocadoCharacter}.tsx` + `components/onboarding/demos/{WordListDemo,FlashcardDemo,CurationDemo,AiWordDemo,PlanDemo}.tsx` → `features/onboarding/components/`. `hooks/useOnboarding.ts` **삭제** + `features/onboarding/store.ts` 신설 — Zustand 스토어(`useOnboardingStore`)에 `isOnboardingDone`/`hydrate`/`markOnboardingDone` 노출, 기존 마이그레이션 로직(auth 키 존재 시 자동 완료 처리) 동일 유지. `features/onboarding/index.ts`에서 `useOnboarding`/`useOnboardingStore` 배럴 export. `_layout.tsx`에 `OnboardingHydrator` 컴포넌트 추가(AuthHydrator/SettingsHydrator와 동일 패턴) + 3개 consumer(`_layout.tsx`, `(tabs)/settings.tsx`, `app/login.tsx`, `features/onboarding/screen.tsx`) 경로 갱신. `segments[0] === 'onboarding'` 비교는 expo-router 생성 types stale로 TS2367 에러 → `const first = segments[0] as string;` 로컬 캐스트로 해결. **Curation**: `app/(tabs)/curation.tsx` → `features/curation/screen.tsx` git mv + shim. `features/curation/index.ts`는 `CurationScreen` re-export만. tsc 통과, Jest 95/103(회귀 0) |
| 10a | ThemeContext → features/theme | `contexts/ThemeContext.tsx` → `features/theme/context.tsx` git mv + `features/theme/index.ts`(배럴 `ThemeProvider`/`useTheme`). Provider 자체는 변경 없음(React Context — `useColorScheme()` 시스템 훅 의존). 37개 소비자의 `@/contexts/ThemeContext` → `@/features/theme` 일괄 `sed` 치환 |
| 10c | LocaleContext → features/locale | `contexts/LocaleContext.tsx` → `features/locale/context.tsx` + `features/locale/index.ts`. 2개 소비자(`_layout.tsx`, `(tabs)/settings.tsx`) import 경로 갱신. `contexts/` 디렉토리 비어서 `rmdir`로 제거 — repo에서 완전히 사라짐 |
| 12a | Hydrator 통합 | `app/_layout.tsx`의 `AuthHydrator`/`SettingsHydrator`/`OnboardingHydrator` 3개를 단일 `AppHydrators` 컴포넌트로 병합. 단일 `useEffect`에서 3 store의 `.hydrate()`를 순서대로 호출 — 실행 순서는 기존과 동일(auth → settings → onboarding). 13줄 트리가 5줄로 축소 |
| 12b | ESLint feature 경계 룰 | `eslint.config.js`에 2개의 `no-restricted-imports` 블록 추가 — (1) `components/**` + `lib/**`는 `@/features/*/*` (deep path) 금지 → 반드시 `@/features/<name>` 배럴 경유, (2) `features/**`는 cross-feature deep path 금지(자기 내부 import는 상대 경로, 타 feature는 배럴만). `pnpm run lint`에서 기존 0 errors → 2 errors 노출: `components/ListCard.tsx:9`와 `components/ListDayPicker.tsx:12`가 `@/features/study/plan/engine` 사용. 해결: `features/study/index.ts`에 `export * from './plan/engine'` 추가 + 두 파일 import를 `@/features/study` 배럴로 교정. lint 다시 0 errors |
| 12c | validateBody 엄격화 | request body 스키마 5개(`AIAnalyzeRequestSchema`, `AIGenerateThemeRequestSchema`, `AIGenerateMoreRequestSchema`, `DictQuerySchema`, `CurationMutateBodySchema`)에서 outer `.passthrough()` 제거 — unknown top-level key는 이제 400 VALIDATION_ERROR. `CurationMutateBodySchema.theme`의 inner `.passthrough()`는 유지(서버가 creatorId/icon 등 optional 필드를 `theme` 하위에서 읽어야 함 — dedicated theme 스키마 작성은 scope 밖). `validateBody` 미들웨어 주석 갱신 |
| 10b(가드) | hex 신규 유입 차단 + dead fallback 정리 | `eslint.config.js`에 `no-restricted-syntax` + `Literal[value=/^#[0-9a-fA-F]{3,8}$/]` 룰 추가 — 깨끗한 12개 경로(`features/{auth,settings,sync,vocab,theme,locale}`, `features/onboarding/{store,index}`, `server/**`, `shared/**`, `lib/{api,storage,theme}`)에만 ERROR 적용. UI 레이어는 의도적으로 제외하여 기존 457개 hex를 건드리지 않음(시각 리뷰 후 별도 PR). `components/ui/Card.tsx`의 `colors.cardShadow \|\| '#000'` dead fallback 제거 |
| 11 | SQLite 마이그 분리 | `lib/db/schema.ts` 삭제 + `lib/db/migrations/NNN_*.ts` 13개 + `migrations/index.ts` registry(`MIGRATIONS` 배열 + `SCHEMA_VERSION = MIGRATIONS.length` + `assertContiguous()`). `Migration` 타입 = `{ version, description, up(db) }`. 러너(`lib/db/index.ts`)는 ~230줄 if-else 사다리 → ~80줄로 축소 — `PRAGMA user_version` 기준 `filter(m => m.version > currentVersion)` 트랜잭션 실행 + 다운그레이드 명시적 throw. fresh install 경로가 기존 v12 `INIT_QUERIES` + v13 ALTER와 열/인덱스 단위로 동일한 최종 shape을 만듦을 교차 검증. 기존 v13 DB는 no-op |
| 13 | 레거시 Postgres 청소 | `server/routes/sync.ts`의 `GET/POST /api/sync/data` 2개 핸들러 + `migrateLegacyIfNeeded` 호출 제거. `server/routes/auth.ts::findOrCreateGoogleUser`의 `INSERT INTO cloud_vocab_data` 한 줄 제거. `server/services.ts`의 `migrateLegacyIfNeeded()` + `markMigrationFailed()` ~110줄 제거 + `cloud_vocab_data`/`VocaListSchema`/`ZodError`/`fromZodError` import 정리. `shared/schema.ts`에서 `cloud_vocab_data` pgTable + `cloud_users.legacy_migration_status` 컬럼 + `jsonb` drizzle import 제거. 사용자가 `pnpm db:push`로 Supabase에 DROP TABLE / DROP COLUMN 반영 필요 |

## 핵심 설계 결정

### 1. sync 엔진은 mutation 레이어와 독립된 "외부 장치"
`features/sync/store.ts`의 dirty set은 `features/vocab/mutations.ts`가 각 쓰기 직후 `markListsDirty`/`markWordsDirty`로 채워넣고, `commit()` helper가 `schedulePush()` + `invalidateLists()`를 원자적으로 실행. 쓰기 호출자는 auth 게이팅·dirty 마킹·debounce·캐시 무효화를 전혀 알 필요가 없음. 이 decoupling 덕에 VocabContext를 해체할 때 sync 로직을 재작성할 필요가 없었음(7c-4d).

### 2. Echo 방지: push 응답의 `serverTime`을 즉시 `lastPulledAt`에 반영
`features/sync/engine.ts::flushPush()`에서 `setLastPulledAt(res.serverTime)`가 dirty set 비움보다 먼저 호출돼, 자기 push가 다음 pull에 되돌아오지 않음. pull 쪽은 반대로 **SQLite 트랜잭션 커밋 후에만** `lastPulledAt`을 갱신해서 crash 내성 확보.

### 3. 로컬 soft-delete vs 클라우드 hard-delete
로컬 SQLite는 `deletedAt` 컬럼을 `NULL`/epoch로 관리하고 모든 SELECT가 필터링. pull로 받은 `deletedAt != null` row는 로컬에서 **hard-delete**(`DELETE FROM lists/words`) — 로컬에서 되살아나는 일 없음.

### 4. 첫 로그인 "합치기"는 id remap이 필수
서버에 같은 id의 row가 있으면 `ON CONFLICT DO UPDATE`가 덮어써 로컬 데이터가 유실됨. `remapLocalIdsAndMarkDirty()`가 FK를 `PRAGMA foreign_keys = OFF`로 잠깐 풀고 list/word id를 전수 새 uuid로 바꾼 뒤 dirty 마킹 → push.

### 5. bigint `mode: 'number'` → `ZodNumber`
`createSelectSchema(cloud_lists).shape.updatedAt`이 실제 `ZodNumber`로 출력됨을 probe로 확인했음. `.transform(Number)` 오버라이드 불필요. JS Number 2^53 안전범위 내이므로 year ≈ 287396까지 문제 없음.

## 환경/운영 주의

- **프로젝트 경로가 OneDrive 안**: `pnpm add` 중 `ERR_PNPM_ENOENT ... _tmp_<pid>` 에러가 반복됨 → `package.json`을 수동으로 편집한 뒤 `pnpm install` 로 보정하는 방식을 기본으로 사용. 메모리에 `env_pnpm_onedrive.md`로 기록됨.
- **`node_modules/jest-util`에 v29와 v30이 섞여 있음**: 최초 run에서 `TypeError: ... initializeGarbageCollectionUtils is not a function` 발생. top-level jest-util을 `node_modules/@jest/core/node_modules/jest-util`(v30)로 복사해 해결. 재발 시 동일 조치.
- **tsx/esbuild 버전 불일치 가능**: `esbuild-bin-temp` 디렉토리 잔재가 있으면 `Host version X does not match binary version Y` 에러. `node_modules/tsx/node_modules/esbuild{-bin-temp}`를 정리 후 재실행.
- **`pnpm db:push`는 항상 사용자가 실행**: drizzle-kit이 "create vs rename" 인터랙티브 프롬프트를 띄움. 이번 1b 적용 시에는 `+ cloud_lists create table` / `+ cloud_words create table` / `users` drop을 각각 선택했음.
- **서버는 `pnpm run server:dev`(tsx watch) 로 백그라운드 기동**하는 걸 권장. `:5000`에 바인딩. 이번 세션에서 `db-check/pull/push/data(410)` 전부 라이브로 검증됨.

## 검증 현황

- **TypeScript**: `pnpm exec tsc --noEmit --skipLibCheck` → **통과** (모든 step 완료 직후)
- **Jest**: 5 suites / 103 tests — **95 pass, 8 fail** (7a/7b/7c-1/7c-2/7c-3/7c-4a/b/c/d 이후에도 동일 — 회귀 0). 실패 8건은 step 0 이전부터 있던 pre-existing 이슈(`vocab-db.test.ts`(ex-`vocab-storage.test.ts`) expo-sqlite ESM import, `gemini-api.test.ts` API 키 mocking, `plan-engine.test.ts`의 computed date 관련 몇 건). 새 `__tests__/sync-mapping.test.ts` 6/6 통과.
- **라이브 서버 probe**:
  - `GET /api/db-check` → 200
  - `GET /api/sync/pull?since=0` (valid JWT) → 200 `{ lists: [], words: [], serverTime, hasMore:false }`
  - `POST /api/sync/data` (valid JWT) → **410 Gone** (DEPRECATED)
  - `POST /api/auth/google` (빈 body) → **400 VALIDATION_ERROR** (validateBody 동작 확인)
  - `GET /api/curations` → 200 + 배열 응답 (7b의 `CurationListResponseSchema` 검증 대상)

## 다음 세션 시작 체크리스트

1. `git status`로 현재 staged/untracked 파일 확인.
2. 필요한 경우 `pnpm install`(OneDrive 간섭 주의).
3. `pnpm exec tsc --noEmit --skipLibCheck`가 여전히 통과하는지 스모크.
4. `pnpm run server:dev` 백그라운드 기동 후 `curl :5000/api/db-check` 200 확인.
5. **Step 13 Supabase 반영** (사용자 작업): `pnpm db:push` 실행. drizzle-kit이 `cloud_vocab_data` 테이블 DROP과 `cloud_users.legacy_migration_status` 컬럼 DROP을 프롬프트 — "truncate and drop" 선택. 이후 staging/prod에 서버 코드 배포.
6. **Step 10b 본 스윕** (유일한 남은 리팩터 작업): UI 디자인 결정 5건 필요 — (1) Light 베이스가 warm cream인지 순백인지, (2) 블루 액센트 `#4A7DFF` 처리, (3) 카테고리 아이콘 6색 토큰화 방식, (4) SVG 일러스트 예외 처리, (5) 시스템 상수(`#000` shadow, `#FFF` text) 예외 처리. 결정 1은 시각 비교 필요.

## 남은 Step 로드맵

| # | 범위 | 위험 |
|---|------|------|
| 10b (본 스윕) | UI 레이어 hex 457개 → `colors.*`/`tokens.*` 치환 (3+ PR). 가드 룰은 이미 설치됨 | 낮음(면적 큼, 시각 리뷰 필요) |
| 11 | SQLite 마이그레이션 분리(`001_init.ts`~`013_*.ts`) + 화이트리스트. 신/구 러너 공존 토글 | **높음** |
| 12 | `validateBody` 엄격화 2단계 + ESLint feature 경계(`no-restricted-imports`) + 최종 Provider 정리 | 낮음 |
| 13 | 레거시 청소: `GET /api/sync/data` 제거, `cloud_vocab_data` DROP (사전 `SELECT COUNT(*)` + 장기 미로그인 분포 확인) | 중 |

## 주요 신규/수정 파일 인덱스

**새로 생긴 디렉토리**
- `features/auth/` — Zustand + persisted
- `features/settings/` — Zustand + persisted
- `features/sync/` — 엔진/매핑/스토어 + index
- `features/vocab/` — `db.ts` + `queries.ts` + `api.ts` + `mutations.ts` + `use-bootstrap.ts` + `hooks.ts` + `index.ts`. `mutations.ts`(7c-1+7c-4a)에 모든 write 함수 + auth-gated dirty 마킹 + `commit()` helper(schedulePush + invalidateLists), `queries.ts`(7b+7c-2)에 `fetchAllLists` + selectors + `useListsQuery`/`invalidateLists`/`LISTS_QUERY_KEY`, `api.ts`(7b+7c-3)에 curation REST helpers + `DuplicateCurationError` + `buildShareRequest(list, identity, description?)`, `use-bootstrap.ts`(7c-4b+7c-4c)에 `useVocabBootstrap()` + `useBootstrapLoading()` Zustand 기반, `hooks.ts`(7c-4d)에 `useLists`/`useListWords`/`useListProgress`/`usePlanStatus`/`useShareList`/`useDeleteCloudCuration`/`useFetchCloudCurations`
- `features/study/` — `store.ts` + `index.ts` + `plan/{engine.ts,screen.tsx}` + `flashcards/screen.tsx` + `quiz/screen.tsx` + `examples/screen.tsx` + `autoplay/screen.tsx` + `components/{StudySettingsModal,CustomStudyModal,BatchResultOverlay}.tsx`. Zustand `useStudyResultsStore`(7c-3 신설) — 비영속, quiz → results 화면 핸드오프용. Step 8에서 5개 screen + plan-engine + 3개 study 컴포넌트가 이 디렉토리로 묶였고 `app/` 쪽은 expo-router shim만 유지
- `features/onboarding/` — `store.ts`(Zustand `useOnboardingStore` + AsyncStorage 마이그레이션) + `index.ts` + `screen.tsx` + `components/{OnboardingDots,AvocadoCharacter}.tsx` + `components/demos/{WordListDemo,FlashcardDemo,CurationDemo,AiWordDemo,PlanDemo}.tsx`. Step 9 신설 — `hooks/useOnboarding.ts` 삭제와 함께 stateful 로직을 Zustand로 이전
- `features/curation/` — `screen.tsx`(1050줄, `app/(tabs)/curation.tsx` 이동) + `index.ts`(CurationScreen re-export). Step 9 신설
- `features/theme/` — `context.tsx`(React Context `ThemeProvider`/`useTheme`, 이전 `contexts/ThemeContext`) + `index.ts`. Step 10a에서 이동
- `features/locale/` — `context.tsx`(`LocaleProvider`/`useLocale`, 이전 `contexts/LocaleContext`) + `index.ts`. Step 10c에서 이동
- `features/sync/first-login.ts` — 7c-3 신설. `probeFirstLoginState` + `applyFirstLoginMerge` + `applyFirstLoginCloudReset` + `markAllLocalDirty`. VocabContext에 있던 첫 로그인 reconcile 로직을 Alert-free pure async 함수들로 추출
- `server/routes/` — 5개 라우트 파일
- `server/middleware/` — 3개 미들웨어
- `lib/api/` — apiFetch + errors (query-client 흡수)
- `lib/storage/` — persisted 래퍼
- `lib/theme/` — tokens(step 10에서 ThemeProvider 추가 예정)

**삭제된 파일**
- `contexts/AuthContext.tsx`, `contexts/SettingsContext.tsx`
- `contexts/VocabContext.tsx` (7c-4d에서 최종 삭제)
- `server/auth.ts`, `server/storage.ts`
- `lib/query-client.ts`
- `lib/vocab-storage.ts` (7a에서 `features/vocab/db.ts`로 이동)
- `lib/db/schema.ts` (Step 11에서 삭제 — `lib/db/migrations/NNN_*.ts` 13개 + `migrations/index.ts` registry가 대체)
- `server/services.ts::migrateLegacyIfNeeded()` + `markMigrationFailed()` (Step 13에서 제거 — ~110줄)
- `shared/schema.ts::cloud_vocab_data` pgTable + `cloud_users.legacy_migration_status` 컬럼 (Step 13)
- `server/routes/sync.ts::GET/POST /api/sync/data` 두 핸들러 (Step 13)
- `lib/plan-engine.ts` (Step 8에서 `features/study/plan/engine.ts`로 이동)
- `components/{StudySettingsModal,CustomStudyModal,BatchResultOverlay}.tsx` (Step 8에서 `features/study/components/`로 이동)
- `hooks/useOnboarding.ts` (Step 9에서 삭제 — `features/onboarding/store.ts` Zustand 스토어가 대체)
- `components/onboarding/` 전체 (Step 9에서 `features/onboarding/components/`로 이동)
- `app/onboarding.tsx` (Step 9에서 `features/onboarding/screen.tsx`로 이동, shim 신설)
- `app/(tabs)/curation.tsx` (Step 9에서 `features/curation/screen.tsx`로 이동, shim 신설)
- `contexts/ThemeContext.tsx` (Step 10a에서 `features/theme/context.tsx`로 이동)
- `contexts/LocaleContext.tsx` (Step 10c에서 `features/locale/context.tsx`로 이동)
- `contexts/` 디렉토리 전체 (Step 10c 완료 후 `rmdir` — repo에서 제거)

**리네임**
- `__tests__/vocab-storage.test.ts` → `__tests__/vocab-db.test.ts` (git mv — 히스토리 유지)

**재작성된 파일**
- `shared/schema.ts` (users 제거, cloud_lists/cloud_words 추가)
- `shared/contracts.ts` (신규, 전체 Zod SoT)
- `server/routes.ts` (엔트리만, 실제 라우트는 `routes/*`)
- `server/services.ts` (curations 로직 + sync 서비스)
- `app/_layout.tsx` (7c-4c/d에서 `VocabProvider` 제거, `VocabBootstrapper`만 유지 — bootstrap hook이 유일한 root-level vocab 효과 진입점)
- `app/(tabs)/*`, `app/list/[id]`, `app/quiz/[id]`, `app/flashcards/[id]`, `app/examples/[id]`, `app/autoplay/[id]`, `app/plan/[id]`, `app/add-word`, `app/search-modal`, `app/study-results`, `components/{WordDetailModal,BatchImportWorkflow,CustomStudyModal}`, `hooks/{useAddWord,useThemeGenerator}` — 18개 소비자 전부 `useVocab()` 제거, `@/features/vocab`의 개별 hook + direct mutation import로 이행
- `lib/db/{schema,index}.ts` (v13 마이그 + soft-delete 필터)
- `features/vocab/db.ts` (ex-`lib/vocab-storage.ts`, row→domain 조립 헬퍼 `rowToWord`/`rowToVocaList` 추출 + `safeJsonParseTags` 방어)

**상태 참고**
- `MEMORY.md`에 `project_refactor_plan.md`, `env_pnpm_onedrive.md` 메모 추가됨 (다음 세션에서 자동 로딩됨).
