# 예문 학습 enrich 백로그

2026-05-30 — 예문 학습 진입 속도 개선 작업(P0+P1) 완료 후 보류된 항목.

P0+P1로 사용자 체감 문제는 해결됨. 아래는 신호가 보일 때만 진행할 것.

## P3 — 단어 저장 시점 background enrich 큐

**무엇:** 단어 저장 시 빈 예문이면 background 큐에 적재 → 학습 시점에 이미 채워져 있음.

**왜 보류:**
- 빈 예문 단어가 *어디서* 들어오는지 측정 안 됨. 추측 기반 큐 설계는 잘못된 추상화 위험.
- 현재(P0+P1)는 빈 예문이 있어도 학습을 막지 않아 사용자 차단 효과 없음.

**트리거 (이 중 하나 발생 시 진행):**
- 사용자 피드백에 "예문이 없다"가 반복 등장
- 큐레이션 import 후 빈 예문 비율이 높다는 게 측정됨
- examples 학습 진입 시 background enrich 배너가 너무 자주 뜬다는 불편 제기

**선행 작업:**
- 빈 예문 진입점 측정 (add-word 스킵 / 큐레이션 / generate-words / 사진 스캔 중 어디)
- 진입점이 한 곳이면 큐 대신 그 흐름 안에서 일괄 enrich로 충분

**예상 작업량:** 진입점 측정 후 큐 + 재시도 + UI 상태까지 며칠.

## P4 — Batch enrich Edge Function

**무엇:** 1 콜에 N단어 묶어 enrich. `supabase/functions/generate-words` 인프라(`_shared/gemini-vertex.ts` + rate-limit + quota RPC) 재사용 가능.

**왜 보류:**
- 출시 직후 DAU=0 시점엔 비용·quota 최적화 의미 없음.
- Gemini N단어 배열 출력의 안정성 리스크(잘림/누락) — chunk size, retry, fallback 등 검증 비용 큼.
- Edge function 신규 배포 + 배포 시 회귀 리스크.

**트리거 (이 중 하나 발생 시 진행):**
- DAU 100+ 도달 + Free tier quota 압박 누적
- 운영자 GCP/Vertex 토큰 비용이 의미 있는 수준 (월 몇 만원+)
- 사진 스캔 활성화로 enrich 트래픽 폭증

**구현 메모:**
- chunk size 5~10 권장 (Gemini 출력 안정성)
- quota 정책 재정의 필요 (단어당 1 차감 유지 / 또는 chunk 단위 할인)
- BYOK 경로도 batch로 호출 가능 (사용자 quota 절약)
- 새 EnrichMode `'batch'` 추가 또는 별도 endpoint `enrich-words-batch`

**예상 작업량:** 1~2일 (Edge 구현 + 프롬프트 + 검증).

## P5 — 콜드 스타트 직후 첫 enrich 일시 실패의 "조용한 빈 결과" → 재시도 안내

**무엇:** 앱 콜드 스타트 직후 첫 enrich가 stale/미준비 세션 토큰으로 Edge `unauthorized`(refresh-retry 1회도 실패) 또는 Vertex 일시 오류로 떨어지면, `autoFillWord`가 조용히 사전 fallback으로 빠진다. en source면 영어 정의/예문만 채워지고 **번역 뜻(meaningKr)은 빈값** → 사용자는 "왜 뜻이 안 나오지?"만 보고 원인을 모른다. 앱 재시작하면 세션이 새로 hydrate되어 정상화.

→ AI 경로가 `unauthorized`/`upstream_failure`로 실패할 때 빈 결과를 그대로 반환하는 대신 **"AI 일시 오류 — 다시 시도" 안내 + 재시도 버튼**을 노출하거나, 첫 enrich 전에 세션 준비를 보장(보강 호출 전 `getSession` await + 필요 시 1회 refresh)한다.

**왜 보류:**
- 자가 치유됨(재시작/재시도 시 정상). 데이터 손상 없음 — 빈 뜻은 캐시도 안 됨(`setCachedEnrich`가 meaningKr 가드).
- 출시 차단 사안 아님. 빈도·체감 신호 측정 전 과설계 위험.

**트리거 (이 중 하나 발생 시 진행):**
- 사용자 피드백에 "뜻이 안 나온다/가끔 빈다"가 반복 등장
- 콜드 스타트 첫 enrich 실패율이 측정상 유의미

**구현 메모:**
- 사전 fallback과 "AI 실패"를 호출자가 구분할 수 있게 신호 분리(현재는 둘 다 빈 결과로 합쳐짐).
- en source의 사전 fallback은 *정상 동작*이므로(영어 정의 제공), AI 실패와 구분해 fallback 자체는 유지하되 "뜻 미생성" 사유만 표시.

**관찰:** 2026-06-09 TestFlight build 9, en→zh 단어 검색에서 첫 시도 뜻 빈값 → 앱 재시작 후 정상. zh 전용 문제 아님(코드상 en→zh는 BYOK·Edge 모두 완전 지원).

**예상 작업량:** 반나절 (신호 분리 + UI 분기 + 세션 prewarm).
