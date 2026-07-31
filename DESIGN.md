# DESIGN.md

쏙쏙 보카의 **공용 UI 스펙**. `PRODUCT.md`가 "누구에게 무엇을"이라면 이 문서는 "어떤 모양으로"를 정한다.

이 스펙은 발명한 것이 아니라 **화면 37개를 실측해 이미 다수가 쓰던 쪽을 확정**한 것이다
(`app/**` 30 · `features/*/screen.tsx` 7 · `components/**`). 그래서 대부분의 규칙에는
"이미 N곳이 이렇게 한다"는 근거가 붙어 있고, 그 N이 규칙의 힘이다. 새 화면을 만들 때는
여기서 고르고, 여기 없는 모양이 필요하면 **먼저 이 문서를 고친 뒤** 만든다.

문서 끝의 [적용 대기 목록](#적용-대기-목록)은 스펙 확정 시점(2026-07-28)에 이미 알려진
이탈들이다. 새로 만드는 코드는 처음부터 스펙을 따르고, 목록은 별도로 흡수한다.

---

## 1. 헤더

계열 **넷**을 인정한다. 서로 다른 일을 하는 화면들이고, 계열 안 일관성은 이미 높다.

### 1.1 콘텐츠 계열 — 읽는 화면 (8곳, 최다)

`advanced-settings` · `faq` · `licenses` · `plans` · `stats` · `terms` · `whats-new` · `contact`

```
const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);

header:      { flexDirection: 'row', alignItems: 'center',
               justifyContent: 'space-between',
               paddingHorizontal: 12, paddingBottom: 8 }
             paddingTop: topPadding + 8      // 호출부에서
backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }
             hitSlop={12}
headerTitle: { fontSize: 18, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.3 }
```

- 좌: `chevron-back` 26 · `colors.text` — 뒤로 갈 부모가 없는 화면이면 `close` 26
- 우: `<View style={styles.backBtn} />` — 40 스페이서. 제목을 시각적 가운데로 밀어준다
- **골라서 학습(`app/search-modal.tsx`)이 이 계열이다.** 아래에서 올라오지만 제목이 이미
  18 Bold라 변경이 가장 작고, 닫기라서 아이콘만 `close`를 쓴다

### 1.2 학습 · 상세 계열 (6곳)

`flashcards` · `quiz` · `examples` · `autoplay` · `plan` · `list/[id]`

```
const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

header:      { paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth }
             paddingTop: topInset + 12
headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 }
headerTitle: { fontSize: 20, fontFamily: 'Pretendard_700Bold' }   // titleArea flex: 1
```

- 좌: `chevron-back` **24** · `colors.text` · `hitSlop={12}`
- 우: 화면의 주 액션(설정 · 플랜 만들기 등)
- 아래: 진행줄 — `{ height: 6, borderRadius: 3 }` 바 + 12px 텍스트(`minWidth: 70`, 우측 정렬)

진행줄이 이 계열의 정체성이다. 진행을 보여줄 게 없는 화면은 이 계열이 아니다.

### 1.3 워크플로 모달 계열 (3곳)

`import-csv` · `BatchImportWorkflow` · `PhotoImportWorkflow`

```
header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
             paddingHorizontal: 16, paddingBottom: 14,
             borderBottomWidth: StyleSheet.hairlineWidth }
           paddingTop: Math.max(insets.top, 14)
headerBtn: { padding: 4, minWidth: 32 }   hitSlop={8}
title:     { flex: 1, textAlign: 'center', fontSize: 17,
             fontFamily: 'Pretendard_600SemiBold' }
```

- 좌: `close` 22 · `colors.textSecondary`
- 우: 32 스페이서. **단계가 둘 이상이면** 좌를 `arrow-back`으로 바꾸고 우에 `close`를 둔다
- 되돌리기 어려운 작업(가져오기 · 일괄 저장)을 단계로 진행하는 화면 전용

> 오른쪽 `close`는 **좌측이 뒤로가기로 점유됐을 때만** 쓴다. 왼쪽이 비어 있는데 오른쪽에
> 닫기를 두면 앱의 다른 어떤 화면과도 맞지 않는다.

### 1.4 탭 루트 (2곳)

`settings`(28) · `vocab-lists`(26). 뒤로가기 없음, 큰 제목. 새 탭이 생기면 26을 따른다.

---

## 2. 필터

### 2.1 표준은 알약 칩

조건으로 좁히는 UI는 **칩**을 쓴다.

```
filterChip:     { flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 12, paddingVertical: 7,
                  borderRadius: Radius.pillSm /* 20 */, borderWidth: 1 }
filterChipText: { fontSize: 13, fontFamily: 'Pretendard_500Medium' }
```

| 상태 | 배경 | 테두리 | 글자 |
|---|---|---|---|
| 비활성 | `colors.surface` | `colors.border` | `colors.textSecondary` |
| 활성 | `colors.primary` | `colors.primary` | `colors.onPrimary` |

**비활성은 테두리형이다.** 채움형(`surfaceSecondary`)은 비활성인데도 면적을 차지해, 칩이
여러 줄이면 회색 덩어리로 읽힌다. 테두리가 있어야 "누를 수 있는 것"으로 보인다.

**칩의 켜짐은 그 조건이 실제로 필터로 세어지는지와 일치해야 한다.** 기본값이라 필터로 세지
않는 조건을 켠 색으로 그리면, 아무것도 고르지 않은 화면이 "골라보세요"라고 말하면서 동시에
이미 골라진 것처럼 보인다.

### 2.2 라벨 거터는 쓰지 않는다

칩 줄 왼쪽에 범주 라벨을 두는 거터는 **쓰지 않는다**. 칩이 이미 자기 범주를 말하고,
거터 폭은 가장 긴 번역에 맞춰야 해서 한국어에서 절반이 빈다.

줄이 여럿이면 **성격으로 두 줄까지** 묶는다.

```
1줄 — 단어 자체 조건:  [전체][미암기][암기] │ [☆별표] │ [많이 틀린][최근 추가]
2줄 — 묶는 조건:       [전체 단어장 ▾] │ [품사 전체 ▾] │ [#태그]
```

- 후보가 많고 자주 만지지 않는 조건(품사 등)은 **값 + `chevron-down` 칩**으로 접어
  바텀시트에서 고르게 한다
- **`▾`가 달린 칩 = 목록에서 고르는 것.** 이 규칙을 깨면 `▾`가 장식이 된다
- 그룹 사이 구분은 `filterDivider`(`{ width: 1, height: 20 }`)

### 2.3 아이콘 순환은 단어장 상세 전용

`app/list/[id].tsx`의 3분할 순환 헤더(별표 토글 · 정렬 순환 · 상태 순환)는 **예외로 남긴다**.
그 배치의 핵심은 아래 단어 행과 정렬선을 공유하는 것이라 다른 화면으로 옮기면 의미가 없고,
후보가 3개를 넘으면 순환 자체가 성립하지 않는다.

### 2.4 가로 스크롤 칩 줄

가로로 스크롤되는 칩 줄에는 **오른쪽 페이드를 모두** 붙인다. 끝 색은 반드시
`colors.background`에서 끌어온다.

```jsx
<LinearGradient
  colors={[colors.background + '00', colors.background]}
  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
  style={styles.filterFadeRight} pointerEvents="none"
/>
```

- 시작 색은 `'transparent'`가 아니라 **같은 색의 알파 0**이다. `'transparent'`는
  `rgba(0,0,0,0)`이라 밝은 배경에서 중간이 탁하게 지나간다
- 넘치지 않는 줄에서는 배경 위에 같은 배경을 덮는 셈이라 보이지 않는다.
  **넘칠 때만 켜려고 폭을 재지 말 것** — 런타임 측정은 이 저장소가 비싸게 배운 함정이다
  (`CLAUDE.md` UI 체크리스트)

---

## 3. 학습 시작 컨트롤

**아이콘 + 제목 버튼 행**을 쓴다. 누르면 곧바로 시작한다.

```
[ 🃏 카드 학습 ]  [ ❓ 퀴즈 ]  [ 💬 예문 ]  [ ▶ 오토플레이 ]
```

- 아이콘 22 + 제목만. **부가 설명을 붙이지 않는다**
- 색은 조용하게(`colors.textTertiary` 계열). 이건 목적지 선택이지 강조 대상이 아니다
- **모드를 기억하는 지속 설정을 두지 않는다.** 같은 버튼이 어떤 날은 카드로, 어떤 날은
  퀴즈로 열리면 그 버튼을 신뢰할 수 없다 (판단 근거는 `app/(tabs)/index.tsx:195` 주석)
- 4곳 중 3곳이 이미 이 방식이다(단어장 상세 · 플랜 · 홈 퀵카드)

세그먼트 + 시작 버튼 조합은 쓰지 않는다.

> **`sel` 지원 현황** — 골라낸 단어 목록을 넘기려면 라우트가 `sel`을 받아야 한다.
> `flashcards` · `quiz` · `examples`는 받고, **`autoplay`는 받지 않는다**
> (`features/study/autoplay/screen.tsx:35`). 오토플레이를 붙이려면 그 지원이 먼저다.

---

## 4. 단어를 그리는 행

**세 종**만 둔다. 지금 여덟 곳에서 여섯 종이 쓰이지만 실제 역할은 셋뿐이다.

### 4.1 인터랙티브 행 — 단어장 상세 · 골라서 학습

```
┃ ☆   despite                          🔊   ✓
┃     ~에도 불구하고                  
```

- 뼈대: `borderLeftWidth: 3` 상태색 + `borderRadius: Radius.md`
- 좌: 별표 **토글**(`colors.starGold`) · 중앙: 단어 + 뜻 · 우: 스피커 + 암기 **토글**
- 암기어는 `colors.surfaceSecondary` 배경 + 취소선
- 왼쪽 테두리 색: 별표 > 미암기(`primary`) > 암기(`border`) 순으로 결정

**단어를 골라내는 화면이라면 그 상태가 행에 보여야 한다.** "미암기만"으로 걸러 놓고
결과에서 암기 여부를 확인할 수 없으면 필터를 신뢰할 수 없다.

### 4.2 읽기 전용 행 — 통계 시트 · 큐레이션 미리보기 · CSV 미리보기

단어 + 뜻만. 토글도 스피커도 없다. 왼쪽 테두리도 없다.

### 4.3 편집 행 — 일괄추가 · 사진 스캔

`TextInput` 두 칸 + 제거 버튼.

---

## 5. 터치 타겟

최소 44×44pt(`PRODUCT.md`). **재는 방법을 통일한다.**

```
박스 40×40 + hitSlop={12}   →  64×64
```

- 아이콘 크기와 무관하게 항상 통과하므로 **암산이 필요 없다**
- 콘텐츠 계열 8곳이 이미 이 방식이다(`backBtn`)
- "아이콘 + hitSlop×2"로 계산하는 방식은 쓰지 않는다. 그 방식이 `hitSlop={6}`(7곳)·
  `hitSlop={10}`(6곳) 같은 미달을 낳았다 — 아이콘 22에 hitSlop 6이면 34, 10이면 42다
- 박스를 둘 수 없는 좁은 자리라면 최소 `hitSlop={12}`

---

## 6. 모서리 반경

`constants/tokens.ts`의 스케일만 쓴다. 원시 숫자를 직접 적지 않는다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `Radius.xs` | 4 | 진행바 · 태그 · 점 |
| `Radius.sm` | 8 | 세그먼트 · 작은 컨트롤 |
| `Radius.smd` | 10 | 컨텍스트 메뉴 · 작은 버튼 |
| `Radius.md` | 12 | 버튼 · 입력 · 표준 카드 |
| `Radius.lg` | 16 | 패널 · 검색 바 |
| `Radius.pillSm` | 20 | 알약 칩 |
| `Radius.xl` | 24 | 바텀시트 · 다이얼로그 |
| `Radius.pill` | 999 | 완전한 원 · 아바타 |

`10`과 `20`은 실측에서 각 32회·24회로 쓰이고 있었는데 토큰에 없어서 원시 숫자로 남았다.
스케일을 실측에 맞춰 넓히는 쪽을 택했다 — 이 여덟 단이 전체의 약 90%를 덮는다.

`9` · `14` · `15` · `18` · `28` 같은 산발값은 가장 가까운 단으로 흡수한다.

---

## 7. 세그먼트 컨트롤

**두 종**을 인정한다. 용도가 다르다.

```
작은 것 — 화면 안 보조 선택
  container { borderRadius: Radius.sm /* 8 */, padding: 2 }
  tab       { borderRadius: 6, paddingVertical: 6 }
  text      13 Pretendard_500Medium → 활성 Pretendard_600SemiBold

큰 것 — 화면의 주 선택 (add-word 입력 방식 등)
  container { borderRadius: Radius.md /* 12 */, padding: 4, height: 48 }
  tab       { flex: 1 }
  text      14 Pretendard_600SemiBold
```

활성 탭은 `colors.surface` 배경 + `colors.primary` 글자. 1px씩 어긋난 사본을 만들지 않는다.

---

## 8. 색

인라인 hex는 lint(`no-restricted-syntax` HEX_GUARD)가 막는다. 색은 전부
`colors.X`(`@/features/theme`)에서 온다.

**알파가 필요하면 토큰에 알파를 붙인다:**

```jsx
colors.primary + '1A'     // 10%
colors.success + '26'     // 15%
colors.error + '33'       // 20%
```

| 알파 | 접미사 |
|---|---|
| 8% | `'14'` |
| 10% | `'1A'` |
| 15% | `'26'` |
| 20% | `'33'` |
| 25% | `'40'` |
| 30% | `'4D'` |

다크에서 같은 알파는 더 옅게 읽히므로, 테두리는 보통 다크가 한 단 진하다
(`colors.primary + (isDark ? '40' : '33')`). **분기하는 것은 알파뿐이고 색상은 아니다.**

> ⚠️ **HEX_GUARD의 사각지대** — 선택자가 `Literal[value=/^#[0-9a-fA-F]{3,8}$/]`라
> `#`으로 시작하는 것만 본다. `rgba(...)` 문자열은 통과한다. 웜 크림 팔레트 전환 때
> `#`으로 쓰인 색은 전부 잡혔지만 `rgba`로 쓰인 테두리 11곳이 살아남아, 홈·단어장·큐레이션
> 세 탭이 Tailwind/GitHub 색을 쓰고 있었다(`60ba485`에서 정리). **알파가 필요하면
> `rgba()`가 아니라 위의 알파 접미사를 쓸 것.**
>
> 검정·흰색 스크림(`rgba(0,0,0,0.5)` 등 20여 곳)을 `colors.overlay` 같은 토큰으로 보낼지는
> 아직 정하지 않았다. 정해지면 HEX_GUARD에 `rgba(` 금지를 추가할 수 있다.

---

## 적용 대기 목록

스펙 확정(2026-07-28) 시점에 알려진 이탈. 새 코드는 처음부터 스펙을 따르고, 아래는 별도로 흡수한다.

> 골라서 학습(`app/search-modal.tsx`)은 **전부 적용됐다**. 다만 실기 검증은 아직이다 —
> 화면 전체가 바뀌는 변경이라 `preview` 프로필(릴리스 APK)에서 눈으로 확인해야 한다.

### 헤더
- [x] `app/search-modal.tsx` — 제목 왼쪽 + 우측 `close` → **콘텐츠 계열**
- [ ] `app/whats-new.tsx` · `app/contact.tsx` — `paddingHorizontal: 8` → `12`
- [ ] `app/stats.tsx` — `headerTitle`에 `letterSpacing: -0.3` 누락
- [ ] `app/list/[id].tsx` — `chevron-back` 28 → 24

### 필터
- [x] `app/search-modal.tsx` — 라벨 거터 폐기, 4줄 → 2줄 하이브리드(품사를 `▾` 칩으로)
- [ ] `app/(tabs)/index.tsx` — 칩 채움형 → 테두리형

### 학습 시작
- [x] `app/search-modal.tsx` — 세그먼트 + 시작 버튼 → 아이콘 + 제목 버튼 행
- [x] `shared/contracts.ts` · `features/settings/store.ts` — `CustomStudySettings`와
      `@soksok_custom_study_settings` 스토어 제거
- [ ] `features/study/autoplay/screen.tsx` — `sel` 미지원. 붙이면 학습 시작 버튼이 넷이 된다

### 단어 행
- [x] `app/search-modal.tsx` — `resultCard`(제3의 카드) → **인터랙티브 행**
- [ ] 읽기 전용 행 3종(통계 시트 · 큐레이션 미리보기 · CSV 미리보기) 통일

### 터치 타겟
- [ ] `hitSlop={6}` 7곳 · `hitSlop={10}` 6곳 — 박스 유무 확인 후 40×40 + 12로

### 반경
- [x] `constants/tokens.ts` — `smd: 10` · `pillSm: 20` 추가
- [ ] 산발값 48곳(`9` · `14` · `15` · `18` · `28` 등) 흡수

### 세그먼트
- [x] `app/search-modal.tsx` — r9/7이 세그먼트째 사라졌다(학습 시작 항목에 흡수)

### 색
- [ ] 검정·흰색 스크림 20여 곳을 토큰(`colors.overlay` 등)으로 보낼지 결정.
      정해지면 HEX_GUARD에 `rgba(` 금지를 추가할 수 있다
