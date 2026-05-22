# 동기화 디버깅 세션 Handoff

작성일: 2026-05-22. dev client(Expo dev build)에서 계정 전환/동기화 버그를 추적한 세션.

## 한 줄 현재 상황

계정 전환·로그아웃 시 데이터 격리/복구 버그를 연쇄로 수정. **미커밋 3파일**(`features/auth/store.ts`, `features/sync/engine.ts`, `features/vocab/use-bootstrap.ts`)이 있고, **dev client 검증(나는솔로 단어장 21개 복구 확인) 후 커밋 예정**. 클라우드 데이터는 안전(손실 없음), 로컬 pull만 막혔던 문제.

---

## 이번 세션 이전에 이미 push된 것 (origin/main, `57b8d51..7b1a647`)

13개 커밋 — 계정 격리(SQLite/settings/BYOK), 결제 흐름(자동 복구/acknowledge/에러 세분화), 트라이얼 vs Pro UX, 라이선스 attribution, env-var 빌드 가드, i18n 보강, UGC 신고, deleteAccount 정리, handoff(v1.1) 갱신. 상세는 `docs/handoff-v1.1-progress.md` 참고.

또한 이번 세션에 **supabase 마이그레이션 `20260522000000_curation_reports.sql`를 production DB에 적용 완료**(`supabase db push`). UGC 신고 기능 동작 가능 상태.

---

## 이번 세션에서 추적한 버그 체인 (증상 → 원인 → 수정)

사용자 증상 흐름: "다른 계정 로그인 시 이전 계정 데이터 보임" → (이전 세션에 1차 수정) → dev에서 "나는솔로 단어장만 남고 단어 없음" → "로그아웃하면 splash부터 시작" → "재로그인해도 단어 없음".

### 버그 1 — pull 워터마크가 skip된 word를 영구 누락 (핵심)
- **증상**: 단어장(list)은 보이는데 그 안 단어(word)가 0개.
- **원인 (데이터로 확정)**: 나는솔로 list `updated_at=1779411399153`, word `updated_at=1779371852098` (list가 word보다 ~11시간 최신 — list만 plan 설정 등으로 나중에 갱신됨). `lastPulledAt`이 이 둘 사이일 때 pull의 `.gt('updated_at', lastPulledAt)`가 **list는 통과시키고 word는 탈락** → list는 빈 채로 오고 word는 워터마크 뒤에 영구 고립. 클라우드엔 word 21개 멀쩡히 살아있음(`is_deleted=false`).
- **수정** (`features/sync/engine.ts:pullChanges`): 두 가지 보강
  1. **parent-list backfill**: word는 왔는데 부모 list가 batch/로컬에 없으면, 그 부모 list를 `list_id`로 직접 fetch(워터마크 무관)해서 word를 정상 저장. (반대 비대칭 — orphan word)
  2. **list→word completeness fetch**: 살아있는 list가 batch에 오면 그 list의 word를 `list_id`로 전부 fetch(워터마크 무관)해서 항상 부모와 함께 내려옴. (나는솔로 케이스의 정확한 해결)
  - 워터마크 전진은 기존 gt batch 기준만 유지 → by-list/backfill fetch는 워터마크에 영향 없음(무한 재pull 방지).

### 버그 2 — 로그아웃 중단 시 데이터 정리 누락
- **증상**: 로그아웃하면 로그인 화면이 아니라 splash부터 다시 시작 (= RootLayout 리마운트).
- **원인**: `logout()`의 데이터 정리(`clearAllData`/`resetAll`/settings/quota)가 `supabase.auth.signOut()` **뒤**에 있었음. signOut이 `onAuthStateChange('SIGNED_OUT')`로 트리를 리렌더(dev에선 루트 리마운트→splash)하면서 logout이 끊기면 정리가 누락 → `lastPulledAt` 리셋 안 됨 → 재로그인해도 복구 불가(워터마크 고착). splash와 복구 실패의 연결고리.
- **수정** (`features/auth/store.ts:logout`): 데이터 정리를 signOut **앞으로** 이동 + 모든 단계(특히 `supabase.auth.signOut()`) try/catch로 감싸 완주 보장. 순서: flush → 로컬 정리 → signOut → persist(none). **이 수정 후 로그아웃 시 로그인 화면 정상 이동 확인됨.**

### 버그 3 — 로그아웃 직후 seed가 conflict 유발
- **증상**: 재로그인하면 샘플 단어장이 생기고 클라우드 데이터가 안 옴.
- **원인**: `use-bootstrap.ts`가 `mode='none'`(로그아웃 직후)에서도 `initSeedDataIfEmpty()`로 샘플을 로컬 생성 → 재로그인 시 "로컬에도 데이터(샘플), 클라우드에도 데이터" = first-login `conflict` 분기로 cloud pull 차단.
- **수정** (`features/vocab/use-bootstrap.ts`): seed를 `authMode === 'guest'`일 때만 생성. `none`(로그인 전/직후)에선 seed 안 넣음. **이 수정 후 나는솔로 list는 복구 확인됨**(단 word는 버그 1 때문에 별도, engine.ts 수정으로 해결).

---

## 다음 세션 즉시 할 일

### 1. dev client 검증 (engine.ts 수정 반영 확인)
- Metro에서 `r`로 reload (engine.ts 수정 반영 필수)
- 로그아웃 → 같은 계정 재로그인
- **기대**: 나는솔로 단어장에 단어 21개 복구. logcat에 나는솔로(`3ca309cb-0edf-4865-b678-7d00fd4f1c40`) 관련 orphan skip 없어야. (삭제된 list들 e0900f0f/1ca6c7c7/331c5cf3/1494e8f2/f33ae4ea의 orphan skip 경고는 정상 — 사용자가 의도 삭제한 단어장 소속이라 무시)
- 안 되면: 재로그인 직후 logcat `[sync]` 로그 확인 (backfilled / skipping orphan / 없음 중 무엇인지)

### 2. 검증 OK면 커밋
미커밋 3파일을 커밋. 제안 메시지:
```
fix(sync): list/word updated_at 비대칭으로 인한 단어 영구 누락 + 로그아웃 정리 견고화

- engine.ts pullChanges: (1) parent-list backfill — orphan word의 부모를
  워터마크 무관 fetch (2) list→word completeness fetch — 살아있는 list가
  batch에 오면 그 word를 list_id로 전부 fetch. list가 word보다 최신
  updated_at일 때 word가 워터마크에 막혀 영구 누락되던 버그 해소.
- auth/store.ts logout: 데이터 정리를 supabase.auth.signOut() 앞으로
  이동 + 전 단계 try/catch. signOut의 리렌더/리마운트로 정리가 누락돼
  lastPulledAt이 안 리셋되던 문제 해소.
- use-bootstrap.ts: seed를 guest 모드에서만 생성. 로그아웃 직후 mode=none
  에서 seed가 들어가 재로그인 시 conflict로 pull 막던 문제 해소.
```
커밋 후 `git push origin main`.

### 3. 후속 보강 (선택, 별도 커밋)
- **word push에 `updated_at` 명시** (`features/sync/mapping.ts:wordToCloudRow`): 현재 word push 시 `updated_at`을 안 보내 DB default로 채워짐. word 갱신 시 list와 timestamp가 어긋나는 구조 → 버그 1 비대칭의 간접 원인. push 시 `updated_at: Date.now()`(또는 word.updatedAt) 명시하면 근본 보강. (engine fetch 수정으로 증상은 이미 차단됨)
- **splash 리마운트 트리거 정밀 진단**: logout 견고화로 데이터 정리는 보장됐으나, dev에서 RootLayout이 왜 리마운트되는지(splash) 정확한 트리거는 logcat 미확인. production 빌드에서 재현되는지 확인 필요. dev client 특유(Fast Refresh/store 리셋)일 가능성.

---

## 미해결 / 보류 (이전 세션부터)

- **EAS production AAB 빌드 막힘**: Free 플랜 월간 Android 빌드 할당량 소진. **2026-06-01 리셋** 후 빌드 가능. 또는 유료 플랜 업그레이드. 빌드 명령:
  ```powershell
  $env:EAS_SKIP_AUTO_FINGERPRINT=1
  eas build --profile production --platform android --non-interactive
  ```
  (이번에 실패한 시도로 versionCode 4→5 증분됨. 다음은 5→6.)
- **Google 로그인 dev build SHA-1**: dev build 로그인이 `DEVELOPER_ERROR(code 10)`였음 → "Avocado Android" OAuth 클라이언트의 SHA-1을 EAS 업로드 키(Expo Dev credentials의 것)로 변경해 해결됨. "Android client for com.soksokvoca (auto created)"는 Play App Signing SHA-1 유지(production용). 두 클라이언트가 각각 dev/prod SHA-1 담당.

---

## 환경 메모

| 항목 | 값 |
|---|---|
| supabase CLI | `%LOCALAPPDATA%\supabase-cli\supabase.exe` (v2.101.0, GitHub 바이너리 직접 설치 — PATH 미등록) |
| Supabase 프로젝트 | linked (`ithqbclnwvyeultkyxbn`) |
| 나는솔로 list id | `3ca309cb-0edf-4865-b678-7d00fd4f1c40` (테스트 계정, 클라우드에 word 21개 살아있음) |
| 테스트 계정 (orphan list user) | orphan list `e0900f0f...`의 user_id로 특정 가능 |
| EAS 프로젝트 | `@baekeunjoeng/soksok-voca` |
| Play 패키지 | `com.soksokvoca` |
| dev client | Expo dev build (네이티브 모듈 포함). `pnpm start` → dev client 접속 |

## 클라우드 데이터 확인용 SQL (Supabase Dashboard SQL Editor, 세미콜론 없이 — 자동 limit 100 충돌 방지)

```sql
-- 특정 list의 word 생사 + updated_at
select id, term, is_deleted, updated_at
from cloud_words
where list_id = '3ca309cb-0edf-4865-b678-7d00fd4f1c40'
order by updated_at desc nulls last
limit 5
```
