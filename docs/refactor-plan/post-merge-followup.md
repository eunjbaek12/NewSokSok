# 리팩터 머지 후 후속 작업

> main 머지(`19d06ad`) + playwright-cli 스모크 테스트 후 발견된 이슈와 미검증 영역. 새 세션에서 순서대로 처리할 수 있도록 정리.

## 1. 즉시 수정 — features/vocab ↔ features/sync 순환 import

### 증상

playwright-cli 세션에서 다음 경고 관찰:

```
Require cycle: features/vocab/index.ts
  → features/vocab/mutations.ts
  → features/sync/index.ts
  → features/sync/first-login.ts
  → features/vocab/index.ts
```

런타임 크래시는 없지만 **uninitialized value 리스크** — 모듈 초기화 순서에 따라 한쪽 배럴의 export가 `undefined`로 평가될 수 있음. 현재 기능이 돌아가는 건 운에 가깝고, 번들러/Metro 캐시 상태에 따라 사일런트 버그 가능성.

### 원인

- `features/vocab/mutations.ts`가 `features/sync`의 배럴 import (dirty marking용 `schedulePush`/`markWrittenLists` 등 호출)
- `features/sync/first-login.ts`가 다시 `features/vocab` 배럴 import (첫 로그인 시 로컬 데이터 → 클라우드 업로드 경로에서 lists 조회)
- 양쪽 다 배럴(`index.ts`) 경유라 순환 성립

### 권장 해결

**옵션 A (선호)**: `features/sync/first-login.ts`에서 `features/vocab` 배럴 대신 내부 모듈 직접 import
- `import { getAllLists } from '@/features/vocab/queries'` 같은 식
- 단점: ESLint 가드의 "배럴만 교차 import" 규칙과 충돌 → 해당 파일만 eslint-disable 또는 sync/vocab 사이는 예외 처리

**옵션 B**: 의존성 역전 — sync가 vocab을 직접 import하지 않고 callback 주입
- `features/sync/store.ts`에 `setVocabProviders({ getAllLists, ... })` 같은 초기화 훅
- `app/_layout.tsx`에서 bootstrap 시 주입
- 장점: 순환 완전 제거, 레이어링 명확. 단점: 작업량 큼

**옵션 C (최소)**: 동적 import — `first-login.ts`에서 lazy `await import('@/features/vocab')`
- 장점: 코드 변경 최소. 단점: 비동기 경계가 늘어 디버깅 어려워짐

**판단**: A가 현실적. 한 곳만 예외 처리하면 해결. `.eslint.config.js`의 feature boundary 룰에 `features/sync/first-login.ts` 예외 추가.

### 검증

```bash
pnpm start
# Expo web 열어서 콘솔 확인
```

"Require cycle" 경고가 사라지면 완료. tsc/jest 회귀 없는지 재확인.

---

## 2. 네이티브 빌드에서 수동 검증 필요 — Expo web 제약 영역

Step 0~13 리팩터의 상당 부분이 **SQLite + native 전용**이라 Expo web 스모크 테스트로는 커버 불가. 다음은 **실제 디바이스/에뮬레이터**에서 확인 필요:

### 2.1 SQLite 마이그레이션 (v12 → v13)
- 기존 사용자 디바이스에 `soksok_voca.db` v12가 있는 상태에서 앱 업데이트 시 `lib/db/migrations/013_add_soft_delete.ts` 정상 실행 여부
- 검증: 이전 빌드로 설치 → 단어장/단어 생성 → 새 빌드로 덮어쓰기 → 데이터 유지 확인
- 실패 시 `lib/db/migrations/index.ts`의 `assertContiguous()` 에러 또는 SELECT에서 `deletedAt IS NULL` 조건이 기존 row(NULL이 아닌 `undefined`) 걸러내는지 체크

### 2.2 Soft-delete 경로
- `features/vocab/mutations.ts`의 `deleteWords`/`deleteList` 호출 → SELECT 시 `WHERE deletedAt IS NULL` 필터 작동 확인
- clearAllData는 **의도적으로 hard-delete 유지** (이전 결정 사항)
- 검증: 단어 삭제 후 목록에서 안 보이는지, 동기화 후 cloud에서도 soft-delete 전파되는지

### 2.3 Sync 엔진 push/pull
- Google 로그인 → 단어장/단어 생성/수정/삭제 → `POST /api/sync/push` 호출 확인 (`features/sync/engine.ts::schedulePush` debounce 2초)
- 다른 기기에서 동일 Google 계정으로 로그인 → `GET /api/sync/pull` 증분 로드 확인
- **특히 주의**: `features/sync/first-login.ts` — 로컬에 데이터가 있는 상태에서 첫 Google 로그인 시 로컬 id 전수 remap(새 uuid) + dirty flush. merge 시 중복/손실 없는지.

### 2.4 학습 모드 전체 플로우
- flashcards/quiz/examples/autoplay 각 모드 완주 → `study-results` 화면 도달
- BatchResultOverlay "다음 세트"/"재시도" 동작
- Plan 모드 (`features/study/plan/`) day 전환, completed 판정

### 2.5 카테고리 아이콘 6색
- StudySettingsModal에서 토큰화된 `colors.icons.*` (memorization/shuffle/sound/timing/language/chat)이 네이티브에서도 의도대로 렌더되는지
- 특히 다크 모드에서 대비 충분한지

### 2.6 iOS Liquid Glass 네이티브 탭
- `app/(tabs)/_layout.tsx`의 `isLiquidGlassAvailable()` 분기 — iOS 18+ 실기기에서 `NativeTabLayout` 렌더 여부

---

## 3. 데이터베이스 스키마 반영 — Supabase

### 증상
`shared/schema.ts`에서 `cloud_vocab_data` 테이블과 `cloud_users.legacy_migration_status` 컬럼은 제거됐지만, **Supabase 원격 DB에는 아직 남아있음** (step 13 핸드오프에 명시).

### 작업
```bash
pnpm db:push
```
drizzle-kit이 다음 두 작업 프롬프트 띄움:
- `DROP TABLE cloud_vocab_data`
- `ALTER TABLE cloud_users DROP COLUMN legacy_migration_status`

"**truncate and drop**" 선택. 이미 코드 경로에서 참조 제거됐으므로 drop 안전.

### 검증
- `pnpm db:push` 성공 후 Supabase 콘솔에서 테이블/컬럼 제거 확인
- 기존 Google 로그인 사용자가 기존 cloud 데이터 유지하면서 새 `cloud_lists`/`cloud_words` 테이블 정상 사용하는지 확인

---

## 4. 코드 품질 후속 — 낮은 우선순위

### 4.1 `shadow*` props deprecation
- React Native Web 신규 경고: `"shadow*" style props are deprecated. Use "boxShadow".`
- 토큰화된 `colors.shadow`와 함께 쓰는 `shadowOffset`/`shadowOpacity`/`shadowRadius`를 `boxShadow: '0 4px 8px rgba(0,0,0,0.2)'` 식으로 전환
- 범위: 전체 UI 레이어(~30개 파일에 shadowColor 사용)
- Platform split 필요할 수도: 네이티브는 shadow* 유지, 웹은 boxShadow. `Platform.select` 래핑
- **우선순위 낮음**: 현재는 경고만, 동작은 정상

### 4.2 `props.pointerEvents` deprecation
- `pointerEvents="box-none"` 같은 prop을 `style={{ pointerEvents: 'box-none' }}`로 이동
- 해당 패턴 사용처: `features/study/components/BatchResultOverlay.tsx`, `app/list/[id].tsx` 등
- **우선순위 낮음**

### 4.3 `features/study/flashcards/screen.tsx`의 btnApply/btnApplyText
- Step 10b 작업 중 발견: 스타일은 정의됐지만 사용처 없음 (dead code)
- 삭제 가능

### 4.4 `app/add-word.tsx`의 toast/segmentedControlIndicator
- 동일 — 정의만 있고 사용 안 함. 삭제 후보

---

## 5. 문서 정리 — 완료

- `docs/refactor-plan/archive/`로 이동: `refactor-plan.md`, `current-architecture.md`, `handoff.md`, `step-10b-handoff.md`
- 최상단 유지: `post-merge-followup.md`(이 문서), `post-refactor-test-plan.md`, 신규 `README.md`(인덱스)

---

## 추천 처리 순서 (새 세션 시작 시)

1. **1번 require cycle 수정** — 15분. 기술 부채 즉시 해소.
2. **3번 Supabase db:push** — 5분. 사용자가 직접 실행 (대화형 프롬프트).
3. **2번 네이티브 수동 검증** — 별도 QA 시간. 에뮬레이터/실기기 준비 필요.
4. **4번 deprecation 정리** — 후속 PR. 기능 영향 없음.
5. **5번 문서 아카이브** — 정리 작업.

## 참고

- 머지된 PR: https://github.com/eunjbaek12/NewSokSok/pull/1 (`19d06ad`)
- 스모크 테스트 스크린샷: `.playwright-cli/screenshots-smoke/` (8장, Light/Dark)
- 테스트 계획: `docs/refactor-plan/post-refactor-test-plan.md`
- 기존 리팩터 이력: `docs/refactor-plan/archive/handoff.md`
