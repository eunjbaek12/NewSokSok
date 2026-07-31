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

## 1. ~~이어짐은 "한 장으로 만들고 코드로 자른다"~~ → **폐기 (2026-07-30)**

> 원안: 2580×2796 한 장을 깔고 `background-position`만 `0` / `-1290px`로 줘서
> 픽셀 단위로 가른다. **구현해서 이음새까지 맞췄지만(실측 평균차 1.7, 대조군 15.7)
> 버렸다.**
>
> **버린 이유는 기하학이다.** 실제 생성물의 캐릭터 폭이 **1134px**인데 분할 창은
> **992px**다. 분할선을 어디로 옮겨도 1장에 캐릭터가 안 들어간다 — "분할선은 코드에서
> 옮길 수 있다"던 안전장치가 통하지 않는 경우다. 캐릭터와 폰이 간격 20px로 맞붙어
> 있어 둘을 떼어낼 수도 없다.
>
> 원본이 §6 프롬프트의 "중앙선을 비울 것"을 안 지킨 결과이고, 그림을 다시 만들지
> 않는 한 해결되지 않는다. §2가 "스토어에서 어차피 안 이어지니 각 장이 단독으로
> 성립해야 한다"고 세운 원칙을 따라 **두 장을 독립 구성**으로 바꿨다.

**현재 방식:** 같은 원본을 쓰되 장마다 배율·오프셋을 다르게 준다. 1장은 폰이 캔버스
밖으로 나가도록, 2장은 폰이 정중앙에 오도록. 좌표와 근거는
`store-assets/screenshots/hero/README.md`.

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

| | 한도 | 기존 | 최종 | 실제 결과 |
|---|---|---|---|---|
| App Store | 10 | 9 | **9** | ✅ 9장 |
| Play | 8 | 7 | **8** | ✅ 8장 |

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
- **`config.json`** 항목에 필드 추가 (배율·오프셋은 장마다 다르다):
  ```json
  { "id": "00-hero-a", "type": "hero", "phone": null,
    "bg": { "file": "hero.png", "width": 2222, "height": 2401, "x": 4, "y": 220 } }
  { "id": "00-hero-b", "type": "hero", "phone": "05-home",
    "bg": { "file": "hero.png", "width": 2580, "height": 2788, "x": -1290, "y": 0 } }
  ```
  공통 좌표(`screen`·`notch`·`cream`)는 `hero` 블록에.
- **`compose.mjs`** 분기 — `entry.type === 'hero'`면 `hero.html`을 쓰고 `bg`·`phone`을
  주입. 그 외는 기존 경로 그대로. `node compose.mjs 00-hero`처럼 id를 주면 그것만 다시 만든다.
- 원본 이미지: `store-assets/screenshots/hero/hero.png` (**언어 공용 1장** —
  문구는 코드가 얹으므로 ko/en을 따로 만들 필요가 없다). 폰 안 캡처만 언어별.
- ⚠️ Play의 `captureStatusBarPx`는 80(안드로이드 기준)인데 `raw`에 든 건 iPhone
  캡처(1125×2436)라 실제로는 132다. 히어로는 `hero.statusBarPx: 132`로 따로 잡았다.
  **기존 7장은 80인 채로 두었다** — 고치면 이미 승인된 렌더가 다 바뀐다.

## 8. 작업 순서

1. [x] 은정님: Gemini로 이미지 생성 → `store-assets/screenshots/hero/hero.png`
       (화면이 마젠타가 아니라 회색으로 나왔지만, 좌표를 실측했으므로 문제없음)
2. [x] `hero.html` 신설 + `compose.mjs` 분기 + 양쪽 `config.json` 재구성
3. [x] ~~두 장이 이어지는지 픽셀 확인~~ → §1대로 파노라마 폐기, 각 장 독립 구성
4. [x] 화면 자리에 캡처가 정확히 들어갔는지 픽셀 확인 (원본 회색 잔상 0.04%,
       코너 안티에일리어싱뿐 — 네 변 안쪽 모두 캡처 색)
5. [x] 테마 2장 합치기 · `05-home` 제거 · Play `05-home` 제거
       → **App Store 9장(한도 10) · Play 8장(한도 8)**. 테마 합치기는 `template-duo.html`을
       썼다 — 커밋 `d82c71c`(브랜치 `chore/store-screenshots-reorder`)에 만들어져 있던
       폰 2대 겹침 템플릿을 꺼내 재사용. `05-home` raw는 히어로가 쓰므로 남겨 둔다.
       🔴 **테마 raw가 낡았다** — 검색창과 "맞춤 학습" 라벨이 남아 있다(둘 다 1.3.0에서
       사라진 UI). 7/30 홈 캡처 손수정 때 `05-home`만 고쳤다. 재캡처나 손수정이 필요하다.
6. [x] 6.5" 축소(`resize65.py`)
7. [ ] 두 스토어 업로드 (App Store는 심사 중이라 순서 주의 — `docs/` 릴리스 메모 참고)

⚠️ 3번은 눈이 아니라 **픽셀로** 확인할 것. 이 저장소는 "눈으로 봤다"가 실측을
대신하지 못한 전례가 여러 번 있다.
