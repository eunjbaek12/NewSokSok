# Feature Graphic — 1024×500

Google Play Store 앱 상세 페이지 최상단에 노출되는 배너 이미지.

## 파일

- `feature-ko.html` — 한국어
- `feature-en.html` — 영어

## 디자인 사양

- 캔버스: 1024×500 px
- 배경: 라디얼 그라데이션 (`#348C89` → `#2A7B78` → `#1F6764`)
- 아보카도 캐릭터: 좌측, 320×320, drop-shadow
- 헤드라인 강조 색: `#C8E8A8` (브랜드 그린의 밝은 톤)
- 우측 배경 장식: 카드 더미 실루엣 (반투명)
- 브랜드 풋바: 좌측 하단 트래킹 적용

## PNG로 export하는 방법

### 방법 A — 크롬 DevTools (가장 정확)

1. Chrome에서 `feature-ko.html` 열기
2. F12 → Device Toolbar (`Ctrl+Shift+M`)
3. 상단에서 "Responsive" 선택 → 사이즈 `1024 x 500` 입력, DPR 1
4. DevTools 우측 ⋮ 메뉴 → "Capture screenshot"
5. 다운로드된 PNG가 정확히 1024×500인지 확인

### 방법 B — Playwright 한 줄 (자동화)

프로젝트에 이미 playwright-cli가 설정돼 있다면:

```bash
npx playwright screenshot \
  --viewport-size=1024,500 \
  --full-page=false \
  "file://$(pwd)/store-assets/feature-graphic/feature-ko.html" \
  store-assets/feature-graphic/feature-ko.png
```

(영어 버전은 파일명만 바꿔서 한 번 더 실행)

### 방법 C — 시스템 스크린샷

브라우저를 1024px 폭에 정확히 맞추기 어려우므로 추천하지 않음.

## 업로드 시 체크리스트

- [ ] 파일 크기 1MB 이하
- [ ] 정확히 1024×500
- [ ] 투명도 사용 안 함 (RGB 또는 24-bit PNG)
- [ ] 텍스트가 모바일 썸네일에서도 읽히는지 확인 (Play Console 미리보기에서 검토)
- [ ] 한/영 두 언어 자산 각각 등록 (Play Console → 스토어 등록정보 → 그래픽 → 언어별 설정)
