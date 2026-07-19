# Google Play 폰 스크린샷 (cream 스타일)

Play Console 업로드용 7장. **순서 = ASO 최적화**(iOS와 동일, 테마 2장 제외). iOS `appstore/`와 같은 cream 디자인, Play 규격(비율 ≤ 2:1)에 맞춰 세로만 줄임.

## iOS와 다른 점

| | iOS `appstore/` | Android `playstore/` |
|---|---|---|
| 해상도 | 1290×2796 (2.167:1) | **1290×2580 (정확히 2:1)** |
| 장수 | 9장 | **7장** (01~07, iOS의 08/09-theme 제외) |
| 캡션·순서 | ASO 순서 | 동일 (01~07 공유) |

## 디렉토리
```
playstore/
├── config.json      — 7장 메타데이터
├── template.html · compose.mjs
├── raw/  ko|en/ 01-generate.png … 07-curation.png   (gitignore 권장)
└── final/ {ko,en}/  — 1290×2580 (Play 업로드용)
```

## 사양
- 1290×2580 (2:1). Play 폰 스크린샷 요건 충족. 24-bit PNG, 알파 없음.
- 장수: 7장 / 언어 (한+영 = 14장). Play 최대 8장.

## 라인업 (ASO 순서)

| # | ID | 화면 | 캡처 상태 |
|---|---|---|---|
| 1 | `01-generate` | AI 단어 생성 | 주제 "배 아플 때…20개" → 결과 (🪝 최고 훅) |
| 2 | `02-photo` | 사진 스캔 결과 | 추출 리스트 + "최종 저장하기". ⚠️picker/PII 금지 |
| 3 | `03-study` | 플래시카드 | 카드 펼쳐진 상태 |
| 4 | `04-stats` | 내 학습(통계) | 스트릭·달력·외운 단어 (🆕) |
| 5 | `05-home` | 홈 탭 | 단어장 진행 + 복습 배너 합성됨 |
| 6 | `06-autocomplete` | 단어 추가 | 자동완성 다 채워진 순간 |
| 7 | `07-curation` | 단어 모음 | 큐레이션 카드들, 다국어 |

## 캡처 수칙
- 안드로이드로 캡처(라이트 테마). 상태바는 합성 때 9:41 더미 교체. 제스처 네비 권장.
- 저장: `raw/ko/01-generate.png … 07-curation.png`, `raw/en/…`.

### ⚠️ iOS 캡처를 재사용할 때 (05-home·04-stats)
- Play compose는 `captureStatusBarPx`(기본 80)를 파이프라인 전체에 하나로 적용 → 아이폰 캡처(상태바 큼)는 상단 더미가 실제 상태바를 덜 덮어 이중 상태바가 생김.
- 대응: 재사용 캡처의 **상단 상태바 영역(~140px)을 배경색으로 덮은 뒤** raw에 넣기(현재 05-home·04-stats에 적용됨). 합성 후 맨 위 확인.

### ⚠️ 캡처 해상도가 1080×2400이 아니면
- 상태바 안 맞으면 `config.json`의 `captureStatusBarPx` 조정(기본 80). 목업 잘림은 `template.html`의 `.phone { width }`(기본 840px) 조정. 한 장 먼저 확인 권장.

## 합성 · 업로드
```bash
node store-assets/screenshots/playstore/compose.mjs   # 14장
```
Play Console → 스토어 등록정보 → 휴대전화 스크린샷 → `final/{ko,en}` 7장 **01→07 순서대로**.

## 팔레트
cream `#F2E8D5` · 캡션 `#3C3526` · 서브 `#6B6358` · 틸 `#2A7B78` / 폰트: 한글 **Jua**, 영문 **Pretendard**

---
## 구버전 정리
기존 `store-assets/screenshots/final/{ko,en}` (구 라인업)은 이 cream 파이프라인으로 대체됨.
