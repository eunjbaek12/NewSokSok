# Handoff — 요금제/사용 상태 가시화 UI (v1.1)

작성일: 2026-05-20

## 1. 배경 / 문제

- 사용자가 **"내가 지금 어떤 요금제이고 얼마나 썼는지"**를 확인하려면 설정 → 요금제 화면까지 드릴인해야만 알 수 있다.
- `/plans` 상단 "현재 상태 카드"는 게스트/BYOK/Pro 분기만 제목·설명이 있고 **Free 분기는 사용량 막대만** 떠서(제목 없음) "무료 플랜 이용 중"이라는 문구가 어디에도 없다 (`app/plans.tsx:174-189`, i18n에 `currentFreeTitle` 키 부재).
- `/plans`의 플랜 카드에서 **"현재 사용 중" 표시가 비대칭**: Pro 카드는 `isPro`일 때 배지가 있으나(`plans.tsx:241`), Free 카드는 현재 Free여도 아무 표시가 없어(`plans.tsx:289`) 선택지처럼 보인다.

## 2. 결정된 방향 (표준·직관·논리 검토 완료)

"상단 카드를 설정 화면으로 통째 이동"하는 원안은 **중복(/plans와 동일 카드 2벌 유지보수) · 우선순위 역전(계정 정체성이 아래로 밀림)** 때문에 기각.
대신 **요약은 설정에, 본판 카드는 /plans에 유지**하는 결합 패턴 채택 (Apple ID 카드 / SaaS 가격표 "Current plan" 표준).

채택 항목:
1. **설정 계정 행에 tier + 사용량 표시** (4상태 분기)
2. **`/plans` 현재 tier 카드에 "현재 사용 중" 마커** + Pro 구독 중이면 "추천" 배지 숨김
3. **`/plans` Free 분기 제목/설명 보완**
4. **게스트 → 로그인 유도 동선**: 계정 행 게스트 상태는 "로그인하고 한도 받기"로 표기 + 탭 시 로그인

## 3. 상태 분기 (단일 진실 표 — 모든 화면 공통 적용)

분기 우선순위: **BYOK > 로그인 tier(Pro/Free) > 게스트**

| 상태 | 판별 | 계정 행 표기 | 비고 |
|------|------|-------------|------|
| BYOK | `!!apiKey` | `🔑 본인 키 · 무제한` | 게스트/로그인 무관. 사용량 카운트 안 함 |
| Pro | `google` & `status.tier==='pro'` | `⭐ Pro · {used}/{limit}` | 한도 1,000/일 |
| Free | `google` & status 존재 & 비Pro | `🟢 무료 · {used}/{limit+bonus}` | 한도 100/일 (+보상형 bonus) |
| 게스트 | `guest` & `!apiKey` | `📵 게스트 · 로그인하고 한도 받기` | quota 객체 `null` → 숫자 없음. 탭 시 로그인 |

> **논리 주의**: 게스트(키 없음)는 `useQuota().status === null` (`features/quota/store.ts:55-58`). "0/0"으로 위장하지 말고 로그인 유도 문구로 처리. status 로딩 전(google인데 null)에는 숫자 생략하고 tier 라벨만.

데이터 출처(이미 존재):
- `useAuth()` → `authMode`, `user`, `signInWithGoogle`
- `useSettings()` → `apiKey`
- `useQuota()` → `status {tier, used, limit, bonus, ...}`, `refresh`

## 4. 변경 파일 및 작업

### 4-1. `app/(tabs)/settings.tsx` — 계정 행에 tier+사용량
- [ ] `useSettings()`에서 `apiKey`, `useQuota()`에서 `status`/`refresh` 추가 import (현재 `profileSettings`만 사용 중).
- [ ] `authMode === 'google'`일 때 마운트/포커스 시 `refresh()` 호출 (plans.tsx와 동일 패턴, `plans.tsx:40-42`).
- [ ] 계정 사용자 행(`settings.tsx:168-179`)의 부제 영역 아래 또는 우측에 **상태 칩** 추가. 위 §3 표대로 4분기.
  - 게스트(키 없음) 칩은 `Pressable`로 `handleGoogleUpgrade` 연결(이미 존재, `settings.tsx:83`).
- [ ] 칩 스타일은 기존 `cloudBadge` 톤 재사용해 시각 통일.

### 4-2. `app/plans.tsx` — Free 제목 보완 + 현재 카드 마커
- [ ] Free 분기(`plans.tsx:174` else)에 `currentFreeTitle`/`currentFreeDesc` 추가 렌더 (Pro 분기와 구조 통일).
- [ ] **Free 카드**(`plans.tsx:289`)에 "현재 사용 중" 마커 추가: 조건 `isLoggedIn && !isPro` (BYOK도 구독 tier는 Free이므로 포함).
- [ ] **Pro 카드** "추천" 배지(`plans.tsx:214`)는 `!isPro`일 때만 노출, `isPro`면 숨김(이미 `proActiveBadge`가 현재 표시 담당).
- [ ] 마커 컴포넌트는 기존 `proActiveBadge` 스타일 재사용/일반화.

### 4-3. i18n — `i18n/locales/ko.json`, `en.json`
신규 키 (plans 네임스페이스):
- [ ] `currentFreeTitle` — ko: "무료 플랜 이용 중" / en: "On the Free plan"
- [ ] `currentFreeDesc` — ko: "매일 100단어 AI 한도 · 광고 포함" / en: "100 AI words/day · ads included"
- [ ] `planCardCurrent` — ko: "현재 사용 중" / en: "Current plan" (Free/Pro 카드 공용 마커)

설정 네임스페이스 (계정 행 칩 문구):
- [ ] `accountTierByok` — "본인 키 · 무제한" / "Your key · Unlimited"
- [ ] `accountTierPro` — "Pro · 오늘 {{used}}/{{limit}}단어" / "Pro · {{used}}/{{limit}} today"
- [ ] `accountTierFree` — "무료 · 오늘 {{used}}/{{limit}}단어" / "Free · {{used}}/{{limit}} today"
- [ ] `accountTierGuest` — "게스트 · 로그인하고 한도 받기" / "Guest · Sign in for free quota"

> 기존 `tierFree/tierPro/tierTrial/tierGuest`(badge용)와 별개. 재사용 가능하면 통합 검토.

## 5. 검증 (수동 QA)

각 상태로 진입해 **계정 행 ↔ /plans 카드 표기 일치** 확인:
- [ ] 게스트(키 없음): 계정 행 "로그인하고 한도 받기" 탭 → 로그인 플로우. /plans 게스트 카드 정상.
- [ ] 게스트 + BYOK 키: 양쪽 "본인 키 · 무제한".
- [ ] 로그인 Free: 계정 행 `무료 · 오늘 N/100`, /plans Free 카드에 "현재 사용 중" + Free 상단 카드 제목 노출.
- [ ] 로그인 Pro: 계정 행 `Pro · 오늘 N/1,000`, /plans Pro 카드 "현재 Pro 구독 중" + "추천" 배지 숨김.
- [ ] status 로딩 중(google, 첫 진입): 숫자 없이 tier 라벨만, 깨지지 않음.
- [ ] 라이트/다크 테마, ko/en 양쪽.

## 6. 리스크 / 비범위

- **비범위**: 게스트에게 운영자 무료 AI를 주는 익명 로그인(anonymous auth)은 **이번 작업에 포함하지 않음** (별도 의사결정 필요 — 비용/악용/sync 모델 변경). 본 작업은 "현 상태 가시화 + 전환 동선"에 한정.
- 사용량 숫자는 daily 갱신이라 계정 행이 약간 산만해질 수 있음 → 보조텍스트(작은 회색)로 처리해 정체성 우선순위 유지.
- `used/limit` 기준은 plans.tsx와 동일하게: Free는 `limit + bonus`(보상형 포함 총 캡), Pro는 `limit` 사용 — **두 화면 계산식 일치 유지**.

## 7. 관련 코드 레퍼런스

- `app/plans.tsx:33-104` — 상태 분기(`isLoggedIn/isByok/isPro/onTrial`) + 사용량 계산(`used/limit/totalCap/progressRatio`). 그대로 차용.
- `app/(tabs)/settings.tsx:151-232` — 계정 섹션.
- `features/quota/store.ts` — `QuotaStatus`, `refresh`(게스트=null 처리).
- `lib/translation-api.ts:59-133` — AI 경로 우선순위(BYOK→Edge→사전). 게스트 제약의 근거.
