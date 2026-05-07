# Handoff: 단어장 번역 3일차

## 현재 상태

| 단어장 | 상태 | 비고 |
|--------|------|------|
| TSL 600 | ✅ 완료 | curationData.ts 반영됨 |
| NAWL 957 | ✅ 완료 | curationData.ts 반영됨 |
| BSL 1000 | ✅ 완료 | curationData.ts 반영됨 |
| NGSL 1001 | ⏸ 중단 | 500개 체크포인트 저장 (`scripts/.ngsl-progress.json`) — Gemini 일일 quota 초과로 중단 |

## 실행 순서

### Step 1: NGSL 이어서 (500→1001)

```bash
npx ts-node scripts/translate-vocab.ts ngsl
npx ts-node scripts/integrate-vocab.ts ngsl
```

## 완료 확인

```bash
grep "curated-toeic-tsl-1\|curated-nawl-1\|curated-bsl-1\|curated-ngsl-1" constants/curationData.ts
```

4줄 모두 출력되면 완료.

## 참고

- Rate limit 발생 시 자동 재시도 (최대 600초 대기 × 6회). 재시도 한도 초과 시 체크포인트에서 재실행하면 이어짐.
- 503(서버 과부하)도 429(rate limit)와 동일하게 처리되도록 수정됨 (`translate-vocab.ts`).
- 유료 API 전환 시 `scripts/translate-vocab.ts`의 `BATCH_DELAY_MS = 5000 → 1000`으로 줄이면 약 8분 내 완료.
