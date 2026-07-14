# iOS App Store 스크린샷 (cream 스타일)

App Store Connect 업로드용 8장 스크린샷 캡처·합성 가이드.

## 디렉토리

```
appstore/
├── config.json      — 8장 메타데이터 (캡션 ko/en + 캡처 힌트 + 팔레트)
├── template.html    — cream 합성 디자인 (배경+캡션+기기목업+상태바 더미)
├── compose.mjs      — raw → final 자동 합성 (Playwright)
├── resize65.py      — 6.9" → 6.5" 다운스케일
├── raw/             — 직접 캡처한 원본 (gitignore 권장)
│   ├── ko/ 01-generate.png … 08-home.png
│   └── en/ 01-generate.png … 08-home.png
└── final/
    ├── 6.9inch/{ko,en}/   — 1290×2796 (필수)
    └── 6.5inch/{ko,en}/   — 1284×2778 (옵션, 자동 생성)
```

## 사양

- **6.9"**: 1290×2796 (App Store 필수 슬롯) — iPhone 15/16 Pro Max 급
- **6.5"**: 1284×2778 (옵션. 6.9"만 올려도 ASC가 커버하지만 안전하게 둘 다)
- **장수**: 8장 / 언어 (한 + 영 = 16장).

## 순서 전략 (차별점 먼저)

스토어 검색결과엔 보통 앞 2~3장만 노출되므로, **다른 단어장 앱에 없는 AI 기능 3종을 맨 앞**에 배치하고 평범한 홈은 마지막에 둔다.

```
1 AI 주제→단어장 생성   ⭐⭐⭐ 개념 자체가 놀라움
2 사진 스캔→단어장       ⭐⭐⭐ 시각적으로 즉시 이해
3 단어 자동완성          ⭐⭐  수동 입력 앱과 대비
4 학습(카드·퀴즈·섀도잉)
5 큐레이션 50+덱·6개 언어
6 학습 스트릭·통계 (신규)
7 스킨/테마
8 홈 대시보드 (StatsStrip)
```

---

## 1. 캡처 (iPhone 13 mini 실기 + TestFlight build 7)

### 공통 수칙
- **iOS로만 캡처.** 안드로이드 화면(하단 3버튼 내비바)은 심사 리스크.
- **라이트 테마 고정** (07-theme 제외).
- **콘텐츠가 다 뜬 걸 확인하고 캡처.** (지난 "C" 버튼 사고 = 텍스트 로딩 전 캡처 추정)
- 상태바(시간·배터리)는 **합성 때 9:41 더미로 자동 교체**되니 신경 안 써도 됨.
- 캡처: **전원 + 볼륨 업** 동시 → 사진 앱 → AirDrop/케이블로 PC 전송.
- 깨끗한 데모 데이터로 (빈/지저분 화면 금지).

### 장별 캡처 대상 (순서 A)

| ID | 화면 | 캡처할 상태 | 주의 |
|---|---|---|---|
| `01-generate` | AI 단어 생성 | 주제 **"배 아플 때 병원 가서 쓰는 단어 20개"** → 결과 | ⚠️뒤로가기 화살표가 제목과 겹치거나 상단 잔상 남지 않게(스크롤 최상단·렌더 완료 후) |
| `02-photo` | 사진 스캔 결과 | 추출 리스트 + **"최종 저장하기" 버튼 정상** | ⚠️picker/갤러리 안 보이게, PII 금지 |
| `03-autocomplete` | 단어 추가 | 뜻·예문·발음·품사 **자동완성 다 채워진** 순간 | 빈 칸 없이 |
| `04-study` | 플래시카드 | 카드 펼쳐진 상태 (단어+뜻) | |
| `05-curation` | 단어 모음 | 큐레이션 카드들, **다국어 섞이게** | |
| `06-stats` | 내 학습(스트릭·통계) | **스트릭 숫자 + 외운 단어 타일 + 월 달력**이 함께 보이게 | 🆕신규. 스트릭 며칠 쌓인 데모 데이터 |
| `07-theme` | 설정→표시→스킨 | **두 장** 캡처 → 한 장에 겹쳐 합성(duo). 같은 화면을 스킨만 바꿔 `07-theme-a`(뒤)·`07-theme-b`(앞) | 톤이 확 대비되는 두 스킨(예: 다크 고요 + Y2K) |
| `08-home` | 홈 탭 | 단어장 2~3개 진행 중 + **검색창 아래 StatsStrip** 보이게 | ⚠️1.1.5 최신 상태. StatsStrip 없는 구버전 재사용 금지 |

> 🎨 **07-theme는 "두 스킨 겹침"**: config의 `shots: ["07-theme-a","07-theme-b"]`로 duo 템플릿(`template-duo.html`)이 폰 2개를 겹쳐 합성. 출력은 `07-theme.png` 한 장. 두 raw 다 있어야 생성(하나만 있으면 스킵).

> 🆕 **이번 재작업 핵심**: `01`(구 04-generate) 헤더 겹침 버그 수정 재캡처 · `06-stats` 신규 · `08-home` StatsStrip 반영 재캡처. 나머지(02·03·04·05·07)도 1.1.5 UI로 다시 찍는 걸 권장.

### 저장
캡처본을 아래 경로에 ID 그대로 저장 (한국어→ko, 영어→en):
```
raw/ko/01-generate.png  …  raw/ko/08-home.png
raw/en/01-generate.png  …  raw/en/08-home.png
```
> ⚠️ `07-theme`만 예외: `07-theme.png` 대신 **`07-theme-a.png`+`07-theme-b.png` 두 장**(스킨 A/B). 나머지는 ID 그대로 한 장씩.
> 앱 설정 → 언어를 한국어/English로 바꿔 같은 화면을 두 번 캡처.
> ⚠️ 구 raw(`01-home.png`, `02-autocomplete.png`, `07-theme2.png` 등)는 새 ID와 안 맞으므로, 재캡처본을 **새 ID 파일명**으로 저장. 남은 구 파일은 무시되지만 헷갈리면 삭제.

---

## 2. 합성

```bash
# Playwright 필요 (미설치 시: npx playwright install chromium)
node store-assets/screenshots/appstore/compose.mjs   # 6.9" 16장
python store-assets/screenshots/appstore/resize65.py # 6.5" 16장
```

raw가 일부만 있어도 있는 것만 합성하고 누락분은 스킵 → 추가 캡처 후 재실행.

## 3. ASC 업로드

App Store Connect → 앱 → 버전 → 미리보기 및 스크린샷:
- **6.9" 디스플레이** 탭 → `final/6.9inch/ko` 또는 `/en` 8장, **01→08 순서대로**
- (옵션) **6.5"** 탭 → `final/6.5inch/...`
- 로컬라이제이션별로 ko = 한국어, en = English(U.S.) 등에 매칭

## 디자인 수정
- 문구: `config.json` 편집 → `compose.mjs` 재실행
- 색·폰트·레이아웃: `template.html` 편집 → 재실행
- 특정 장만 재촬영: `raw/`의 해당 파일 교체 → 재실행

## 팔레트
cream `#F2E8D5` · 캡션 `#3C3526` · 서브 `#6B6358` · 틸 액센트 `#2A7B78`
폰트: 한글 캡션 **Jua**, 영문 캡션·서브 **Pretendard**
