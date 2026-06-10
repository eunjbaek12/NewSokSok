# Feature Graphic — 1024×500

Google Play Store 앱 상세 페이지 최상단에 노출되는 배너 이미지.

## 파일

- `feature-ko.html` — 한국어
- `feature-en.html` — 영어

## 디자인 사양 (cream — 스크린샷 파이프라인과 통일)

- 캔버스: 1024×500 px
- 배경: cream 라디얼 그라데이션 (`#FBF5EA` → `#F2E8D5` → `#E9DCC4`)
- 아보카도 캐릭터: 좌측, 320×320, 3D png (`assets/images/Avocado-3D-clean.png`, 투명 배경), drop-shadow
- 헤드라인: ink `#3C3526` (한글 Jua / 영문 Pretendard 800), 강조 색: teal `#2A7B78`
- 서브라인: `#6B6358`
- 상단 틸 액센트 바: `#2A7B78` (스크린샷 모티프와 통일)
- 우측 배경 장식: 카드 더미 실루엣 (teal 반투명)
- 브랜드 풋바: 좌측 하단 `#6B6358` 트래킹 적용
- 팔레트: cream `#F2E8D5` · ink `#3C3526` · sub `#6B6358` · teal `#2A7B78` (`screenshots/playstore`와 동일)

## PNG로 export하는 방법

### 방법 A — 크롬 DevTools (가장 정확)

1. Chrome에서 `feature-ko.html` 열기
2. F12 → Device Toolbar (`Ctrl+Shift+M`)
3. 상단에서 "Responsive" 선택 → 사이즈 `1024 x 500` 입력, DPR 1
4. DevTools 우측 ⋮ 메뉴 → "Capture screenshot"
5. 다운로드된 PNG가 정확히 1024×500인지 확인

### 방법 B — render.mjs (권장, 폰트·SVG/PNG 로딩 대기 포함)

```bash
node store-assets/feature-graphic/render.mjs feature-ko.html
node store-assets/feature-graphic/render.mjs feature-en.html
```

`render.mjs`는 file:// 로 열어 상대경로 캐릭터(png)를 로드하고, networkidle + 0.5s 대기로 웹폰트를 안정화한 뒤 정확히 1024×500으로 캡처한다. 출력은 같은 폴더에 `<html이름>.png`.

### 방법 C — 시스템 스크린샷

브라우저를 1024px 폭에 정확히 맞추기 어려우므로 추천하지 않음.

## 업로드 시 체크리스트

- [ ] 파일 크기 1MB 이하
- [ ] 정확히 1024×500
- [ ] 투명도 사용 안 함 (RGB 또는 24-bit PNG)
- [ ] 텍스트가 모바일 썸네일에서도 읽히는지 확인 (Play Console 미리보기에서 검토)
- [ ] 한/영 두 언어 자산 각각 등록 (Play Console → 스토어 등록정보 → 그래픽 → 언어별 설정)
