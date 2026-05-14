# Google Play 폰 스크린샷

Play Store 등록용 폰 스크린샷 캡처·합성 가이드.

## 📁 디렉토리 구조

```
store-assets/screenshots/
├── config.json       — 8장 스크린샷 메타데이터 (caption·sub·캡처 가이드)
├── template.html     — 합성 디자인 (배경+캡션+스크린샷)
├── compose.mjs       — raw → final 자동 합성 스크립트
├── raw/              — 사용자가 캡처한 원본 (gitignored 권장)
│   ├── ko/
│   │   ├── 01-home.png
│   │   ├── 02-flashcard.png
│   │   └── ... (08-skin까지)
│   └── en/
│       └── ...
└── final/            — 합성 결과 (Play Console 업로드용)
    ├── ko/
    └── en/
```

## 🎯 사양

- **해상도**: 1080×2400 (Pixel 7 기준, 9:16 세로)
- **장수**: 8장 / 언어 (한국어 + 영어 = 16장)
- **최소 요구사항**: Play Store는 폰 스크린샷 최소 2장 필요

---

## 1️⃣ Android 에뮬레이터 셋업

Android Studio가 이미 설치돼 있다고 가정합니다.

```bash
# 1. Pixel 7 에뮬레이터 생성 (1080×2400, Android 14 권장)
#    Android Studio → Device Manager → Create Device → Pixel 7
#    System Image: Android 14 (API 34) — 최신 Play 타겟 SDK와 일치

# 2. 개발 빌드 설치
eas build --profile development --platform android
# 또는 expo dev client로 실행
pnpm start
# 에뮬레이터에서 a 키 또는 expo go 앱으로 접속
```

## 2️⃣ 캡처

각 스크린마다 `config.json`의 `captureHint`를 참고해 화면 구성한 뒤 캡처:

| ID | 화면 | 라이트/다크 | 비고 |
|---|---|---|---|
| `01-home` | 홈 대시보드 | 라이트 | 단어장 1–3개 + 진척도 |
| `02-flashcard` | 플래시카드 | 라이트 | 카드 한 장 펼쳐진 상태 |
| `03-quiz` | 퀴즈 | 라이트 | 객관식 또는 주관식 |
| `04-ai-generate` | AI 단어 생성 모달 | 라이트 | 주제 + 생성 결과 |
| `05-add-word` | 단어 추가 | 라이트 | 입력 방법 선택지 보이게 |
| `06-curation` | 단어 모음 | 라이트 | 공유 단어장 카드 |
| `07-plan-progress` | 학습 계획·진척 | 라이트 | 그래프가 보이게 |
| `08-skin` | 스킨 설정 | **다크/Y2K** | 일반 화면과 톤 차별화 |

### 캡처 방법

**에뮬레이터**:
- 우측 카메라 버튼 클릭 → 자동 저장 (Pictures 폴더)
- 또는 Ctrl+S (Mac: Cmd+S)

**실기기**:
- 전원+볼륨다운 동시 누르기
- 캡처된 파일을 PC로 전송

### 저장

캡처한 파일을 다음 경로로 옮기고 이름 변경:

```
store-assets/screenshots/raw/ko/01-home.png
store-assets/screenshots/raw/ko/02-flashcard.png
...
store-assets/screenshots/raw/en/01-home.png
...
```

> 💡 **언어 전환**: 앱 내 설정 → 언어 → 한국어/English 전환 후 같은 화면을 다시 캡처해 `en/`에 저장. 모든 화면을 한 번씩 한국어로, 다시 한 번씩 영어로 캡처.

## 3️⃣ 합성

raw 파일이 준비되면 한 번의 명령으로 16장 합성:

```bash
node store-assets/screenshots/compose.mjs
```

출력:
```
✓ ko/01-home.png
✓ ko/02-flashcard.png
...
⏭  en/05-add-word — raw 누락
...
결과: 14장 생성, 2장 raw 누락으로 스킵.
```

누락분만 추가 캡처 후 재실행하면 됩니다.

## 4️⃣ 합성 결과 확인

`final/ko/01-home.png` 등을 확인:

```
┌─────────────────────────┐ 1080
│   한눈에 보는 오늘의 학습  │  ← 캡션 (Jua 한글 / Pretendard 영문)
│   (서브카피 한 줄)        │
│                          │
│  ╭──────────────────╮    │
│  │                  │    │
│  │   [앱 스크린샷]   │    │  ← 둥근 모서리 + 그림자
│  │                  │    │
│  │                  │    │
│  ╰──────────────────╯    │
│                          │
│        AVOCADO           │  ← 풋바
└─────────────────────────┘ 2400
```

## 5️⃣ Play Console 업로드

Play Console → 스토어 등록정보 → 그래픽 → 폰 스크린샷:
- 한국어 탭 → `final/ko/*.png` 8장 업로드
- 영어 탭 → `final/en/*.png` 8장 업로드
- **번호 순서대로 업로드** (01 → 08) — 첫 장이 Play Store 메인 노출

## 🛠 디자인 수정이 필요할 때

- 캡션·서브카피 수정: `config.json` 편집 후 `compose.mjs` 재실행
- 색·폰트·레이아웃 수정: `template.html` 편집 후 재실행
- 스크린샷 자체 재촬영: `raw/`의 해당 파일만 교체 후 재실행

## ⚠️ 주의

- `raw/`는 비교적 용량 큰 PNG들이라 git에 넣을지 결정 필요 (`.gitignore` 권장)
- `final/`은 commit하는 게 좋음 (Play Console 업로드 추적용)
- `compose.mjs`의 playwright import 경로는 로컬 환경 의존적. 다른 환경에서 돌릴 땐 `npx playwright install`된 위치로 수정 필요
