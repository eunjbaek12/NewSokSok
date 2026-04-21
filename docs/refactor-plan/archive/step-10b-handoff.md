# Step 10b 핸드오프 — hex 454개 UI 레이어 토큰화

> 전체 리팩터 플랜 이력은 `docs/refactor-plan/handoff.md` 참조.
> 이 문서는 **Step 10b 본 스윕**에만 집중 — 리팩터 플랜의 마지막 남은 작업.

## 한 줄 요약

데이터/로직 레이어는 이미 hex-free + ESLint 가드로 보호. UI 레이어에 454개의 하드코딩된 hex 색상 리터럴이 남아있으며 이를 `constants/colors.ts`(팔레트) 또는 `lib/theme/tokens.ts` 참조로 치환해야 함. 치환 자체는 기계적이지만 **시각 회귀 위험**이 있어 **디자인 결정 5건**과 **스크린샷 비교**가 선행 필요.

## 현재 상태

- **가드 설치 완료** (`eslint.config.js`): 깨끗한 경로(`features/{auth,settings,sync,vocab,theme,locale}`, `features/onboarding/{store,index}`, `server/**`, `shared/**`, `lib/{api,storage,theme}`)에 `no-restricted-syntax` + hex 정규식 ERROR. 신규 유입 차단됨.
- **미완료**: UI 레이어 실제 치환 (아래 39개 파일, 총 454 hex).
- **다른 모든 Step (0→13)은 완료**. 10b가 유일한 남은 리팩터 작업.

## hex 분포 (2026-04-20 기준, 총 454개)

**최고 밀도 (일러스트/SVG — 예외 처리 검토 대상):**
| 파일 | hex 개수 |
|---|---|
| `components/CharacterSvg.tsx` | 66 |
| `features/onboarding/components/AvocadoCharacter.tsx` | 64 |
| `features/onboarding/components/demos/WordListDemo.tsx` | 26 |
| `features/onboarding/components/demos/PlanDemo.tsx` | 15 |
| `features/onboarding/components/demos/CurationDemo.tsx` | 15 |
| `features/onboarding/components/demos/FlashcardDemo.tsx` | 12 |
| `features/onboarding/components/demos/AiWordDemo.tsx` | 12 |
| **소계(일러스트)** | **~210** |

**중밀도 (설정/모달):**
| 파일 | hex 개수 |
|---|---|
| `features/study/components/StudySettingsModal.tsx` | 46 |
| `app/login.tsx` | 20 |
| `app/add-word.tsx` | 20 |
| `components/AiModelDownloadModal.tsx` | 16 |
| `features/curation/screen.tsx` | 14 |
| `app/list/[id].tsx` | 14 |
| `features/study/components/CustomStudyModal.tsx` | 10 |
| `app/(tabs)/index.tsx` | 10 |
| `features/onboarding/screen.tsx` | 11 |

**저밀도 (공통 UI):** 나머지 파일들. `components/ui/*` 대부분 ≤ 4.

**전체 분포는 조사 명령으로 재생성 가능:**
```bash
grep -rE "'#[0-9a-fA-F]{3,8}'|\"#[0-9a-fA-F]{3,8}\"" app components features hooks lib --include='*.ts' --include='*.tsx' | awk -F: '{print $1}' | sort | uniq -c | sort -rn
```

## 결정이 필요한 5가지

이전 대화에서 논의된 내용. 치환 진행 전에 사용자 결정 필수.

### 결정 1 (가장 중요, 시각 차이): Light 모드 베이스는 warm cream인가 순백인가?

`constants/colors.ts`의 light 팔레트:
- `light.surface = #FFF8F2` (warm cream)
- `light.surfaceSecondary = #EDE0D4` (베이지)
- `light.border = #BCA898` / `light.borderLight = #D0C0B0`
- `light.background = #F5EDE3`

하지만 코드에 ~150곳이 이렇게 되어 있음:
```tsx
backgroundColor: isDark ? colors.surface : '#FFF'
backgroundColor: isDark ? colors.surfaceSecondary : '#F3F4F6'
borderColor:     isDark ? colors.border : '#F3F4F6'
```

→ light 모드에서 `colors.surface` 대신 **`#FFF`(순백)** 사용 중. dark 모드에서만 warm/dark 팔레트 사용.

**두 가능성:**
- **(A) 디자인 의도는 warm cream인데 개발 중 실수** → `#FFF`/`#F3F4F6`을 `colors.surface`/`colors.border`로 치환. 앱 전체 light 모드가 warm cream으로 바뀜.
- **(B) 디자인 의도는 순백이고 팔레트 warm cream은 사용되지 않는 잔재** → 팔레트를 수정: `light.surface = #FFF`, `light.surfaceSecondary = #F3F4F6`으로. 코드는 `isDark ? ... : ...` 삼항을 제거하고 `colors.surface` 한 번만 호출.

**제안 접근법**:
1. 실험 브랜치에서 (A) 패턴으로 일괄 치환
2. Expo web build 또는 에뮬레이터로 주요 화면(home, vocab-lists, settings, list detail, StudySettingsModal) light 모드 스크린샷
3. 현재 main의 같은 화면 스크린샷과 비교
4. warm cream이 더 좋으면 (A)로 전체 스윕, 아니면 (B)로 팔레트 수정

### 결정 2: 브랜드 블루 액센트 `#4A7DFF` 처리

`StudySettingsModal.tsx`, `CustomStudyModal.tsx` 등에서 active tab indicator, star 아이콘 컬러로 `#4A7DFF` 직접 사용. 그런데 팔레트의 `colors.primary`는 티얼(`#2A7B78`).

- **(A)** 블루가 의도된 액센트 → 팔레트에 `colors.accentBlue = #4A7DFF` 추가
- **(B)** 블루는 레거시 → `colors.primary`(티얼)로 치환. 앱 active 색이 티얼로 통일됨
- **(C)** 블루와 티얼 둘 다 의도적 → 팔레트에 둘 다 유지

### 결정 3: 카테고리 아이콘 6색

`StudySettingsModal.tsx`에서 기능별 아이콘 색:
- `#10B981` (녹) — text/memorization
- `#9333EA` (보라) — shuffle
- `#FF5722` (주황) — sound
- `#F59E0B` (앰버) — timing, language
- `#EC4899` (핑크) — chat
- `#14B8A6` (티얼) — language

- **(A)** 팔레트에 `colors.icons.shuffle`, `colors.icons.sound` 식으로 nested 토큰화
- **(B)** 별도 상수 파일 `constants/icon-colors.ts` 만들고 `ICONS.SHUFFLE = '#9333EA'` 형식
- **(C)** 인라인 유지 + 해당 라인에만 `// eslint-disable-next-line no-restricted-syntax` 주석

### 결정 4: SVG 일러스트 (총 ~210 hex)

`CharacterSvg.tsx` (66), `AvocadoCharacter.tsx` (64), 온보딩 demo 5개 (총 80+). 본질적으로 **테마 무관 아트워크** — 캐릭터/일러스트 색상은 다크모드에서도 동일하게 렌더되어야 자연스러움.

- **(A) 추천**: 이 파일들은 `eslint.config.js` 예외 처리하고 hex 유지. 리팩터 범위에서 제외.
- **(B)** 일러스트 팔레트도 별도 상수로 토큰화 (`constants/illustration-colors.ts`).
- (C) 일러스트 색을 테마 따라 동적으로 변경 — 디자인 재설계 수준의 큰 작업.

### 결정 5: 시스템 상수 (`#000`, `#FFF`)

- shadowColor: `#000` (OS 관례)
- 버튼 위 text: `#FFFFFF` (액센트 배경 위)

- **(A) 추천**: 해당 용도만 예외 처리. `#000` shadow는 OS 전역 관례, `#FFF` on primary는 a11y 대비 계산이 필요한 영역.
- **(B)** `tokens.system.shadowColor`, `tokens.system.onPrimary`로 토큰화.

## PR 분할 전략 (결정 이후)

결정 4를 (A)로 가정 (일러스트 제외) 시 남는 hex는 ~240개. 3-4개 PR로 분할 권장:

1. **PR-10b-1**: 결정 1 치환 (`isDark ? ... : '#FFF'` / `'#F3F4F6'` 패턴, ~150 hex). 가장 큰 시각 영향 — 단독 PR로 스크린샷 리뷰.
2. **PR-10b-2**: 결정 2/3 적용 (블루 액센트 + 카테고리 아이콘 색, ~50 hex).
3. **PR-10b-3**: 나머지 잔여 hex + ESLint 룰을 UI 레이어까지 확장.
4. **PR-10b-4** (선택): 일러스트 예외 처리 주석 추가, 최종 lint ERROR 0개 검증.

각 PR마다:
- tsc 통과
- Jest 95/103 유지(회귀 0)
- Expo web 스크린샷 한 세트(light/dark × 주요 화면) 첨부

## 시각 회귀 리뷰 방법

기존 `.playwright-cli/` 디렉토리가 있음 — playwright-cli skill 활용 가능.

**수동 방법:**
1. `pnpm start` (Expo)로 web 빌드
2. 브라우저에서 주요 경로 방문 + 스크린샷 촬영
   - `/` (home)
   - `/vocab-lists`
   - `/settings`
   - `/list/<id>` (샘플 list)
   - StudySettingsModal 열기 (flashcards 진입 후 설정 버튼)
   - `/curation`
   - `/onboarding`
3. main branch 동일 경로 스크린샷과 비교 (GitHub PR 탭에서 side-by-side)

**자동화 옵션:**
- `@playwright/test` 추가 + visual regression snapshot 테스트
- `percy` 또는 `chromatic` 같은 visual testing SaaS (pre-launch 단계라 과도할 수 있음)

## 시작 체크리스트 (다음 세션)

1. `git status` — clean인지 확인
2. `pnpm install` (OneDrive 간섭 주의; `env_pnpm_onedrive.md` 메모 참조)
3. `pnpm exec tsc --noEmit --skipLibCheck` — baseline 통과 확인
4. `pnpm run lint` — 경계 룰 + hex 가드 현재 상태 0 errors(1개 잔존 워닝은 `voca_app_ui.jsx` lucide-react-native로 무관)
5. **사용자에게 결정 1~5 확인** — 특히 결정 1은 스크린샷 비교가 선행되어야 함
6. 결정 확정 후 실험 브랜치 생성: `git checkout -b step-10b-sweep-phase1`
7. 결정 1부터 sed 치환 + 스크린샷 비교 → PR
8. 순차적으로 PR 2, 3, 4 진행

## 환경/운영 주의

- **OneDrive 경로**: `tsx watch`가 파일 변경을 놓칠 때 있음. tsx 서버 재시작이 필요해 보이면 `netstat -ano | grep :5000 | grep LISTENING`으로 PID 확인 후 `taskkill /F /PID <PID>`로 강제 종료 → 수동 재기동.
- **`pnpm add`가 ENOENT로 실패**하는 경우 빈번 → `package.json` 직접 편집 후 `pnpm install` 보정. 이 프로젝트 루트의 `MEMORY.md > env_pnpm_onedrive.md` 참조.

## 참고 파일

- `constants/colors.ts` — 팔레트 (Light/Dark 양쪽)
- `lib/theme/tokens.ts` — spacing/radius/fontSize/popup 토큰 (색상 토큰은 없음 — Step 10b의 결정에 따라 추가 여부 결정)
- `features/theme/context.tsx` — `useTheme()` 구현
- `eslint.config.js` — 현재 가드 룰 (line 40+)
- `docs/refactor-plan/handoff.md` — 전체 리팩터 이력 및 이전 Step들의 결정 배경

## 성공 기준

- Jest 95/103 유지 (회귀 0)
- tsc 통과
- 모든 UI 경로에 대해 light/dark 스크린샷 차이가 **의도된 팔레트 변경만** 반영
- `pnpm run lint`: 0 errors from `no-restricted-syntax` — UI 레이어에도 가드 룰 확대
- 최종 hex 검색 결과:
  ```bash
  grep -rE "'#[0-9a-fA-F]{3,8}'|\"#[0-9a-fA-F]{3,8}\"" app components features hooks lib --include='*.ts' --include='*.tsx' | wc -l
  ```
  일러스트 예외 처리 후 기대치: **SVG 일러스트 파일들의 hex만 남음** (~210 또는 0, 결정 4에 따라).
