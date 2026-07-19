# iOS App Store 스크린샷 (cream 스타일)

App Store Connect 업로드용 9장 스크린샷 캡처·합성 가이드.

## 디렉토리

```
appstore/
├── config.json      — 9장 메타데이터 (캡션 ko/en + 캡처 힌트 + 팔레트)
├── template.html    — cream 합성 디자인 (배경+캡션+기기목업+상태바 더미)
├── compose.mjs      — raw → final 자동 합성 (Playwright)
├── resize65.py      — 6.9" → 6.5" 다운스케일
├── raw/             — 직접 캡처한 원본 (gitignore 권장)
│   ├── ko/ 01-home.png … 09-theme2.png
│   └── en/ 01-home.png … 09-theme2.png
└── final/
    ├── 6.9inch/{ko,en}/   — 1290×2796 (필수)
    └── 6.5inch/{ko,en}/   — 1284×2778 (옵션, 자동 생성)
```

## 사양

- **6.9"**: 1290×2796 (App Store 필수 슬롯) — iPhone 15/16 Pro Max 급
- **6.5"**: 1284×2778 (옵션. 6.9"만 올려도 ASC가 커버하지만 안전하게 둘 다)
- **장수**: 9장 / 언어 (한 + 영 = 18장). App Store 최대 10장. Play는 7장(테마 2장 제외, playstore/ 참조).

---

## 1. 캡처 (iOS 실기 + TestFlight)

### 공통 수칙
- **iOS로만 캡처.** 안드로이드 화면(하단 3버튼 내비바)은 심사 리스크.
- **라이트 테마 고정** (08/09-theme 제외).
- **콘텐츠가 다 뜬 걸 확인하고 캡처.** (지난 "C" 버튼 사고 = 텍스트 로딩 전 캡처 추정)
- 상태바(시간·배터리)는 **합성 때 9:41 더미로 자동 교체**되니 신경 안 써도 됨.
- 캡처: **전원 + 볼륨 업** 동시 → 사진 앱 → AirDrop/케이블로 PC 전송.
- 깨끗한 데모 데이터로 (빈/지저분 화면 금지).

### 장별 캡처 대상

| ID | 화면 | 캡처할 상태 | 주의 |
|---|---|---|---|
| `01-home` | 홈 탭 | 단어장 2~3개 진행 중 + **상단 '오늘의 복습' 배너** 보이게 | 🆕 배너 포함 = 홈 한 장이 복습도 홍보 |
| `02-autocomplete` | 단어 추가 | 뜻·예문·발음·품사 **자동완성 다 채워진** 순간 | 빈 칸 없이 |
| `03-photo` | 사진 스캔 결과 | 추출 리스트 + **"최종 저장하기" 버튼 정상** | ⚠️picker/갤러리 안 보이게, PII 금지 |
| `04-generate` | AI 단어 생성 | 주제 **"배 아플 때 병원 가서 쓰는 단어 20개"** → 결과 | 주제 텍스트 보이게 |
| `05-study` | 플래시카드 | 카드 펼쳐진 상태 (단어+뜻) | |
| `06-stats` | 내 학습(통계) | **연속 학습·달력·외운 단어** 보이게, 캐릭터 포함 | 🆕 1.2.0. 홈 통계 스트립 탭해서 진입 |
| `07-curation` | 단어 모음 | 큐레이션 카드들, **다국어 섞이게** | |
| `08-theme1` | 설정→표시→스킨 | 스킨(예: 다크 고요) 적용 화면 | 일반 화면과 톤 대비 |
| `09-theme2` | 설정→표시→스킨 | theme1과 다른 스킨(예: Y2K) | 두 장이 대비되게 |

> 🆕 1.2.0 신규 캡처는 **06-stats 1장뿐**. 01-home은 복습 배너 포함해 재촬영 권장. 나머지(02~05·07~09)는 기존 raw 재사용.

### 저장
캡처본을 아래 경로에 ID 그대로 저장 (한국어→ko, 영어→en):
```
raw/ko/01-home.png  …  raw/ko/09-theme2.png
raw/en/01-home.png  …  raw/en/09-theme2.png
```
> 앱 설정 → 언어를 한국어/English로 바꿔 같은 화면을 두 번 캡처.

---

## 2. 합성

```bash
# Playwright 필요 (미설치 시: npx playwright install chromium)
node store-assets/screenshots/appstore/compose.mjs   # 6.9" 18장
python store-assets/screenshots/appstore/resize65.py # 6.5" 18장
```

raw가 일부만 있어도 있는 것만 합성하고 누락분은 스킵 → 추가 캡처 후 재실행.

## 3. ASC 업로드

App Store Connect → 앱 → 버전 → 미리보기 및 스크린샷:
- **6.9" 디스플레이** 탭 → `final/6.9inch/ko` 또는 `/en` 9장, **01→09 순서대로**
- (옵션) **6.5"** 탭 → `final/6.5inch/...`
- 로컬라이제이션별로 ko = 한국어, en = English(U.S.) 등에 매칭

## 디자인 수정
- 문구: `config.json` 편집 → `compose.mjs` 재실행
- 색·폰트·레이아웃: `template.html` 편집 → 재실행
- 특정 장만 재촬영: `raw/`의 해당 파일 교체 → 재실행

## 팔레트
cream `#F2E8D5` · 캡션 `#3C3526` · 서브 `#6B6358` · 틸 액센트 `#2A7B78`
폰트: 한글 캡션 **Jua**, 영문 캡션·서브 **Pretendard**
