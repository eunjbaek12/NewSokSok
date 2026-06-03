# 출시 마스터 체크리스트 (Play Store + App Store v1.1)

**이 문서가 출시까지 남은 작업의 단일 기준(master)이다.** 2026-06-03 기준 갱신.

> ⚠️ **문서 신뢰도 주의**: 기존 handoff 문서·자동 메모가 시점별로 작성돼 서로 **상충**한다.
> 본 문서 §1의 (A)·(B)·(C) 분류가 가장 최신·정확.
>
> **출시 전략 변경 (2026-06-02)**: "한국 first"(v1.2 글로벌)는 **폐기**, **전 세계 동시 출시**로 결정.
> 비공개 테스트는 한국 트랙으로 진행하고 프로덕션 승격 시 전 국가 선택. iOS도 동시 출시 결정.

관련 상세 문서:
- `handoff-monetization-setup.md` — GCP/Vertex·AdMob·Play 구독 등록 상세 절차
- `handoff-play-console-setup.md` — Play Console 앱 등록·트랙·OAuth SHA-1
- `handoff-subscription-testing.md` — 결제 테스트 전략 + ④ 결제 E2E 체크리스트
- `handoff-v1.1-progress.md` — v1.1 구현 상세 (구버전 진행 기록, 상태는 본 문서가 우선)
- `handoff-play-release.md` — v1.0 출시 기록 (구버전, 환경/계정 메모만 유효)
- `supabase/functions/verify-purchase/README.md` — Android + iOS 영수증 검증 (Apple secret 4종 발급 절차)

---

## 1. 현재 상태 (2026-06-03)

### ✅ (A) CLI로 검증된 사실
| 항목 | 검증 |
|---|---|
| v1.1 코드 (구독·결제·quota·광고) | 레포 |
| **iOS 코드 작업 완료** | Sign in with Apple·verify-purchase iOS 분기·ATT 다국어 plugin (커밋 `43974c7`·`66a4669`·`edded1b`·`5afa697`) |
| **isReal 할루시네이션 차단** | enrich-word 재배포, PROMPT_VERSION 2 (커밋 `a8ca6e4`) |
| **개인정보 처리방침 ko/en** | 토글 + URL `?lang=en` (커밋 `4c10bf8`) |
| **Support URL 랜딩 ko/en** | `docs/index.html` 신규 — 한·영 토글 + FAQ 3종 + Play 다운로드 (커밋 `273d974`) |
| 구독 시스템 테스트 101케이스 (①②③) | Jest + 원격 pgTAP 통과, main 머지 (PR #2/#3/#4) |
| verify-purchase Edge **배포 v3** (Android만) | `supabase functions list` (ACTIVE) — 2026-05-26. iOS 분기 추가분은 **미배포** (트랙 B9에서 재배포) |
| Edge Secret: `PLAY_SA_*`·`ANDROID_PACKAGE_NAME`·`VERTEX_*` | `supabase secrets list` |
| EAS Secret: Supabase URL/ANON_KEY·`GOOGLE_CLIENT_ID`·`GOOGLE_SERVICES_JSON` | `eas secret:list` |
| **EAS Secret: `EXPO_PUBLIC_ADMOB_ANDROID_*` 실 ID 교체 완료** | 2026-06-03. APP_ID `~7571600348`, BANNER `/1006191991`, REWARDED `/9960062757`. publisher `2552217172819688`. **다음 production 빌드(vCode 9)부터 반영** |
| 코드 SKU 정합성 (`pro_monthly`/`pro_yearly`) | `lib/billing/skus.ts` 점검 |
| **최근 production 빌드: versionCode 8** | 2026-06-01, Build `340f2ce3-b6fd-4ab6-a449-f44e71eb54d5`, AAB https://expo.dev/artifacts/eas/7qRtPuVX3UbHWEfif5MdAH.aab. **AdMob은 옛 테스트 ID로 굽힘 — 비공개 테스트엔 무방, 프로덕션 승격 전 vCode 9 새 빌드 필요** |
| **사업자등록증 발급 완료** | 2026-06-02. 주업종 525101(전자상거래 소매업) + 642004(SW), 간이과세, 자택(대전 유성구). 사업자번호 `215-29-02111`, 상호 `산녀와 나무꾼`, 대표 `김호성` |
| **Store listing v1.1 정책 반영 완료** | `store-assets/listing/ko.md`·`en.md` 갱신 + `ios-ko.md`·`ios-en.md` 신규 (커밋 `273d974`). Apple 부제·키워드·홍보텍스트·IAP Tier 매핑·App Privacy 설문 포함 |
| ES 언어 지원 검증 | `constants/languages.ts`에 6종(en/ko/ja/zh/vi/es) + TTS 매핑 `es-ES` 확인. "6개 언어" 클레임 정확 |

### 🟡 (B) 사용자 구두 확인
| 항목 | 비고 |
|---|---|
| Play Console **구독 상품 등록·활성화** (`pro_monthly`/`pro_yearly` + 7일 체험) | Product ID 정확성은 첫 결제 E2E에서 최종 확정 |
| Play Console **정책 폼** (광고·데이터보안·콘텐츠등급) | v1.0 → v1.1 변경 항목(광고 ID=사용함, 데이터보안 광고/구매 추가, 콘텐츠등급 재답변)은 한국 법규 폼 통과 후 동시 처리 예정 |
| Supabase 마이그레이션 remote 적용 / Android OAuth SHA-1 등록 | 2026-05-25 검증 |
| **AAB versionCode 8 Play Console 수동 업로드 완료** | 2026-06-01. 한국 법규 추가정보 요구로 비공개 테스트 검토 **차단 상태** |
| **테스터 20명 모집 완료** | 2026-05-26 사용자 확인 |
| **정부24 통신판매업 신고 접수 완료** | 2026-06-03. 첨부=비적용 확인서 1개 (사업자등록증은 행정정보공동이용 자동조회). 호스트서버 소재지=`서울특별시 강남구 논현로 508, GS타워 12층 (AWS Korea)` (해외 우회). 취급품목=`교육/도서/완구/오락`. 등록면허세 고지 대기 중 |
| **AdMob Android 앱 이미 등록됨** | 2026-06-03 사용자 확인. 콘솔에서 앱명 "아보카도"로 표시. iOS 앱은 미등록 (트랙 B12에서 추가) |

### ❌ (D) 현재 차단·대기 중
| 항목 | 해결 조건 |
|---|---|
| **등록면허세 납부** | 유성구청 고지서 도착(1~2일) → 위택스(https://www.wetax.go.kr) 즉시 납부 (4~8만원). 납부 안 하면 신고증 안 나옴 |
| **통신판매업 신고증 발급** | 납부 완료 후 1~3영업일. 정부24 마이페이지 → 나의 신청내역에서 진행상황 확인 |
| **Play 비공개 테스트 검토** | 신고증의 신고번호 받으면 → A3·A4 동시 입력 후 검토 재시도 |
| **Apple Developer Program** | 2026-06-02 가입 신청, 본인 확인 1~2일 대기 중. Team ID `74SA3LF88F`, Apple ID `mtgirltreeguy@gmail.com`. 매일 https://developer.apple.com 로그인해서 활성화 여부 확인 |
| **Google Service Account 키 (eas submit)** | 미등록 — 현재 AAB 업로드는 수동. vCode 9 빌드 전 등록하면 편함 (선택) |

---

## 2. 다음 세션 실행 순서 (2026-06-03 이후)

> **세션 진입 시 우선 확인할 외부 상태 3가지** (이메일/SMS/정부24/developer.apple.com 체크):
> 1. **등록면허세 고지서 도착?** (6/3~6/5 예상) → 도착 시 A2.5로
> 2. **통신판매업 신고증 발급?** (납부 후 1~3일) → 발급 시 A3·A4로
> 3. **Apple Developer 활성화?** (6/3~6/5 예상) → 활성화 시 트랙 B 시작

### 🔴 트랙 A: Android 한국 법규 풀기 (병목 1)

```
A1. ✅ 완료 (2026-06-03) — ② 비적용 확인서 수기 작성·서명·스캔 PDF
    ※ ① 통신판매업 신고서 HWP는 정부24 온라인 폼이 대체 → 미사용

A2. ✅ 완료 (2026-06-03) — 정부24 통신판매업 신고 접수
    - 첨부: 비적용 확인서 PDF 1개 (사업자등록증은 행정정보공동이용 자동조회)
    - 호스트서버 소재지: "서울특별시 강남구 논현로 508, GS타워 12층 (AWS Korea)" (해외 우회 표준 답안)
    - 취급품목: "교육/도서/완구/오락"
    - 인터넷 도메인: Play Store URL

A2.5. 🟡 등록면허세 납부 (10분, 본인) — 고지서 도착 후
    - 위택스 https://www.wetax.go.kr → 로그인 → "납부할 세금"
    - 금액: 4~8만원 (대전 유성구는 약 4.05만원 예상)
    - 카드 결제 가능. 납부 안 하면 신고증 안 나옴
    - 납부 후 정부24 마이페이지에서 처리 상태 확인 (1~3영업일)

A3. 🟡 신고번호 받음 → Play Console 한국 법규 입력 (10분, 본인)
    Play Console → 정책 → 한국 법규 섹션
    - 사업자 등록 번호: 215-29-02111
    - 전자상거래 라이선스 번호: (발급받은 통신판매업 신고번호)
    - 전자상거래 라이선스 대행사: 대전광역시 유성구청

A4. 🟡 Play Console 폼 재답변 (v1.0 → v1.1 변경) (15분, 본인)
    - 광고 ID 선언: "사용 안 함" → "사용함"
    - 데이터 보안: 광고 ID + 거래 정보 추가
    - 콘텐츠 등급: "디지털 구매=예", "광고=예" 재답변
    - 답변지: store-assets/compliance/ + store-assets/listing/ko.md (메타데이터 표)

A5. 🟡 비공개 테스트 검토 재시도 → 통과 → 14일 시계 시작 (검토 1~3일)

A6. 🟡 vCode 9 production 빌드 (Claude 명령) — 프로덕션 승격 전 필수
    - 옛 빌드(vCode 8)는 AdMob 테스트 ID로 굽힘 → 비공개 테스트엔 OK, 프로덕션 금지
    - 새 빌드: EAS_SKIP_AUTO_FINGERPRINT=1 eas build --profile production --platform android --non-interactive
    - 함께 처리: expo-image-manipulator 복원 (commits 89bbb92 참조, package.json + PhotoImportWorkflow.tsx)
    - 완료되면 Play Console 비공개/프로덕션 트랙에 수동 업로드
```

### 🔴 트랙 B: iOS Apple Developer 활성화 (병목 2 — 1~2일 대기)

Apple Developer 본인 확인 완료되면:

```
B1. App ID 등록 + Sign In with Apple capability (5분, 본인)
    Apple Developer → Identifiers → + → App IDs
    - Bundle ID: com.soksokvoca
    - Capabilities: Sign In with Apple 체크

B2. Service ID 발급 (Supabase Apple OAuth용) (10분, 본인)
    Apple Developer → Identifiers → + → Services IDs
    - Identifier: com.soksokvoca.signin (App ID와 달라야)
    - Sign In with Apple → Configure → Primary App ID: com.soksokvoca
    - Return URLs: https://ithqbclnwvyeultkyxbn.supabase.co/auth/v1/callback

B3. Sign In with Apple Key 발급 (5분, 본인)
    Apple Developer → Keys → + → Sign In with Apple 체크
    - Configure → Primary App ID: com.soksokvoca
    - .p8 다운로드 (1회만 가능, 분실 시 재발급 필요)
    - Key ID 메모

B4. App Store Connect API Key 발급 (verify-purchase Edge용) (5분, 본인)
    App Store Connect → 사용자 및 액세스 → 통합 → App Store Connect API
    - 이름: soksok-verify-purchase
    - 액세스: Customer Support 이상
    - .p8 다운로드 + Key ID + Issuer ID 메모

B5. Google iOS OAuth 클라이언트 발급 (5분, 본인)
    GCP Console → 사용자 인증 정보 → OAuth 클라이언트 ID → iOS
    - Bundle ID: com.soksokvoca
    - 클라이언트 ID 복사 (com.googleusercontent.apps.XXX)

B6. Supabase Apple Provider 활성화 (10분, Claude 지원)
    Supabase Dashboard → Authentication → Providers → Apple
    - Services ID: com.soksokvoca.signin
    - Team ID: 74SA3LF88F
    - Key ID: B3에서 발급
    - Private Key: B3의 .p8 내용

B7. EAS Secret 등록 (Claude 명령)
    eas secret:create --name EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS --value <B5 결과>

B8. Supabase Secret 4종 등록 (Claude 명령)
    supabase secrets set APPLE_KEY_ID=<B4 Key ID> \
      APPLE_ISSUER_ID=<B4 Issuer ID> \
      APPLE_BUNDLE_ID=com.soksokvoca
    supabase secrets set APPLE_PRIVATE_KEY="$(cat <B4 .p8 file>)"

B9. verify-purchase Edge 재배포 (Claude 명령)
    supabase functions deploy verify-purchase

B10. iOS EAS 빌드 (Claude 명령)
    eas build --platform ios --profile production --non-interactive
    - prebuild 시 plugins/withLocalizedATT가 ko.lproj/en.lproj 생성
    - Apple App Store Connect 자동 자격 증명 (Apple Developer 가입돼 있어야)

B11. TestFlight 업로드 + App Store Connect 자동 처리 (Claude 명령 또는 수동)
    eas submit -p ios --latest

B12. AdMob iOS 앱 추가 (10분, 본인) — TestFlight 업로드 후가 매끄러움
    AdMob Console (Android 앱 "아보카도" 이미 등록됨, iOS만 신규)
    → 앱 추가 → 플랫폼 iOS → "App Store 등록됨? 예" → com.soksokvoca 검색
    - 배너 + 보상형 광고 단위 발급
    - EAS Secret 3종 등록 (Claude 명령): EXPO_PUBLIC_ADMOB_IOS_APP_ID/BANNER_ID/REWARDED_ID

B13. App Store Connect 앱 생성 + 메타데이터 입력 (30분, 본인)
    - 자산: store-assets/listing/ios-ko.md + ios-en.md 그대로 붙여넣기
    - 부제(30자)·키워드(100자)·홍보텍스트(170자)는 별도 칸
    - Support URL: https://eunjbaek12.github.io/NewSokSok/ (커밋 273d974로 라이브)
    - 개인정보 처리방침 URL: https://eunjbaek12.github.io/NewSokSok/privacy-policy
    - App Privacy 설문: ios-ko.md/ios-en.md의 표 참조 (IDFA "추적 사용=예", 그 외 No)
    - 스크린샷: store-assets/screenshots/final/ko/, final/en/ 그대로 사용 가능

B14. App Store Connect 구독 상품 등록 (Play Console과 동일 Product ID) (15분, 본인)
    - pro_monthly, pro_yearly 정확히 일치 (코드가 productId만 매칭)
    - 가격: Tier 2 (월 ~$2.99 ≈ ₩3,900) / Tier 19~20 (연 ~$27.99 ≈ ₩35,900)
    - App Store Connect → IAP → Pricing 매트릭스에서 KR Won 칼럼 확인하여 tier 선택
    - 같은 Subscription Group "SokSok Voca Pro"에 두 상품 등록
    - 7일 무료 체험

B15. iOS 결제 E2E 검증 (TestFlight 빌드에서) — Sandbox 환경 자동
    - 구독 결제 → finishTransaction → user_subscriptions 갱신 확인

B16. App Store 심사 제출 → 1~3일
```

### 🟢 트랙 C: 동시 출시 (둘 다 끝나면)

```
C1. Android 14일 시계 완료 + 프로덕션 트랙 승격 → 전 세계 국가 선택 → 심사 1~7일
C2. iOS App Store 심사 → 1~3일
C3. 둘 다 승인 받으면 동시 출시 발표
```

**홍보**: 티저 드립(Phase 1, 14일 테스트 기간) + 출시일 채널·커뮤니티 체크리스트(Phase 2)는 `docs/handoff-marketing-teasers.md` 참조.

---

## 3. 결제 관련 주의 (Android + iOS 공통)

**SKU / Product ID** — 코드가 매칭하는 건 **Product ID뿐**:
- Product ID = **`pro_monthly` / `pro_yearly`** 정확히 (Play Console·App Store Connect 양쪽 동일하게)
- Android: Base Plan ID는 `offerToken`으로 자동 처리 → 코드 무관
- iOS: subscription group 안 product ID로 매칭
- Product ID 오타 시 **verify에서 402 product_mismatch로 강등**
- 가격은 코드 하드코딩 없음 — 양 스토어 설정값을 `priceFor()`로 표시

**AdMob 테스트 ID는 임시** — 정식 출시 전 반드시 실 ID로 교체:
- Android: 트랙 A 진행 중에 AdMob 발급(Play 등록 후 매끄러움)
- iOS: 트랙 B11 TestFlight 업로드 후 AdMob 발급

**iOS verify-purchase 검증 차이**:
- Android: purchaseToken으로 Play Developer subscriptionsv2 호출
- iOS: JWS purchaseToken → transactionId 디코딩 → App Store Server API → production/sandbox fallback. originalTransactionId를 안정 키로 저장.

---

## 4. 환경 / 계정 메모

| 항목 | 값 |
|---|---|
| Expo/EAS 프로젝트 | `@baekeunjoeng/soksok-voca` |
| Expo projectId | `2d560de2-a41b-4ac1-a019-d287f7aaa2d6` |
| 패키지명·Bundle ID | `com.soksokvoca` (Android·iOS 공통, 변경 금지) |
| Firebase/GCP 프로젝트 | `avocado-491710` |
| Supabase 프로젝트 (프로덕션) | `ithqbclnwvyeultkyxbn` (Avocado) |
| Supabase URL | `https://ithqbclnwvyeultkyxbn.supabase.co` |
| Supabase OAuth callback (Apple 등록용) | `https://ithqbclnwvyeultkyxbn.supabase.co/auth/v1/callback` |
| 개인정보 처리방침 | https://eunjbaek12.github.io/NewSokSok/privacy-policy (ko/en 토글) |
| **앱 Support URL** | https://eunjbaek12.github.io/NewSokSok/ (ko/en 토글, 커밋 `273d974`로 라이브) |
| 앱 버전 | 1.1.0 (versionCode는 EAS 원격 관리, **최근 8**) |
| Play Developer 계정 | 가입 완료. **신규 개인계정 → 비공개 테스트 20명·14일 의무** |
| **Apple Developer 계정** | 2026-06-02 가입 신청. Team ID `74SA3LF88F`, Apple ID `mtgirltreeguy@gmail.com`. 본인 확인 1~2일 대기 |
| **사업자등록증** | 2026-06-02 발급. 사업자번호 `215-29-02111`, 상호 `산녀와 나무꾼`, 대표 `김호성`. 개인사업자, 간이과세, 525101+642004, 자택(대전 유성구 와룡로 206, 105동 2103호) |
| **통신판매업 신고** | 2026-06-03 정부24 접수. 호스트서버 소재지=AWS Korea(GS타워) 우회. 등록면허세 납부 대기, 신고증 발급 후 신고번호 확정 |
| **Store listing 자산 위치** | `store-assets/listing/ko.md`·`en.md` (Play Console) + `ios-ko.md`·`ios-en.md` (App Store Connect). 모두 v1.1 정책 반영 완료 |

---

## 5. AdMob 광고 단위 발급 현황

**Android**: ✅ 실 ID 등록 완료 (2026-06-03) — publisher `2552217172819688`
- APP_ID `ca-app-pub-2552217172819688~7571600348`
- BANNER `ca-app-pub-2552217172819688/1006191991`
- REWARDED `ca-app-pub-2552217172819688/9960062757`
- EAS Secret `EXPO_PUBLIC_ADMOB_ANDROID_*` 3종 교체 완료
- ✅ **AdMob 계정 정식 승인 완료 (2026-06-03 승인 메일 수신)** — 광고 단위는 승인 전에도 발급되나 계정 활성화 전엔 실 광고 미송출. 이제 실 광고 송출 가능 상태. (ID는 이미 등록됨 → 추가 발급/등록 작업 없음. 남은 건 vCode 9 빌드뿐)
- ⚠️ vCode 8 빌드는 옛 테스트 ID로 굽힘. **vCode 9 새 빌드부터 실 ID 반영** — 비공개 테스트엔 vCode 8로 OK, 프로덕션 승격 전 vCode 9 필수

**iOS**: 🟡 미등록 — TestFlight 업로드(트랙 B11) 후 B12에서 추가
- AdMob 콘솔에서 "App Store 등록됨? 예" → com.soksokvoca 검색 흐름이 정공법
- 미리 만들면 IDFA 통계 분리·재검증 등 부작용 가능 → 권장하지 않음

---

## 6. 알려진 이슈

- **fingerprint 우회**: 재빌드 시 `EAS_SKIP_AUTO_FINGERPRINT=1` 필요 (`@expo/fingerprint`의 brace-expansion 해소 버그). 근본 해결은 pnpm overrides `brace-expansion: "^4.0.0"`, 출시 후로 미뤄도 무방.
- **OneDrive 간섭**: 로컬 빌드/`expo prebuild`/`pnpm add` 실패 → EAS 클라우드 빌드 사용. `pnpm install`도 한 번 ENOENT 실패 → 재시도면 통과.
- **EAS 빌드 시 정보성 경고**(정상): SECRET 가시성으로 env 목록 안 보임, `googleServicesFile not checked in`, versionCode 자동 증가.
- **expo-image-manipulator 미복원**: 2026-05-28 임시 제거 상태. 다음 빌드 시 복원 권장 — `package.json` `"expo-image-manipulator": "~14.0.7"` 추가 + `PhotoImportWorkflow.tsx` 복원(커밋 `89bbb92` 참조). 미복원 영향: 사진 OCR 페이로드 +500KB~1MB (체감 1초).
- **R8/난독화 매핑 누락 경고** (Play Console): 차단 X, 크래시 분석 어려움. v1.2 검토.
- **Google Service Account (eas submit) 미등록**: 자동 업로드 불가, 수동 업로드로 우회 중. 다음 빌드 전 등록하면 편함.

---

## 7. 최근 갱신 (변경 로그)

**2026-06-03 세션 진척:**
- 정부24 통신판매업 신고 접수 (§1B, §2 A2 완료) — 신고증 발급 대기
- AdMob Android 실 ID → EAS Secret 3종 교체 (§5)
- AdMob 계정 정식 승인 메일 수신 → 실 광고 송출 가능 (§5). 추가 작업 없음, vCode 9 빌드 시 반영
- `store-assets/listing/ko.md`·`en.md` v1.1 정책 반영 (광고/IAP 사용함, 한국 법규 필드 추가)
- `store-assets/listing/ios-ko.md`·`ios-en.md` 신규 — App Store Connect 전용 자산 (부제·키워드·홍보텍스트·IAP Tier 매핑·App Privacy 설문·심사 노트)
- `docs/index.html` 신규 — Apple Review Guideline 1.5 Support URL 충족 (커밋 `273d974`)
- ES 언어 지원 검증 — `constants/languages.ts`에 6종 + TTS 매핑 확인. "6개 언어" 클레임 정확

**다음 세션 진입 시 즉시 확인할 외부 상태:**
1. 등록면허세 고지서 도착 여부 (이메일/SMS)
2. 통신판매업 신고증 발급 여부 (정부24 마이페이지)
3. Apple Developer 활성화 여부 (developer.apple.com 로그인)
4. Apple Developer 활성화 시 → 트랙 B1~B5 본인 작업 (App ID·Service ID·Keys·OAuth) 즉시 시작 가능
