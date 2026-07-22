# 완주 자랑하기 (Completion Share) — 설계 문서

> 상태: **설계만**(2026-07-19). 미구현. 1.2.0 이후 버전 작업 후보.
> 발안: 단어장 학습이 "완주"로 바뀌면 스트릭·통계처럼 자랑(공유)할 수 있게 하자.

## 0. 한 줄 요약

**이미 있는 "학습결과" 바텀시트에 자랑하기 버튼 + 완주 전용 공유 카드**를 추가한다. 완주 순간
자동 축하 모달은 **선택(2단계)** 으로 미룬다.

## 1. 지금 있는 것 (재사용)

| 조각 | 위치 | 재사용 |
|---|---|---|
| 공유 캡처·저장 | `features/stats/share.ts` — `shareStatsCard(ref, title)`, `saveStatsCard(ref)` | **범용**(카드 ref만 받음). 그대로 사용 |
| 스트릭 자랑 카드 | `features/stats/ShareCard.tsx` — 1080² PNG, 고정 light 팔레트, 브랜드 URL 각인 | 완주용 변형 신설의 템플릿 |
| 축하 모달+자랑 | `features/stats/MilestoneCelebration.tsx` — 모달 → 자랑 버튼 → 화면 밖 카드 캡처 → OS 공유 | 2단계(자동 축하) 때 복제 |

## 2. "완주"는 어디서 정해지나

- 파생 상태. `computePlanStatus()` (`features/study/plan/engine.ts:60`) 가 `planUpdatedAt != null &&
  planCurrentDay > planTotalDays` 이면 `'completed'`(완주) 반환. **이벤트가 아니라 매 렌더 재계산.**
- 완주로 "바뀌는 순간" = 마지막 Day 세션을 끝낸 직후(`app/study-results.tsx`).
- 완주는 되돌릴 수 있음("새 계획 세우기"/리셋) → 재완주 가능. → 자동 축하를 넣는다면 **중복 방지**
  필요(스트릭의 `saveMaxCelebrated` 패턴 = 완주 축하한 listId 기록).

## 3. 진입점 (결정)

### ✅ 1단계 — "학습결과" 바텀시트에 자랑하기 버튼 (채택)

- **위치**: `app/(tabs)/index.tsx` 의 Study Result Modal (현재 `:754`~`:815`).
  - 홈 완주 카드 → "학습결과" 버튼(`setResultList(list)`) → 이 바텀시트.
  - 현재 구성: 캐릭터 + 제목 + `CircularProgress(percent)` + "N/M 암기" + "새 계획 세우기" 버튼.
- **추가**: "새 계획 세우기" 위(또는 옆)에 **자랑하기** 버튼 1개. 누르면 완주 카드 캡처 → OS 공유.
- **이유**: 재진입 가능(놓쳐도 언제든), 완주 데이터가 이 시트에 이미 다 있음(`resultList.title`,
  `memorizedWords`, `totalWords`, `percent`), 신규 화면·감지·중복방지 로직 불필요 → **최소 변경**.

### ◻ 2단계(선택) — 완주 순간 자동 축하 모달

- 완주가 감정 고조 순간이라 공유율이 가장 높음. `MilestoneCelebration` 복제해 `study-results.tsx`
  에서 "이 세션이 플랜을 완주로 넘겼다" 감지 시 1회 팝업.
- 비용: 완주 전환 감지 + 중복방지(listId 기록) + 스트릭 축하와 **동시 발생 시 순서 조정**
  (같은 세션에 스트릭 마일스톤 + 완주가 겹칠 수 있음 → 완주 먼저 or 통합).
- 1단계와 **같은 카드·같은 share.ts** 재사용. 1단계를 먼저 내고 반응 보고 판단.

## 4. 완주 공유 카드 (신설: `CompletionShareCard.tsx`)

- `ShareCard.tsx` 를 템플릿으로, 스트릭(🔥) 대신 **완주** 서사.
- 표시 데이터: **단어장 제목** + "완주! 🎉" + **N단어 마스터**(memorized/total) + **percent** + 브랜드 URL.
- 규칙 준수: 뷰어 테마 무관하게 **고정 light 팔레트**(`Colors.light`, hex 리터럴 금지), 1080² PNG,
  `BRAND_URL` 각인(유기적 유입 — 앱 병목이 "발견"이라 정렬됨).
- 캡처는 화면 밖 렌더(`offscreen` 패턴) + `captureRef`(share.ts 그대로).

## 5. i18n (ko/en 동시)

- `shareCard.*` 확장 또는 `completionShare.*` 신설: 카드 문구("완주!", "{{count}}단어 마스터"),
  버튼 라벨("자랑하기"), 공유 메시지, 에러/미지원 alert.
- 공유 메시지 예: "「{{title}}」 완주! 🥑 {{count}}단어를 끝냈어요" / EN 대응.

## 6. 범위·규모

1단계만: `CompletionShareCard.tsx`(신설) + Study Result 바텀시트에 버튼/캡처 배선 + i18n(ko/en).
**하루 안 걸리는 규모.** share.ts·캡처·권한 흐름은 검증된 것 재사용이라 리스크 낮음.

## 7. 열린 질문

- 자랑 카드에 정확도·소요시간도 넣을까? → 완주 시트는 **플랜 레벨**이라 세션 정확도/시간이 없음
  (그건 `study-results.tsx` 소관). 완주 카드엔 제목·암기수·percent만 자연스러움.
- "이미지로 저장"도 줄까(통계 화면은 공유+저장 둘 다 제공)? → 통계 패턴 따라 **공유 우선**, 저장은 선택.
- 2단계 자동 축하를 넣을지 / 스트릭 축하와의 순서.

## 8. 관련

- 스트릭·통계 자랑: `[[project_study_streak_stats]]`, `app/stats.tsx`, `MilestoneCelebration.tsx`
- 완주 카드 스냅샷 주의: `components/ListCard.tsx:44` (lastResult* 스냅샷 vs 라이브 카운트 —
  `[[project_listcard_snapshot_mismatch]]` 참고, 완주 시트는 라이브 `list.words` 사용)
