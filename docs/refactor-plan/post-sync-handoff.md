# Sync 검증 & 출시 준비 핸드오프

> 작성일: 2026-04-29
> 기준 커밋: `8a2c9af` (main)
> 이전 문서: `post-native-qa-handoff.md`

---

## 이번 세션 완료 항목

| 항목 | 결과 |
|---|---|
| EAS preview 빌드 환경변수 누락 수정 | ✅ EXPO_PUBLIC_SUPABASE_URL/ANON_KEY/GOOGLE_CLIENT_ID를 EAS preview env에 등록 |
| 첫 Google 로그인 "합치기" 동기화 무음 실패 수정 | ✅ `PRAGMA foreign_keys = OFF`를 트랜잭션 밖으로 이동 |
| 동기화 오류 Alert 표시 | ✅ loadCloudData catch에서 Alert 추가 |
| Supabase push/pull 기본 동작 확인 | ✅ 단일 기기에서 확인 |

---

## 남은 작업

### 1. Sync 멀티 기기 검증 (2.3) — 중간 우선순위

**조건**: Google 계정 + 기기 2대 (또는 에뮬레이터 + 실기기)

**검증 시나리오**:
- 기기 A에서 Google 로그인 → 단어장/단어 생성/수정/삭제 → 2초 후 Supabase 반영 확인
- 기기 B에서 동일 Google 계정 로그인 → 기기 A의 데이터 pull 확인
- **특히 주의**: `features/sync/first-login.ts` — 로컬 데이터 없는 상태에서 첫 로그인 시 `cloud-only` 브랜치 타는지 확인

**관련 파일**: `features/sync/engine.ts`, `features/sync/first-login.ts`, `features/vocab/use-bootstrap.ts`

---

### 2. shadow*/pointerEvents deprecation 정리 — 낮은 우선순위

**증상**: 경고만, 동작 정상

#### 2.1 `shadow*` props (~30개 파일)
```bash
grep -r "shadowOffset\|shadowOpacity\|shadowRadius" --include="*.tsx" --include="*.ts" -l
```
- `shadowOffset` / `shadowOpacity` / `shadowRadius` → `boxShadow: '0 4px 8px rgba(0,0,0,0.2)'`
- 네이티브는 `shadow*` 유지, 웹은 `boxShadow` — `Platform.select` 필요

#### 2.2 `pointerEvents` prop
- `pointerEvents="box-none"` → `style={{ pointerEvents: 'box-none' }}`
- 주요 사용처: `features/study/components/BatchResultOverlay.tsx`, `app/list/[id].tsx`

**작업 방식**: 새 브랜치(`chore/deprecation-cleanup`) → PR

---

### 3. EAS Production 빌드 & 스토어 제출 — 높은 우선순위 (출시 전)

#### 사전 체크리스트
- [ ] `eas.json` production 프로필 확인 (`autoIncrement: true` 설정됨)
- [ ] `app.json` `version`, `versionCode` 확인
- [ ] EAS production 환경변수 등록 확인
  ```bash
  npx eas env:list --environment production
  ```
  현재 production에는 `GOOGLE_SERVICES_JSON`만 등록됨 → `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID` 추가 필요
- [ ] iOS용 `GoogleService-Info.plist` EAS secret 등록 필요 (iOS 빌드 시)

#### Production 빌드 명령
```bash
EAS_SKIP_AUTO_FINGERPRINT=1 npx eas build --platform android --profile production
EAS_SKIP_AUTO_FINGERPRINT=1 npx eas build --platform ios --profile production
```

#### 스토어 제출
```bash
npx eas submit --platform android
npx eas submit --platform ios
```

---

## 참고

- EAS 프로젝트: `@baekeunjoeng/soksok-voca`
- Supabase project ref: `ithqbclnwvyeultkyxbn`
- 이번 세션 수정 커밋: `8a2c9af`
- 네이티브 검증 체크리스트: `docs/refactor-plan/post-refactor-test-plan.md`
