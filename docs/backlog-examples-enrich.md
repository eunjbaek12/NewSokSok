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
