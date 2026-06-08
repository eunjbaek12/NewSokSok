# 시크릿 관리 (Secrets Management)

이 프로젝트의 **모든 민감 정보가 어디 사는지·무엇이 지키는지·어떻게 회전하는지**를 모은 단일 출처(SoT).
새 시크릿을 추가할 땐 먼저 이 문서의 [결정 규칙](#새-시크릿-추가-시-결정-규칙)을 따른다.

## 원칙

1. **모든 시크릿은 아래 5개 tier 중 하나에 속한다.** 어디에도 안 맞으면 잘못 설계된 것.
2. **추적(git) 파일 본문에 시크릿 값을 절대 넣지 않는다.** (식별자라도)
3. **2겹 방어**: `.gitignore`(파일 단위) + `.githooks/pre-commit`(추적 파일 본문 임베드). 둘 다 우회 가능하므로 *습관*이 1차 방어.
4. **유출은 "되돌리기"보다 "회전(rotate)"으로 무력화한다.** git 히스토리 재작성보다 키 교체가 확실.

## 시크릿 레지스트리

| 이름 | Tier | 사는 곳 | git 보호 | 회전 |
|---|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | 1 공개 클라 | `.env` + EAS secret | `.gitignore: .env` | 불필요(공개값) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 1 | `.env` + EAS secret | 〃 | RLS가 보호. 유출 자체는 설계상 허용 |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` / `_IOS` | 1 | `.env` + EAS secret | 〃 | GCP 콘솔에서 재발급 |
| `EXPO_PUBLIC_ADMOB_*` (앱/배너/리워드 ID) | 1 | `.env` + EAS secret | 〃 | AdMob 콘솔 |
| `EXPO_PUBLIC_PRO_*_SKU`, `EXPO_PUBLIC_ENRICH_VIA_EDGE` | 1 | `.env` + EAS secret | 〃 | 설정값(시크릿 아님) |
| `GEMINI_API_KEY` (dev 스크립트 전용) | 2 dev | `.env` **만** (EXPO_PUBLIC 금지) | `.gitignore: .env` | Google AI Studio 재발급 |
| 사용자 BYOK Gemini 키 | 3 기기 | 기기 SecureStore | 기기 밖으로 안 나감 | 사용자가 앱에서 교체 |
| `SUPABASE_SERVICE_ROLE_KEY` | 4 서버 | Supabase Edge Secrets | 레포에 없음 | Supabase 대시보드 → API |
| `VERTEX_SA_PRIVATE_KEY` / `VERTEX_SA_CLIENT_EMAIL` / `VERTEX_PROJECT_ID` 등 | 4 | Supabase Edge Secrets | 〃 | GCP IAM에서 SA 키 재발급 |
| `PLAY_SA_PRIVATE_KEY` / `PLAY_SA_CLIENT_EMAIL` / `ANDROID_PACKAGE_NAME` | 4 | Supabase Edge Secrets | 〃 | GCP IAM (Play 개발자 API SA) |
| `APPLE_PRIVATE_KEY` / `APPLE_KEY_ID` / `APPLE_ISSUER_ID` / `APPLE_BUNDLE_ID` | 4 | Supabase Edge Secrets | 〃 | App Store Connect → Integrations |
| Android 업로드/서명 keystore (`*.jks`/`*.keystore`) | 5 빌드 | EAS 서버 (또는 gitignore 로컬) | `.gitignore: *.jks *.keystore` | EAS `credentials` 재생성(주의: Play 등록키와 일치 필요) |
| `google-services.json` | 5 | gitignore 로컬 + EAS file secret `GOOGLE_SERVICES_JSON` | `.gitignore` | Firebase 콘솔 재다운로드 |
| iOS ASC API key (`.p8`) + key/issuer/app ID | 5 | EAS 서버(`eas credentials`) 권장 | `.gitignore: *.p8` (식별자는 본문 임베드 → **pre-commit 훅**이 차단) | App Store Connect → Integrations |
| iOS 배포 인증서 / provisioning profile | 5 | EAS 서버 (자동 관리) | `.gitignore: ios/ *.mobileprovision` | EAS `credentials` |

> ⚠️ **현재 미해결**: iOS ASC 식별자가 과거 커밋 히스토리에 남아 있음(`.p8`은 미노출이라 저위험). 다음 ASC 작업 시 키 회전으로 무력화 예정 — [[project_play_release]] 참조.

## Tier별 저장소 한 줄 요약

- **Tier 1 (공개 클라)**: 앱 번들에 박히는 값. 기술적으로 "공개"지만 `.env`(gitignore)로 관리하고 빌드는 EAS secret에서 주입. 템플릿은 `.env.example`.
- **Tier 2 (dev)**: 로컬 스크립트에서만 쓰는 키. `EXPO_PUBLIC_` 접두사를 붙이면 번들로 새므로 **금지**.
- **Tier 3 (기기)**: 사용자 개인 키. `expo-secure-store`에 저장, 서버·번들 어디에도 안 보냄.
- **Tier 4 (서버)**: Edge Function만 보는 진짜 백엔드 시크릿. `supabase secrets set ...`로 등록, 코드에선 `Deno.env.get(...)`. 절대 클라이언트/레포로 안 감.
- **Tier 5 (빌드/서명)**: 앱 서명·스토어 제출 자격. EAS 서버에 두는 게 기본. 로컬 파일이 필요하면 `.gitignore`로만.

## 새 시크릿 추가 시 결정 규칙

```
이 값이 …
├─ 앱이 실행 중 client에서 필요한가?
│   ├─ 사용자별 개인 값?        → Tier 3 (SecureStore)
│   └─ 앱 공통 설정값?          → Tier 1 (EXPO_PUBLIC_*, .env + EAS secret, .env.example에 키 추가)
├─ 서버(Edge Function)에서만 쓰나? → Tier 4 (supabase secrets set, Deno.env.get)
├─ 빌드/서명/스토어 제출용인가?    → Tier 5 (eas credentials / EAS file secret)
└─ 로컬 개발 스크립트 전용인가?    → Tier 2 (.env, EXPO_PUBLIC 금지)
```

추가 후 체크:
1. 값이 **추적 파일 본문**에 들어가지 않았는가? (들어가야 한다면 설계가 틀린 것)
2. Tier 1/2면 `.env.example`에 **키 이름만**(값 없이) 추가했는가?
3. 새 파일 종류의 시크릿이면 `.gitignore`에, 본문 임베드 위험이 있으면 `.githooks/pre-commit`의 PATTERN에 고신뢰 정규식을 추가했는가?

## 방어 계층

| 계층 | 막는 것 | 파일 |
|---|---|---|
| `.gitignore` | 시크릿 **파일** 통째 커밋 (`.env .p8 .p12 .key .pem *.keystore google-services.json` 등) | `.gitignore` |
| `pre-commit` 훅 | 추적 파일 **본문에 박힌** 시크릿(키 자료·API 키·ASC 자격·JWT 등) | `.githooks/pre-commit` (활성화: `git config core.hooksPath .githooks`) |
| `.env.example` | "어떤 키가 필요한지"의 계약(값은 비움) | `.env.example` |

## 유출 대응 (순서)

1. **회전 먼저**: 해당 tier의 회전 절차로 키/자격 교체 → 유출분 즉시 무력화.
2. 추적 파일에 들어갔다면 본문에서 제거하고 커밋(앞으로 클린).
3. 필요 시(진짜 키 자료가 노출됐고 회전 불가할 때만) git 히스토리 재작성 + force-push. 회전이 됐으면 보통 불필요.
4. 어떤 값이 어떤 범위로 노출됐는지 기록(`docs/handoff-*` 또는 메모리).
