# iOS App Store 스크린샷 (cream 스타일)

App Store Connect 업로드용 9장. **순서 = ASO 최적화**(히어로→차별점→깊이→개성).
`config.json` 배열 순서 그대로 업로드하면 됨.

## 디렉토리

```
appstore/
├── config.json        — 9장 메타데이터 (순서 · 캡션 ko/en · 캡처 힌트 · 팔레트 · hero 좌표)
├── template.html      — 폰 1대 (기본)
├── template-duo.html  — 폰 2대 겹침 (entry.shots 2개인 항목 = 스킨 대비)
├── hero.html          — 히어로 2장 (배경판 + 그 위에 캡처·노치)
├── compose.mjs        — raw → final 합성 (Playwright). 인자로 id를 주면 그것만 재렌더
├── resize65.py        — 6.9" → 6.5" 다운스케일
├── raw/  ko|en/ …     (gitignore 권장)
└── final/
    ├── 6.9inch/{ko,en}/   — 1290×2796 (필수)
    └── 6.5inch/{ko,en}/   — 1284×2778 (옵션)
```

히어로 원본·부품과 실측 좌표는 `../hero/`(README 포함).

## 사양
- **6.9"**: 1290×2796 (필수 슬롯), **6.5"**: 1284×2778 (옵션)
- **장수**: 9장 / 언어 (한+영 = 18장). App Store 최대 10장 — **한 장 여유는 복습 화면 자리**.
  Play는 8장(테마 제외).

## 라인업

| # | ID | 화면 | 캡처 상태 | 의도 |
|---|---|---|---|---|
| 1 | `00-hero-a` | (캡처 없음) | 아보카도 캐릭터 + 문구 | 🥑 첫인상 |
| 2 | `00-hero-b` | 홈 탭 | 캐릭터가 든 폰 안에 `05-home` raw | 첫인상 + 앱 실물 |
| 3 | `01-generate` | AI 단어 생성 | 주제 "배 아플 때 병원 가서 쓰는 단어 20개" → 결과 | 🪝 최고 훅(가장 유니크) |
| 4 | `02-photo` | 사진 스캔 결과 | 추출 리스트 + "최종 저장하기". ⚠️picker/PII 금지 | 학생 공감·페인포인트 해결 |
| 5 | `03-study` | 플래시카드 | 카드 펼쳐진 상태(단어+뜻) | 학습 깊이 증명 |
| 6 | `04-stats` | 내 학습(통계) | 스트릭·달력·외운 단어, 캐릭터 포함 | 리텐션 |
| 7 | `06-autocomplete` | 단어 추가 | 뜻·예문·발음·품사 자동완성 다 채워진 순간 | AI 디테일 |
| 8 | `07-curation` | 단어 모음 | 큐레이션 카드들, 다국어 섞이게 | 규모감 |
| 9 | `08-theme` | 설정→표시→스킨 | **duo** — `08-theme1`(뒤) + `09-theme2`(앞) 겹침 | 🥑 브랜드 개성 |

> - `05-home`은 **단독 장에서 빠졌다** — 히어로 2장의 폰 안이 같은 화면이라 중복.
>   raw는 히어로가 쓰므로 **지우지 말 것**. 이 raw는 홈 캡처에 '오늘의 복습' 배너를
>   합성한 것이다(재촬영 시 주의).
> - `08-theme`는 id와 raw 파일명이 다르다. raw는 `08-theme1.png`·`09-theme2.png` 두 장.
> - id 번호에 05가 없는 건 의도다 — 재번호하면 raw 파일명을 다 바꿔야 한다.

## 캡처 수칙
- iOS로만, 라이트 테마(`08-theme`의 두 장 제외), 콘텐츠 다 뜬 뒤 캡처.
  상태바는 합성 때 9:41 더미로 교체된다.
- 저장: `raw/{ko,en}/{id}.png`. 앱 언어를 바꿔 두 번 찍는다.
- ⚠️ **UI가 바뀌면 raw도 같이 갱신할 것.** 앱에서 사라진 UI가 스크린샷에 남아 있으면
  가이드라인 2.3.10 위반이 될 수 있고, 리스팅 안에서 화면끼리 어긋나 보인다.

## 합성 · 업로드
```bash
node store-assets/screenshots/appstore/compose.mjs            # 6.9" 18장 전부
node store-assets/screenshots/appstore/compose.mjs 00-hero     # 히어로만 다시
python store-assets/screenshots/appstore/resize65.py          # 6.5" 18장
```
ASC → 버전 → 6.9" 탭 → `final/6.9inch/{ko,en}` 9장 **config 배열 순서대로**. (6.5"는 옵션)

## 팔레트
cream `#F2E8D5` · 캡션 `#3C3526` · 서브 `#6B6358` · 틸 `#2A7B78` / 폰트: 한글 **Jua**, 영문 **Pretendard**
