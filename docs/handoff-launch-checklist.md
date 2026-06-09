# 출시 마스터 체크리스트 (Play Store + App Store v1.1)

**이 문서가 출시까지 남은 작업의 단일 기준(master)이다.** 2026-06-05 기준 갱신.

> ⚠️ **문서 신뢰도 주의**: 기존 handoff 문서·자동 메모가 시점별로 작성돼 서로 **상충**한다.
> 본 문서 §1의 (A)·(B)·(C) 분류가 가장 최신·정확.
>
> **출시 전략 변경 (2026-06-02)**: "한국 first"(v1.2 글로벌)는 **폐기**, **전 세계 동시 출시**로 결정.
> 비공개 테스트는 한국 트랙으로 진행하고 프로덕션 승격 시 전 국가 선택. iOS도 동시 출시 결정.
>
> **출시 전략 재변경 (2026-06-07)**: "동시 출시" → **iOS 소프트 런치 선행**으로 결정. 근거: 두 플랫폼 임계경로가 비대칭 —
> iOS는 아이폰 확보 후 build 4 실기 검증 + iOS 스크린샷 재촬영 + 재제출 → 심사 1~3일이면 ~1주 내 승인 가능한 반면,
> Android는 신규 개인계정 의무 비공개 테스트(20명·14일)가 하드 게이트라 등록면허세·신고증 관료절차까지 최소 ~3주.
> "승인"과 "공개 출시"는 분리돼 있으므로(App Store=수동 출시 보류 / Play=관리형 게시), 둘 다 승인까지 병렬로 밀되
> **먼저 깨끗이 승인되는 쪽(현재 iOS 유력)을 먼저 공개**한다. 한국은 Android ~70%라 iOS는 작은 모집단 →
> 결제 E2E(B15 미완)·크래시·구독 갱신 등 **공통 백엔드 로직을 적은 사용자에서 먼저 검증**하고 Android 대규모 출시 전 수정.
> ⚠️ iOS 클린 ≠ Android 안전: Android 전용(Play Developer API 결제·R8 난독화·기기 파편화)은 14일 비공개 테스트에서 별도 검증 필수.
> 인디 앱 "동시 출시"의 마케팅 효과는 미미해 상징성 대비 소프트 런치의 학습 가치가 큼.

---

## 🟢 2026-06-10 최신 상태 — 다음 세션은 여기부터 읽어라

**✅ build 11(커밋 `26bdc94`) 실기 테스트 통과 → App Store 심사 제출 완료(2026-06-10, "심사 대기 중"). build 8 이후 빌링·UI 코드 커밋 6개 포함. 결제 E2E는 6/9 sandbox fallback 수정으로 verify→tier=pro 실측 통과. 남은 건 심사 결과(1~3일) 대기.**

> 🟢 **build 11이 최신·테스트 대상 (06-10)**: build 8(`e89f234`) 이후 코드 커밋 6개 —
> ① `26bdc94` Pro 구독화면 결제주기(월간/연간)+"~까지 이용" 종료일 표시
> ② `6fd62a4` iOS sandbox verify 401 fallback (결제 E2E 수정, [[project_ios_sandbox_verify_401]])
> ③ `5e175ac` AI 생성 단어 태그(#중급·#AI생성) UI 언어로 표시
> ④ `ce499de` 정의 라벨 출처 언어별 표시(영영/일일 등)
> ⑤ `3aa34e9` iOS 모달 안 picker 미표시 + 설정 적용 후 화면 멈춤 해소 ([[project_nested_modal_ios]])
> ⑥ `969f7e5` 입력 모달 키보드 dismiss + AI 생성 언어 드롭다운 ([[project_dialogmodal_scrollable_keyboard]])
> 빌드↔커밋 매핑(EAS 기록): build 9 = `969f7e5`(입력모달), build 10 = `3aa34e9`(모달 picker), **build 11 = `26bdc94`(빌링화면, HEAD) — 위 6개 전부 포함**. IPA `afhPm3og9ToLnJ6h7pVmCm`, Build ID `4ae1062d`, finished 06-10 04:01. ⚠️교훈 재확인: 빌드 직후 buildNumber↔커밋 해시를 즉시 문서에 박을 것(build 6 함정 방지).

### ✅ build 11 실기 검증 체크리스트 (다음 세션 즉시)

**A. 이번 빌드 신규 (실기 검증 0회):**
1. **빌링 화면**(`26bdc94`) — Pro 월간/연간 + "YYYY.MM.DD까지 이용" 정확, 트라이얼은 "체험 D-N", `play_product_id` 병렬조회가 RLS에 안 막히고 로드되는지(값 비면 조용히 실패)
2. **AI 단어 태그**(`5e175ac`) — #중급·#AI생성이 UI 언어로 표시(영어 UI면 영어)
3. **정의 라벨**(`ce499de`) — 출처 언어별(영영/일일/중중) 정확
4. **모달 picker**(`3aa34e9`) — iOS 모달 안 언어 picker 표시 + 설정 적용 후 화면 안 멈춤
5. **입력 모달**(`969f7e5`) — 키보드 배경탭 dismiss + AI 생성 언어 드롭다운 표시

**B. 결제 E2E 회귀**(`6fd62a4`, 6/9 통과) — 샌드박스 구매→verify→tier=pro→종료일 표시→Restore(복원)

**C. build 8부터 이월 (어느 빌드에서도 실기 검증 기록 없음):**
- 로그인 3종(Google/Apple/게스트)→홈
- Apple 동등성(무료검색·설정 동기화 배지) [[project_apple_login_cloud_parity]]
- Apple "이메일 가리기" 케이스 — 릴레이 이메일이라 기존 Google과 별개 user_id로 갈라지는지 [[project_supabase_identity_autolink]]
- TTS 무음 스위치에서 소리남 [[project_ios_tts_silent_switch]]
- 홈 필터칩 안 잘림 / 스플래시 양옆 안 잘림

**D. ✅ build 11 App Store 심사 제출 완료 (2026-06-10, "심사 대기 중"). 심사 1~3일 → 승인 시 트랙 C대로 보류 없이 즉시 공개(iOS 소프트 런치). 반려 시 사유 캡처 → 수정 후 재제출.**

---

## (이전 기록) 2026-06-08 build 8 — 히스토리 보존

**iOS 1차 반려(2.1a/2.3.10) 수정 완료 + 결제 설정 100% 완료. build 8 제출 완료(ASC 처리 중) → 실기 검증 → App Store 재제출.**

> 🟢 **build 8이 최신·심사 대상 (06-08 후속2 세션)**: build 7(`7ed51e3`) 이후 **요금제 가격 통화 버그 수정**(`e40e72f`) + 배너 진단(`e89f234`)이 추가됨. **반드시 build 8(커밋 `e89f234`)로 심사 제출** — build 7엔 가격 수정이 없어 통화 섞인 화면(₩블록+$CTA) 그대로 나감. build 8 = Build ID `d96ce297`, buildNumber 8, IPA `sRdHpCdjWps5E1wv3HmM6d`, submission `aa867fe6`. `Submitted to App Store Connect!` 확인, Apple 처리 중. 사전검증 Jest 308·TSC 클린·lint 클린.

> 🔴 **build 6 함정 정정 (06-08 후속 세션)**: 이전 기록의 "build 6에 모든 코드 수정 포함"은 **틀렸음**. build 6은 14:59 트리거됐는데 핵심 수정 커밋들(`b745542` Apple 동등성·`c01222b` restore·`e8583d5` 스플래시·`274d357` 칩·`f7da488` TTS·`c76ae9b` Android lazy-require)은 15:02~15:10에 커밋됨 → **build 6 = build 5 (둘 다 `212adc1`), 수정 전부 누락**. 게다가 build 6은 ASC 제출까지 안 돼 TestFlight에 build 5만 떴음. → **build 7로 재빌드**(커밋 `7ed51e3`, 모든 수정 + `ITSAppUsesNonExemptEncryption:false`). `Submitted to App Store Connect!` 확인, Apple 처리 중. **교훈: 빌드 트리거 전에 커밋 먼저.**

**이번 세션(06-08) 한 일:**
- **iOS Google 로그인 3겹 차단 전부 해소 → 실기 로그인 성공(Google/Apple/게스트):**
  1. Info.plist reversed-client URL scheme 누락 → `app.config.js`에서 주입 (커밋 `212adc1`)
  2. Supabase Google provider **Client IDs**에 iOS client ID(`...257n6iof...`) 추가
  3. Supabase Google provider **"Skip nonce checks" ON** — iOS google-signin이 idToken에 nonce 자동주입 → `AuthApiError 400 nonce mismatch`였음 (진단빌드 5로 원인 포착)
- **2.3.10 스크린샷 해소:** Android 크롬 제거 합성본 **6.9"(1290×2796)·6.5"(1284×2778) 5종** ASC 업로드 완료. 원본 `assets/marketing/appstore-screenshots/`(gitignored)
- **Apple 로그인 클라우드 동등성 버그 수정**(커밋 `b745542`) — `=== 'google'` 산재 검사로 Apple 사용자가 게스트 취급(동기화 안 됨→로그아웃 데이터 유실·무료AI/사진스캔/공유 차단)되던 것 `isCloudAuthMode`로 12파일 일괄 수정. [[project_apple_login_cloud_parity]]
- 추가 수정: 빌링 restore(expo-iap 3.4 getAvailablePurchases void → root API) `c01222b` · 스플래시 cover→contain `e8583d5` · 홈 필터칩 flexWrap `274d357` · TTS 무음스위치 playsInSilentMode(expo-audio) `f7da488`
- **결제 설정 완료:** 유료 앱 계약 **활성화됨** · 구독 `pro_monthly`/`pro_yearly` 메타데이터+심사스크린샷 완료(제출 준비) · W-8BEN 2종 활성 · 한국세금/은행(우리은행) 제출(처리됨) · DSA 거래자 신고+문서 제출(**심사 중**) · Supabase APPLE_* 4종 확인
- ~~build 6 (buildNumber 6) 빌드+자동제출~~ — **실패/무의미**(위 정정 박스 참조: 수정 누락 + ASC 미제출)
- **build 7 (buildNumber 7, v1.1.0, 커밋 `7ed51e3`) 빌드+자동제출 성공** — 모든 코드 수정 + 암호화 면제 플래그 포함. Build ID `4461f0b1`, submission `aab8d2a6`, IPA `9rLcmXKowPV9yvjhfbe1kR`. **`Submitted to App Store Connect!` 확인 → Apple 처리 중(5~10분)**. 사전검증: Jest 300/300, TSC 에러 4건 전부 빌드 무관(Android 가드/dev 스크립트/Deno)
- **암호화 면제 플래그 추가**(커밋 `7ed51e3`) — `app.json` ios.infoPlist `ITSAppUsesNonExemptEncryption:false`. HTTPS/Keychain/OAuth 표준 암호화만 사용 → 면제 정확. 제출마다 뜨는 수출 컴플라이언스 질문 제거
- **요금제 가격 통화 일관화**(커밋 `e40e72f`) — 가격블록·서브CTA가 하드코딩 ₩, 메인CTA만 실시간 → US 스토어프론트에서 한 화면에 ₩+$ 혼재. pricing.ts(Intl 런타임 월환산·절약%)+priceDetailFor로 단일 출처화. terms/FAQ prose의 ₩·"Google Play"도 Platform분기. **달러 표시 자체는 버그 아님**(테스트 Apple ID가 US 스토어프론트 — KR 계정은 ₩). 기존 billing 타입에러 4건도 정리
- **iOS 배너 no-fill 조사 종결** — 빈 배너는 코드 아님, AdMob "광고 게재 제한됨"(스토어 미연결). 출시 후 "스토어 추가"로 해제. 진단 오버레이 `EXPO_PUBLIC_AD_DEBUG=1`(커밋 `e89f234`) 마련. [[project_admob_serving_limited_prelaunch]]
- **build 8 (buildNumber 8, 커밋 `e89f234`) 빌드+자동제출 성공** — 위 가격수정 포함. Build ID `d96ce297`, IPA `sRdHpCdjWps5E1wv3HmM6d`. Apple 처리 중. ⚠️eas.json submit.ios 블록은 빌드용 복원 후 `git checkout`으로 커밋상태(`{}`) 복원함 — 트리 클린

**다음 세션 즉시 할 일:**
1. **build 8 TestFlight 처리 완료 확인** (5~10분, Apple 이메일) → https://appstoreconnect.apple.com/apps/6776714408/testflight/ios 에 **build 8** 뜨는지
2. **build 8 실기 테스트(아이폰)** — ① 로그인 3종→홈 ② **Apple 로그인 시 무료검색·설정 동기화 배지**(동등성 검증) ③ 홈 필터칩 안 잘림 ④ 스플래시 양옆 안 잘림 ⑤ TTS 무음스위치에서 소리남 ⑥ **플랜→가격: KR Apple ID는 ₩ 일관 표시·월환산/절약% 정상→샌드박스 구매→Pro 전환→구매 복원(Restore)** ⑦ **Apple 로그인 "이메일 가리기(Hide My Email)" 켠 케이스** — 릴레이 이메일(`@privaterelay.appleid.com`)이라 기존 Google과 **별개 user_id 생성→데이터 갈라짐**. 같은 사람인데 빈 계정처럼 보이는지 확인. 치명적 판단 시 v1.2 account-linking 안내로 보완. [[project_supabase_identity_autolink]]
3. 전부 OK → **App Store 심사 재제출 (반드시 build 8 선택, 스크린샷 이미 반영됨)**
4. DSA 거래자 검증 결과 확인(심사 중) — EU 제품페이지 표시용, 결제/심사 차단은 아님

⚠️ 결제 실기 테스트 전 유료 앱 계약 "활성화됨" 유지 + 은행/한국세금 "처리 중→활성" 확정 확인.
⚠️ `eas.json submit.production.ios`는 개인 .p8 절대경로라 **커밋 금지**(미커밋 상태 유지). docs 노트(`handoff-*.md`)·`break-even-calculator.html`도 이번 커밋에서 제외함.

---

관련 상세 문서:
- `handoff-monetization-setup.md` — GCP/Vertex·AdMob·Play 구독 등록 상세 절차
- `handoff-play-console-setup.md` — Play Console 앱 등록·트랙·OAuth SHA-1
- `handoff-subscription-testing.md` — 결제 테스트 전략 + ④ 결제 E2E 체크리스트
- `handoff-v1.1-progress.md` — v1.1 구현 상세 (구버전 진행 기록, 상태는 본 문서가 우선)
- `handoff-play-release.md` — v1.0 출시 기록 (구버전, 환경/계정 메모만 유효)
- `supabase/functions/verify-purchase/README.md` — Android + iOS 영수증 검증 (Apple secret 4종 발급 절차)

---

## 1. 현재 상태 (2026-06-05)

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
| **Google Service Account 키 (eas submit)** | 미등록 — 현재 AAB 업로드는 수동. vCode 9 빌드 전 등록하면 편함 (선택) |
| **iOS App Store 심사** | 2026-06-05 제출, "심사 대기 중"(1~3일). 승인 시 수동 출시로 보류(Android와 동시) / 리젝 시 사유 확인 후 재제출 |

---

## 2. 다음 세션 실행 순서 (2026-06-03 이후)

> **세션 진입 시 우선 확인할 외부 상태 3가지** (이메일/정부24/App Store Connect 체크):
> 1. **iOS 심사 결과?** (제출 2026-06-05, 1~3일) → **승인** 시 "개발자 출시 대기"로 보류(수동 출시 선택했음 — Android와 동시 출시 위해 버튼 안 누름) / **리젝** 시 사유 캡처 → 수정 후 재제출
> 2. **등록면허세 고지서 도착?** → 도착 시 트랙 A의 A2.5로
> 3. **통신판매업 신고증 발급?** (납부 후 1~3일) → 발급 시 A3·A4로
>
> ✅ **트랙 B(iOS) 전체 완료 (2026-06-05)** — App Store 심사 제출, "심사 대기 중". 이제 **트랙 A(Android)가 유일한 병목**. 둘 다 승인되면 트랙 C 동시 출시. (Team ID `4XZS542GQP`)

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

### 🟢 트랙 B: iOS — ✅ 완료 (2026-06-05, App Store 심사 제출 "심사 대기 중")

B1~B16 전부 완료. 아래는 작업 기록(다음 세션 참고용). **남은 건 심사 결과 대기 + B15 결제 E2E(미완)**. 아래 산출물·완료 내역 참고:

**수집된 산출물 (B6~B9에서 사용):**
| 항목 | 값 | 비고 |
|---|---|---|
| App ID (B1) | `com.soksokvoca` | Sign In with Apple capability 켜짐 |
| Service ID (B2) | `com.soksokvoca.signin` | Primary App ID `com.soksokvoca`, Return URL Supabase callback |
| **Sign In with Apple Key ID** (B3) | `58639QRP54` | `.p8` 사용자 로컬 보관 → B8 Supabase `APPLE_PRIVATE_KEY`용은 아님(이건 Sign in OAuth용, B6에서 Supabase Apple Provider에 입력) |
| **App Store Connect API Key ID** (B4) | `6VRBZPDM3P` | verify-purchase용 → Supabase Secret `APPLE_KEY_ID` |
| **App Store Connect Issuer ID** (B4) | `7c5b502b-e95e-4f15-a05a-8ac973136f03` | Supabase Secret `APPLE_ISSUER_ID` |
| iOS OAuth Client ID (B5) | `172087024533-257n6iofivcvsf3le82cld42m2s8hj1f.apps.googleusercontent.com` | EAS Secret `EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS` |

✅ **B6~B9 완료 (2026-06-05)**:
- **B6** Apple Provider Client IDs `com.soksokvoca,com.soksokvoca.signin` 설정 (네이티브 흐름 → Secret Key 불필요, store.ts:240-258 signInWithIdToken 확인)
- **B7** EAS Secret `EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS` 등록
- **B8** Supabase Secret `APPLE_KEY_ID`(6VRBZPDM3P)·`APPLE_ISSUER_ID`·`APPLE_BUNDLE_ID`·`APPLE_PRIVATE_KEY`(B4 `.p8`) 4종 등록 — `apple-auth.ts:82`가 `\n`/실제개행 모두 정규화하므로 PEM 원문 OK
- **B9** `verify-purchase` 재배포 — iOS 분기(apple-storekit/apple-auth) ACTIVE

⚠️ `.p8` 2개·sb-token.txt는 `OneDrive\바탕 화면\Avocado\`에 보관. B3 `.p8`(58639QRP54)은 네이티브 흐름이라 미사용(웹 OAuth 추가 시).

- **B10** iOS 빌드 성공 — `withLocalizedATT` plugin 경로 버그 수정(커밋 `5a135e9`: InfoPlist.strings를 `ios/<projectName>/` → `ios/` 루트 생성, XCODE_BUILD_ERROR 해소) 후 통과. Build `f455a21b`, buildNumber 2, `EAS_SKIP_AUTO_FINGERPRINT=1`.
- **B11** TestFlight 업로드 — `eas submit` 성공(submission `10af2157`). eas.json `submit.production.ios`에 ascApiKey 3종 + `ascAppId: 6776714408` 설정. ⚠️ **이 설정은 로컬 전용 — 커밋 금지**(개인 절대경로 `OneDrive/바탕 화면/Avocado/AuthKey_6VRBZPDM3P.p8` 포함). Apple 빌드 처리 중.

**Team ID 정정 (2026-06-05):** 빌드 자격증명 기준 실제 Team ID = **`4XZS542GQP`** (HOSEONG KIM Individual). 기존 `74SA3LF88F`는 오기 → 체크리스트·메모 전부 수정.

✅ **B12~B16 완료 + iOS 심사 제출 (2026-06-05)**:
- **B12** AdMob iOS 실 ID 교체 (APP `~2860788000`·BANNER `/5454631522`·REWARDED `/7697651484`)
- **B13** 메타데이터(설명 등 — ▸·↔·★ 특수문자는 App Store가 거부해 `•`/`-`로 치환) + 스크린샷 7장(안드로이드 네비바 크림색 덮기 → 1242×2688 24bpp 변환, 05-add-word는 목업 구조 달라 제외). App Privacy(IDFA만 추적=예)·연령등급 4+·콘텐츠권한 완료
- **B14** 구독 `pro_monthly`(미국 $2.99 기준+한국 ₩3,900)·`pro_yearly`(미국 $27.99+한국 ₩35,900) + 7일 무료체험(=1주). ascAppId `6776714408`
- **실 AdMob 재빌드** buildNumber 3 (`901c6ca0`) → TestFlight 업로드(submission `3a9482e0`)
- **B16 심사 제출 완료 → "심사 대기 중"** (심사 1~3일)

⚠️ **B15 결제 E2E(TestFlight sandbox) 미완** — 심사 통과 후/출시 전 구독 결제→user_subscriptions 갱신 검증 권장.
⚠️ **eas.json `submit.production.ios` 설정은 로컬 전용 — 커밋 금지** (개인 .p8 절대경로 `OneDrive/바탕 화면/Avocado/AuthKey_6VRBZPDM3P.p8` 포함).
⚠️ **iOS 스크린샷은 안드로이드 캡처 변환본(임시)** — 사용자가 출시 후 iOS 실기기로 재촬영 예정. 영어 스크린샷은 한국어 7장이 모든 로케일 공용이라 불필요.
💡 다음 빌드 전 `app.json`에 `ITSAppUsesNonExemptEncryption: false` 넣으면 빌드마다 뜨는 암호화 질문 제거.

**남은 작업:** iOS 심사 결과 대기(1~3일) + Android 통신판매업 신고증 대기 → 둘 다 승인 시 트랙 C 동시 출시.


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
    - Team ID: 4XZS542GQP
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

### 🟢 트랙 C: iOS 소프트 런치 선행 (전략 재변경 2026-06-07)

```
C1. iOS 먼저 — build 4 실기 검증(아이폰) → iOS 스크린샷 재촬영(2.3.10) → 재빌드/재제출 → 심사 1~3일
    → 승인 시 즉시 공개(보류 안 함). 소프트 런치.
C2. iOS 출시 후 집중 관찰:
    - 결제 E2E(B15 미완): 구독→finishTransaction→user_subscriptions 갱신, JWS production/sandbox fallback (verify-purchase 로그)
    - 크래시: iOS26 ClassicTabLayout 회피 안정성, 기기/OS 파편화
    - AI quota(Free 100/일·KST 리셋)·실 AdMob 송출(buildNumber 3 실 ID)
    - Google + Apple 로그인 production 동작
C3. Android — 14일 시계 완료 + 프로덕션 승격 → 전 세계 국가 선택 → 심사 1~7일.
    iOS 소프트 런치에서 잡은 공통 백엔드 버그 수정 반영한 vCode 9로 출시.
    ⚠️ Android 전용(Play 결제·R8·기기 파편화)은 iOS에서 검증 안 됨 — 비공개 테스트에서 별도 확인.
```

**유연성**: "iOS 무조건 먼저"로 못 박지 말 것. iOS 재심사가 또 막힐 수 있으니(이미 1차 반려) **먼저 깨끗이 승인되는 쪽을 먼저 공개**. 두 트랙은 독립(Android 병목=관료절차, iOS=재심사)이라 서로 발목 안 잡음.

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
| **Apple Developer 계정** | ✅ **활성화 완료 (2026-06-04)**. Team ID `4XZS542GQP`, Apple ID `mtgirltreeguy@gmail.com` |
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

**iOS**: ✅ **실 ID 등록 완료 (2026-06-05)** — publisher `2552217172819688`
- APP_ID `ca-app-pub-2552217172819688~2860788000`
- BANNER `ca-app-pub-2552217172819688/5454631522`
- REWARDED `ca-app-pub-2552217172819688/7697651484`
- EAS Secret 3종 `--force` 교체 완료 (테스트 ID → 실 ID). 보상 수량은 코드 `grant_rewarded_bonus` RPC가 고정 +50 지급 → AdMob 콘솔 reward 값 무관.
- ⚠️ **현재 TestFlight 빌드(buildNumber 2)는 테스트 AdMob ID로 구움** — 심사 제출 전 실 ID 반영 **재빌드 필수**.

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

**2026-06-04 세션 진척:**
- **Apple Developer 활성화 완료** — Team ID `4XZS542GQP` 활성. 트랙 B 즉시 시작 가능 (§1 D에서 제거, §2 트랙 B 헤더·§4 갱신)

**2026-06-05 세션 진척 (iOS 트랙 B 전체 — 하루에 B1~B16 완료):**
- 본인 콘솔 B1~B5(App ID·Service ID·Sign In Key·ASC API Key·iOS OAuth) → Claude B6~B9(Apple Provider는 네이티브 흐름이라 Client IDs만·Supabase APPLE_* 4종·verify-purchase iOS 재배포)
- B10 빌드: `withLocalizedATT.js`의 InfoPlist.strings 경로 버그 수정(커밋 `5a135e9`: `ios/` 루트 생성) → 성공
- B11 TestFlight → B12 AdMob iOS 실 ID → B13 메타데이터(특수문자 `•`/`-` 치환)+스크린샷(안드로이드 네비바 제거 1242×2688 변환 7장)+App Privacy(IDFA만 추적=예)+연령 4+ → B14 구독(미국 기준가+한국 개별조정, 7일=1주)
- 실 AdMob 재빌드 buildNumber 3 → **iOS 심사 제출 완료, "심사 대기 중"**
- Team ID 정정: `74SA3LF88F`(오기) → `4XZS542GQP` 전체 수정
- 미완/주의: B15 결제 E2E(TestFlight sandbox), iOS 스크린샷 임시본(출시 후 iOS 실기기 재촬영), eas.json `submit.production.ios` 설정 **커밋 금지**(개인 .p8 경로)

**2026-06-08 세션 진척 (iOS 반려 수정 + 결제 설정 완료):** 상세는 문서 상단 "🟢 2026-06-08 최신 상태" 블록 참조.
- iOS Google 로그인 3겹 차단 해소(URL scheme + Supabase Client IDs + Skip nonce checks) → 실기 로그인 성공
- 2.3.10 스크린샷 6.9"/6.5" 합성본 업로드 / Apple 클라우드 동등성·빌링 restore·스플래시·칩·TTS 수정 커밋(`b745542`·`c01222b`·`e8583d5`·`274d357`·`f7da488`)
- 결제 설정 완료(유료 앱 계약 활성·구독 제출준비·세금/은행 제출·DSA 심사중·Supabase APPLE_* 확인)
- build 6(buildNumber 6) 빌드+제출 → TestFlight 처리 대기

**다음 세션 진입 시 즉시 확인할 외부 상태:**
1. **build 6 TestFlight 처리 완료?** → 아이폰 실기 테스트(상단 블록 "다음 세션 즉시 할 일" 6항목) → 통과 시 **App Store 심사 재제출**
2. **DSA 거래자 검증 결과?** (심사 중) — 승인 시 EU 배포 열림 / 보완요청 시 문서 재제출
3. **유료 앱 계약 "활성화됨" 유지 + 은행/한국세금 처리완료?** → 샌드박스 결제 테스트 가능 상태 확인
4. (Android 트랙) 등록면허세 고지서·통신판매업 신고증 발급 여부 → 트랙 A A2.5/A3·A4 → 비공개 테스트 14일 시계
