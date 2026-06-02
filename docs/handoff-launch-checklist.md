# 출시 마스터 체크리스트 (Play Store + App Store v1.1)

**이 문서가 출시까지 남은 작업의 단일 기준(master)이다.** 2026-06-02 기준 갱신.

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

## 1. 현재 상태 (2026-06-02)

### ✅ (A) CLI로 검증된 사실
| 항목 | 검증 |
|---|---|
| v1.1 코드 (구독·결제·quota·광고) | 레포 |
| **iOS 코드 작업 완료** | Sign in with Apple·verify-purchase iOS 분기·ATT 다국어 plugin (커밋 `43974c7`·`66a4669`·`edded1b`·`5afa697`) |
| **isReal 할루시네이션 차단** | enrich-word 재배포, PROMPT_VERSION 2 (커밋 `a8ca6e4`) |
| **개인정보 처리방침 ko/en** | 토글 + URL `?lang=en` (커밋 `4c10bf8`) |
| 구독 시스템 테스트 101케이스 (①②③) | Jest + 원격 pgTAP 통과, main 머지 (PR #2/#3/#4) |
| verify-purchase Edge **배포 v3** (Android만) | `supabase functions list` (ACTIVE) — 2026-05-26. iOS 분기 추가분은 **미배포** |
| Edge Secret: `PLAY_SA_*`·`ANDROID_PACKAGE_NAME`·`VERTEX_*` | `supabase secrets list` |
| EAS Secret: Supabase URL/ANON_KEY·`GOOGLE_CLIENT_ID`·`GOOGLE_SERVICES_JSON` | `eas secret:list` |
| EAS Secret: `EXPO_PUBLIC_ADMOB_ANDROID_*` | **테스트 ID 임시 등록**(2026-05-26) — 빌드 가드 통과용 |
| 코드 SKU 정합성 (`pro_monthly`/`pro_yearly`) | `lib/billing/skus.ts` 점검 |
| **최근 production 빌드: versionCode 8** | 2026-06-01, Build `340f2ce3-b6fd-4ab6-a449-f44e71eb54d5`, AAB https://expo.dev/artifacts/eas/7qRtPuVX3UbHWEfif5MdAH.aab |
| **사업자등록증 발급 완료** | 2026-06-02. 주업종 525101(전자상거래 소매업) + 642004(SW), 간이과세, 자택(대전 유성구) |

### 🟡 (B) 사용자 구두 확인
| 항목 | 비고 |
|---|---|
| Play Console **구독 상품 등록·활성화** (`pro_monthly`/`pro_yearly` + 7일 체험) | Product ID 정확성은 첫 결제 E2E에서 최종 확정 |
| Play Console **정책 폼** (광고·데이터보안·콘텐츠등급) | v1.0 → v1.1 변경 항목(광고 ID=사용함, 데이터보안 광고/구매 추가, 콘텐츠등급 재답변)은 한국 법규 폼 통과 후 동시 처리 예정 |
| Supabase 마이그레이션 remote 적용 / Android OAuth SHA-1 등록 | 2026-05-25 검증 |
| **AAB versionCode 8 Play Console 수동 업로드 완료** | 2026-06-01. 한국 법규 추가정보 요구로 비공개 테스트 검토 **차단 상태** |
| **테스터 20명 모집 완료** | 2026-05-26 사용자 확인 |

### ❌ (D) 현재 차단·대기 중
| 항목 | 해결 조건 |
|---|---|
| **Play 비공개 테스트 검토** | 한국 법규 3항목(사업자등록번호 + 통신판매업 신고번호 + 신고 지자체) 입력 필요. 통신판매업 신고번호 받기 전까지 차단 |
| **통신판매업 신고** | 사업자등록증은 발급 완료 → 정부24 신고 가능. 처리 3영업일 |
| **Apple Developer Program** | 2026-06-02 가입 신청, 본인 확인 1~2일 대기 중. Team ID `74SA3LF88F`, Apple ID `mtgirltreeguy@gmail.com` |
| **AdMob 실 ID** | Play Store 등록(내부 테스트라도) 후 발급 매끄러움. 미발급 — 현재 테스트 ID로 빌드 가드 통과 중 |
| **Google Service Account 키 (eas submit)** | 미등록 — 현재 AAB 업로드는 수동. 다음 빌드 전까지 미루기 OK |

---

## 2. 다음 세션 실행 순서 (2026-06-02 이후)

### 🔴 트랙 A: Android 한국 법규 풀기 (병목 1)

```
A1. 양식 2개 PDF 작성 (15분, 본인)
    - 다운로드 폴더의 HWP 2개:
      ① [별지 제1호서식] 통신판매업 신고서
      ② 구매안전서비스 비적용 대상 확인서
    - 사업자등록번호 등 채우기 → 본인 서명/날인 → PDF 저장
    - 비적용 사유 체크 3개: 신용카드·정보통신망 전송 디지털·분할공급(구독)
    - 취급품목 "기타 → 어플리케이션"
    - 수신 "대전광역시 유성구청장 귀하"

A2. 정부24 통신판매업 신고 (15분, 본인 + 3영업일 대기)
    https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=11300000006
    - 첨부: 사업자등록증 PDF + 비적용 대상 확인서 PDF
    - 등록면허세 4~8만원 (지자체별)
    - 처리 3영업일

A3. 신고번호 받음 → Play Console 한국 법규 입력 (10분, 본인)
    - 사업자 등록 번호: 발급받은 10자리
    - 전자상거래 라이선스 번호: 통신판매업 신고번호
    - 전자상거래 라이선스 대행사: "대전광역시 유성구청"

A4. Play Console 폼 재답변 (v1.0 → v1.1 변경) (15분, 본인)
    - 광고 ID 선언: "사용 안 함" → "사용함"
    - 데이터 보안: 광고 ID + 거래 정보 추가
    - 콘텐츠 등급: "디지털 구매=예", "광고=예" 재답변
    - 답변지: store-assets/compliance/

A5. 비공개 테스트 검토 재시도 → 통과 → 14일 시계 시작 (검토 1~3일)
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
    AdMob Console → 앱 추가 → 플랫폼 iOS → "App Store 등록됨? 예" → com.soksokvoca 검색
    - 배너 + 보상형 광고 단위 발급
    - EAS Secret 3종 등록 (Claude 명령)

B13. App Store Connect 구독 상품 등록 (Play Console과 동일 Product ID) (15분, 본인)
    - pro_monthly, pro_yearly 정확히 일치 (코드가 productId만 매칭)
    - 가격: 월 ₩3,900 / 연 ₩35,900
    - 7일 무료 체험

B14. iOS 결제 E2E 검증 (TestFlight 빌드에서) — Sandbox 환경 자동
    - 구독 결제 → finishTransaction → user_subscriptions 갱신 확인

B15. App Store 심사 제출 → 1~3일
```

### 🟢 트랙 C: 동시 출시 (둘 다 끝나면)

```
C1. Android 14일 시계 완료 + 프로덕션 트랙 승격 → 전 세계 국가 선택 → 심사 1~7일
C2. iOS App Store 심사 → 1~3일
C3. 둘 다 승인 받으면 동시 출시 발표
```

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
| 앱 버전 | 1.1.0 (versionCode는 EAS 원격 관리, **최근 8**) |
| Play Developer 계정 | 가입 완료. **신규 개인계정 → 비공개 테스트 20명·14일 의무** |
| **Apple Developer 계정** | 2026-06-02 가입 신청. Team ID `74SA3LF88F`, Apple ID `mtgirltreeguy@gmail.com`. 본인 확인 1~2일 대기 |
| **사업자등록증** | 2026-06-02 발급. 개인사업자, 간이과세, 525101+642004, 자택(대전 유성구) |

---

## 5. AdMob 광고 단위 발급 여부 확인법

[admob.google.com](https://admob.google.com) → 앱(Apps):
- 앱 목록에 `아보카도`/`com.soksokvoca` **없으면** → 미발급
- 있으면 → 광고 단위(Ad units)에서 배너·보상형 단위 확인
- **ID 앞부분으로 테스트/실 구분**: `ca-app-pub-`**`3940256099942544`**`...` = Google 테스트 ID(현재 등록된 것) / **다른 숫자** = 본인 실 ID

실 ID가 있으면 알려주면 EAS Secret을 `--force`로 교체. 없으면 트랙 A·B 빌드 후 발급.

---

## 6. 알려진 이슈

- **fingerprint 우회**: 재빌드 시 `EAS_SKIP_AUTO_FINGERPRINT=1` 필요 (`@expo/fingerprint`의 brace-expansion 해소 버그). 근본 해결은 pnpm overrides `brace-expansion: "^4.0.0"`, 출시 후로 미뤄도 무방.
- **OneDrive 간섭**: 로컬 빌드/`expo prebuild`/`pnpm add` 실패 → EAS 클라우드 빌드 사용. `pnpm install`도 한 번 ENOENT 실패 → 재시도면 통과.
- **EAS 빌드 시 정보성 경고**(정상): SECRET 가시성으로 env 목록 안 보임, `googleServicesFile not checked in`, versionCode 자동 증가.
- **expo-image-manipulator 미복원**: 2026-05-28 임시 제거 상태. 다음 빌드 시 복원 권장 — `package.json` `"expo-image-manipulator": "~14.0.7"` 추가 + `PhotoImportWorkflow.tsx` 복원(커밋 `89bbb92` 참조). 미복원 영향: 사진 OCR 페이로드 +500KB~1MB (체감 1초).
- **R8/난독화 매핑 누락 경고** (Play Console): 차단 X, 크래시 분석 어려움. v1.2 검토.
- **Google Service Account (eas submit) 미등록**: 자동 업로드 불가, 수동 업로드로 우회 중. 다음 빌드 전 등록하면 편함.
