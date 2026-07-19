# iOS App Store 스크린샷 (cream 스타일)

App Store Connect 업로드용 9장. **순서 = ASO 최적화**(차별점→깊이→개성). 01→09 그대로 업로드하면 됨.

## 디렉토리

```
appstore/
├── config.json      — 9장 메타데이터 (ASO 순서 · 캡션 ko/en · 캡처 힌트 · 팔레트)
├── template.html    — cream 합성 디자인
├── compose.mjs      — raw → final 합성 (Playwright)
├── resize65.py      — 6.9" → 6.5" 다운스케일
├── raw/  ko|en/ 01-generate.png … 09-theme2.png   (gitignore 권장)
└── final/
    ├── 6.9inch/{ko,en}/   — 1290×2796 (필수)
    └── 6.5inch/{ko,en}/   — 1284×2778 (옵션)
```

## 사양
- **6.9"**: 1290×2796 (필수 슬롯), **6.5"**: 1284×2778 (옵션)
- **장수**: 9장 / 언어 (한+영 = 18장). App Store 최대 10장. Play는 7장(테마 제외).

## 라인업 (ASO 순서)

| # | ID | 화면 | 캡처 상태 | ASO 의도 |
|---|---|---|---|---|
| 1 | `01-generate` | AI 단어 생성 | 주제 "배 아플 때 병원 가서 쓰는 단어 20개" → 결과 | 🪝 최고 훅(가장 유니크) |
| 2 | `02-photo` | 사진 스캔 결과 | 추출 리스트 + "최종 저장하기". ⚠️picker/PII 금지 | 학생 공감·페인포인트 해결 |
| 3 | `03-study` | 플래시카드 | 카드 펼쳐진 상태(단어+뜻) | 학습 깊이 증명 |
| 4 | `04-stats` | 내 학습(통계) | 스트릭·달력·외운 단어, 캐릭터 포함 | 🆕 리텐션 |
| 5 | `05-home` | 홈 탭 | 단어장 진행 + **복습 배너 합성됨** | 개요+복습+캐릭터 |
| 6 | `06-autocomplete` | 단어 추가 | 뜻·예문·발음·품사 자동완성 다 채워진 순간 | AI 디테일 |
| 7 | `07-curation` | 단어 모음 | 큐레이션 카드들, 다국어 섞이게 | 규모감 |
| 8 | `08-theme1` | 설정→표시→스킨 | 스킨(다크 고요) 적용 | 🥑 브랜드 개성 |
| 9 | `09-theme2` | 설정→표시→스킨 | 다른 스킨(Y2K) | 개성 마무리 |

> 05-home은 기존 홈 캡처에 '오늘의 복습' 배너를 합성한 것(raw에 반영됨). 재촬영 시 주의.

## 캡처 수칙
- iOS로만, 라이트 테마(08/09-theme 제외), 콘텐츠 다 뜬 뒤 캡처. 상태바는 합성 때 9:41 더미 교체.
- 저장: `raw/ko/01-generate.png … 09-theme2.png`, `raw/en/…`. 앱 언어 전환해 두 번.

## 합성 · 업로드
```bash
node store-assets/screenshots/appstore/compose.mjs   # 6.9" 18장
python store-assets/screenshots/appstore/resize65.py # 6.5" 18장
```
ASC → 버전 → 6.9" 탭 → `final/6.9inch/{ko,en}` 9장 **01→09 순서대로**. (6.5"는 옵션)

## 팔레트
cream `#F2E8D5` · 캡션 `#3C3526` · 서브 `#6B6358` · 틸 `#2A7B78` / 폰트: 한글 **Jua**, 영문 **Pretendard**
