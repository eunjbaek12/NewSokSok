# 히어로 스크린샷 계획 (첫 2장 파노라마)

2026-07-29 확정. 스토어 스크린샷 **첫 2장을 이어지는 한 장으로** 만들어 아보카도
캐릭터가 앱이 켜진 폰을 들고 있는 홍보 컷으로 바꾼다. 최근 스토어 리스팅 트렌드.

**SoT는 이 문서다.** 여기 없는 건 구현하지 않는다.

## 0. 핵심 판단 — Gemini에게 앱 화면을 그리게 하지 않는다

Gemini는 **캐릭터·손·폰 껍데기·배경까지만** 그리고, 폰 화면은 **단색으로 비운다**.
그 자리에 지금 파이프라인이 하듯 **실제 앱 캡처**를 코드로 얹는다.

**왜:**
- Apple은 스크린샷이 실제 앱을 반영하길 요구한다(가이드라인 2.3.10). 그려낸 가짜 UI는
  반려 위험이 있고, 폰 안이 진짜 캡처면 안전하다. 이 앱은 이미 2.1a/2.3.10로 반려된
  이력이 있다 — 심사 리스크를 새로 만들 이유가 없다.
- **앱 UI가 바뀌어도 그림을 다시 안 만들어도 된다.** raw 캡처만 갈아끼우면 끝난다.
- 기존 `template.html`이 `.phone > .screen > img`로 하던 일과 정확히 같은 구조다.

## 1. 이어짐은 "한 장으로 만들고 코드로 자른다"

Gemini에 두 장을 따로 시키면 **절대 안 이어진다.** 2580×2796 한 장을 만든 뒤
HTML에서 같은 배경을 깔고 `background-position`만 `0` / `-1290px`로 준다.
픽셀 단위로 정확히 갈라진다.

> 안전장치: Gemini가 좌표를 정확히 못 지켜도 **분할선은 코드에서 옮길 수 있다.**
> `background-position`을 몇십 px 미는 것으로 구도를 살릴 수 있으니, 생성물이
> "대충 왼쪽에 캐릭터·오른쪽에 폰"만 맞으면 쓸 수 있다.

## 2. ⚠️ 스토어에서 완벽히 이어져 보이지는 않는다

갤러리는 스크린샷 사이에 간격이 있고 모서리가 둥글게 잘린다. 검색 결과에선
1~3장만 잘린 채 노출된다. 따라서 **설계 원칙**:

- **문구를 두 장에 걸치지 말 것.** "단어를 쏙쏙 →" / "→ 외우게 해줄게" 식으로 나누면
  따로 볼 때 무의미해진다. **배경과 캐릭터만 이어지고, 문구는 각 장에 완결형으로.**
- 각 장이 단독으로도 성립해야 한다.

## 3. 구도 (확정)

**캐릭터 → 폰.** 시선이 왼→오른쪽으로 흘러 다음 장 스와이프를 유도한다.

```
┌─ 1장 (0~1290) ─┐┌─ 2장 (1290~2580) ─┐
│  문구 A         ││  문구 B            │
│                 ││                    │
│     🥑          ││   ┌────────┐       │
│   아보카도       ││   │ 실제    │       │
│  (손 내밀며)     ││   │ 앱화면  │       │
│      ────────▶  ││   └────────┘       │
└─────────────────┘└────────────────────┘
 첫 인상=캐릭터      다음 장으로 유도
```

**2장의 폰 안 = 홈 화면.** 기존 `raw/{ko,en}/05-home.png`를 재사용하므로 새 캡처가
필요 없고, 덕분에 `05-home` 단독 장을 뺄 수 있어 장수 문제도 같이 풀린다.

## 4. 장수 재배치 (두 스토어 다 한도를 넘겼다)

| | 한도 | 기존 | 최종 |
|---|---|---|---|
| App Store | 10 | 9 | **9** |
| Play | 8 | 7 | **8** |

**App Store (9장)** — 히어로2 · 01-generate · 02-photo · 03-study · 04-stats ·
06-autocomplete · 07-curation · 테마(2장→**1장으로 합침**)
→ 한 장 여유. 나중에 복습 화면을 넣을 자리로 남긴다.

**Play (8장)** — 히어로2 · 01-generate · 02-photo · 03-study · 04-stats ·
06-autocomplete · 07-curation
→ Play는 원래 테마를 안 쓰므로 "테마 합치기"가 효과 없다. **`05-home` 제거**로 해결.

## 5. 문구 (A안 확정)

| | ko | en |
|---|---|---|
| 1장 (캐릭터) | 단어장 만들기, 이제 3초 | A word list in 3 seconds |
| 2장 (폰) | 만드는 건 AI, 외우는 건 나 | AI builds it. You learn it. |

서브 문구는 기존 config 스타일(`sub`)에 맞춰 렌더 후 확정한다.

## 6. Gemini 프롬프트

**반드시 `assets/images/Avocado-3D-clean.png`를 참조 이미지로 첨부할 것.**
안 넣으면 다른 아보카도가 나온다.

```
Create a single wide illustration, 2580 x 2796 pixels. It will later be split
into two vertical halves, so composition matters.

STYLE: Match the attached reference character EXACTLY — same avocado mascot,
same proportions, same face, same colors. Soft rounded 3D-ish style, friendly.

BACKGROUND: Solid warm cream #F2E8D5. Completely flat — no gradient, no
texture, no pattern, no shadow vignette.

LAYOUT (critical):
- LEFT HALF (x 0–1290): the avocado character, full body, smiling happily,
  one arm extended toward the right side.
- RIGHT HALF (x 1290–2580): a modern smartphone shown STRAIGHT-ON (front view,
  no perspective, no tilt, no rotation), presented as if offered by the character.
- The vertical center line (x = 1290) must stay EMPTY — no face, no hand, no
  important detail may cross it.
- TOP 900 pixels: empty cream space reserved for text. Nothing there.

PHONE SCREEN: Fill the entire screen area with FLAT PURE MAGENTA #FF00FF.
No UI, no icons, no text inside the screen — it is a placeholder to be replaced.
The screen must be a clean rounded rectangle, unobstructed: no fingers over it,
no glare, no reflection.

ACCENTS: teal #2A7B78 sparingly (small sparkles/props). Ink #3C3526 for outlines.

NO text, NO logos, NO watermark anywhere.
```

**팔레트를 고정하는 이유**: 뒤따르는 7장이 크림 `#F2E8D5` · 틸 `#2A7B78` ·
잉크 `#3C3526`이다(`config.json`의 `palette`). 히어로만 톤이 뜨면 리스팅 전체가
아마추어처럼 보인다.

**폰을 정면으로 요청하는 이유**: 기울어지면 캡처를 얹을 때 원근 변환이 필요해져
난이도가 급격히 오른다. 정면이면 CSS로 사각형에 얹으면 끝난다.

## 7. 파이프라인 변경 명세

기존 `template.html`·9장 렌더는 **건드리지 않는다**(회귀 위험 0).

- **`hero.html` 신설** (appstore/playstore 각각) — 배경 이미지 + 오프셋 + 캡션 +
  마젠타 자리에 얹을 실제 캡처.
- **`config.json`** 항목에 필드 추가:
  ```json
  { "id": "00-hero-a", "type": "hero", "heroOffset": 0,     "phone": null }
  { "id": "00-hero-b", "type": "hero", "heroOffset": -1290, "phone": "05-home" }
  ```
- **`compose.mjs`** 분기 — `entry.type === 'hero'`면 `hero.html`을 쓰고
  `heroOffset`·`phone`을 주입. 그 외는 기존 경로 그대로.
- 원본 이미지: `store-assets/screenshots/hero/hero.png` (**언어 공용 1장** —
  문구는 코드가 얹으므로 ko/en을 따로 만들 필요가 없다).

## 8. 작업 순서

1. [ ] 은정님: Gemini로 이미지 생성 → `store-assets/screenshots/hero/hero.png`
2. [ ] `hero.html` 신설 + `compose.mjs` 분기 + 양쪽 `config.json` 재구성
3. [ ] 렌더 후 **두 장이 실제로 이어지는지 픽셀 확인**
       (1장 오른쪽 끝 열 == 2장 왼쪽 끝 열)
4. [ ] 마젠타 영역에 캡처가 정확히 들어갔는지 확인 (경계에 마젠타 잔상 금지)
5. [ ] 테마 2장 합치기 · `05-home` 제거 · Play `05-home` 제거
6. [ ] 6.5" 축소(`resize65.py`) → 두 스토어 업로드

⚠️ 3번은 눈이 아니라 **픽셀로** 확인할 것. 이 저장소는 "눈으로 봤다"가 실측을
대신하지 못한 전례가 여러 번 있다.
