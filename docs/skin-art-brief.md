# 스킨 배경 아트 브리프 — 가을 단풍 · 한글 한옥

2026-09-03 · 1.7.0(10/1) · **목업 = https://claude.ai/code/artifact/8479887c-d137-4213-8a2f-faf2de47bacb**

그림 두 장을 만들어 앱 배경으로 얹는다. 이 문서는 **그림을 만드는 사람이 보는 규격서**다.
색·구도·무게가 여기서 어긋나면 좋은 그림이라도 앱에서 안 보이거나 글자를 덮는다.

---

## §1 먼저 알아야 할 것 — 그림의 대부분은 가려진다

홈 화면은 카드로 덮여 있다. 실기(갤럭시 S22 · 1080×2340)에서 **배경이 실제로 보이는 자리**를
재 보면 이렇다.

```
   0 ┌──────────────────────────┐
     │                          │
     │   ▒▒▒  열림 357px  ▒▒▒   │  ← 인사말·아보카도. 그림이 가장 크게 보이는 곳
     │                          │
 357 ├──────────────────────────┤
     │ ███ 통계 카드            │
 578 ├──────────────────────────┤
     │ ▒ 54px                   │
 632 ├──────────────────────────┤
     │ ███ 복습 배너            │
 806 ├──────────────────────────┤
     │ ▒ 24px                   │
 830 ├──────────────────────────┤
     │ ███ 학습 타일 3개        │
1130 ├──────────────────────────┤
     │ ▒▒ "나의 학습" 제목 170px │  ← 글자만 있어 배경이 비친다
1300 ├──────────────────────────┤
     │ ███ 칩 · 단어장 카드 …   │  카드 사이 60px 틈으로만 비침
     │ ███                      │
2000 ├──────────────────────────┤
     │ ███ 탭바(면이 깔림)      │
2340 └──────────────────────────┘

     좌우 여백 60px 은 위아래로 계속 열려 있다
```

🔑 **결론: 그림의 무게를 위쪽에 둔다.** 아래는 카드가 거의 다 덮으므로, 아래쪽 요소는
"틈으로 언뜻 비치는 것"으로만 설계한다. 아래에 공들인 그림을 그리면 아무도 못 본다.

⚠️ 단, **단어장이 없는 새 사용자**는 화면이 거의 비어 배경이 통째로 보인다.
아래쪽이 허전해도 안 되므로 **잔잔하게 채우되 공들이지는 않는다.**

---

## §2 기술 규격 [고정]

| 항목 | 값 |
|---|---|
| 크기 | **1080 × 2340** (세로) |
| 형식 | **WebP** · 품질 80 안팎 |
| 용량 | **한 장 250KB 이하** (목표 150~200KB) |
| 배율 | 1배만 준비 — `resizeMode="cover"` 로 늘린다 |
| 파일명 | `assets/images/skin-autumn-bg.webp` · `assets/images/skin-hanok-bg.webp` |

**왜 250KB 인가** — 지금 앱에 들어가는 이미지가 10.7MB 인데 그중 아이콘 세 장이 7.4MB 다.
두 장 합쳐 0.5MB 는 부담이 아니다. 부드러운 그림(그라디언트·소프트 셰이프)은 WebP 압축이
잘 먹어 이 예산 안에 충분히 들어간다.

### 좌우가 잘려도 무너지지 않게

기기마다 비율이 다르다(19.5:9 ~ 20:9). `cover` 라서 **좌우가 각 5%씩 잘릴 수 있다.**
- 중요한 것을 가장자리에 두지 않는다
- 좌우 대칭이면 안전하다
- 가로로 이어지는 무늬(격자·결)는 잘려도 티가 안 난다 → 권장

---

## §3 색 [고정 — 이 팔레트 밖으로 나가지 말 것]

앱의 글자 대비를 이미 계산해 둔 값이다. 배경이 이 밖의 색을 들이면 카드 테두리가 묻히거나
글자가 안 읽힌다.

### 가을 단풍

| 쓰임 | 색 | 비고 |
|---|---|---|
| 바탕 | `#F7E9D7` | 호박빛 종이 — 그림의 기본 톤 |
| 카드 면 | `#FFF8EE` | 이 위에 카드가 얹힌다 |
| 단풍 빨강 | `#A8442A` | 가장 진한 색 |
| 참나무 갈색 | `#8A5D18` | |
| 은행 노랑 | `#D9A22B` | |
| 글자 | `#3A241A` | 그림에 쓰지 말 것 |

### 한글 한옥

| 쓰임 | 색 | 비고 |
|---|---|---|
| 바탕 | `#F4EFE3` | 한지 |
| 카드 면 | `#FCF9F2` | 창호지 |
| 기와 | `#333A3F` | 지붕 — 가장 진한 색 |
| 나무 기둥 | `#8B6A42` | 기둥·서까래·창살 |
| 단청 청 | `#1F5C8C` | 처마 끝 선 한 줄. **아껴 쓸 것** |
| 글자 | `#22201C` | 그림에 쓰지 말 것 |

⚠️ **진하기 상한** — 가장 진한 색도 **불투명도 25% 를 넘지 않는다.** 배경은 배경이다.
카드가 그 위에 얹혀도 카드 테두리(`#E3CDB0` / `#C9AC82`)가 보여야 한다.

---

## §4 가을 단풍 — 무엇을 그리나

> **한 문장:** 늦가을 오후, 창으로 든 햇살 아래 단풍잎이 천천히 내려앉는 종이.

```
위 (0~360)      오후 햇살. 화면 위쪽 모서리에서 비스듬히 드는 금빛.
                그 빛 속에 단풍잎 서넛이 크게, 흐리게 떠 있다.
                ★ 여기가 가장 많이 보이는 곳 — 공을 들인다.

가운데 (360~1300) 빛이 잦아들며 종이 바탕으로. 잎은 작고 성글게 몇 장.
                카드 틈과 좌우 여백으로만 비치므로 잔잔해야 한다.

아래 (1300~)     낙엽이 바닥에 쌓인다. 아래로 갈수록 촘촘하고 진하게.
                거의 가려지지만 새 사용자에게는 다 보인다.
```

- **잎은 세 종류**를 섞는다 — 단풍(손바닥 모양) · 은행(부채꼴) · 참나무(길쭉한 타원)
- 잎에 **가느다란 잎맥**을 넣으면 종이 위 그림 느낌이 산다
- 잎은 **떨어지는 중**이다 — 위는 작고 흐리고 기울고, 아래는 크고 진하고 겹친다
- ❌ 나무 전체·풍경·사람·건물을 그리지 않는다. 잎과 빛만.

---

## §5 한글 한옥 — 무엇을 그리나

> **한 문장:** 한옥 마루에 앉아 창호를 마주 본 자리. 위는 처마, 아래는 창살, 사이는 한지.

```
위 (0~360)      기와 처마가 화면을 위에서 덮는다. 완만한 곡선 한 겹,
                그 끝에 단청 선 한 줄(청색). 아래로 서까래가 짧게 뻗는다.
                ★ 여기가 가장 많이 보이는 곳 — 공을 들인다.

가운데 (360~1300) 한지 결. 아주 옅은 섬유 무늬가 화면 전체에 깔린다.
                이 층이 "전체적으로 한옥"을 실제로 만드는 것이다.

아래 (1300~)     창호 격자. 나무 창살이 가로세로로 짜인다.
                위로 갈수록 흐려져 한지 결에 녹아든다.
```

- **한옥은 위에서 덮는 집**이다. 지붕이 위에 있어야 건물로 읽힌다
- 격자 칸은 **정사각에 가깝게**, 살은 가늘게(2~3px 상당)
- 단청은 **선 한 줄만.** 처마 끝에만 쓰고 다른 곳에 칠하지 않는다
- 한지 결은 **가는 사선 두 벌**이 겹친 느낌 — 종이를 빛에 비췄을 때의 섬유
- ❌ 마당·기와 한 장 한 장·꽃·한복 입은 사람을 그리지 않는다. 재료와 구조만.

---

## §6 AI로 만든다면 — 프롬프트 초안

영어가 잘 먹는다. **만든 뒤 §3 색으로 보정**하는 것을 전제로 한다 — 모델은 지정 색을
정확히 내지 못한다.

**가을**
```
Vertical mobile wallpaper, 1080x2340. Soft warm amber paper background.
Golden late-afternoon light entering from the top-left corner, fading downward.
A few large translucent autumn leaves floating in the light at the top;
smaller sparse leaves in the middle; leaves accumulating densely at the bottom.
Three leaf types: maple, ginkgo, oak. Delicate visible leaf veins.
Muted palette: deep maple red, oak brown, ginkgo gold on amber cream.
Flat illustration, subtle, low contrast, lots of empty space in the middle.
No trees, no people, no landscape. Nothing in the center third.
```

**한옥**
```
Vertical mobile wallpaper, 1080x2340. Warm hanji paper background with
very subtle fiber texture across the whole image.
Top: a curved Korean hanok tile roof eave seen from below, dark slate grey,
with a single thin dancheong blue line along its edge, and short wooden
rafters extending downward.
Bottom: a wooden lattice window screen (changho), thin square grid,
fading upward into the paper.
Middle: empty warm paper.
Muted palette: slate grey, warm wood brown, one blue accent, on cream paper.
Flat illustration, architectural, calm, low contrast.
No courtyard, no flowers, no people. Nothing in the center third.
```

🔑 두 프롬프트 모두 **"Nothing in the center third"** 가 핵심이다. §1 의 이유다.

---

## §7 받은 뒤 확인 [내가 한다]

1. **크기·용량** — 1080×2340 · WebP · 250KB 이하
2. **가운데가 조용한가** — 카드를 얹었을 때 무늬가 비쳐 어수선하지 않은가
3. **카드 테두리가 보이는가** — 배경이 진하면 테두리가 묻힌다
4. **실기 확인** — 갤럭시 S22 에 얹어 스크린샷. 새 사용자(빈 화면)와 카드가 찬 화면 둘 다
5. ⚠️ **`preview` 프로필로 한 번** — 릴리스 빌드에서만 나는 UI 문제를 겪은 적이 있다

---

## §8 얹는 방법 [내가 한다]

`OceanBackdrop` 과 같은 구조 — 홈 컨테이너의 **첫 자식**, `pointerEvents="none"`,
`position:absolute` 로 화면 전체. 다른 점은 SVG 대신 `<Image>` 한 장이라는 것뿐이다.

```tsx
<Image
  source={require('@/assets/images/skin-autumn-bg.webp')}
  style={StyleSheet.absoluteFill}
  resizeMode="cover"
  pointerEvents="none"
/>
```

🔴 **층 규칙은 그대로다.** 배경 뒤 · 내용 앞. 절대 위치 요소는 DOM 순서만으로 뒤로 가지
않으므로 내용 쪽에 층을 명시해야 한다(웹 목업에서 이걸 놓쳐 낙엽이 카드 위에 그려졌다).

플래그는 `SKIN_LIST` 에서 두 스킨을 빼는 것으로 건다 — 팔레트와 이미지는 들어가 있되
선택기에 안 뜬다. 10/1 빌드에서 그 한 줄만 되돌린다.
