# v1.1 (광고·인앱구독) 작업 인수인계

작성일: 2026-05-18 (AdMob 배너·보상형·한도 카운터 커밋 반영 예정)

다음 세션으로 이어갈 인수인계 문서. v1 내부 테스트 출시 + v1.1 코드 작업 계속.

---

## 한 줄 현재 상황

**v1 AAB** Play 내부 테스트 트랙 업로드 성공. **v1.1 코드 작업**은 AdMob 배너·보상형·한도 카운터 골격까지 완료 (테스트 광고 ID로 동작) — **남은 건 Pro 인앱구매 / 약관 / 통합 테스트** 3개.

---

## 정책 확정사항 (Task #1 — 완료)

### 단계적 출시 (v1 → v1.1)

```
v1 (현재): 3-tier 골격
   • Free (게스트 + 로그인 무료)
   • BYOK (자기 Gemini 키, 고급 설정에 격하 완료)
   • Pro 미구현 — 인앱구매 통합 후 활성화

v1.1 (목표): 3-tier + 광고 + 결제
   • Free: 배너 광고 + AI 단어 추가 일 100단어
       한도 초과 시 보상형 광고 → +50단어 (선택)
       일 절대 상한 300단어
   • BYOK: 배너 광고 + 자기 키 무제한 (설정 → 고급 설정)
   • Pro: 월 3,900원 / 연 35,900원 (14% 할인)
       모든 광고 제거 + AI 단어 추가 일 1,000단어
       7일 무료 체험 (자동 결제 X)
   • 신규 가입 첫 7일: 배너 없음
   • 14세 미만: 광고 비활성

v1.2 (이후): Pro Lite 추가 검토
   • BYOK 등록자 한정 광고 제거 옵션
   • 월 1,900원 / 연 17,900원
```

### 단위 표기
사용자에게 보여줄 단위 = **"단어 수"** (포인트 X)
- 자동완성 1단어 = 1단어 카운트
- AI 단어 생성 1세트 = 20단어 카운트
- 사진 스캔 1장 = 약 15단어 카운트 (OCR 오버헤드는 운영자 흡수)

---

## 완료된 코드 작업 (커밋됨)

| 커밋 | 작업 |
|---|---|
| `d1acef5` | Naver 비공식 API 제거 + Datamuse 분리 |
| `24e74cb` | 어린왕자 큐레이션 제거 + Alice/Sherlock PD 출처 명시 |
| `6b85162` | 오픈소스 및 데이터 출처 페이지 추가 (`app/licenses.tsx`) |
| `4453c7e` | v1.1 정책·인프라 가이드 + CLAUDE.md 갱신 |
| `0d69260` | Play Console 최종 스크린샷 추가 |
| `8d74ac8` | **FAQ v1.1 정책 반영** — 요금제·광고 카테고리 신설 + 사진 스캔 안내 수정 (#10 완료) |
| `af3bde4` | **AI quota Edge Function 도입** — Vertex AI + 사용자별 일일 한도 (#3·#6 완료) |
| `d2e6738` | **설정 UI 개편** — 요금제 화면 + BYOK 고급 설정 격하 (#7 완료) |
| _(미커밋)_ | **#4 AdMob SDK 통합** — 배너 (8개 화면) + 보상형 모달 + 한도 카운터 + Edge 클라이언트 grant 마이그레이션 |

### #4 작업 상세 (미커밋, 2026-05-18)

신규/수정 파일:
- `package.json` — `react-native-google-mobile-ads ^15.4.0` 추가 (OneDrive 이슈로 직접 편집, **`pnpm install` 보정 필요**)
- `app.config.js` — AdMob Expo plugin 등록 + `EXPO_PUBLIC_ADMOB_*_APP_ID` env → 테스트 App ID fallback
- `lib/ads/admob.ts` — 광고 단위 ID resolver (`AD_UNIT_BANNER`, `AD_UNIT_REWARDED`) + `initAdMob()` + `isAdsAllowed()` 가드 (Pro/트라이얼/under14 차단)
- `features/quota/store.ts` — 전역 quota Zustand 스토어 + `notifyQuotaExceeded` 이벤트
- `features/quota/index.ts`
- `components/ads/AppBannerAd.tsx` — `mode='tab-anchor' | 'bottom-anchor' | 'inline'` 배너
- `components/ads/RewardedAdModal.tsx` — Free 한도 초과 시 보상형 광고 + `grant_rewarded_bonus` RPC 호출
- `supabase/migrations/20260519000000_quota_status_client_grant.sql` — `get_ai_quota_status` / `grant_rewarded_bonus`를 authenticated 클라이언트에 grant + `auth.uid()` 검증
- `lib/ai/edge-enrich.ts` — quota_exceeded 응답 시 store에 신호
- `app/_layout.tsx` — `initAdMob()` 호출 + 로그인 시 quota refresh + 글로벌 `RewardedAdModal` 마운트
- `app/plans.tsx` — 새 quota store로 마이그레이션
- `app/add-word.tsx` — 헤더 우측에 한도 chip (`Free + non-BYOK + 로그인` 조건)
- `i18n/locales/{ko,en}.json` — `ads.*` 키 신설
- 배너 통합 화면:
  - 탭 4개 (`mode="tab-anchor"`): `app/(tabs)/index.tsx`, `vocab-lists.tsx`, `settings.tsx`, `features/curation/screen.tsx`
  - 학습 모드 4개 (`mode="bottom-anchor"`, **TODO: 답 버튼 16dp 정밀 보정 follow-up**): `features/study/{flashcards,quiz,examples,autoplay}/screen.tsx`

알려진 한계:
- **AdMob SSV(서버측 검증) 미통합** — 클라이언트가 직접 `grant_rewarded_bonus` RPC 호출. 일 cap 200으로 어뷰징 제한. v1.2에 SSV + Edge Function 경유로 전환 권장.
- **학습 화면 답 버튼 정밀 보정 미완** — 현재 배너가 답 버튼 영역과 인접. 각 학습 화면에서 답 영역 `paddingBottom = insets.bottom + BANNER_SLOT_HEIGHT + 16` 조정 follow-up.
- **iOS Liquid Glass NativeTabs** — 배너가 보이지 않을 수 있음. iOS 출시 전 검증/수정.

> 미커밋: `.claude/settings.local.json` (로컬 설정, 커밋 X).

---

## 남은 작업 한눈에 (v1.1)

| Task | 작업 | 사용자 사전 작업 필요 |
|---|---|---|
| ~~#4~~ | ~~AdMob SDK 통합 + 배너 + 보상형~~ | ✅ 골격 완료 (테스트 ID). 실 ID는 EAS Secret만 설정 |
| #4-follow-up | 학습 화면 답 버튼 16dp 정밀 보정 + iOS NativeTabs 배너 + AdMob SSV (v1.2) | — |
| #5 | **Pro 인앱구매 통합** (Play Billing) + 영수증 검증 | Play 구독 상품 ID (`pro_monthly`, `pro_yearly`) |
| #11 | **개인정보 처리방침 + 약관 업데이트** (광고·결제 반영) | #5 완료 후 |
| #14 | **통합 테스트 + Production AAB 재빌드** | 모든 작업 완료 후 |

### Edge Function deploy (사용자 측, 미진행)

코드는 작성 완료, 배포만 남음:

1. Supabase CLI 설치: `scoop install supabase`
2. `supabase login` + `supabase link --project-ref <ref>`
3. DB 마이그레이션 적용: `supabase db push` (`supabase/migrations/20260518000000_ai_quota.sql`)
4. Secrets 설정 (`supabase/functions/enrich-word/README.md` 참고)
   - `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, `VERTEX_SA_CLIENT_EMAIL`, `VERTEX_SA_PRIVATE_KEY`
5. 배포: `supabase functions deploy enrich-word`
6. 앱 환경변수 `EXPO_PUBLIC_ENRICH_VIA_EDGE=1` 추가 (EAS Secret 권장)
7. GCP Budget cap 설정 (월 $20 등) + Vertex AI Quotas cap 권장

> 미배포 동안에는 코드가 v1 동작 유지 (BYOK 또는 dictionaryapi.dev fallback).

---

## 사용자 측 진행 상황 (운영자 작업)

### Play Console v1 등록 (진행 중)

| 단계 | 상태 |
|---|---|
| 1. 앱 생성 | ✅ |
| 2. 정책 선언 10개 | ✅ |
| 3. 스토어 등록정보 | ✅ |
| 4. AAB 업로드 (내부 테스트 트랙) | ⏳ **광고 ID 선언 충돌 해결 후 재시도** |
| 5. SHA-1 → Google OAuth 등록 | ⏳ |
| 6. 본인 기기 옵트인·설치·검증 | ⏳ |

### 광고 ID 선언 충돌 해결법 (진행 중인 이슈)

**원인**: Play Console "광고 ID 사용함" + v1 AAB에 AdMob SDK 없음 → `AD_ID` 권한 매니페스트에 없음 → 충돌.

**해결**:
1. Play Console → 정책 → 앱 콘텐츠 → 광고 ID → **"사용 안 함"** 으로 변경
2. 데이터 보안 폼에서도 광고 ID 항목 체크 해제
3. AAB 업로드 재시도

> v1.1 빌드에 AdMob SDK 추가하면 `AD_ID` 권한 자동 포함 → 그때 "사용함"으로 다시 변경.

### Part A — GCP Agent Platform (구 Vertex AI) ✅ 완료
| 항목 | 값 |
|---|---|
| Agent Platform API | ✅ 활성화 |
| 결제 등록 | ✅ |
| 서비스 계정 | `avocado-ai-proxy@<project>.iam.gserviceaccount.com` |
| 역할 | `roles/aiplatform.user` |
| JSON 키 | ✅ 발급·보관 |

### Part B — AdMob ⏳ 미완료
- 앱 ID, 배너 광고 단위 ID, 보상형 광고 단위 ID 발급 필요
- 신규 단위는 활성화까지 ~24시간

### Part C — Play 인앱구독 ⏳ 미완료
- Play Console 앱 등록 완료 후 가능
- 상품 ID 등록: `pro_monthly` (₩3,900), `pro_yearly` (₩35,900)
- 7일 무료 체험 설정

---

## 작업 의존도 그래프

```
Phase 0 (사용자 인프라, 병렬 — 미완)
   • Part B AdMob 등록·광고 단위 발급
   • Part C Play 인앱구독 등록
   • Edge Function deploy (코드 완료, 사용자가 deploy)

Phase 1 ✅ 완료
   • #10 FAQ 전면 개정
   • #3 Edge Function 코드
   • #6 클라이언트 enrich 흐름 교체
   • #7 설정 UI 개편 (Pro 구독 버튼은 "곧 출시" placeholder)

Phase 2 (Part B·C 완료 후) ← 다음 작업
   • #4 AdMob SDK 통합 (배너 + 보상형)
   • #5 Pro 인앱구매 통합 (Play Billing)
       → app/plans.tsx의 "곧 출시" 모달 → 실제 결제 흐름 교체
       → 보상형 광고 모달 (Free 한도 초과 시 +50)

Phase 3
   • #11 개인정보 처리방침·약관 갱신 (광고·결제 반영)

Phase 4
   • #14 통합 테스트 + Production AAB 재빌드 → 내부 테스트 트랙 업데이트
```

---

## 다음 세션 시작 흐름

1. **현 변경분 점검** — `pnpm install` (OneDrive 이슈 시 직접 편집 → `pnpm install`로 보정) → `pnpm lint` → 타입 점검
2. **EAS dev build** — `react-native-google-mobile-ads`가 네이티브 모듈이라 새 빌드 필요. 테스트 광고 ID로 동작 확인.
3. **Supabase 마이그레이션 deploy** — `supabase db push` (20260518 + 20260519 모두). 20260519는 클라이언트 RPC grant 보강.
4. **Edge Function deploy** — `supabase functions deploy enrich-word` (코드는 이미 작성됨, Part A GCP는 완료)
5. **Phase 2 진입** — Play 구독 상품 ID 받으면 #5 Pro 인앱구매. 둘 다 안 됐으면 #11 약관 초안 먼저.
6. **실 AdMob ID 받으면** — EAS Secret에 `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID` / `EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID` / `EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID` 등록만 하면 자동 교체.

### 사용자 측 즉시 가능 작업
- `pnpm install` (의존성 보정)
- `supabase db push` (마이그레이션 2개 적용)
- AdMob 등록 진행 (광고 단위 ID 확보) → EAS Secret 등록
- Play 구독 상품 등록 (#5 차단 해제)
- Edge Function deploy (`enrich-word` 활성화)

---

## 알려진 이슈 / 주의사항

### Play Console
- 광고 ID 선언과 매니페스트 권한 일치 필수 (v1.1 시점에 다시 "사용함"으로)
- 데이터 보안 폼: v1.1 빌드 시 "광고 ID 수집" + "구매 내역 수집" 추가
- 콘텐츠 등급 설문: v1.1엔 "디지털 구매 = 예", "광고 = 예"로 재답변 필요할 수도

### AdMob 정책
- 신규 광고 단위는 활성화까지 ~24시간
- 14세 미만 사용자에게는 광고 비활성 (코드에서 처리 필요)
- 학습 화면에 배너 노출 시 퀴즈 답 버튼과 16dp 이상 간격 필수 (오탭 방지)

### Pro 결제 UX
- 현재 `app/plans.tsx`의 Pro 구독 버튼은 "곧 출시" 모달
- #5 인앱구매 통합 시 실제 Play Billing 흐름으로 교체
- Pro 사용자가 1,000단어 한도 초과 → "내일 다시" 메시지 (광고 X — Pro 약속 무결성)

### EAS 빌드
- `EAS_SKIP_AUTO_FINGERPRINT=1` 환경변수 다음 빌드에도 필요 (brace-expansion 이슈, 출시 후 해결)
- versionCode 자동 증분 (3 → 4 → ...)
- GOOGLE_SERVICES_JSON EAS Secret으로 주입됨

### CLAUDE.md "No backend server" 정책
- Supabase Edge Function은 BaaS 서버리스라 정책 준수 OK
- Express 서버 부활 아님

### 큐레이션
- 어린 왕자 단어장 제거 완료
- Alice/Sherlock은 PD 명시 (한국·전세계 PD)
- 큐레이션 신고 기능 v1.x에서 추가 권장 (UGC 정책 강화)

---

## 환경/계정 메모

| 항목 | 값 |
|---|---|
| Expo/EAS 프로젝트 | `@baekeunjoeng/soksok-voca` |
| Expo projectId | `2d560de2-a41b-4ac1-a019-d287f7aaa2d6` |
| Play 패키지명 | `com.soksokvoca` |
| Firebase 프로젝트 | `avocado-491710` |
| GCP 프로젝트 (Agent Platform) | 사용자가 별도 보관 |
| 서비스 계정 | `avocado-ai-proxy@...iam.gserviceaccount.com` |
| Supabase URL | `https://ithqbclnwvyeultkyxbn.supabase.co` |
| 개인정보 처리방침 | https://eunjbaek12.github.io/NewSokSok/privacy-policy.html |
| 계정 삭제 안내 | https://eunjbaek12.github.io/NewSokSok/account-deletion.html |
| v1 AAB | https://expo.dev/artifacts/eas/jSwoo5f88KR1C2jf4PMXL8.aab |
| 출시 가격 | Pro 월 3,900원 / 연 35,900원 |

---

## 빠른 명령 모음

```bash
# 빌드 상태
eas build:list --platform android --limit 3

# 새 빌드 (v1.1)
$env:EAS_SKIP_AUTO_FINGERPRINT=1; eas build --profile production --platform android --non-interactive

# Secret 점검
eas env:list production

# 자격증명
eas credentials --platform android

# Play 제출
eas submit -p android --latest

# Edge Function 배포 (사용자 측)
supabase functions deploy enrich-word
supabase db push
```

---

## 참고 문서

- `CLAUDE.md` — 코드 정책 (모네타이제이션 섹션 포함)
- `docs/handoff-play-release.md` — v1 빌드 시점 인수인계 (2026-05-15)
- `docs/handoff-monetization-setup.md` — 사용자 인프라 가이드 (GCP·AdMob·Play 인앱)
- `docs/handoff-play-console-setup.md` — Play Console 등록 가이드
- `supabase/functions/enrich-word/README.md` — Edge Function deploy 가이드
- `store-assets/` — 스토어 자산 (스크린샷·아이콘·그래픽·정책 답변지)
