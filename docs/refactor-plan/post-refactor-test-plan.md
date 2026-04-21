# 리팩터 후 playwright-cli 스모크 테스트 계획

## Context

Step 0~13 리팩터가 main으로 머지됐습니다 (commit `19d06ad`). 주요 변경:

- **상태 관리**: React Context → zustand `features/*` 도메인 스토어 (auth/settings/vocab/sync/theme/locale/onboarding/study)
- **DB 스키마**: `cloud_vocab_data` 단일 jsonb → `cloud_lists`/`cloud_words` 정규화. SQLite 마이그레이션 v13 (soft-delete 컬럼)
- **sync 엔진**: VocabContext 내장 debounce → `features/sync`의 push/pull + mapping
- **색상 토큰**: UI 전역 hex 454개 → `colors.onPrimary`/`shadow`/`accentAction`/`icons.*`/`brand.*` 등 semantic 토큰
- **파일 구조**: `contexts/` 폐기, `app/*/screen.tsx` → `features/*/screen.tsx` 이동 (app/은 thin wrapper)

자동화 테스트는 `jest` 단위 테스트(95/103)와 tsc로 회귀 일부 커버되지만 **UI 런타임 회귀**는 수동 확인 필요. 이 계획은 `playwright-cli`로 주요 플로우를 훑어 (1) 모듈 resolution 에러, (2) 스토어 hydration 실패, (3) 색상 토큰 시각 회귀, (4) 사용자 인터랙션 breakage를 잡는 **일회성 스모크 테스트**입니다. 영구 테스트 스위트가 아닌 머지 직후 안전망.

## Scope

**포함:**
- 게스트 로그인 플로우 (onboarding → login → home)
- 4개 메인 탭 렌더링 + 네비게이션 (home / vocab-lists / curation / settings)
- 단어장 CRUD 핵심 경로 (list 생성 → word 추가 → list 상세)
- 학습 모드 진입 (flashcards, quiz — 실제 학습 완료까지는 X)
- Dark 모드 토글 + 모든 탭 시각 확인
- 콘솔 에러/경고 모니터링

**제외:**
- Google OAuth (수동 확인 필요)
- Supabase sync push/pull (인증 필요, 별도 수동)
- Native 전용 기능 (iOS Liquid Glass tabs, speech recognition)
- 영구 visual regression 도구 (percy/chromatic) — pre-launch 단계라 과도

## 실행 환경

- **Dev server**: `pnpm start` (Metro + Expo web on `http://localhost:8081`)
- **Browser**: playwright-cli 기본 세션, 모바일 뷰포트 `414x896`
- **베이스라인**: `.playwright-cli/screenshots-baseline/` (리팩터 전 8장) + `.playwright-cli/screenshots-final/` (리팩터 후 5장)
- **신규 저장 경로**: `.playwright-cli/screenshots-smoke/` (이번 실행 결과)

## 테스트 시나리오

각 시나리오는 **"navigate → snapshot 확인 → screenshot → 콘솔 에러 체크"** 단위. playwright-cli는 이미 설치됨(`npx playwright-cli`).

### S1. 게스트 로그인 플로우

```bash
npx playwright-cli open http://localhost:8081
npx playwright-cli resize 414 896
# 온보딩 슬라이드 3회 넘기기
npx playwright-cli click <next-btn-ref>  # x3
npx playwright-cli click <start-btn-ref>  # login으로 이동
# login에서 "바로 시작하기" 클릭
npx playwright-cli click <guest-btn-ref>
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s1-home-after-guest.png
npx playwright-cli console  # 에러 0 확인
```

**검증:**
- `/` 도달 (Expo Router → (tabs)/index)
- localStorage에 `@soksok_auth={mode:"guest",...}` + `@soksok_onboarding_done="true"`
- 아보카도 캐릭터 + "안녕하세요, 학습자" 렌더
- 콘솔: 0 errors (경고는 허용)

### S2. 4개 탭 네비게이션 + 베이스라인 diff

```bash
# home은 S1에서 이미 캡처됨
npx playwright-cli goto http://localhost:8081/vocab-lists
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s2-vocab-lists.png
npx playwright-cli goto http://localhost:8081/curation
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s2-curation.png
npx playwright-cli goto http://localhost:8081/settings
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s2-settings.png
```

**검증:**
- 각 스크린샷을 `.playwright-cli/screenshots-final/` 기준과 육안 비교 (warm cream 베이스 유지, 토큰 회귀 없음)
- curation에서 공식 단어장 목록 로드 (difficulty chip 색: `colors.difficulty.*`)
- settings에서 "구글로 연결하기" 버튼 아이콘 `colors.brand.googleBlue`

### S3. 단어장 생성 → 단어 추가

```bash
# vocab-lists에서 "단어장 만들기" 클릭
npx playwright-cli click <create-list-btn>
# ManageModal 열림 → 새 리스트 이름 입력 → 추가
npx playwright-cli fill <list-name-input> "테스트 단어장"
npx playwright-cli click <add-icon-btn>
npx playwright-cli click <apply-btn>
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s3-list-created.png

# 생성된 list로 진입 → FAB → add-word
npx playwright-cli click <list-card>
npx playwright-cli click <fab-add>
# add-word modal 입력
npx playwright-cli fill <word-input> "hello"
npx playwright-cli fill <meaning-input> "안녕"
npx playwright-cli click <save-btn>
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s3-word-added.png
```

**검증:**
- SQLite 저장 성공 (단어 1개 뜸)
- `features/vocab/mutations.ts`의 `addWord` 경로가 `features/sync`의 dirty marking까지 전파 (sync store 내부 로그 선택 확인)
- add-word 모달 배경 warm cream, `colors.onPrimary` 저장 버튼 텍스트

### S4. Dark 모드 토글 + 회귀 확인

```bash
npx playwright-cli goto http://localhost:8081/settings
# "다크 모드" Switch 클릭
npx playwright-cli click <dark-mode-switch>
# 전체 탭 다크 스크린샷
npx playwright-cli goto http://localhost:8081/
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s4-dark-home.png
npx playwright-cli goto http://localhost:8081/vocab-lists
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s4-dark-vocab.png
npx playwright-cli goto http://localhost:8081/curation
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s4-dark-curation.png
```

**검증:**
- 다크 팔레트 (`#1C1410`/`#281E18`) 전면 적용
- `#000` shadowColor, `#FFF` on-primary가 토큰화됐는지 확인 — 다크에서도 그림자 보임, 버튼 텍스트 흰색 유지
- 회귀 의심: StudySettingsModal의 segmented tab active, difficulty chips, hint box (examples), star icon

### S5. 학습 모드 진입

```bash
# S3에서 만든 테스트 단어장에 단어 2개 더 추가 후
npx playwright-cli goto http://localhost:8081/list/<list-id>
# 하단 바의 "플래시카드" 진입
npx playwright-cli click <flashcards-btn>
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s5-flashcards-card.png
# 설정 버튼 → StudySettingsModal 열기
npx playwright-cli click <settings-icon>
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s5-study-settings-modal.png
# 닫고 quiz 진입
npx playwright-cli go-back
npx playwright-cli click <quiz-btn>
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s5-quiz-card.png
```

**검증:**
- 카드 렌더 (Ionicons, star `colors.starGold`)
- StudySettingsModal: 카테고리 아이콘 6색 (`colors.icons.*`), `colors.accentAction` 활성 텍스트
- quiz 4지선다 버튼 클릭 가능

### S6. 검색 모달

```bash
npx playwright-cli goto http://localhost:8081/
npx playwright-cli click <search-trigger>
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s6-search-modal.png
# 검색어 입력 → 결과 확인
npx playwright-cli fill <search-input> "hello"
npx playwright-cli screenshot --filename=.playwright-cli/screenshots-smoke/s6-search-results.png
```

**검증:**
- starred filter chip color (`colors.warning` / `colors.warningLight`)
- list filter chip active/inactive 색상 (`colors.onPrimary` / `colors.textSecondary`)

## 실행 순서

1. Dev server 준비
   ```bash
   pnpm start  # 또는 이미 실행 중이면 재사용
   ```
   metro 번들이 `http://localhost:8081`에서 200 응답할 때까지 대기

2. playwright-cli 세션 오픈 + 모바일 뷰포트
   ```bash
   npx playwright-cli open http://localhost:8081
   npx playwright-cli resize 414 896
   ```

3. S1 → S6 순서대로 실행. 각 시나리오 종료 시 `npx playwright-cli console` 로 에러 누적 확인

4. 최종
   ```bash
   npx playwright-cli close
   ```

## 검증 방법

### 자동
- 각 scenario 종료 후 `npx playwright-cli console` → **errors == 0**
- localStorage 상태 스냅샷 (`playwright-cli localstorage-list`)
- tsc/jest는 이미 CI에서 통과 확인됨 (95/103, 0 tsc errors)

### 수동 (스크린샷 비교)
- `.playwright-cli/screenshots-smoke/` vs `.playwright-cli/screenshots-final/` (같은 경로 있는 5장)
  - `04-home` vs `s1-home-after-guest`
  - `05-vocab-lists` vs `s2-vocab-lists`
  - `06-settings` vs `s2-settings`
  - `07-curation` vs `s2-curation`
  - `08-add-word` — S3에서 대응
- 신규 화면 (S4 dark, S5 study, S6 search, S3 created list)은 **첫 캡처**이므로 토큰 의도 검증만 (warm cream 유지, 다크 팔레트 적용, 의도된 액센트 색)

### 회귀 판정 기준
- **Pass**: 베이스라인과 시각적으로 동일 + 콘솔 에러 0 + 모든 인터랙션 작동
- **Fail (차단)**: 화면 미렌더 / 크래시 / 콘솔 error / 탭 간 이동 불가
- **Fail (조사)**: 토큰 변경이 의도와 다름 (예: 기존 white가 warm cream으로 바뀜 — 의도인지 확인)

## 참고 파일

- `.playwright-cli/SKILL.md` — playwright-cli 명령 레퍼런스
- `.playwright-cli/screenshots-baseline/` — 리팩터 전 기준 (8장)
- `.playwright-cli/screenshots-final/` — Step 10b 머지 직후 (5장)
- `constants/colors.ts` — 색상 토큰 소스
- `features/auth/store.ts`, `features/onboarding/store.ts` — auth 플로우 하이드레이트 로직
- `app/_layout.tsx` — 라우팅 가드 (login redirect, onboarding gate)

## 환경 주의

- **Windows + OneDrive**: `pnpm start` 프로세스가 OneDrive 파일 이벤트 때문에 느리게 부팅됨 → 30~60초 대기
- **Expo SQLite on web**: 모의 스토리지로 동작하지만 실제 persist 없음. 페이지 새로고침하면 생성한 단어장 사라짐 → **한 세션 내에서 S3→S5 연속 실행** 필요
- **Onboarding 우회**: S1 중간에 localStorage 직접 주입(`@soksok_onboarding_done="true"` + `@soksok_auth=...`) 하면 슬라이드 스킵 가능하지만 Zustand hydrate 경로 검증을 위해 **정상 플로우 권장**

## 성공 기준

- S1~S6 모두 크래시 없이 완료
- 최종 콘솔 errors 0 (warnings 허용)
- 시각 diff: 베이스라인과 동일하거나 의도된 토큰 변경만 반영
- 다크 모드 스크린샷에서 하드코딩된 흰 그림자/흰 배경 잔여 없음 (S4)
