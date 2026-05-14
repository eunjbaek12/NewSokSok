# Play Store 출시 작업 Handoff

세션이 길어져서 다음 세션으로 이어갈 인수인계 문서. 2026-05-15 기준.

---

## 현재 상태 한 줄

EAS production 빌드가 클라우드에서 진행 중. 빌드 완료 후 → Play Console 앱 생성/AAB 업로드/OAuth SHA-1 등록만 하면 출시 가능.

---

## 진행 중인 작업

### EAS 빌드 (진행 중)
- **빌드 URL**: https://expo.dev/accounts/baekeunjoeng/projects/soksok-voca/builds/98d2690b-f54c-4fbf-a7cf-bfcf45d89213
- **프로파일**: production, platform: android
- **시작 시각**: 2026-05-14 22:38 KST 경
- **versionCode**: 빌드 시작 시 2 → 3 자동 증가됨
- **fingerprint 단계 우회**: `EAS_SKIP_AUTO_FINGERPRINT=1` 환경변수로 우회. `@expo/fingerprint`가 `brace-expansion@2.0.2` (구버전, `.expand` export 없음)를 잘못 해소해서 fingerprint 단계에서 크래시. fingerprint는 EAS Update/캐싱용이라 첫 출시엔 불필요해서 우회로 진행. **재빌드 시에도 동일 환경변수 필요할 수 있음.**

### 빌드 완료 후 즉시 할 일
1. AAB 다운로드 → 서명 지문 검증 (아래 "키 검증" 섹션 참고)
2. Play Console 프로덕션 트랙에 AAB 업로드 (또는 `eas submit -p android`)
3. Google Cloud Console OAuth Android 클라이언트에 Play App Signing SHA-1 등록

---

## 완료된 작업

### 코드/에셋 (이번 세션 커밋 5건)
| 커밋 | 내용 |
|---|---|
| `a9c12bf` | `expo-location` 의존성 제거 — 미사용 위치 권한 자동 추가 차단 |
| `b273797` | `babel-plugin-transform-remove-console` 도입 + `attached_assets/` 14파일 + `test-api.ts` 삭제 |
| `724a896` | 설정 → 정보에 "개인정보 처리방침" 외부 링크 row 추가 |
| `834d1e8` | `.env` 정리 (Express 잔재 DATABASE_URL/EXPO_PUBLIC_DOMAIN/JWT_SECRET 제거), `scripts/test-db.js` 삭제, `.env.example`에 EAS Secrets 등록 절차 추가 |
| `c312e34` | Play Store 폰 스크린샷 합성 시스템 (`store-assets/screenshots/`) |

### EAS Secrets (production 환경에 4개 등록 완료)
- `EXPO_PUBLIC_SUPABASE_URL` (string)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` (string)
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (string)
- `GOOGLE_SERVICES_JSON` (file)

⚠️ 처음 등록 시 `GOOGLE_SERVICES_JSON`이 4/28자 옛것과 중복돼 있었음. 웹 UI로 옛것(`2f2b2757...`) 삭제. 지금은 `89562af5...` 하나만 존재 — `eas env:list production`으로 확인 가능.

### Play Store 자산 (모두 git에 있음)
| 위치 | 내용 |
|---|---|
| `store-assets/listing/{ko,en}.md` | 스토어 텍스트 (한/영) |
| `store-assets/icons/` | 512×512 아이콘 + 렌더 스크립트 |
| `store-assets/feature-graphic/` | 1024×500 그래픽 (한/영) |
| `store-assets/compliance/data-safety.md` | Play Console 데이터 보안 폼 답변지 |
| `store-assets/compliance/content-rating.md` | 콘텐츠 등급 설문 답변지 |
| `store-assets/compliance/ai-disclosure.md` | AI 생성 콘텐츠 공시 답변지 |
| `store-assets/screenshots/` | 캡처+합성 시스템 (raw → final) |

### 인프라
- 개인정보 처리방침 호스팅: https://eunjbaek12.github.io/NewSokSok/privacy-policy.html (GitHub Pages, 200 OK 확인)
- Play Developer 계정: ✅ 가입 완료 ($25 결제됨)

---

## 사용자가 직접 진행한 Play Console 작업

### 개발자 인증 (Developer Verification) — 패키지 키 관리
- URL: https://play.google.com/console/u/0/developers/6509407789649920229/android-developer-verification/packages/com.soksokvoca
- **선택한 SHA-256**: `07:17:69:C9:04:4D:4E:17:23:B1:DF:46:B5:EF:4C:29:48:93:E9:BC:67:D3:D0:98:0B:22:73:B1:41:E3:9E:9F`
- **다른 후보(미선택)**: `07:67:D9:1E:F9:79:1E:47:F4:BE:AC:A4:1D:6B:FE:DA:BD:63:01:A9:A3:59:DC:02:8F:D4:37:0E:C3:93:B5:BC`
- 상태: 확정됨 (다만 "키 변경" 버튼이라 언제든 변경 가능)
- **검증 필요**: 빌드 완료 후 AAB 서명 지문이 위 둘 중 어느 것과 일치하는지 확인. 신규 앱이라 설치 0이므로 어느 쪽 선택해도 무방하지만 EAS 업로드 키와 일치시켜두는 게 깔끔.

---

## 빌드 완료 후 단계별 가이드

### 1) 빌드 결과 확인
```
! tail -50 "C:\Users\kimos\AppData\Local\Temp\claude\C--Users-kimos-OneDrive----repositories-NewSokSok\08b46c17-eff9-4aad-a107-8845a03a5155\tasks\b1ul2mpsf.output"
```
또는 https://expo.dev/accounts/baekeunjoeng/projects/soksok-voca/builds/98d2690b-f54c-4fbf-a7cf-bfcf45d89213

성공 시 AAB 다운로드 URL이 출력됨. `eas build:list --platform android --limit 1`로도 조회 가능.

### 2) 키 검증 (선택)
빌드 끝나면 AAB의 서명 지문을 확인해 위 두 SHA-256 중 어느 게 EAS 업로드 키인지 확정:
```
! "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -printcert -jarfile <다운로드한.aab>
```
또는 EAS의 키 정보 직접 조회:
```
! eas credentials --platform android
```

### 3) Play Console 앱 생성
- 앱 이름: `아보카도: 단어장 학습`
- 기본 언어: 한국어
- 무료 앱
- 패키지명: `com.soksokvoca` (첫 AAB 업로드 시 자동 고정)

### 4) AAB 업로드
- Play Console → 프로덕션 트랙 → 새 버전 → AAB 업로드
- 또는 CLI: `eas submit -p android --latest`

### 5) Play App Signing SHA-1 → Google OAuth 등록 ⚠️ 중요
첫 AAB 업로드하면 Play Console이 **앱 서명 키 SHA-1**을 발급함.
- 위치: Play Console → 좌측 메뉴 "테스트 및 출시" → "설정" → "앱 무결성" → "앱 서명" 탭
- 거기서 **앱 서명 키 인증서의 SHA-1**을 복사
- Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → OAuth 2.0 클라이언트 ID (Android 타입) → SHA-1 추가
  - 프로젝트: `avocado-491710` (google-services.json 기준)
  - 패키지명: `com.soksokvoca`
- **이걸 해야 production 빌드에서 Google 로그인이 작동함.** 안 하면 로그인 시 `DEVELOPER_ERROR` (code 10).

### 6) Play Console 폼 입력 (자료 다 준비됨)
- 앱 액세스 권한: 로그인 필요 + 게스트 모드 있음 명시. 테스트용 Google 계정 제공 권장
- 광고: 없음
- 콘텐츠 등급 설문 → `store-assets/compliance/content-rating.md` 답변 그대로
- 타겟층: 만 13세 이상
- 데이터 보안 → `store-assets/compliance/data-safety.md` 그대로
- 정부 앱: 아니요 / 금융 기능: 없음
- 생성형 AI 공시 → `store-assets/compliance/ai-disclosure.md` 그대로
- 스토어 등록정보 (한/영) → `store-assets/listing/{ko,en}.md`
- 아이콘 512×512 → `store-assets/icons/` 결과물
- 그래픽 이미지 1024×500 → `store-assets/feature-graphic/` 결과물

### 7) 폰 스크린샷 (남은 사용자 작업)
EAS 빌드된 AAB를 Android 에뮬레이터(Pixel 7, 1080×2400)에 설치해 8장 × 2언어 = 16장 캡처:
- 저장 위치: `store-assets/screenshots/raw/{ko,en}/{id}.png`
- ID 목록: `01-home`, `02-flashcard`, `03-quiz`, `04-ai-generate`, `05-add-word`, `06-curation`, `07-plan-progress`, `08-skin`
- 합성: `node store-assets/screenshots/compose.mjs` → `final/{ko,en}/` 16장 생성
- 가이드: `store-assets/screenshots/README.md`

---

## 알려진 이슈 / 주의

### fingerprint 우회 필요
재빌드 시 `EAS_SKIP_AUTO_FINGERPRINT=1` 다시 설정해야 함. 근본 해결책은 pnpm overrides에 `brace-expansion: "^4.0.0"` 추가 후 `pnpm install`이지만, 빌드 우회로 해결됐으니 출시 후로 미뤄도 무방.

### 빌드 시 정보성 경고 (정상)
- `No environment variables with visibility "Plain text" and "Sensitive"` — SECRET 가시성이라 목록에 안 보이는 게 정상
- `googleServicesFile ... is not checked in` — EAS Secret으로 주입되므로 정상
- `watcher.unstable_workerThreads` typing warning — 무해
- `versionCode 2 → 3` — `eas.json`의 `autoIncrement: true` 동작

### `expo-location` 제거 결과
data-safety.md의 위치 정보 항목이 "의존성 제거"로 갱신됨. Play Console 데이터 보안 폼에서 위치 정보를 "수집 안 함"으로 답변할 근거 확보.

### 미커밋 변경
빌드 시작 시점에 working tree clean. 빌드 중 의도치 않게 파일이 변경됐으면 (`git status`) 점검 후 정리.

---

## 환경/계정 메모

| 항목 | 값 |
|---|---|
| Expo/EAS 프로젝트 | `@baekeunjoeng/soksok-voca` |
| Expo projectId | `2d560de2-a41b-4ac1-a019-d287f7aaa2d6` |
| Play 패키지명 | `com.soksokvoca` (고정 예정) |
| Firebase 프로젝트 | `avocado-491710` |
| Google OAuth Web Client ID | `172087024533-evb9v37p7usa4u2uek2qns9isfrg8902.apps.googleusercontent.com` |
| Supabase URL | `https://ithqbclnwvyeultkyxbn.supabase.co` |
| 호스팅 (개인정보) | GitHub Pages `eunjbaek12.github.io/NewSokSok/` |
| 앱 버전 | 1.0.0 (versionCode는 EAS 원격 관리) |

---

## 빠른 명령 모음

```bash
# 빌드 상태
eas build:list --platform android --limit 3

# 빌드 로그
eas build:view --platform android <BUILD_ID>

# Secret 점검
eas env:list production

# 자격증명 (서명 키 정보)
eas credentials --platform android

# Play 제출 (수동 업로드 대신)
eas submit -p android --latest

# 재빌드 (필요 시)
$env:EAS_SKIP_AUTO_FINGERPRINT=1; eas build --profile production --platform android --non-interactive
```
