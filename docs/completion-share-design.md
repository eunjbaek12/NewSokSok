# 완주 자랑하기 (Completion Share) — 설계 문서

> 상태: **1단계 구현·상장으로 재작업**(2026-09-06). 2·3단계(자동 축하 · 완주 기록 화면)는 미착수.
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

## 4. 완주 공유 카드 (`CompletionShareCard.tsx`) — **상장으로 다시 짬**

> 첫 판(`4d9724d`)은 이 문서대로 "완주! 🎉 + percent" 카드였다. 종이가 비어 보였는데,
> **원인은 여백이 아니라 «상장의 본문»이 없어서였다** — 제목·수여 대상·본문·날짜·발행자가
> 상장의 구성인데 본문이 빠져 있었다. 한 문장을 넣자 숫자가 장식이 아니라 문장의 일부가
> 되면서 종이가 찼다. 아래가 지금 나가는 것이다.

- **짜임이 상장을 만든다** — 이중 괘선 · 자간 벌린 머리글 · 가운데 정렬 · 기울인 도장 ·
  하단 괘선(서명란). 종이 비율이 아니라 정사각인데(`share.ts` 가 1080²로 못 박음, 340dp
  View → 3.18배) SNS 규격이라 이게 맞다. **비율이 아니라 짜임으로 만들어야 했다.**
- **덱 이름·머리글·날짜만 명조**(`GowunBatang_*` — 한글 스킨이 이미 싣고 있어 새로 넣은
  폰트가 없다). 본문은 앱 서체 그대로 — 전부 명조면 촌스러워진다.
- **percent 는 뺐다** — 「완주」라는 말이 이미 그 뜻이다.
- 표시 데이터와 출처:

  | 값 | 출처 |
  |---|---|
  | 덱 이름 | `list.title` (한 줄에 안 들어가면 35.5→25dp) |
  | N개 | `list.words.length` |
  | N일 동안 | `memorized_log` 의 `COUNT(DISTINCT date)` — **실제로 편 날.** 달력 일수가 아니다 |
  | 마지막 단어 | `memorized_log` 를 `date, createdAt` 내림차순으로 하나 |
  | 날짜·도장 | `planUpdatedAt` |

- 🔴 **017(2026-07-09) 이전에 완주한 단어장은 로그가 없다** → 「N일 동안」과 「마지막 단어」가
  빠지고, 빠진 만큼 위 여백을 늘려 가운데가 비지 않게 한다.
- 규칙 준수: 뷰어 테마 무관하게 **고정 light 팔레트**(`Colors.light` + `CERT_GOLD`, hex 리터럴
  금지), 1080² PNG, `BRAND_URL` 각인(유기적 유입 — 앱 병목이 "발견"이라 정렬됨).
- 캡처는 화면 밖 렌더(`offscreen` 패턴) + `captureRef`(share.ts 그대로).
- 🔴 **치수는 눈대중으로 바꾸지 말 것.** 여백·자간·괘선 두께는 1080²로 실제 렌더해 정본과
  1~2px 안쪽으로 맞춘 값이다. CSS로 흉내 내고 "되겠지" 한 첫 시도가 세 번 틀렸다.
  판단(크기 단계·강조 분해·SQL)만 `features/stats/completion.ts` 로 빼서 테스트가 지킨다.

## 5. i18n (ko/en 동시)

- `shareCard.*` 확장 또는 `completionShare.*` 신설: 카드 문구("완주!", "{{count}}단어 마스터"),
  버튼 라벨("자랑하기"), 공유 메시지, 에러/미지원 alert.
- 공유 메시지 예: "「{{title}}」 완주! 🥑 {{count}}단어를 끝냈어요" / EN 대응.

## 6. 범위·규모

1단계만: `CompletionShareCard.tsx`(신설) + Study Result 바텀시트에 버튼/캡처 배선 + i18n(ko/en).
**하루 안 걸리는 규모.** share.ts·캡처·권한 흐름은 검증된 것 재사용이라 리스크 낮음.

## 7. 열린 질문

- ~~자랑 카드에 정확도·소요시간도 넣을까?~~ → **넣을 수 없다.** 마이그레이션 21개를 전부
  확인했는데 **총 학습 시간·정답률을 저장하는 표가 없다** — 학습결과의 `29s`·`100%`는 세션 중
  메모리 값이고 커밋 때 버려진다. 「가장 많이 틀린 단어」도 안 된다:
  `use-session-commit.ts:85` 가 맞힌 단어의 `wrongCount` 를 0으로 지우는데, 완주는 결국 전부
  맞힌 상태라 전부 0이다. → 대신 `memorized_log` 에서 **편 날 수**와 **마지막 단어**를 쓴다.
- "이미지로 저장"도 줄까(통계 화면은 공유+저장 둘 다 제공)? → 통계 패턴 따라 **공유 우선**, 저장은 선택.
- 2단계 자동 축하를 넣을지 / 스트릭 축하와의 순서.
- 🔴 **완주는 기록이 아니라 «상태»라 지워진다.** `clearPlan`(`features/vocab/db.ts:917`)이
  「새 계획 세우기」·완주 카드의 ✕ 에서 근거를 통째로 지운다 → 보관함(완주 기록 화면)은
  이 위에 못 세운다. `022_add_completions`(append-only, `memorized_log` 와 같은 형태)가
  선행이고, 덤으로 상장 날짜가 고정된다(지금은 `planUpdatedAt` 을 따라 흔들린다).

## 8. 관련

- 스트릭·통계 자랑: `[[project_study_streak_stats]]`, `app/stats.tsx`, `MilestoneCelebration.tsx`
- 완주 카드 스냅샷 주의: `components/ListCard.tsx:44` (lastResult* 스냅샷 vs 라이브 카운트 —
  `[[project_listcard_snapshot_mismatch]]` 참고, 완주 시트는 라이브 `list.words` 사용)
