# B 마이그레이션: Express 백엔드 → Supabase 직결

> **상태**: Phase 0~4 완료. **다음 세션에서 Phase 5 (정리) 진행.**
> **수립일**: 2026-04-26 / **마지막 업데이트**: 2026-04-28

## Context

**왜 이 변경을 하는가**

- 5월 출시(Android+iOS) 예정. 1인 운영, 광고 수익 모델, 5년+ 장기 운영을 가정.
- 현재 Express 백엔드(`server/`)가 떠 있어야 사용자가 클라우드 동기화/큐레이션을 쓸 수 있음 → 호스팅 비용/관리 부담 발생.
- Replit을 더 이상 쓰지 않음. 새 호스팅을 셋업하느니 백엔드를 걷어내는 게 장기적으로 단순.
- AI 호출은 이미 클라가 사용자 본인 Gemini 키로 직접 호출 (이전 작업에서 마이그레이션 완료, commit f58b162).
- DB는 이미 Supabase Postgres에 떠 있음 (`DATABASE_URL`의 `postgres.ithqbclnwvyeultkyxbn` + 6543 포트 + `pgbouncer=true`로 확인. 프로젝트 ref: `ithqbclnwvyeultkyxbn`).

**의도한 결과**

- `server/` 폴더 통째로 삭제. 호스팅 0개. 운영비는 Supabase free tier로 충분.
- 클라가 `@supabase/supabase-js`로 직접 Auth/Sync/Curation 처리.
- RLS(Row Level Security)로 보안 격리.
- 코드 순감 ~950 LOC.
- 현재 사용자에게 보이는 동작은 그대로 유지 (sync, login flow, curation tab 등).

**핵심 정책 결정**

- 게스트 사용자: 클라우드 동기화 안 함(현행 동일). **커뮤니티 큐레이션 공유는 Google 로그인 필요로 변경** (UI 가드 추가, 로그인 유도).
- Realtime 구독은 사용 안 함. 기존 push/pull 구조 유지.
- soft-delete 유지 (멀티 디바이스 tombstone 필요).
- 출시 전이라 기존 cloud 데이터 wipe 가능 — 가장 깔끔한 마이그레이션 경로.

---

## 영역별 설계

### A. Auth (Supabase Auth + Google idToken)

- `@react-native-google-signin/google-signin`은 그대로 유지. `GoogleSignin.signIn()` → **idToken** → `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })`로 교환.
  - 현재 `accessToken`을 보내는 방식은 폐기.
  - `webClientId`는 Google Cloud Console의 기존 Web Client ID 그대로. 이걸 Supabase Dashboard → Authentication → Providers → Google에도 등록.
  - iOS는 nonce 권장이지만 v1은 nonce 없이 시작 (출시 후 보강).
- 게스트 모드 = 로컬 전용 (Supabase Anonymous Auth 사용 안 함).
- `useAuthStore` 단순화:
  - `mode: 'none' | 'guest' | 'google'` 유지 (라우팅 가드 호환).
  - **`token` 필드 제거** — Supabase SDK가 세션 자동 관리.
  - `user`: `{ id, email, displayName, avatarUrl, isAdmin }` 형태로 정규화.
  - `isAdmin`은 `app_admins` 테이블에서 `auth.uid()` 조회로 가져옴.
  - `isJwtExpired`/`handleTokenExpired` 제거 — SDK가 refresh 자동.
  - `hydrate`: `supabase.auth.getSession()` + `onAuthStateChange` 리스너 등록.
- Supabase 클라이언트: `lib/supabase/client.ts` 신설.
  - `createClient(URL, ANON_KEY, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`.
  - `AppState` 리스너로 foreground 시 `startAutoRefresh()`, background 시 `stopAutoRefresh()`.

### B. Sync (Supabase JS SDK + RLS)

- 기존 dirty-set + push/pull + 2초 debounce + lastPulledAt 구조 **유지**. fetch 호출만 SDK로 교체.
- `flushPush()`: `supabase.from('cloud_lists').upsert(rows, { onConflict: 'id' })`. words 동일.
- `pullChanges()`: `.select('*').gt('updated_at', lastPulledAt)`. soft-delete 행은 그대로 받아서 클라가 로컬 DELETE.
- **`updated_at`은 서버 trigger가 강제** (시계 skew 방지). LWW 정확성 유지.
  - `BEFORE INSERT OR UPDATE` trigger로 `updated_at = (extract(epoch from now()) * 1000)::bigint`.
- `user_id`는 컬럼 default를 `auth.uid()`로 두어 클라가 안 보내도 됨. 보내도 RLS가 일치 확인.
- echo-prevention: push 응답 row의 `max(updated_at)`을 `lastPulledAt`에 반영.
- First-login merge 3-way 로직 (`probeFirstLoginState` / `applyFirstLoginMerge` / `applyFirstLoginCloudReset` / `markAllLocalDirty`) **그대로 유지**. probe만 Supabase select로 교체.
- mapping: `vocaListToCloudPush` (camelCase) 폐기 → `vocaListToCloudRow` (snake_case row) 신설. pull용 `cloudListToVocaList`/`cloudWordToWord`는 살림.
- 401 분기 제거. PostgrestError/AuthSessionMissingError 처리만.

### C. Curation

- 공식 큐레이션 (`constants/curationData.ts`) 변경 없음.
- 커뮤니티 큐레이션은 Supabase 직결로:
  - `fetchCloudCurations`: `.select('*, curated_words(*)')` (조인).
  - `shareCuration` create: 사전 dup-check(`.select().eq('creator_id', auth.uid()).ilike('title', $1)`) → 없으면 insert.
  - `shareCuration` update: RLS가 `creator_id = auth.uid()` 강제 → `.update().eq('id', id)`.
  - `deleteCloudCuration`: `.delete().eq('id', id)`. RLS가 막아줌.
- **게스트는 공유 불가** (UI에서 버튼 비활성 + 로그인 유도). `creatorId`는 항상 `auth.uid()`.
- admin: `app_admins(user_id uuid pk)` 테이블 신설. 운영자가 SQL editor에서 직접 insert.
- `cloud_users` 테이블 폐기. user 정보는 `auth.users` 사용. `cloud_lists.user_id`/`cloud_words.user_id`/`curated_themes.creator_id`는 모두 `auth.users(id)` FK로 변경.

### D. Supabase 설정

- 기존 프로젝트 그대로 사용 (project ref: `ithqbclnwvyeultkyxbn`).
- 출시 전이므로 기존 `cloud_users`/`cloud_lists`/`cloud_words`/`curated_themes`/`curated_words` 데이터 wipe + 스키마 재생성.
- Authentication → Providers → Google enable + 기존 Web Client ID 등록.
- 환경변수:
  - 신설: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
  - 폐기: `EXPO_PUBLIC_DOMAIN`, `JWT_SECRET`, `DATABASE_URL` (서버용), `EXPO_PUBLIC_GEMINI_API_KEY` 검토 (test/scripts에서만 쓰면 유지).
  - 유지: `EXPO_PUBLIC_GOOGLE_CLIENT_ID`(=webClientId).

---

## RLS 정책 SQL (요약)

전체 SQL은 마이그레이션 시 직접 작성. 핵심 정책:

```sql
-- updated_at trigger
create or replace function set_updated_at_ms() returns trigger as $$
begin
  new.updated_at := (extract(epoch from now()) * 1000)::bigint;
  return new;
end; $$ language plpgsql;

-- cloud_lists / cloud_words
alter table cloud_lists enable row level security;
alter table cloud_lists alter column user_id set default auth.uid();
create trigger cloud_lists_set_updated_at before insert or update on cloud_lists
  for each row execute function set_updated_at_ms();
create policy lists_own on cloud_lists for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- cloud_words 동일 패턴

-- app_admins
create table app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- curated_themes
alter table curated_themes enable row level security;
alter table curated_themes alter column creator_id set default auth.uid();
create policy themes_select_all on curated_themes for select using (true);
create policy themes_insert_authed on curated_themes for insert
  with check (auth.uid() is not null and creator_id = auth.uid());
create policy themes_update_owner on curated_themes for update
  using (creator_id = auth.uid()
         or exists (select 1 from app_admins where user_id = auth.uid()));
create policy themes_delete_owner on curated_themes for delete
  using (creator_id = auth.uid()
         or exists (select 1 from app_admins where user_id = auth.uid()));

-- curated_words: 부모 통해 권한 위임
alter table curated_words enable row level security;
create policy words_select_all on curated_words for select using (true);
create policy words_write_via_parent on curated_words for all
  using (exists (select 1 from curated_themes t
                 where t.id = curated_words.theme_id
                   and (t.creator_id = auth.uid()
                        or exists (select 1 from app_admins where user_id = auth.uid()))))
  with check (exists (select 1 from curated_themes t
                      where t.id = curated_words.theme_id
                        and t.creator_id = auth.uid()));
```

---

## 코드 변경 범위

### 삭제

- `server/` 폴더 전체 (index.ts, db.ts, routes.ts, services.ts, routes/{auth,sync,curations}.ts, middleware/*).
- `server_dist/`.
- `migrations/` (drizzle SQL).
- `drizzle.config.ts`.
- `shared/schema.ts` (drizzle 스키마).
- `package.json` 의존성: `express`, `pg`, `@types/pg`, `drizzle-orm`, `drizzle-kit`, `drizzle-zod`, `jsonwebtoken`, `@types/jsonwebtoken`, `tsx`, `concurrently`, `cross-env`, `http-proxy-middleware`, `ws`, `sqlite3`(server측), `@types/express`.
- `package.json` 스크립트: `dev`, `server:dev`, `server:build`, `server:prod`, `db:push`.
- `lib/api/client.ts` 의 `apiFetch`/`resolveApiBase`/deprecated 헬퍼들.
- `lib/api/errors.ts` 의 401-specific 에러.
- `shared/contracts.ts` 의 server-only 스키마 (`JwtPayloadSchema`, `GoogleAuthRequest/Response`, `SyncPullQuery`, `SyncPushRequest/Response`, `CurationMutateBodySchema`).

### 신설

- `lib/supabase/client.ts` — `createClient` + AsyncStorage adapter + AppState 핸들러.
- `lib/supabase/index.ts` — re-export.

### 수정 (재사용할 기존 함수)

- `features/auth/store.ts` — 재작성. `signInWithIdToken` 사용. `useAuthStore`/`useAuth` export 시그니처는 가능한 보존 (`token` 필드만 제거).
- `features/sync/engine.ts` — `flushPush`/`pullChanges` 내부를 SDK 호출로 교체. dirty-set/debounce/lastPulledAt 로직은 보존.
- `features/sync/first-login.ts` — `probeFirstLoginState`만 supabase select로 교체. 나머지 함수 그대로.
- `features/sync/mapping.ts` — `vocaListToCloudRow`/`wordToCloudRow` (snake_case) 신설. `cloudListToVocaList`/`cloudWordToWord` 그대로.
- `features/vocab/api.ts` — 큐레이션 함수를 SDK 호출로 교체. `CurationAuth` 타입 폐기.
- `features/vocab/hooks.ts` — `useShareList`/`useDeleteCloudCuration`에서 device id fallback 제거. 게스트 가드 추가.
- `features/vocab/use-bootstrap.ts` — `loadCloudData`에서 token 인자 제거.
- `features/vocab/mutations.ts` — `isGoogleAuthed()` 정의 유지 (`mode === 'google'` 체크만).
- `features/curation/screen.tsx` — `canDeleteCuration`에서 deviceId 분기 제거. 게스트일 때 공유 버튼 비활성/로그인 유도.
- `app/_layout.tsx`, `app/login.tsx` — 인터페이스 동일하면 거의 변경 없음.
- `app.json` — `expo-web-browser` 등 무관 plugin은 다른 용도 있으면 유지.
- `shared/contracts.ts` — `CloudList`/`CloudWord`/`Word`/`VocaList`/`AIWordResultSchema` 등 살림. server-only 스키마 삭제.
- `package.json` — `@supabase/supabase-js` 추가.
- `.env.example`, `CLAUDE.md` 갱신.

### Critical Files (구현 시 가장 자주 만질 파일)

- `features/auth/store.ts`
- `features/sync/engine.ts`
- `features/sync/mapping.ts`
- `features/sync/first-login.ts`
- `features/vocab/api.ts`
- `features/vocab/hooks.ts`
- `features/vocab/use-bootstrap.ts`
- `features/curation/screen.tsx`
- `lib/supabase/client.ts` (신설)

---

## Phase 분할 (4~6일)

### Phase 0 — 사전 검증 (반일, ~3시간)

가장 큰 위험 요소(idToken+Supabase 통합)를 격리 검증.

1. Supabase Dashboard에서 Google Provider enable + Web Client ID 등록.
2. 작은 SQL로 테스트 RLS 적용.
3. 임시 화면(또는 단발 스크립트)에서 `GoogleSignin.signIn()` → `idToken` 추출 → `supabase.auth.signInWithIdToken` 1회 성공 확인.
4. `auth.uid()`가 RLS 정책에서 매칭되는지 SQL editor로 확인.

**검증**: Supabase Dashboard `auth.users`에 user row가 생성되고, RLS 정책으로 select가 자기 행만 보이는지.

### Phase 1 — Supabase 인프라 (반일)

1. 운영 DB에 RLS SQL 일괄 적용.
2. 기존 데이터 wipe (`drop table cloud_users, cloud_lists, cloud_words, curated_themes, curated_words cascade` → 재생성).
3. `cloud_users` 폐기 + `app_admins` 신설 + FK 변경 (`auth.users(id)`).
4. `package.json`에 `@supabase/supabase-js` 추가, `pnpm install`.
5. `lib/supabase/client.ts` 신설.
6. `.env`에 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` 추가.

**검증**: `pnpm dev` 정상 동작 (Express는 아직 살아 있음). `lib/supabase/client.ts` import만으로 컴파일 통과.

### Phase 2+3 — Auth + Sync 동시 전환 (2일, 단일 commit 단위)

Auth만 바꾸면 sync가 깨지므로 둘을 묶어서 진행.

1. `features/auth/store.ts` 재작성 (signInWithIdToken, onAuthStateChange, token 제거).
2. `features/sync/mapping.ts`에 snake_case row mapper 추가.
3. `features/sync/engine.ts` 재작성 (SDK 호출).
4. `features/sync/first-login.ts`의 probe 함수 교체.
5. `features/vocab/use-bootstrap.ts` token 인자 제거.
6. `apiFetch('/api/auth/google'|'/api/sync/*')` 호출 사이트 모두 정리.

**검증 시나리오**:
- 신규 Google 로그인 → Supabase `auth.users`에 user row 생성.
- 게스트 로그인 → 단어 추가/학습 가능, sync는 안 함.
- Google 로그인 → 단어 추가 → 2초 후 Supabase `cloud_lists`/`cloud_words`에 row 보임.
- 다른 디바이스(또는 앱 재설치) 로그인 → cloud-only 분기 → pull로 데이터 채워짐.
- 양쪽에 데이터 → conflict prompt → 합치기/클라우드 유지 둘 다 동작.
- Soft-delete: list 삭제 → 다른 디바이스 pull 후 사라짐.
- 오프라인 → 단어 추가 → 온라인 복귀 후 push 자동.

### Phase 4 — Curation 전환 (반일)

1. `features/vocab/api.ts` (또는 `features/curation/api.ts`로 분리)에서 큐레이션 함수를 SDK 호출로 교체.
2. `CurationAuth` 타입 폐기.
3. `features/vocab/hooks.ts`에서 게스트 가드 추가, device id 로직 제거.
4. `features/curation/screen.tsx`: 공유 버튼 게스트 비활성/로그인 유도, `canDeleteCuration` deviceId 분기 제거.
5. `@soksok_device_id`는 다른 용도 없으면 삭제.

**검증 시나리오**:
- Google 로그인 → 큐레이션 공유 → Supabase `curated_themes`에 row 생성 → 다른 계정 community 탭에 보임.
- 자기 큐레이션 삭제 OK. 남의 큐레이션 삭제 시도 → RLS 차단.
- 게스트 → 공유 버튼 비활성/로그인 안내.
- Admin 계정 (app_admins에 등록): 모든 큐레이션 삭제 가능.

### Phase 5 — 정리 (반일)

1. `server/`, `server_dist/`, `migrations/`, `drizzle.config.ts`, `shared/schema.ts` 삭제.
2. `package.json` 의존성/스크립트 정리.
3. `lib/api/client.ts`, `lib/api/errors.ts` 정리.
4. `shared/contracts.ts` server-only 스키마 삭제.
5. `CLAUDE.md` 갱신: 백엔드 섹션 제거, Supabase 섹션 추가.
6. EAS preview build 1회 → Android internal testing track 업로드 → 실 디바이스 smoke test.

**검증 시나리오 (출시 후보 빌드)**:
- 콜드 스타트 → onboarding → google 로그인 → 단어 추가 → 앱 종료 → 재실행 → 단어 보임.
- 항공기 모드 → 단어 추가 → 항공기 모드 해제 → 30초 내 sync.
- 큐레이션 공유 + 삭제.
- 로그아웃 → 다른 계정 로그인 → first-login flow.

---

## 위험 요소 / 우선 검증 순서

1. **idToken + Supabase signInWithIdToken** (Phase 0) — 가장 큰 위험. 막히면 plan 변경 필요.
   - 함정: `idToken`이 null로 오면 `getTokens()`로 강제 추출.
   - 함정: `webClientId` 일치 (GoogleSignin.configure ↔ Supabase Provider 등록 ↔ Google Cloud Console).
   - 함정: Android release build의 SHA-1을 Google Cloud Console에 등록 안 하면 idToken 검증 실패.
2. **RLS 정책 SQL 적용 + auth.uid() 동작** (Phase 1) — `select * from pg_tables where rowsecurity=false and schemaname='public'` 으로 누락 점검.
3. **Single-row upsert + select after `.gt('updated_at',...)`** (Phase 3) — 컬럼명 매핑 정확성.
4. **First-login conflict prompt** (Phase 3 끝) — 기존 시나리오 회귀.

기타:
- iOS deep link 불필요 (idToken 방식).
- updated_at 시계 skew는 trigger로 해결.
- anon key 노출은 RLS로 막힘. RLS 정책 작성 후 `auth.uid()=null` 시나리오로 SQL editor에서 직접 시도해 누수 검증.
- Supabase free tier 한도(500MB DB / 5GB egress / 50K MAU): 단어장 앱 1만 명까지 여유. 7일 inactivity pause 정책은 광고 트래픽으로 회피.

---

## 일정

| Phase | 작업 | 시간 |
|---|---|---|
| 0 | 사전 검증 (idToken+Supabase) | 0.5일 |
| 1 | RLS SQL + 환경 + supabase client | 0.5일 |
| 2+3 | Auth + Sync 동시 전환 (단일 commit) | 2일 |
| 4 | Curation 전환 | 0.5일 |
| 5 | 정리 + EAS build smoke test | 0.5일 |
| **합계** | | **4일** + 버퍼 1~2일 = **5~6일** |

---

## 검증 (End-to-End)

마이그레이션 완료 시 다음 시나리오가 모두 동작해야 함:

1. **신규 사용자 (Google 로그인)**: 콜드 스타트 → 로그인 → 빈 상태 → 단어장 만들기 → 단어 추가 → Supabase Dashboard에 row 보임.
2. **재로그인**: 로그아웃 → 같은 계정 다시 로그인 → 데이터 그대로.
3. **다른 기기 sync**: 같은 계정으로 다른 기기 로그인 → cloud-only 분기 → 데이터 채워짐.
4. **First-login conflict**: 게스트로 일부 데이터 → google 로그인 → conflict prompt → "합치기" 또는 "클라우드 유지" 선택 → 결과 일관됨.
5. **오프라인 push**: 항공기 모드 → 단어 여러 개 추가 → 온라인 복귀 → 자동 sync.
6. **soft-delete sync**: 한 기기에서 list 삭제 → 다른 기기 pull 후 사라짐.
7. **큐레이션 다운로드 (공식)**: 공식 탭 → 테마 선택 → 단어장 만들기.
8. **큐레이션 공유 (Google 로그인)**: 단어장 → 공유 → community 탭에 자기 큐레이션 보임 → 다른 계정에서도 보임.
9. **큐레이션 삭제 권한**: 자기 큐레이션 삭제 OK, 남의 것 시도 → 차단.
10. **게스트 공유 차단**: 게스트 모드 → 공유 버튼 비활성/로그인 유도.
11. **Admin (app_admins)**: admin 계정 → 모든 큐레이션 삭제 가능.
12. **자동 채우기**: API 키 입력 + 단어 추가 → Naver 우선 → 실패 시 사용자 키로 Gemini 호출.
13. **EAS preview build**: Android internal testing track에 업로드 → 실 디바이스에서 위 시나리오 1~5 통과.

검증 도구:
- Supabase Dashboard → Table editor에서 row 확인.
- Supabase Dashboard → Authentication → Users에서 user 확인.
- 항공기 모드 / 두 디바이스 (또는 앱 두 번 설치) 로 멀티 시나리오 검증.
- EAS preview build로 production-like 환경 검증.

---

---

## Phase 0~4 완료 요약 (2026-04-28)

### 완료된 코드 변경

| 파일 | 변경 내용 |
|---|---|
| `lib/supabase/client.ts` | 신설 — Supabase 클라이언트 (AsyncStorage + AppState) |
| `lib/supabase/index.ts` | 신설 — re-export |
| `shared/contracts.ts` | `GoogleUser`에서 `googleId` 제거, `AuthState`에서 `token` 제거, 서버 전용 스키마 삭제 |
| `features/auth/store.ts` | `signInWithIdToken` 전환, token 필드 제거, `onAuthStateChange` 등록 |
| `features/sync/mapping.ts` | snake_case DB row 매퍼 추가 (`vocaListToCloudRow`, `wordToCloudRow`, `dbRowToVocaList`, `dbRowToWord`) |
| `features/sync/engine.ts` | Supabase SDK push/pull 전환, `apiFetch` 제거 |
| `features/sync/first-login.ts` | `probeFirstLoginState` → Supabase select로 교체 |
| `features/vocab/use-bootstrap.ts` | `token` 인자 제거, `ApiError` 분기 제거 |
| `features/vocab/api.ts` | Supabase SDK curation 전환, `CurationAuth` 폐기 |
| `features/vocab/hooks.ts` | device ID 로직 제거, 게스트 공유 가드 추가 |
| `features/curation/screen.tsx` | `deviceId` state 제거, `canDeleteCuration` 단순화 |
| `tsconfig.json` | `server/`, `server_dist/` 컴파일 제외 |
| `package.json` | `@supabase/supabase-js` ^2.49.0 추가 (실제 설치: 2.104.1) |
| `.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` 추가 |
| `app/login.tsx` | Phase 0 임시 테스트 버튼 잔류 (Phase 5에서 제거) |

### 완료된 Supabase Dashboard 작업
- Google Auth Provider 활성화 (Web Client ID + Secret 등록)
- 테이블 재생성: `cloud_lists`, `cloud_words`, `curated_themes`, `curated_words`, `app_admins`
- RLS 정책 전체 적용
- `set_updated_at_ms()` trigger 함수 등록
- **`cloud_lists.position` 컬럼을 `integer` → `bigint`로 변경** (SQLite migration 6에서 position이 lastStudiedAt ms값으로 초기화되므로 integer 범위 초과)

### 검증 완료
- Google 로그인 → Supabase `auth.users` row 생성 ✅
- 단어 추가 → `cloud_lists`, `cloud_words` row 생성 ✅
- TypeScript 컴파일 오류 없음 ✅

---

## Phase 5 — 정리 (다음 세션)

### 삭제할 파일/폴더

```
server/
server_dist/
migrations/          (drizzle SQL)
drizzle.config.ts
shared/schema.ts
```

### `package.json` 제거할 의존성

```
dependencies:
  express, pg, http-proxy-middleware, jsonwebtoken, ws, sqlite3, tsx

devDependencies:
  @types/express, @types/pg, @types/jsonwebtoken,
  drizzle-kit, concurrently, cross-env
```

### `package.json` 제거할 스크립트

```
dev, server:dev, server:build, server:prod, db:push, expo:dev
```

### 코드 정리

- `lib/api/client.ts` — `apiFetch`, `resolveApiBase`, deprecated helpers 제거 (`queryClient`와 `apiRequest`는 다른 곳에서 사용 여부 확인 후 결정)
- `lib/api/errors.ts` — 401 전용 에러 타입 삭제 여부 확인
- `shared/contracts.ts` — `SyncPullResponseSchema`, `SyncPushResponseSchema`, `CloudListPush`, `CloudWordPush`, `CurationMutateBodySchema` 등 서버 전용 스키마 삭제
- `app/login.tsx` — Phase 0 임시 테스트 버튼 제거 (GoogleSignin, supabase import도 제거)
- `CLAUDE.md` — 백엔드 섹션 제거, Supabase 섹션 추가

### Phase 5 완료 검증

```bash
pnpm start   # Express 없이 정상 실행
```
- TypeScript 컴파일 오류 없음
- 앱 실행 → Google 로그인 → 단어 추가 → Supabase row 확인

---

## 다음 세션 시작하는 법

1. 이 파일 (`docs/B-supabase-migration-plan.md`)을 Claude에게 보여주기.
2. "B 마이그레이션 Phase 5 시작해" 라고 요청.
3. Claude가 위의 삭제 목록과 코드 정리를 순서대로 진행.
4. 완료 후 commit.
