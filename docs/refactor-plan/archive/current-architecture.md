# 현재 아키텍처 분석

> 작성일: 2026-04-18  
> 분석 범위: 프론트엔드(React Native/Expo), 백엔드(Express), 로컬 DB(SQLite), 클라우드 DB(PostgreSQL)

---

## 1. 레이어 구조 (현재)

```
┌────────────────────────────────────────────────────┐
│  Screen (app/)                                     │
│  직접 Context 호출 + 직접 fetch() + StyleSheet     │
├────────────────────────────────────────────────────┤
│  Context Layer (contexts/)                         │
│  비즈니스 로직 + API 호출 + 상태 관리 혼재        │
├────────────────────────────────────────────────────┤
│  Storage / Lib (lib/)                              │
│  SQLite CRUD + API 클라이언트 + 플랜 엔진         │
├────────────────────────────────────────────────────┤
│  Server (server/)                                  │
│  Express 라우터 (단일 routes.ts)                  │
└────────────────────────────────────────────────────┘
```

각 레이어의 경계가 불명확하고, **"무엇이 어디서 일어나는지"** 예측이 어렵다.

---

## 2. 주요 파일 규모

| 파일 | 줄 수 | 비고 |
|------|-------|------|
| app/add-word.tsx | 1517 | DraggableFieldItem, 자동완성, Batch·사진 임포트 혼재 |
| app/list/[id].tsx | 1289 | 단어 목록, 컨텍스트 메뉴, 필터, 편집 모드 혼재 |
| app/(tabs)/index.tsx | 1108 | 대시보드 |
| app/plan/[id].tsx | 1091 | 플랜 화면 |
| app/flashcards/[id].tsx | 1033 | 카드 UI, 제스처, 설정 모달 혼재 |
| contexts/VocabContext.tsx | 565 | 30개 이상 메서드, 신 객체 |
| lib/vocab-storage.ts | 768 | SQLite CRUD 레이어 |

---

## 3. Context 의존성 구조

```
Provider 스택 순서:
LocaleProvider
  QueryClientProvider          ← TanStack Query 설치했으나 실제로 미사용
    AuthProvider
      SettingsProvider
        ThemeProvider
          VocabProvider        ← Auth + Settings에 직접 의존
            GestureHandlerRootView
```

- `VocabContext`가 `AuthContext` + `SettingsContext`를 `useContext`로 직접 끌어옴
- Provider 순서에 강하게 결합 — 순서 바뀌면 런타임 에러
- `QueryClientProvider` 설치되어 있으나 모든 데이터 페칭은 raw `fetch()` — TanStack Query 미활용

---

## 4. 아키텍처 문제점

---

### A1. API 클라이언트가 없음 — `API_BASE`가 4군데서 따로 정의됨

```
contexts/AuthContext.tsx    → http://{EXPO_PUBLIC_DOMAIN}     (http)
contexts/VocabContext.tsx   → https://{EXPO_PUBLIC_DOMAIN}, 개발 시 자동 IP 감지
lib/translation-api.ts      → {EXPO_PUBLIC_DOMAIN} (scheme 누락 가능)
lib/naver-dict-api.ts       → http://{EXPO_PUBLIC_DOMAIN}
```

- AuthContext는 `http://`, VocabContext는 `https://` — 미묘하게 다름
- 토큰 주입이 각 `fetch()` 호출마다 수동으로 이루어짐 (8군데)
- 타임아웃, 재시도 로직 없음
- 단일 API 클라이언트 모듈(`lib/api-client.ts`)이 없어 서버 주소 변경 시 4곳 수정 필요

---

### A2. 동기화 아키텍처 — "전체 덮어쓰기" 방식의 구조적 취약성

```
POST /api/sync/data
Body: { lists: 전체_단어장_배열 }  ← 단어 수백 개 포함
```

- 단어장 수/단어 수에 비례해 페이로드 증가 (100개 단어장 × 50단어 = 5,000개 객체)
- **동시 사용(2기기)** 시 마지막 sync가 이기는 구조 → 데이터 유실 가능
- 최초 로그인 시에만 conflict Alert이 뜸. 이후 매 변이마다 전체 덮어쓰기
- 실패 시 재시도 큐 없음 → 네트워크 순간 끊김 시 조용히 손실

---

### A3. `studyResults`가 잘못된 레이어에 존재

```ts
// VocabContext에 있음
studyResults: StudyResult[]
setStudyResults: (results: StudyResult[]) => void
clearStudyResults: () => void
```

실제로는 **화면 간 일회성 데이터 전달**(flashcards → study-results)에 해당한다.

- 앱 재시작 시 유지되지 않음 (올바름)
- 그러나 전역 VocabContext에 있어, 단어 CRUD와 무관한 컴포넌트가 이 상태 변화로 리렌더됨

---

### A4. `VocaList` 타입이 신 타입(God Type) — 22개 필드

```ts
interface VocaList {
  // 핵심 (5개)
  id, title, words, isVisible, createdAt,

  // 플랜 데이터 (6개) — 플랜 없어도 모든 리스트가 이 필드 보유
  planTotalDays, planCurrentDay, planWordsPerDay,
  planStartedAt, planUpdatedAt, planFilter,

  // 공유/소셜 (5개)
  isCurated, isUserShared, creatorId, creatorName, downloadCount,

  // 학습 이력 (4개)
  lastStudiedAt, lastResultMemorized, lastResultTotal, lastResultPercent,

  // 기타 (2개+)
  position, icon, sourceLanguage, targetLanguage, ...
}
```

- 플랜을 사용하지 않는 리스트도 6개의 플랜 필드를 항상 포함
- SQLite 단일 `lists` 테이블에 모든 것이 평탄하게 저장 → 열 추가마다 migration 필요

---

### A5. 서버 라우터에 비즈니스 로직 혼재

```ts
// routes.ts — DELETE /api/curations/:id
const result = await pool.query(          // storage.ts 우회, 직접 SQL
  'SELECT is_admin FROM cloud_users WHERE id = $1',
  [requesterId],
);
isAdmin = result.rows[0]?.is_admin ?? false;
await storage.deleteCuration(...)         // 그 다음은 storage 추상화 사용
```

- `routes.ts` 안에서 raw `pool.query()`와 `storage.*()` 혼용
- 인증/권한 로직이 미들웨어가 아닌 핸들러 안에 inline
- AI, dict proxy, sync, curation, auth — 모두 `routes.ts` 한 파일 (262줄)

---

### A6. SQLite 마이그레이션 — 조용한 실패

```ts
// lib/db/index.ts (모든 migration step이 이 패턴)
try {
  await dbInstance.execAsync('ALTER TABLE words ADD COLUMN ...');
} catch (e) {
  console.log('Column might already exist.');  // 진짜 에러도 이 분기로
}
currentVersion = N;  // 실패해도 버전 증가
```

- 컬럼이 이미 존재해서 발생하는 정상 에러와 진짜 오류를 동일하게 처리
- 마이그레이션 실패 후 버전 번호가 올라가면 다음 앱 시작 시 재시도 불가
- 현재 버전 0→12로 12단계 — 체인이 길수록 위험도 상승

---

### A7. 코드 레벨 버그 (아키텍처 연관)

| 항목 | 위치 | 내용 |
|------|------|------|
| `deleteWord` 인터페이스 누락 | VocabContext.tsx:375, 552 | 정의는 있으나 `VocabContextValue` 미포함, useMemo deps에만 존재 |
| `withSync` 데드코드 | VocabContext.tsx:229 | 정의됐으나 실제 콜백은 수동으로 refreshData + debouncedSync 호출 |
| 이중 SQLite 읽기 | VocabContext.tsx 다수 | 매 변이마다 `Storage.getLists()` 2회 (중복 확인 + refreshData) |
| `Alert.alert()` 컨텍스트 내부 호출 | VocabContext.tsx:130 | 데이터 레이어에서 UI 직접 제어 |
| SettingsContext fieldOrder 마이그레이션 | SettingsContext.tsx:179 | 새 필드 추가마다 수동 삽입 위치 계산, 취약 |

---

## 5. 개선 방향

---

### B1. API 클라이언트 통합

```ts
// lib/api-client.ts (신규)
const BASE = resolveApiBase();  // 단 한 번 정의

export async function apiFetch(
  path: string,
  opts?: RequestInit & { token?: string }
) {
  const headers = {
    'Content-Type': 'application/json',
    ...(opts?.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    ...opts?.headers,
  };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (res.status === 401) throw new ApiError(401, 'UNAUTHORIZED');
  return res;
}
```

모든 `fetch()` 호출이 이 모듈을 통과 → 토큰 주입, 에러 정규화, 타임아웃 일원화.

---

### B2. 동기화 전략 개선 (최소 변경)

```
현재: POST /api/sync/data { lists: 전체 }
개선: 변경된 listId만 추적 → POST /api/sync/data { lists: 변경된_것만 }
```

- `VocabContext`에 `dirtyListIds: Set<string>` 유지
- 변이 발생한 listId를 Set에 추가
- sync 시 해당 list만 전송 → 페이로드 대폭 감소

---

### B3. `studyResults` 이동

```ts
// 개선: 화면 파라미터로 직접 전달
// flashcards/[id].tsx 완료 시:
router.push({
  pathname: '/study-results',
  params: { results: JSON.stringify(results), listId },
});

// study-results.tsx:
const { results } = useLocalSearchParams();
const parsed: StudyResult[] = JSON.parse(results);
```

VocabContext에서 `studyResults`, `setStudyResults`, `clearStudyResults` 제거 가능.

---

### B4. 서버 라우터 분리

```
server/routes.ts (현재 262줄) →
  server/routes/curations.ts
  server/routes/ai.ts
  server/routes/sync.ts
  server/routes/dict.ts
  server/middleware/requireAuth.ts    ← 인증 미들웨어 추출
```

---

### B5. SQLite 마이그레이션 안전화

```ts
// 진짜 에러와 "already exists" 구분
try {
  await db.execAsync('ALTER TABLE words ADD COLUMN tags TEXT;');
} catch (e: any) {
  if (!e.message?.includes('duplicate column')) throw e;  // 진짜 에러는 re-throw
}
```

---

### B6. 디자인 토큰 체계화

```ts
// constants/tokens.ts (신규, popup.ts 흡수 통합)
export const Tokens = {
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  radius:  { sm: 8, md: 12, lg: 16, xl: 20, full: 999 },
  fontSize:{ xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24 },
  fontFamily: {
    regular:  'Pretendard_400Regular',
    medium:   'Pretendard_500Medium',
    semibold: 'Pretendard_600SemiBold',
    bold:     'Pretendard_700Bold',
  },
} as const;
```

현재 app/components 전반에 하드코딩된 hex 색상 169개, 폰트명 직접 기입 다수.

---

## 6. 우선순위 요약

| 우선순위 | 항목 | 영향 |
|---------|------|------|
| 🔴 즉시 | A7 버그 수정 (deleteWord, withSync, Alert, fieldOrder) | 숨은 버그 제거 |
| 🔴 즉시 | A6 마이그레이션 에러 구분 | 스키마 손상 방지 |
| 🟡 단기 | A1 API 클라이언트 통합 | 유지보수, 일관성 |
| 🟡 단기 | A3 studyResults 이동 | 불필요한 리렌더 제거 |
| 🟡 단기 | A5 서버 라우터 분리 | 가독성, 유지보수 |
| 🟢 중기 | A2 sync dirty tracking | 다기기 안전성, 성능 |
| 🟢 중기 | B6 디자인 토큰 체계화 | 색상/타이포 일괄 변경 |
| 🟢 중기 | A4 VocaList 타입 정리 | 확장성 |
