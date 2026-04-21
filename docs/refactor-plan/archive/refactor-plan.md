# SokSok 전면 아키텍처 개편 + Zod 도입

## Context

React Native Expo + Express + SQLite + Postgres 보카 앱. 구조적 문제로 **숨은 버그와 조용한 실패**가 누적:

- **API_BASE 4곳 분산·불일치** — `AuthContext.tsx:38`(`http://`), `VocabContext.tsx:26`(`https://`), `lib/translation-api.ts`, `lib/naver-dict-api.ts`. 별개로 `lib/query-client.ts`에 `getApiUrl()`이 이미 존재(미사용)
- **VocabContext 신객체**(565줄, 30+ 메서드) — 서버 통신·SQLite·UI Alert(`VocabContext.tsx:131`)·sync 혼재. `deleteWord` 인터페이스 미노출, `withSync` 데드코드
- **서버 입력 검증 부재** — `POST /api/sync/data`는 `Array.isArray(lists)` 한 줄(`server/auth.ts:176`)
- **AsyncStorage 캐스팅 파싱** — `as AuthState` 캐스팅, 수동 `fieldOrder` 마이그레이션(`SettingsContext.tsx:176-212`, 취약)
- **AI 응답 캐스팅** — `server/gemini.ts:67,115,152`에서 `JSON.parse(text) as X`
- **동기화 아키텍처** — `cloud_vocab_data.data_json`에 사용자 단어장 전체 jsonb 통짜 저장. 변이 하나마다 전체 페이로드 왕복. row 단위 델타 sync 불가, 확장성 한계. **정규화(`cloud_lists`/`cloud_words`) 필요**
- **SQLite 마이그레이션 조용한 실패** — `lib/db/index.ts` 모든 catch가 에러 삼킴. 버전은 항상 증가(v0→v12)
- **디자인 하드코딩** — 실측 **457개 hex 리터럴** 화면/컴포넌트 산재
- **TanStack Query 설치 미사용** — `lib/query-client.ts` 구현 있으나 호출 없음

**주안점**: 안정성 + 오버엔지 방지 + 디자인 용이성. 확장성 과잉 배제.

**의사결정**:
- 전면 개편 + Zod
- drizzle-zod는 서버 테이블이 있는 엔티티만, 로컬 전용(VocaList/Word 22+필드)은 수동 Zod
- `cloud_vocab_data` jsonb → `cloud_lists` / `cloud_words` 정규화

**이미 설치**: `zod`, `drizzle-zod`, `zod-validation-error`, `@tanstack/react-query`, `jest`, `ts-jest`.
**신규 설치**: `zustand` (스코프 축소됨 — 아래).

---

## 목표 아키텍처

### 폴더 구조 — tsconfig alias 유지

`@/* → ./*`, `@shared/* → ./shared/*` 그대로. 의미만 재편:

- **`@shared/*`** = 프론트↔서버 공유 (Drizzle + Zod 스키마 + 타입)
- **`@/features/*`** = 프론트 도메인 수직 슬라이스
- **`@/lib/*`** = 프론트 전용 공용 인프라
- **`server/*`** = 서버 전용

```
app/                              ← expo-router (화면 조립만)
features/
  vocab/        { api, db, queries, components, screens, index }
  auth/         { store, queries, screens, index }
  settings/     { store, screens, index }
  study/        { flashcards, quiz, examples, autoplay, plan, components, index }
  sync/         { engine, mapping, store, index }
  onboarding/   { hooks, screens, index }
  curation/     { api, queries, screens, index }
lib/
  api/          { client.ts, errors.ts }       ← 기존 query-client.ts 흡수
  storage/      { persisted.ts }
  theme/        { tokens.ts, colors.ts, ThemeProvider.tsx }  ← ThemeContext 이동, constants/ 흡수
  ui/           { Button, Modal, Sheet, ... }   ← components/ui/ 이동
  db/           { index.ts, index.web.ts, schema.ts, migrations/00N_*.ts }
  i18n/         { index.ts, useLocale.ts, resources.ts }    ← LocaleContext 흡수
  search.ts    ← 현 위치 유지 (cross-feature 유틸)
  plan-engine.ts → features/study/plan/engine.ts 로 이동
  vocab-storage.ts → features/vocab/db.ts 로 이동
shared/                           ← @shared/* (drizzle.config.ts가 읽으므로 경로 변경 없음)
  schema.ts                       ← Drizzle 테이블 (그대로, drizzle.config.ts:9 참조 유지)
  contracts.ts                    ← Zod 스키마 단일 파일로 시작 (500줄 초과 시 분할)
  types.ts                        ← z.infer 타입 re-export
server/
  routes/       { auth.ts, sync.ts, curations.ts, ai.ts, dict.ts }
  services.ts   ← 초기엔 단일 파일 (pool.query 집중)
  middleware/   { requireAuth.ts, validateBody.ts, validateQuery.ts }
  gemini.ts     ← 유지 (Zod parse 추가)
  index.ts

(삭제) constants/                 ← lib/theme 흡수
(삭제) contexts/                  ← 4개 제거 (Theme는 lib/theme로 이동)
(삭제) hooks/useOnboarding.ts     ← features/onboarding/hooks.ts로
```

**리네임하지 않는 것**:
- `shared/schema.ts` 유지 (`drizzle.config.ts:9` 하드코딩)
- `lib/db/index.web.ts` 유지 (Metro resolver 규칙)

### DB 스키마 방침

**PostgreSQL** (`shared/schema.ts`):

| 변경 | 처리 | 근거 |
|------|------|------|
| `users` 테이블 + 관련 타입/함수 | **제거** | 데드코드. drizzle-kit이 `DROP TABLE users` 마이그 자동 생성 |
| `server/auth.ts:64-69` `runMigrations()` | **제거** | `is_admin`이 이미 Drizzle 스키마에 정의됨. `pnpm db:push` 일원화 |
| `cloud_users`, `curated_themes`, `curated_words` | **유지** | 현 사용 형태 |
| `cloud_vocab_data { user_id PK, data_json jsonb, updated_at }` | **삭제** (이관 후) | 아래 정규화 참조 |
| **`cloud_lists`**, **`cloud_words`** 테이블 | **신규** | row-per-list / row-per-word 구조로 정규화 |

**정규화 채택 배경 (클라우드 사용량 관점)**:
- 활동 유저 확대 시 jsonb 통짜 egress 선형 증가 위험. 정규화로 **변이 1개 = row 1개 UPDATE**로 egress·DB I/O 동시 감소
- "last-write-wins" 의미론은 **row 단위로 유지** (사용자 전체가 아니라 개별 row)
- 부분 동기화 구조적 지원 → 진짜 델타 sync 가능

---

#### `cloud_lists` 테이블 설계

SQLite `lists` 테이블의 22+ 필드 중 **서버 보관 대상만 이동**. 공유/소셜 필드도 프론트가 들고 다니므로 거울 저장:

```ts
const nowEpochMs = sql`(extract(epoch from now())*1000)::bigint`;

export const cloud_lists = pgTable("cloud_lists", {
  id:              varchar("id").primaryKey(),                 // 클라 생성 uuid
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
});
// 인덱스:
//  - (userId, updatedAt)                 -- pull 필터
//  - (userId, deletedAt, updatedAt)      -- pull 시 알아야 할 삭제 row 까지 효율
//  - (userId, position)                  -- UI 정렬 (사실상 클라 캐시용)
```

#### `cloud_words` 테이블 설계

`definition`/`exampleEn`/`meaningKr`은 SQLite `words`에서 `NOT NULL`이므로 **cloud_words도 NOT NULL로 맞춤**. 비어 있으면 빈 문자열 `''`로 전송(매핑 함수 규칙):

```ts
export const cloud_words = pgTable("cloud_words", {
  id:             varchar("id").primaryKey(),
  listId:         varchar("list_id").notNull()
                    .references(() => cloud_lists.id, { onDelete: 'cascade' }),
  userId:         varchar("user_id").notNull()                 // denormalize (쿼리 효율 + 권한 체크)
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
  tags:           text("tags"),                                // JSON string (SQLite와 일관)
  position:       integer("position").notNull().default(0),
  wrongCount:     integer("wrong_count").notNull().default(0),
  assignedDay:    integer("assigned_day"),
  sourceLang:     text("source_lang").notNull().default('en'),
  targetLang:     text("target_lang").notNull().default('ko'),
  createdAt:      bigint("created_at", { mode: 'number' }).notNull().default(nowEpochMs),
  updatedAt:      bigint("updated_at", { mode: 'number' }).notNull().default(nowEpochMs),
  deletedAt:      bigint("deleted_at", { mode: 'number' }),
});
// 인덱스:
//  - (userId, updatedAt)                 -- pull 필터
//  - (userId, deletedAt, updatedAt)
//  - (listId)                             -- FK 성능 (Postgres는 FK 인덱스 자동 생성 안 함)
//  - (listId, deletedAt, position)        -- 단어장 조회
```

**타임스탬프**: Unix ms `bigint` + `mode: 'number'` — 프론트 SQLite(`createdAt INTEGER`)와 일관. JS Number 2^53 안전범위 내. **step 1b 직후 검증**: `createSelectSchema(cloud_lists)`가 실제로 `z.number()`를 내는지 한 번 찍어봄. 만약 `z.bigint()`로 나오면 매핑에 `.transform(Number)` 또는 스키마 override.

**네이밍 컨벤션 혼재 주의**:
- 기존 `cloud_users`는 **snake_case TS 필드**(`google_id`, `is_admin`, `created_at`). `server/auth.ts`가 직접 참조 중 → **건드리지 않음**
- 신규 `cloud_lists`/`cloud_words`는 **camelCase TS 필드**. 한 파일 내에서 두 규칙이 공존함을 받아들임
- `drizzle-zod`는 TS 필드명 기준으로 Zod 키 생성 → `CloudListSchema`는 자동 camelCase, `CloudUserSchema`는 snake_case로 나옴

**JSON 응답 키**: camelCase (신규 엔티티), snake_case (`cloud_users`) — 일관성 없지만 현 `/api/auth/google` 응답은 이미 camelCase 수동 매핑(`server/auth.ts:134-141`). sync 응답은 자동 camelCase.

---

#### Sync 프로토콜 (신규)

기존 `GET/POST /api/sync/data` 제거. 새 엔드포인트:

```
GET  /api/sync/pull?since=<ms>
  Response {
    lists: CloudList[],     // updatedAt > since인 것만 (삭제 포함, deletedAt 필드로 구분)
    words: CloudWord[],     // updatedAt > since인 것만
    serverTime: number,     // 다음 pull의 since 값
    hasMore: boolean,       // 현 스코프 항상 false — 페이지네이션 스펙 선점(향후 확장)
    nextSince?: number      // 현 스코프 미사용
  }

POST /api/sync/push
  Body {
    lists: CloudListPush[],    // upsert할 것만 (변경/생성/soft-delete/복원)
    words: CloudWordPush[],
  }
  Response {
    serverTime: number        // 이 값을 lastPulledAt에 즉시 기록 (아래 echo 방지)
  }
```

**`CloudListPush`/`CloudWordPush` 스키마**: `createInsertSchema(cloud_lists).omit({ userId: true, updatedAt: true })`로 파생. **`userId`는 서버가 JWT에서 주입**, **`updatedAt`은 서버가 NOW() 강제**. 클라가 어느 쪽이든 보내도 서버는 무시.

**서버 `push` 동작**:
1. `verifyJWT`로 `req.userId` 확보
2. Zod로 body 검증(`SyncPushRequestSchema`)
3. **권한 검증**: 각 `word.listId`가 **현 userId 소유의 cloud_list 인지 확인**(악성 클라가 남의 list로 단어 주입 방지). `SELECT id FROM cloud_lists WHERE id IN (...) AND user_id = ?` → 일치 안 하는 listId 있으면 400
4. 트랜잭션 내에서 각 row `INSERT ... ON CONFLICT (id) DO UPDATE SET ..., updated_at = (extract(epoch from now())*1000)::bigint, user_id = EXCLUDED.user_id로 고정`. `deleted_at`이 포함된 row는 그대로 소프트 삭제. **`deletedAt: null` 명시 전송도 허용** → 복원 경로
5. 응답 `serverTime = extract(epoch from now())*1000`

**서버 `pull` 동작**:
- `SELECT * FROM cloud_lists WHERE user_id=? AND updated_at > ?`
- `SELECT * FROM cloud_words WHERE user_id=? AND updated_at > ?`
- `serverTime = now ms`
- soft-delete된 row도 `updated_at > since`이면 포함 (프론트가 hard-delete 적용)

**Last-write-wins**: 서버 `NOW()` 강제 덮어쓰기로 row-level LWW. 같은 row A → B 순 push → B 생존.

**`since` 필터 정확성**: `updated_at > since` (`>=` 아님). Push 응답 `serverTime`을 클라의 `lastPulledAt`으로 즉시 갱신 → 자기 방금 push가 다음 pull 응답에 포함되지 않음(echo 방지). 밀리초 해상도 충돌(같은 ms에 서버가 두 row를 다른 기기 push로 기록)은 양쪽 기기가 한쪽 변경 유실 가능 → 실무적으로 무시 가능. Verification에 "push 직후 pull → 자기 변경이 돌아오지 않음" 명시.

**Echo 방지 규칙**:
- push 성공 시 `lastPulledAt ← response.serverTime` **즉시 갱신** (SQLite write 없으니 즉시 OK)
- pull 성공 시 `lastPulledAt ← response.serverTime`은 **SQLite upsert 트랜잭션 커밋 성공 후에만** (크래시 시 재pull 가능하게)

**삭제 추적 / 복원**:
- 삭제: 프론트 `deletedAt = Date.now()`로 push
- 복원: 프론트 `deletedAt = null` 명시 전송. 서버 upsert 시 `deleted_at = NULL` 반영
- 리스트 soft-delete 시 **하위 단어들도 cascade soft-delete** → `features/sync/engine.ts`에서 list dirty push 전에 해당 list의 모든 word에 `deletedAt` 설정 후 dirtyWordIds에 추가 (`features/vocab/db.ts:softDeleteList`가 이 책임을 짐)
- 물리 청소(`cloud_lists/words.deleted_at < NOW() - interval '1 year'` cron hard-delete)는 **현 스코프 제외** — 향후 별도 배치

**보안**: push/pull 모두 `verifyJWT` 뒤. 클라가 `userId`를 쿼리·바디로 보내도 서버 무시(Zod `.omit`).

**페이지네이션 선점**: 현 스코프 미구현. 단, 응답 스키마에 `hasMore`, `nextSince` 필드를 **지금 추가**해두고 서버는 항상 `hasMore: false`. 향후 "since=0 대용량 pull이 타임아웃"하면 스펙 변경 없이 서버만 수정.

---

#### 레거시 `cloud_vocab_data` → 신규 테이블 이관

**전체 흐름**:

1. **step 1b**: 새 테이블 생성. `cloud_vocab_data`는 남김
2. **step 6a**: `migrateLegacyIfNeeded(userId)` + **기존 `POST /api/sync/data`는 즉시 410 Gone 차단**(fallback 없음). `GET`만 남김(아무 데도 안 쓰이지만 혹시 모를 구프론트 대비, step 13에서 제거)
3. **step 13**: `cloud_vocab_data` DROP

**`migrateLegacyIfNeeded` 구현 (동시성·멱등성)**:

```ts
async function migrateLegacyIfNeeded(userId: string) {
  await db.transaction(async tx => {
    // 1) advisory lock으로 동시 pull race 차단
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

    // 2) 이미 이관됐는가?
    const existing = await tx.select({ n: count() }).from(cloud_lists)
                        .where(eq(cloud_lists.userId, userId));
    if (existing[0].n > 0) return;

    // 3) 레거시 row 존재?
    const legacy = await tx.select().from(cloud_vocab_data)
                      .where(eq(cloud_vocab_data.user_id, userId));
    if (!legacy.length) return;

    // 4) jsonb 파싱 (구조: VocaList[] with nested words)
    const parsed = VocaListSchema.array().safeParse(legacy[0].data_json);
    if (!parsed.success) {
      await markMigrationFailed(tx, userId, parsed.error);  // 재시도 방지
      return;
    }
    const validLists = parsed.data;  // 깨진 list는 safeParse가 전체 실패 → 부분 허용 원하면 per-list safeParse

    // 5) lists INSERT
    const listRows = validLists.map(l => ({
      id: l.id, userId, title: l.title, /* ...VocaList → CloudList 매핑... */,
      createdAt: l.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    }));
    if (listRows.length) await tx.insert(cloud_lists).values(listRows);

    // 6) words INSERT — data_json의 nested words를 listId별로 풀어서
    const wordRows = validLists.flatMap(l => (l.words ?? []).map(w => ({
      id: w.id, listId: l.id, userId,
      term: w.term, definition: w.definition ?? '', /* ... */,
      createdAt: w.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    })));
    if (wordRows.length) await tx.insert(cloud_words).values(wordRows);

    // 7) 레거시 row 제거
    await tx.delete(cloud_vocab_data).where(eq(cloud_vocab_data.user_id, userId));
  });
}
```

**핵심**:
- **`pg_advisory_xact_lock(hashtext(userId))`** — 같은 사용자의 동시 pull 요청에서 하나만 이관, 나머지는 대기 후 `existing > 0`으로 skip. 트랜잭션 종료 시 자동 해제
- **트랜잭션 단일 원자** — 중간 실패 시 전부 롤백
- **실패 플래그** — 파싱 실패한 사용자는 재시도 무한 반복 방지 위해 `cloud_users.legacyMigrationStatus: text` 컬럼 신설(`'pending'|'done'|'failed'`). `markMigrationFailed`가 `'failed'` 기록 → 이후 `migrateLegacyIfNeeded`는 즉시 return. 1인 프로젝트 스코프에선 in-memory Set+TTL로 대체 가능하나, 컬럼 추가가 서버 재시작 내성 있음

**`POST /api/sync/data` 즉시 차단**: step 6a 배포 시점에 구프론트가 남아있지 않으므로 `410 Gone + { error: 'DEPRECATED', upgradeUrl }` 반환. 혹시 구프론트가 POST하면 레거시 row 재생성 → 이관 무한 루프 → **즉시 차단이 안전**. `GET /api/sync/data`는 조용히 남기되 빈 배열 반환(호환).

**지연 migrate의 한계**: 영영 로그인 안 하는 유저의 레거시 row가 영구 잔류. step 13 DROP 전 **`SELECT COUNT(*) FROM cloud_vocab_data`와 `SELECT COUNT(*) FROM cloud_vocab_data WHERE user_id IN (SELECT id FROM cloud_users WHERE updated_at < NOW() - interval '6 months')` 둘 다 확인** — 전자가 0이 아니지만 후자와 같으면 전부 장기 미로그인 → 데이터 유실 감수하고 DROP (1인·출시 전 스코프).

---

**SQLite** (`lib/db/schema.ts`):
- `lists` 22필드 + `words` — **기본 구조 유지**
- **마이그 013에서 3개 컬럼 추가**:
  - `lists.deletedAt INTEGER` (soft-delete)
  - `lists.updatedAt INTEGER DEFAULT 0` (**현재 SQLite `lists`에 없음** — sync dirty push에 필수. `words`는 이미 있음)
  - `words.deletedAt INTEGER`
- `SCHEMA_VERSION` 상수 12 → **13**으로 변경 + 기존 러너(`lib/db/index.ts`)에 `if (currentVersion === 12) { ...ALTER... currentVersion=13 }` 블록 추가 (step 6b 범위)
- **`vocab-storage.ts`의 SELECT 쿼리 전수 필터 추가** (step 6b 범위, 7a 이전):
  - 15개 `FROM lists/words` SELECT에 `WHERE deletedAt IS NULL` (또는 기존 WHERE에 `AND`)
  - `getLists()`의 lists 조회 2회 + words 조회 포함
  - `getWordsForList`, `getListById` 등 전수 sweep
  - COUNT 쿼리(예: `getListProgress`의 memorized count)도 필터 포함
- **5개 DELETE → UPDATE SET deletedAt**:
  - `deleteList`, `deleteWord`, `deleteWords`, `mergeLists`, `clearAllData`(이것만 hard-delete 유지, 테스트/초기화용)
  - soft-delete 시점에 sync engine이 dirty set에 반영해야 함(`softDeleteList` 호출 뒤 `features/sync/engine.markListDirty(id)` + cascade로 word들도)
- **step 11의 마이그 분리(러너 교체)**는 별도. step 6b에서는 **기존 러너에 013 step만 추가**하고 쿼리 필터 전파. 11에서 러너 구조 전면 정비

**마이그레이션 파일 관리**:
- Drizzle: `pnpm drizzle-kit generate` → 새 마이그레이션 파일(`users` DROP + `cloud_lists`/`cloud_words` CREATE + 인덱스) → `pnpm db:push`
- step 1b: 위 작업. step 6a: `cloud_users.legacyMigrationStatus` 컬럼 추가 마이그레이션 별도 생성
- 현 `migrations/` 하위 파일은 유지

### 상태 관리 — Zustand 최소화

**Zustand 사용**: `features/auth/store.ts` (token, user, mode), `features/settings/store.ts` (6개 설정 묶음), `features/sync/store.ts` (dirtyListIds).

**Zustand 미사용**: vocab/study/curation — TanStack Query 캐시 + 화면 로컬 `useState`로 충분.

**Context**: Theme만 `lib/theme/ThemeProvider.tsx`로 이동 유지. QueryClientProvider는 `lib/query-client.ts` 재활용.

### 응답 envelope 정책

**현 서버 응답 모양 그대로 유지**, Zod로 그 모양 기술. `{ data, error }` 같은 표준화는 도입 안 함.

---

## Zod 적용 — 경계 5곳 + 추가 2곳

### 스키마 배치

`shared/contracts.ts` (단일 파일로 시작):
- **drizzle-zod 파생**: `CloudUser`, `CuratedTheme`, `CuratedWord`, **`CloudList`**, **`CloudWord`** (`createInsertSchema` + `createSelectSchema`)
- **수동 정의** (로컬 전용):
  - `WordSchema`, `VocaListSchema`, `StudyResultSchema` — 프론트 `Word`/`VocaList` (SQLite 필드 기반)
  - `InputSettings`, `StudySettings`, `AutoPlaySettings`, `ProfileSettings`, `CustomStudySettings`, `AuthState`, `DashboardFilter`, `ThemeMode`, `Locale`
  - `AIWordResult`, `ThemeList`, `GenerateMoreResult`, `GeminiImageResult` — **`server/gemini.ts` 로컬 타입(4필드)과 `lib/types.ts` 정의(7필드) 통일**
  - `GoogleAuthRequest/Response`, `CreateCurationRequest`, `UpdateCurationRequest`, `AIAnalyzeRequest`, `GenerateThemeRequest`, `GenerateMoreRequest`
  - **Sync 스키마**: `SyncPullQuerySchema` (`{ since: coerce.number() }`), `SyncPullResponseSchema` (`{ lists: CloudList[], words: CloudWord[], serverTime: number, hasMore: boolean, nextSince?: number }`), `SyncPushRequestSchema` (`{ lists: CloudListPush[], words: CloudWordPush[] }` — `userId`/`updatedAt` 필드 omit), `SyncPushResponseSchema`
  - 외부 API(번역/사전/Datamuse) 응답: **`.passthrough()` + 핵심 필드만** 엄격
  - `JwtPayloadSchema` (`z.object({ userId: z.string(), exp: z.number() })`)

**프론트↔클라우드 변환**: `VocaList ↔ CloudList`, `Word ↔ CloudWord` 매핑 함수 `features/sync/mapping.ts`. 필드 대부분 동일(camelCase 통일) — `userId` 주입/제거, `listId` 연결, `deletedAt` 처리, `null → ''` coerce(notNull default 컬럼).

### 1. 서버 req.body / query 검증 (`validateBody`/`validateQuery` 미들웨어)

`zod-validation-error` 사용, 실패 시 `400 { error:'VALIDATION_ERROR', details }`. 적용 라우트:
- `POST /api/auth/google` — `GoogleAuthRequestSchema`
- **`POST /api/sync/push` — `SyncPushRequestSchema`** (userId는 서버 JWT로 주입, body에 없음)
- **`GET /api/sync/pull` — `validateQuery(SyncPullQuerySchema)`**
- `POST/PUT /api/curations` — create/update 스키마
- `POST /api/ai/*` — 각 요청 스키마 (`count`는 `z.number().min(1).max(100)`로 클램프 내장)
- `GET /api/dict/naver|autocomplete` — `validateQuery`

**관대→엄격 2단계**: step 2에선 `.passthrough()` + optional 여유. step 12에서 엄격화.

### 2. 서버 **응답** 검증 (이관 방어)

**추가 지점**: `migrateLegacyIfNeeded()` 내부에서 레거시 `data_json` 파싱 시 `z.array(VocaListSchema).safeParse()` — 기존 악성/변형 jsonb 방어. 실패 시 row별 drop + 로그. 이관 실패한 사용자는 "클라우드에 데이터 없음" 상태로 진입 (로컬 데이터 업로드 흐름).

### 3. 클라이언트 응답 파싱 (`apiFetch` 내장)

**신규**: `lib/api/client.ts`
```ts
export async function apiFetch<T>(
  path: string,
  opts: {
    schema: ZodSchema<T>;
    method?: string; body?: unknown;
    token?: string; headers?: Record<string,string>;   // x-user-id 지원
    timeout?: number;                                   // default 15s
  }
): Promise<T>;
```

- `resolveApiBase()` 단일 함수 — 프로덕션(`EXPO_PUBLIC_DOMAIN` + `https`) / 개발(`hostIp` + `http`) 분기. 4곳 불일치 해소.
- 기존 `lib/query-client.ts`의 `apiRequest`/`getApiUrl`은 흡수해서 제거.

**치환 대상** (전수):
- `AuthContext.tsx:109` `/api/auth/google`
- `VocabContext.tsx:86,112,159` sync 3곳 — **신규 `/api/sync/pull`, `/api/sync/push`로 전환**
- `VocabContext.tsx:182,198,320,333` curations POST/GET/PUT/DELETE
- **`app/(tabs)/curation.tsx`** Gemini REST 직접 호출
- `lib/translation-api.ts`, `lib/naver-dict-api.ts`
- `lib/gemini-api.ts` 이미지 OCR

### 4. AsyncStorage JSON 파싱 (`persisted` 래퍼)

**신규**: `lib/storage/persisted.ts`
```ts
export function persisted<T>(
  key: string, schema: ZodSchema<T>, defaults: T,
  opts?: { onDrift?: (raw: unknown, error: ZodError) => T | undefined }
) { ... }
```

`onDrift` 콜백으로 각 키별 복구 전략 선택 — 부분 merge vs 리셋. 기본은 리셋.

**키 전수**:
| 키 | 스키마 |
|---|------|
| `@soksok_auth` | `AuthStateSchema` (JWT 만료 체크는 load 후 유지) |
| `@soksok_user_input_settings` | `InputSettingsSchema` — `fieldOrder`에 `.default()` + `.transform(fillMissing)` → `SettingsContext.tsx:176-212` 수동 로직 대체 |
| `@soksok_user_study_settings` | `StudySettingsSchema` (onDrift: 필드별 defaults merge) |
| `@soksok_user_autoplay_settings` | `AutoPlaySettingsSchema` (동일) |
| `@soksok_custom_study_settings` | `CustomStudySettingsSchema` |
| `@soksok_profile_settings` | `ProfileSettingsSchema` |
| `@soksok_dashboard_filter` | `z.enum(['all','studying','completed','finished'])` — 현 `SettingsContext.tsx:167`이 `'all'`/`'finished'` 누락, 스키마에서 바로잡음 |
| `@soksok_theme` | `z.enum(['light','dark'])` |
| `@soksok_locale` (LOCALE_KEY) | `UILocaleCodeSchema` (현 `i18n`의 `UI_LOCALES` 기반) |
| `@soksok_onboarding_done` | `z.enum(['true','false'])` |
| `@soksok_last_pulled_at` | `z.number().int().min(0).default(0)` |
| `@soksok_device_id`, `@soksok_last_google_id` | 단순 문자열, 스키마 불필요 |

### 5. AI 응답 검증

- 서버 `server/gemini.ts:67,115,152` → `AIWordResultSchema.parse(JSON.parse(text))` 등. Gemini `responseSchema`는 1차 방어선으로 유지.
- 클라이언트 `lib/gemini-api.ts:72` → `GeminiImageResultSchema.parse(...)`. 실패 시 "다시 시도" UI 안내.
- `app/(tabs)/curation.tsx` Gemini 직접 호출 응답도 동일 스키마.

### 6. JWT payload 검증

`server/middleware/requireAuth.ts`의 `verifyJWT`에서 `JwtPayloadSchema.parse(jwt.verify(...))` — decoded claims 신뢰성 확보.

### 7. SQLite row → 객체 조립

`features/vocab/db.ts`(기존 `lib/vocab-storage.ts`)의 row→`Word`/`VocaList` 조립 함수에 **defaults 적용** (마이그 중간 상태의 undefined 필드 방어). Zod parse까지 갈 필요는 없으나, defaults는 필수.

---

## 안정성 개선 (Zod 외)

### VocabContext 해체

- `features/vocab/queries.ts` (TanStack Query): lists 조회/변이
- `features/vocab/api.ts`: apiFetch로 curation
- `features/vocab/db.ts`: 현 `lib/vocab-storage.ts` 이동. row→객체 defaults. **`deletedAt` 컬럼 추가**(마이그 013), soft-delete API(`softDeleteList`, `softDeleteWord`, `softDeleteWords`) 추가
- `features/sync/engine.ts` — 정규화 기반 재설계:
  - `dirtyListIds: Set<string>`, `dirtyWordIds: Set<string>`
  - `lastPulledAt: number` (AsyncStorage `@soksok_last_pulled_at`, `persisted()`)
  - 변이 발생 시 dirty set 추가
  - 2초 debounce 후 `push`: dirty set의 SQLite row 조회 → `VocaList→CloudList` / `Word→CloudWord` 매핑 → `POST /api/sync/push`
  - push 성공 시 `lastPulledAt ← response.serverTime` **즉시 갱신** (echo 방지), dirty set 비움
  - 로그인 시 / 앱 기동 시 `pull(since=lastPulledAt)`: 응답을 **SQLite 트랜잭션**으로 upsert (deletedAt non-null이면 hard-delete). **트랜잭션 커밋 후에만** `lastPulledAt ← serverTime`
  - 리스트 soft-delete 호출 시 cascade: `softDeleteList(id)`가 `SELECT id FROM words WHERE listId=?`로 자식 word들 조회 후 각각 `deletedAt` 설정 → 모두 dirtyWordIds 추가
  - 첫 로그인 + `lastPulledAt === 0` 상태에서 로컬+클라우드 데이터 공존 시 "합치기 vs 클라우드 유지" 분기 유지:
    - **"합치기" 경로는 로컬 list/word의 id를 전부 새 uuid로 재발급** (서버에 같은 id 있을 수 있음 — 충돌 회피). remap 후 push
    - "클라우드 유지" 경로는 로컬 SQLite `DELETE FROM` → pull 수행
- `studyResults` → **router params는 크기 제약**. `JSON.stringify(Word[])`가 URL 길이 초과 가능. 대안: `features/study/store.ts`에 비영속 Zustand로 일회성 전달
- **`Alert.alert()` 제거 전략**: `loadCloudData`는 `'local-empty' | 'cloud-empty' | 'conflict'` 상태 반환 → 로그인 화면에서 Alert 표시. 정규화 구조에서도 **첫 로그인 시 "합치기 vs 클라우드 유지"** 분기는 유지(로컬에 데이터 + 클라우드에 데이터가 모두 있을 때 한 번만)
- `withSync` 데드코드 제거, `deleteWord` 단일 버전 삭제(`deleteWords`로 통일)

### SQLite 마이그레이션 분리 + 화이트리스트 (step 11)

```
lib/db/
  index.ts        ← 러너만
  index.web.ts    ← 유지 (Metro .web.ts 규칙)
  schema.ts       ← INIT_QUERIES 유지
  migrations/
    001_init.ts   export async function up(db) { /* INIT_QUERIES */ }
    002_words_tags.ts ... 013_add_deletedAt_updatedAt.ts
```

각 migration의 `up()`:
```ts
try { await db.execAsync('ALTER TABLE ...'); }
catch (e: any) {
  const msg = (e?.message ?? '').toLowerCase();
  if (!/duplicate column|already exists/.test(msg)) throw e;
}
```

- `PRAGMA user_version` 갱신은 **각 step 성공 뒤**로 변경. 트랜잭션은 step 단위.
- **위험 완화**: 기존 러너와 신규 러너 공존, `SOKSOK_NEW_MIGRATION_RUNNER` env/상수로 토글. 신규 설치만 새 러너. 2주 관찰 후 기존 러너 제거.

### 디자인 토큰 단일화 (457개 스윕 — 3 PR)

`lib/theme/tokens.ts` 신규 + `constants/colors.ts` → `lib/theme/colors.ts` 이동 + `constants/popup.ts` 흡수.

- **10a**: 기반 + WordDetailModal(34K), StudySettingsModal(31K), ListContextMenu(22K) 등 대형 파일 3-5개
- **10b**: 화면별 (`app/**/*.tsx`) 20-30개씩
- **10c**: 나머지 컴포넌트 + ESLint 룰 활성화 (style prop hex 리터럴 금지)

### 서버 라우터 분리

`server/routes.ts`(262줄) + `auth.ts`(195줄) → `server/routes/{auth,sync,curations,ai,dict}.ts`. `pool.query` 집중은 `server/services.ts` **단일 파일로 시작**(수요 발생 시 분할). `requireAuth`/`resolveRequesterId`는 middleware로.

### components/ 이동 전략

- **`components/ui/*`** (14개, Context 독립) → `lib/ui/*` (step 10a에서 일괄 이동)
- **Context 사용 컴포넌트** (4개): `WordDetailModal`, `CustomStudyModal`, `BatchImportWorkflow`, `PhotoImportWorkflow` → 해당 feature의 step(7 또는 8)에서 함께 이동
- **공용 도메인 컴포넌트** (`ListCard`, `ListContextMenu`, `ErrorBoundary` 등): 그대로 `components/` 유지 또는 필요시 `lib/ui`로 승격

---

## 이행 전략 (17단계)

| # | 내용 | 의존 | 위험 |
|---|------|------|-----|
| 0 | `zustand` 설치, `jest.config` moduleNameMapper 확인, 루트 temp 스크립트 정리 | — | 낮음 |
| 1 | 기반: `shared/contracts.ts`(sync·auth·AI·settings·외부 API 전수), `shared/types.ts`, `lib/api/client.ts`(`query-client.ts` 흡수), `lib/storage/persisted.ts`, `lib/theme/tokens.ts`, `server/middleware/*`. **bigint mode:'number' zod 출력 실제 검증** | 0 | 낮음 |
| 1b | DB 정리: `users` 제거 + `runMigrations()` 제거 + **`cloud_lists`/`cloud_words` 신설**(인덱스·default·`legacyMigrationStatus` 포함), `cloud_vocab_data`는 이관 전 유지. **IStorage 인터페이스 완전 제거**. `drizzle-kit generate` → `db:push` | 1 | 낮음 |
| 2 | 서버 라우터 분리 + `validateBody`(관대) + curation 로직 `server/services.ts`로. 기존 `/api/sync/data`는 6a에서 처리 | 1b | 낮음 |
| 3 | AI 응답 Zod parse (`server/gemini.ts`, `lib/gemini-api.ts`, `app/(tabs)/curation.tsx`) | 1 | 낮음 |
| 4 | `features/auth` + Zustand store, `AuthContext` 제거, `persisted()` 적용, `apiFetch` 치환 | 1 | 중 |
| 5 | `features/settings` + Zustand store, `SettingsContext` 제거, 수동 `fieldOrder` 삭제 | 1 | 중 |
| **6a** | 서버 sync 재작성: `POST /api/sync/push`, `GET /api/sync/pull` + `migrateLegacyIfNeeded`(advisory lock + failed 플래그) + **권한 검증(word.listId 소유자)**. 기존 **`POST /api/sync/data`는 410 Gone 즉시 차단**, GET은 빈 배열 반환 | 1b,2 | 중 |
| **6b** | SQLite 마이그 013: **`lists.updatedAt` + `lists.deletedAt` + `words.deletedAt`** 3개 컬럼 추가. `SCHEMA_VERSION` 12→13. 기존 러너에 `if(currentVersion===12)` 블록. **`lib/vocab-storage.ts`의 15개 SELECT 전수에 `WHERE deletedAt IS NULL`** + 5개 DELETE→UPDATE(softDelete*, mergeLists 조건부. clearAllData는 hard-delete 유지). **UI delete 버튼은 여기선 바꾸지 않음**(7c에서) | 1 | 중 |
| **6c-1** | `features/sync/{engine,mapping,store,index}.ts` **신설**(미활성, 유닛 테스트). mapping의 `VocaList ↔ CloudList` 규칙 확정(null→'' coerce 포함) | 6a,6b | 낮음 |
| **6c-2** | push 전환: VocabContext 내부에 dirty set 주입. debounce push 활성(pull은 아직 기존). **echo 방지**(push 응답 serverTime 즉시 갱신) | 6c-1 | 중 |
| **6c-3** | pull 전환: `pull(since=lastPulledAt)`로 교체. **기존 `GET /api/sync/data` 호출 제거**. SQLite 트랜잭션 커밋 후 `lastPulledAt` 갱신. "합치기" 경로는 **로컬 id remap** 후 push | 6c-2 | **높음** |
| 7a | `lib/vocab-storage.ts` → `features/vocab/db.ts` 이동 (6b에서 만든 softDelete API 포함, 내용 이동만) | 6b | 낮음 |
| 7b | `features/vocab/queries.ts` + `api.ts` (curation만) 신설, VocabContext 읽기 메서드 이관 | 6c-3,7a | 중 |
| 7c | VocabContext 쓰기 메서드 이관 + `Alert.alert()` 화면 이동 + `studyResults` → `features/study/store`. **UI delete 버튼 → softDelete 전환**. VocabContext 제거 | 7b | **높음** |
| 8 | `features/study`로 flashcards/quiz/examples/autoplay/plan 이동, `plan-engine.ts` 이동 | 7c | 중 |
| 9 | `features/curation`, `features/onboarding` 이동. `hooks/useOnboarding.ts` 제거 | 7c | 낮음 |
| 10a | `components/ui/*` → `lib/ui/*`, tokens/colors 이동, 대형 파일 3-5개 hex 치환 | 1 | 낮음 |
| 10b | 화면별 hex 치환 | 10a | 낮음 |
| 10c | 남은 hex + ESLint hex 금지 룰 + **ThemeContext → `lib/theme/ThemeProvider.tsx`**, **LocaleContext → `lib/i18n/useLocale.ts`** | 10b,9 | 낮음 |
| 11 | SQLite 마이그 분리(001~013) + 화이트리스트. 신구 러너 공존 토글, 신규 설치만 신규 러너 | 1,6b | **높음** |
| 12 | `validateBody` 엄격화(2단계). ESLint feature 경계 룰(`no-restricted-imports`). 최종 Provider: `<QueryClientProvider><ThemeProvider><GestureHandlerRootView>` | 전부 | 낮음 |
| 13 | 레거시 청소: 서버 `GET /api/sync/data` 제거, `cloud_vocab_data` DROP. 사전에 `SELECT COUNT(*)` + 장기 미로그인 유저 분포 확인 | 6c-3,12 | 중 |

**Step 7 분할**: 7a(이동) / 7b(읽기) / 7c(쓰기 + UI delete 전환 + VocabContext 제거).
**Step 6 분할**:
- **6a**(서버·무해 배포): 신구 엔드포인트 공존, 구 POST 차단
- **6b**(SQLite 마이그·무해 배포): 컬럼 추가 + 쿼리 필터 전파. soft-delete API 존재하나 UI는 아직 호출 안 함 → 동작 동일
- **6c-1/6c-2/6c-3**(프론트): 엔진 신설 → push → pull 3분할. **6a+6b 선행 필수**
- 6a/6b는 독립 배포 가능. 6c-*는 선행 의존 (표의 "각 배포 가능"은 엄밀히 6a/6b 기준)

**공유 단어장 정책**:
- `cloud_lists`와 `curated_themes`는 **별개 엔티티**. 사용자 개인 보유 list는 `cloud_lists`, 공유 스냅샷은 `curated_themes`에 저장. 동기화 안 함
- 사용자가 curation을 **다운로드**하면 프론트 `features/curation`이 **로컬에서 새 uuid 발급** + SQLite `lists`에 삽입 → 이후 sync로 `cloud_lists`에 저장됨 (원본 `curated_themes.id`와 분리)
- 공유본 편집은 `PUT /api/curations/:id`로 별도 처리 (현 흐름 유지)

---

## 도입/제거 요약

**도입**: Zod(경계 7곳), Zustand(3 store), `lib/api/client.ts`, `lib/storage/persisted.ts`, `lib/theme/tokens.ts`, TanStack Query 실제 사용, feature 폴더, `validateBody`/`validateQuery`, `server/services.ts`, `shared/contracts.ts`, **`cloud_lists`/`cloud_words` 테이블**, **`/api/sync/pull`·`/api/sync/push` 엔드포인트**, **SQLite 마이그 013** (`lists.updatedAt` + `lists.deletedAt` + `words.deletedAt`), **`cloud_users.legacyMigrationStatus` 컬럼**, **advisory lock 기반 이관**.

**제거**: 4개 Context(Vocab/Auth/Settings/Locale), `constants/`, 수동 `fieldOrder` 로직, `withSync` 데드코드, Context 내 `Alert.alert()`, 중복 API_BASE 4개, 라우트 핸들러 `pool.query` 직접 호출, hex 리터럴, `hooks/useOnboarding.ts`, `lib/query-client.ts`(흡수), `lib/types.ts`(shared/types로 대체), **`users` 테이블 + 관련 코드**, **`server/auth.ts:runMigrations()`**, **`/api/sync/data` GET/POST 엔드포인트**(step 13), **`cloud_vocab_data` 테이블**(step 13, 이관 확인 후).

**도입 안 함**: Tailwind/NativeWind, shadcn/react-native-reusables, Redux/Recoil/Jotai, Clean Architecture/DDD/Repository, DI 컨테이너, tRPC/GraphQL, 응답 envelope 표준화, `eslint-plugin-boundaries`(대신 `no-restricted-imports` 5줄).

**리네임 안 함**: `shared/schema.ts`, `lib/db/index.web.ts`, `constants/colors.ts`(이동만).

---

## 핵심 수정 파일

**신규**:
- `shared/contracts.ts`, `shared/types.ts`
- `shared/schema.ts`에 **`cloud_lists`, `cloud_words`** 테이블 추가
- `lib/api/client.ts`, `lib/api/errors.ts`
- `lib/storage/persisted.ts`
- `lib/theme/tokens.ts`, `lib/theme/ThemeProvider.tsx`
- `lib/db/migrations/001_init.ts` ~ `013_add_deletedAt_updatedAt.ts`
- `lib/i18n/useLocale.ts`
- `server/middleware/{validateBody,validateQuery,requireAuth}.ts`
- `server/routes/{auth,sync,curations,ai,dict}.ts`
- `server/services.ts` (sync: `pullSince`, `pushUpsert`, `migrateLegacyIfNeeded`, `softDelete`)
- `features/sync/{engine.ts,mapping.ts,store.ts,index.ts}` (변환 + dirty set + debounce)
- `features/{vocab,auth,settings,study,onboarding,curation}/**`

**삭제**:
- `contexts/` 전체 (Theme만 lib/theme로 이동)
- `constants/colors.ts`, `popup.ts` (lib/theme로)
- `server/routes.ts`, `server/auth.ts`
- `hooks/useOnboarding.ts`
- `lib/query-client.ts` (lib/api/client.ts로 흡수)
- `lib/types.ts` (shared/types로)
- `shared/schema.ts`의 `users` 테이블 + `insertUserSchema` + `InsertUser`/`User` 타입
- `server/storage.ts`의 `getUser`/`getUserByUsername`/`createUser` + `IStorage` 인터페이스 해당 라인
- `server/auth.ts:64-69` `runMigrations()` 및 `server/index.ts`의 호출
- **`shared/schema.ts`의 `cloud_vocab_data` 테이블** (step 13, 이관 확인 후)
- **`GET/POST /api/sync/data` 핸들러** (step 13)

**재배치 (내용 거의 유지)**:
- `lib/vocab-storage.ts` → `features/vocab/db.ts` (row defaults 추가)
- `lib/plan-engine.ts` → `features/study/plan/engine.ts`
- `lib/db/index.ts` → 러너만 남기고 migrations 분리
- `components/ui/*` → `lib/ui/*`
- 4개 도메인 컴포넌트 → 해당 features/*/components/
- `__tests__/*.test.ts` — step 3/7a/8에서 import 경로 갱신

**변경 안 함**:
- `shared/schema.ts`, `drizzle.config.ts` (drizzle-kit 그대로 동작)
- `lib/db/index.web.ts` (Metro resolver)

---

## Verification

### 각 단계 공통
- `pnpm run lint` 통과
- `pnpm test` — 기존 4개 + 새 contracts 통합 테스트
- `pnpm run server:dev` → `GET /api/db-check` 200
- `pnpm dev` 앱 기동, golden path 회귀 없음
- **step 1 직후 `pnpm db:push` 동작 확인** (drizzle 경로 유지 검증) + **`createSelectSchema(cloud_lists).shape.updatedAt` 출력 확인** — `ZodNumber`면 OK, `ZodBigInt`면 `.transform(Number)` 오버라이드 필요
- **step 1b 직후** Supabase 대시보드에서 `users` DROP 확인, `cloud_lists`/`cloud_words` 생성 + 인덱스 + default(`extract(epoch from now())*1000`) 확인. `cloud_users.is_admin`·`legacyMigrationStatus` 존재 확인
- **step 6b 직후** `PRAGMA user_version` → 13 확인. `getLists()`가 soft-delete row 제외 확인. 기존 기기(v12)를 최신 앱으로 열어 ALTER 성공 확인

### Golden path
1. 게스트: 단어장 생성 → 단어 추가 → 암기 체크
2. Google 최초 로그인(로컬 데이터 있음, 클라우드 비어 있음): 로컬이 그대로 서버에 push 되어 `cloud_lists`/`cloud_words` 생성
3. Google 로그인(양쪽 데이터 있음): "합치기" 또는 "클라우드 유지" 선택 → 결과 Alert 정상
4. 변이(단어 토글/추가/삭제) → 2초 debounce 후 `POST /api/sync/push` 호출, body에 **해당 row만** 포함. Postgres 해당 row만 UPDATE
5. 소프트 삭제: 단어 삭제 → push에 `deletedAt` 포함 → 서버 기록 → 다른 기기 pull 시 받아서 로컬 hard-delete
6. 플래시카드 → 결과 화면(비영속 Zustand 전달)
7. AI 생성 / 네이버 사전 / 번역 / 이미지 OCR

### 정규화 sync 특화 검증 (step 6a~6c, 13)
- **이관 (6a)**: 기존 `cloud_vocab_data`에 데이터 있는 테스트 사용자로 pull → `migrateLegacyIfNeeded` 자동 실행 → `cloud_lists`/`cloud_words` row 생성, `cloud_vocab_data` row 제거. 로그에 "migrated N lists, M words for userId=..."
- **이관 동시성 (6a)**: 같은 유저로 2개 탭/요청 동시 pull → advisory lock 덕에 한쪽은 대기 → 최종 row 수 정상(중복 없음)
- **이관 실패 플래그 (6a)**: 깨진 `data_json` 수동 주입 → pull → `legacyMigrationStatus='failed'` 기록 → 이후 pull은 skip (로그 반복 없음)
- **권한 검증 (6a)**: 사용자 A의 JWT로 `push` body에 사용자 B 소유 `listId`의 word 포함 → 400 에러. 로그에 "unauthorized listId"
- **POST /api/sync/data 차단 (6a)**: 410 Gone 응답 확인
- **Row-level LWW (6c-3)**: 기기 A "암기함" 체크 + 기기 B "삭제" 거의 동시 push → 뒤에 도착한 쪽이 생존. 다른 row 영향 없음
- **Echo 방지 (6c-2)**: push 직후 즉시 pull → 응답에 자기 변경이 **포함되지 않음** (`lastPulledAt` 즉시 갱신 덕)
- **Crash 내성 (6c-3)**: pull 응답 수신 후 SQLite upsert 중 강제 종료 시뮬레이션 → 재시작 후 같은 since로 재pull → 데이터 일관
- **부분 실패 내성 (6c-2)**: push 네트워크 끊김 → dirty set 유지 → 재연결 시 재시도. `ON CONFLICT DO UPDATE`로 멱등
- **Payload 크기 (6c-2)**: 1 단어 토글 시 push body ≈ 200B (vs. 기존 jsonb 통짜 ≈ 250KB). Chrome DevTools Network로 측정
- **Soft delete 일관성 (6c-3)**: 기기 A에서 단어 삭제 push → 서버 `deletedAt` 기록 → 기기 B pull → SQLite hard-delete. B에서 `getLists()` 응답에 안 나옴
- **리스트 cascade soft-delete (6b)**: 리스트 삭제 시 하위 단어 전체 `deletedAt` 설정 + dirtyWordIds 포함 → push로 서버 일관
- **복원 경로 (6c-2)**: `softDeleteList`한 list의 id를 다시 생성할 경우 (push body에 `deletedAt: null` 명시) → 서버 upsert가 `deleted_at=NULL` 반영 → 다음 pull에서 복원된 상태
- **첫 로그인 합치기 remap (6c-3)**: 로컬 list id `L1`과 서버 list id `L1`이 겹치는 상황에서 "합치기" 선택 → 로컬 L1이 새 uuid로 remap 후 push → 서버에 별도 row로 저장
- **Legacy cutover (13)**: DROP 전 `SELECT COUNT(*) FROM cloud_vocab_data` 0 또는 장기 미로그인 유저만 남음 확인

### Zod 회귀 (신규 `__tests__/contracts.integration.test.ts`)
- AsyncStorage 깨진 JSON → 앱 크래시 없이 defaults 복구
- `/api/sync/push` 잘못된 body (`{lists:"x"}`) → 400 `VALIDATION_ERROR`
- `/api/sync/push` body에 `userId` 임의 주입 → 서버 무시 (Zod `.omit`), JWT userId 사용
- `/api/sync/push` body에 `updatedAt` 임의 주입 → 서버가 `NOW()`로 덮어쓰기
- 레거시 `data_json`에 깨진 항목 → 이관 실패 플래그 기록, 정상 항목은 별도 테스트 사용자로 이관
- Gemini 필드 누락 응답 → 서버 500 + 로그
- 변형된 서버 응답 → 프론트 `ApiParseError`

### 기능별
- **SQLite 마이그 (step 11)**: v0/v5/v12/v13 DB 각각에서 정상 기동. **기존 러너로 v12 달성 기기 → 신규 러너 v13 전환 시 `deletedAt` 컬럼만 추가**
- **디자인 토큰 (step 10)**: 다크모드 전환 일관, `tokens.radius.md` 변경 → 전역 반영
- **`fieldOrder` (step 5)**: 구버전 `['term','meaningKr']` → Zod transform이 누락 필드 자동 보충
- **401 (step 4)**: JWT 만료 → `ApiError(401)` → 자동 로그아웃
- **외부 API 유연성**: 번역 API가 새 필드 추가해도 `.passthrough()` 덕에 정상
