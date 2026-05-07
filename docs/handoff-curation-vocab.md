# Handoff: 큐레이션 단어장 Gemini 번역 및 통합

## 목표
NAWL·BSL·NGSL 세 개 단어장을 Gemini API로 번역하여 `constants/curationData.ts`에 통합.
TSL은 기존에 Wiktionary+AI 혼합으로 되어 있으므로 순수 Gemini로 재번역 후 교체.

## 현재 상태

| 단어장 | 소스 파일 | 번역 파일 | curationData.ts |
|--------|----------|----------|----------------|
| TSL 토익 600 | `tsl-top600-source.json` (600개) | `tsl-merged.json` (Wiktionary+AI 혼합) | ✅ 통합됨 (교체 필요) |
| NAWL 수능·학문 957 | `nawl-source.json` (957개) | `.nawl-progress.json` (400개 체크포인트) | ❌ 미통합 |
| BSL 비즈니스 1000 | `bsl-source.json` (1000개) | 없음 | ❌ 미통합 |
| NGSL 기초 1001 | `ngsl-source.json` (1001개) | 없음 | ❌ 미통합 |

## 사전 준비

`.env` 파일에 Gemini API 키 확인:
```
EXPO_PUBLIC_GEMINI_API_KEY=your_key_here
```

## 실행 순서

### Step 1: TSL 재번역 (Wiktionary 혼합 → 순수 Gemini)

```bash
# 기존 progress 파일 있으면 삭제
del scripts\.tsl-progress.json

# 재번역 실행 (출력: scripts/tsl-translated.json)
npx ts-node scripts/translate-vocab.ts tsl
```

완료 후 `scripts/reintegrate-tsl.py` 수정 필요:
- 현재: `MERGED_PATH = 'scripts/tsl-merged.json'`
- 변경: `MERGED_PATH = 'scripts/tsl-translated.json'`

그 다음 교체 실행:
```bash
python scripts/reintegrate-tsl.py
```

### Step 2: NAWL 번역 완료

체크포인트 400개가 있으므로 이어서 실행:
```bash
# 출력: scripts/nawl-translated.json
npx ts-node scripts/translate-vocab.ts nawl
```

완료 후 통합:
```bash
npx ts-node scripts/integrate-vocab.ts nawl
```

### Step 3: BSL 번역

```bash
npx ts-node scripts/translate-vocab.ts bsl
npx ts-node scripts/integrate-vocab.ts bsl
```

### Step 4: NGSL 번역

```bash
npx ts-node scripts/translate-vocab.ts ngsl
npx ts-node scripts/integrate-vocab.ts ngsl
```

## description 문구 수정

번역 전에 `scripts/integrate-vocab.ts`의 META description 수정 필요:

```typescript
// 현재
description: '수능·TOEFL·IELTS 학술 어휘 957. NAWL by Browne & Culligan (CC BY-SA 4.0) 기반',
// 변경
description: '수능·TOEFL·IELTS 학술 어휘 957. NAWL by Browne & Culligan (CC BY-SA 4.0) 기반, 뜻·예문 AI 생성',

// 현재
description: '실무 비즈니스 영어 1000. BSL by Browne & Culligan (CC BY-SA 4.0) 기반',
// 변경
description: '실무 비즈니스 영어 1000. BSL by Browne & Culligan (CC BY-SA 4.0) 기반, 뜻·예문 AI 생성',

// 현재
description: '일상 영어 필수 1000. NGSL by Browne & Culligan (CC BY-SA 4.0) 기반',
// 변경
description: '일상 영어 필수 1000. NGSL by Browne & Culligan (CC BY-SA 4.0) 기반, 뜻·예문 AI 생성',
```

`scripts/integrate-tsl.ts` 및 `scripts/reintegrate-tsl.py`도 동일하게:
```
"토익 핵심 어휘 600. TSL by Browne & Culligan (CC BY-SA 4.0) 기반, 뜻·예문 AI 생성"
```

## Rate Limit 대응

`translate-vocab.ts`에 이미 자동 재시도 로직 있음:
- 429 발생 시 30초→60초→120초→300초→600초→900초 대기 후 재시도
- 중단되어도 체크포인트에서 재실행 가능 (동일 명령 재실행)

유료 API로 전환 시 `BATCH_DELAY_MS = 5000` → `1000`으로 줄이면 10분 이내 완료.

## 예상 소요 시간 (Free 티어)

| 단계 | 예상 시간 |
|------|---------|
| TSL 재번역 | 5~10분 |
| NAWL 완료 (557개) | 5~10분 |
| BSL (1000개) | 10~20분 |
| NGSL (1001개) | 10~20분 |
| 통합 4개 | 5분 |
| **합계** | **35~65분** |

Rate limit 없으면 약 15분, 429 자주 발생 시 최대 1시간.

## 완료 후 확인

```bash
# curationData.ts에 4개 모두 있는지 확인
grep "curated-toeic-tsl-1\|curated-nawl-1\|curated-bsl-1\|curated-ngsl-1" constants/curationData.ts
```

4줄 모두 출력되면 완료.
