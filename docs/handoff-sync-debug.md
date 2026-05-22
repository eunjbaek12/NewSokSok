# 동기화 디버깅 세션 Handoff

작성일: 2026-05-22, 갱신: 2026-05-23. dev client(Expo dev build)에서 계정 전환/동기화 버그를 추적한 세션.

## 한 줄 현재 상황

계정 전환·로그아웃 시 데이터 격리/복구 버그를 연쇄로 수정. 2026-05-22의 3파일 수정은 **커밋·push 완료**(`10280c0`). 2026-05-23 후속 세션에서 닉네임 복원·게스트 데이터 보존·first-login 고아 방지를 추가 수정해 **2개 커밋 push 완료**(`c4c5d63`, `cc5ebd8`). 클라우드 데이터는 안전(손실 없음). **다음 세션은 아래 "2026-05-23 후속 세션" 섹션부터 읽기.**

---

## 2026-05-23 후속 세션 (닉네임 + 게스트 보존 + 고아 방지)

> push 완료: `c4c5d63` feat(auth), `cc5ebd8` fix(sync). dev client 검증 체크리스트는 이 섹션 끝.

### 발견 1 — 후속 보강 #1(word push updated_at 명시)은 무효
2026-05-22 핸드오프의 "후속 보강 #1"은 **trigger 때문에 불필요**. `cloud_words`/`cloud_lists`의 `updated_at`은 `BEFORE INSERT OR UPDATE` trigger가 `(extract(epoch from now())*1000)::bigint`로 **서버에서 강제**(시계 skew 방지, B-supabase-migration-plan.md L58-59). 클라이언트가 `wordToCloudRow`에 `updated_at`을 넣어도 trigger가 덮어씀. 버그1 비대칭의 진짜 원인은 timestamp 누락이 아니라 "list만 갱신돼 push되고 word는 dirty가 아니라 애초에 push 안 됨"이라, 이미 커밋된 engine.ts의 list→word completeness fetch가 유일하게 유효한 해결책. **mapping.ts는 손대지 않음(맞는 결정).**

### 수정 A — 닉네임 클라우드 백업/복원 (`c4c5d63`)
- **증상**: 로그아웃할 때마다 닉네임 초기화. 구글 계정조차 사라짐.
- **원인**: 닉네임이 로컬 `profileStore`(AsyncStorage)에만 저장 → `logout`의 `clearAccountScopedSettings`가 격리 목적(`2b7c0cc`)으로 삭제하는데 **복원 짝이 없었음**. 클라우드 백업 경로 자체가 없음.
- **수정**: `updateProfileSettings`가 `supabase.auth.updateUser({data:{nickname}})`로 user_metadata에 백업(best-effort, 게스트는 세션 없어 skip). `buildUser`가 `user_metadata.nickname`을 `GoogleUser`에 포함. `use-bootstrap` 구글 로그인 부트스트랩이 **로컬이 비었을 때만** user_metadata에서 복원. `contracts.ts` `GoogleUserSchema`에 `nickname` optional(기존 persist 호환 — 안 그러면 onDrift로 기존 사용자 로그아웃됨).
- **잔여 엣지(합의됨)**: 게스트가 닉네임 설정 → 로그아웃 → **다른** 구글 계정 로그인 시 그 계정에 닉네임 없으면 게스트 닉네임이 잠깐 노출. 표시 이름일 뿐이고 드물어 그대로 둠.

### 수정 B — 게스트 로그아웃 시 로컬 데이터 보존 (`c4c5d63`)
- **증상(데이터 손실)**: 게스트 로그아웃 시 닉네임뿐 아니라 **단어·단어장까지 전부 삭제**. 게스트 로그아웃 안내문 "저장된 단어는 이 기기에 유지됩니다"와 정면 모순.
- **원인**: `logout`이 모드 구분 없이 `clearAllData()`(`db.ts:141`, 가드 없음) + `clearAccountScopedSettings()` 실행. 구글용으로 견고화된 정리가 게스트엔 파괴가 됨(로컬이 유일한 원본).
- **수정**: `const wasGoogle = useAuthStore.getState().mode === 'google'`로 캡처해 **파괴적 정리를 `wasGoogle`일 때만** 실행. flush·signOut은 게스트에선 자연 no-op이라 그대로.
- **결정(사용자 확정)**: "계정 데이터는 그 계정으로만 보임" 현재 동작 유지. 게스트→구글 합치기는 first-login conflict Alert(`use-bootstrap.ts:40`)가 처리하므로 손대지 않음.

### 수정 C — first-login conflict 개수 정확도 + merge 고아 방지 (`cc5ebd8`)
- **증상**: 구글 로그인 시 "클라우드에 2436개" 합치기 메시지. 실제 단어는 몇 개 없음.
- **원인 1 (개수)**: `probeFirstLoginState`가 `.select('id')` 후 `.length` → Supabase 기본 1000행 제한에 걸려 ≥1000이면 "1000" 고정. → `count:'exact'`+`head:true`로 정확 개수 조회.
- **원인 2 (고아)**: 진단 결과 2436 중 ~2363이 **고아 단어**(부모 list는 `is_deleted=true`인데 word는 `is_deleted=false`로 클라우드에 잔존). 출처는 (a) 게스트 모드 삭제 시 dirty 마킹 skip, (b) **`applyFirstLoginMerge`가 합치기마다 모든 로컬 id를 새 UUID로 재발급→새 행 업로드→옛 행 고아화**(반복 merge 시 중복 누적, f33ae4ea에 2배 복사 확인).
- **수정**: 모든 id가 `Crypto.randomUUID`(고정 id 전무)라 충돌 불가 → `applyFirstLoginMerge`의 **재발급 제거**, 기존 id로 dirty 마킹만. upsert(onConflict:id)가 멱등이 되어 재업로드가 행을 갱신만 함. PRAGMA FK off 트랜잭션 코드도 제거.
- **클라우드 정리 완료**: 테스트 계정의 고아 2363건을 Supabase에서 직접 정리(아래 SQL). 재실행 시 count 0 확인됨.

```sql
-- 고아(부모 list 삭제/부재) 단어 개수
select count(*) from cloud_words w
where w.is_deleted = false
  and not exists (select 1 from cloud_lists l where l.id = w.list_id and l.is_deleted = false)
-- 고아 하드 삭제 (Dashboard는 service role → 다중 계정이면 and w.user_id='uid' 추가)
delete from cloud_words w
where not exists (select 1 from cloud_lists l where l.id = w.list_id and l.is_deleted = false)
```

### 다음 세션 dev client 검증 체크리스트 (`pnpm start`)
1. 구글: 닉네임 설정 → 로그아웃 → 재로그인 → **닉네임 복원** 확인
2. 게스트: 단어·닉네임 설정 → 로그아웃 → 다시 게스트 → **유지** 확인
3. 합치기 **반복**(게스트 단어→구글 합치기→로그아웃 반복) → Supabase 고아 count **0 유지**, conflict 숫자 정상

### 미해결/선택 (출시 후 검토)
- **설치된 큐레이션 단어의 사용자별 클라우드 복제** (출시 후, 우선순위 낮음). 2026-05-23 재조사로 핸드오프 이전 기술("모든 사용자 × 수천 행 복제 / isCurated 필터로 cloud 제외")이 **부정확**함을 확인. 정정 내용:
  - **다운받지 않으면 DB에 없음**: 큐레이션 프리셋은 `curationPresets`(constants/curationData.ts)에서 화면에 *보여주기만* 함(`features/curation/screen.tsx:27,383`). 단어가 로컬 DB에 들어가는 건 사용자가 "설치"를 눌러 `createCuratedList`(`features/vocab/db.ts:243`)가 호출될 때뿐. → 안 받은 덱은 로컬·클라우드 어디에도 없음. 실제 복제 규모는 "모든 사용자 × 모든 단어"가 아니라 **"각 사용자 × 자기가 설치한 덱"**, 즉 인기 덱이 설치 횟수만큼 중복되는 수준. 핸드오프가 우려한 규모보다 훨씬 작음.
  - **단순 `isCurated` 필터는 금지(데이터 유실)**: `isCurated=true`는 빌트인 덱과 **AI 생성 덱(`AI: 주제`, screen.tsx:570)** 모두에 붙음. push에 `isCurated` 필터를 넣으면 AI 덱이 클라우드에 안 올라가 **영구 유실**(오프라인 재현 불가). 설치한 빌트인 덱의 학습 진행상태(isMemorized/plan 등)도 함께 막힘.
  - **제대로 하려면 콘텐츠/진행상태 분리**: 단어별로 "원본 그대로 vs 사용자 수정/삭제/추가"를 추적해, 안 건드린 빌트인 단어만 콘텐츠를 cloud 제외하고 constants에서 rehydrate. 수정·삭제·신규 단어와 AI 덱은 콘텐츠까지 동기화. 스키마 마이그레이션 + pull 분기가 따르는 중간 규모 작업이고, 어긋나면 사용자 수정분/AI 덱 유실 버그라 출시 직전엔 부적합.
  - **결론**: 기능은 정상 동작(수정·삭제·추가·진도 다 동기화됨). 버그가 아니라 비효율이고, 절약 대상이 "인기 덱 중복"으로 좁아 효과 대비 위험이 큼 → DAU/용량이 실제로 압박될 때 착수.
- **빌드 전 점검 결과(2026-05-23)**: tsc 6건·lint 11건 모두 sync 작업과 무관한 기존 부채(usePurchaseFlow expo-iap 타입 좁히기 5건=런타임 안전, CharacterAccessory/SkinSelector hex·barrel, voca_app_ui.jsx 미사용, fetch-wiktionary 정규식 오타). EAS는 Metro/babel 번들이라 tsc/lint가 빌드를 막지 않음. **production 빌드 차단 요소 없음.**

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

## 2026-05-22 계획 (✅ 전부 완료 — 아래는 당시 기록)

> 이 3파일 수정은 검증·커밋(`10280c0`)·push 완료. 후속 작업은 위 "2026-05-23 후속 세션" 섹션 참고.

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

### 3. 후속 보강
- ~~**word push에 `updated_at` 명시**~~ → ❌ **무효로 판명, 진행 안 함**. `updated_at`은 서버 trigger가 강제하므로 클라이언트 명시가 무시됨. 상세는 위 "2026-05-23 후속 세션 > 발견 1" 참고.
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
