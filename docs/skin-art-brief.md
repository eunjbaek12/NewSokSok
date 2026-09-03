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
2006 ├══════════════════════════┤  ← 여기부터 아래는 절대 안 보인다
     │ ███ 앱 탭바              │
2180 ├──────────────────────────┤
     │ ███ 폰 내비게이션 바     │
2340 └──────────────────────────┘

     좌우 여백 60px 은 위아래로 계속 열려 있다 (카드 x 60~1019)
```

🔑 **결론: 그림의 무게를 위쪽에 둔다.** 아래는 카드가 거의 다 덮으므로, 아래쪽 요소는
"틈으로 언뜻 비치는 것"으로만 설계한다. 아래에 공들인 그림을 그리면 아무도 못 본다.

### 🔴 y 2006 아래 334px(14%)는 **어떤 경우에도 안 보인다**

첫 그림 두 장이 이 사실을 모른 채 만들어져, **아래쪽 띠를 통째로 못 쓰게 됐다** —
한옥 담장은 y 2028~2336, 가을 낙엽 더미는 y 1980~2336 에 그려졌는데 탭바가 y 2006 부터
시작한다. 한옥은 100%, 가을은 26px 만 빼고 다 가려졌다.

**스크롤해도 안 나온다.** 탭바는 `position:absolute · bottom:0` 이라 화면에 고정이고,
카드가 탭바 **밑으로** 지나간다. 목록을 끝까지 밀어도 y 2006 아래는 탭바·내비바다.
(실측: 끝까지 스크롤한 뒤 y 2050·2150 = `#FAF9F6` 탭바, y 2250 = `#FFFEFE` 내비바.)

🔑 **아래쪽에 뭔가 보이게 하려면 y 2006 위에 그린다.** 그 아래는 비율이 다른 기기를 위한
여백(bleed)으로만 쓴다 — 그래서 아래쪽은 **가로로 이어지는 무늬**여야 잘려도 티가 안 난다.

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

아래 (1300~2006) 낙엽이 바닥에 쌓인다. 아래로 갈수록 촘촘하고 진하게.
                거의 가려지지만 새 사용자에게는 다 보인다.
                🔴 **쌓임의 윗머리를 y 1800 안쪽에 둔다.** 첫 판은 y 1980 에서
                시작해 26px 만 빼고 탭바에 다 가렸다(§1).

여백 (2006~2340) 잎이 화면 밖으로 이어지는 것처럼만. 여기는 안 보인다.
```

- **잎은 세 종류**를 섞는다 — 단풍(손바닥 모양) · 은행(부채꼴) · 참나무(길쭉한 타원)
- 잎에 **가느다란 잎맥**을 넣으면 종이 위 그림 느낌이 산다
- 잎은 **떨어지는 중**이다 — 위는 작고 흐리고 기울고, 아래는 크고 진하고 겹친다
- ❌ 나무 전체·풍경·사람·건물을 그리지 않는다. 잎과 빛만.

---

## §5 한글 한옥 — 무엇을 그리나

> **한 문장:** 한옥 툇마루에 앉아 밖을 내다본 자리. 머리 위에 처마, 양옆에 기둥,
> 발밑에 마루. 그 사이는 비어 있다.

### 🔴 첫 그림이 왜 안 됐나 (2026-09-04 실기)

「지붕 + 빈 벽 + 담장」으로 나왔는데 **화면에서는 지붕만 떠 있었다.**

- 빈 벽 구간(y 700~1900)을 가로로 훑으니 **가장 큰 색차가 4/255** — 사실상 완전한 단색이다.
  불투명도 0.35 를 거치면 1.4 로 줄어 아무것도 안 보인다. **지붕을 받치는 것이 없다.**
- 담장은 y 2028~2336 이라 §1 대로 **통째로 탭바 아래**였다.
- 게다가 **기둥 없이 담장만 있는 것은 구조가 안 맞는다.** 담장은 마당 저편의 경계이지
  처마 바로 밑에 오는 것이 아니다.

🔑 **고치는 방향: 건물이 서 있게 만든다.** 처마 → 기둥 → 마루로 위아래를 잇는다.
기둥은 **카드가 절대 덮지 않는 좌우 여백 60px**에 세운다.

```
위 (0~590)        기와 처마. 지금 것이 잘 보이므로 ★ 그대로 간다.
                  완만한 곡선 한 겹, 끝에 단청 선 한 줄, 서까래가 짧게 아래로.

좌우 (590~1850)   ★ 새로 — 나무 기둥 둘. 처마에서 마루까지 내려온다.
    x 0~110       카드(x 60~1019)에 안쪽 절반이 가리고 바깥 60px 만 남는다.
    x 970~1080    그 가려짐이 오히려 "가까이 서서 처마 밑을 올려다본" 깊이를 만든다.

가운데 (590~1800) 빈 한지. 아주 옅은 섬유 결만. ❌ 여기에 기둥·무늬를 넣지 않는다.

아래 (1800~2340)  ★ 새로 — 툇마루. 가로로 이어지는 널 몇 줄.
                  y 2006 위(1800~2006)가 실제로 보이는 부분이고,
                  그 아래는 비율 다른 기기를 위한 여백이다.
                  가로 무늬라 잘려도 티가 안 난다 → §2 의 권장 그대로.
```

- **한옥은 위에서 덮는 집**이다. 지붕이 위에 있어야 건물로 읽힌다
- 기둥은 **원기둥**이다 — 한쪽에 옅은 그림자를 넣어야 둥글게 읽힌다
- 기둥 밑은 **마루에 닿는다.** 허공에서 끊기면 안 된다
- 단청은 **선 한 줄만.** 처마 끝에만 쓰고 다른 곳에 칠하지 않는다
- 한지 결은 **가는 사선 두 벌**이 겹친 느낌 — 종이를 빛에 비췄을 때의 섬유
- ❌ **담장·마당·꽃·한복 입은 사람을 그리지 않는다.** 재료와 구조만.
- ❌ 창호 격자도 넣지 않는다 — 처마·기둥·마루로 이미 한옥이 된다

⚠️ **좌우 잘림 여유** — 20:9 기기에서 좌우가 각 14px 쯤 잘린다. 기둥의 **안쪽 윤곽**을
x 100 / x 980 근처에 두고 바깥은 화면 끝까지 흘리면, 잘려도 기둥이 상하지 않는다.

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

**한옥** — 2026-09-04 개정. 첫 판(지붕+빈벽+담장)이 §5 의 이유로 안 됐다.

좌표를 **비율(%)로** 준다. 모델은 픽셀 좌표를 잘 못 지키지만 "위 25%" 같은 말은 지킨다.

```
Vertical mobile wallpaper, 1080x2340, flat vector illustration,
calm and low contrast, lots of empty space.
Warm cream hanji paper background with a very faint fiber texture.

The viewpoint is sitting on the wooden veranda of a Korean hanok, looking outward:
the eave is overhead, two pillars frame the view at the far left and right,
and the veranda floor is underfoot. Everything between them is empty paper.

TOP 25%: a curved hanok tile roof eave seen from below, spanning the full width,
dark slate grey, with short wooden rafters pointing down and a single thin
blue dancheong line along the eave edge.

FAR LEFT AND FAR RIGHT EDGES, from the eave down to the floor: two round wooden
pillars, warm brown, each only about 10% of the image width, standing at the very
edges of the frame. Soft shading on one side so they read as round. They rest on
the veranda floor and do not stop in mid-air.

CENTER (between the two pillars, from below the eave down to 77%): completely
empty cream paper. No pattern, no objects, no structure at all.

BOTTOM 23%: a wooden veranda floor (maru) — simple horizontal plank lines running
across the full width, warm brown, slightly darker toward the bottom edge.

Muted palette: slate grey roof, warm wood brown pillars and floor, one thin blue
accent line, on warm cream paper.
No boundary wall, no fence, no lattice window, no courtyard, no flowers, no people,
no furniture, no text. The middle of the image must stay empty.
```

🔑 두 프롬프트 모두 **가운데를 비우라는 지시**가 핵심이다. §1 의 이유다.
한옥 쪽은 거기에 더해 **기둥을 양 끝으로 밀어내는 지시**가 핵심이다 — 가운데로 오면
카드에 완전히 묻히고, 가장자리에 있어야 §1 의 열린 60px 띠에 걸린다.

⚠️ **받은 뒤 반드시 확인** — 모델은 "far left and right edges" 를 무시하고 기둥을
가운데로 모으는 일이 잦다. §7 에 확인 항목으로 넣어 뒀다.

---

## §7 받은 뒤 확인 [내가 한다]

1. **크기·용량** — 1080×2340 · WebP · 250KB 이하
2. **가운데가 조용한가** — 카드를 얹었을 때 무늬가 비쳐 어수선하지 않은가
3. **카드 테두리가 보이는가** — 배경이 진하면 테두리가 묻힌다
4. 🔴 **y 2006 아래에 공들인 것이 없는가** — §1. 첫 두 장이 여기서 걸렸다
5. 🔴 **기둥이 양 끝에 있는가** — 가운데로 모였으면 다시 뽑는다(§6)
6. 🔴 **원본을 화면과 겹쳐 볼 것** — "헤더 뒤가 비었다"만 보고 통과시켰다가
   **3배 확대된 것을 못 잡았다.** 확인은 이렇게 한다:
   `OPACITY` 를 잠깐 `1.0` 으로 올리고 스크린샷 → 원본과 나란히 놓고 대조.
   두 그림의 같은 부분이 같은 높이에 있어야 한다.
7. **실기 확인** — 갤럭시 S22 에 얹어 스크린샷. 새 사용자(빈 화면)와 카드가 찬 화면 둘 다
8. ⚠️ **`preview` 프로필로 한 번** — 릴리스 빌드에서만 나는 UI 문제를 겪은 적이 있다

---

## §8 얹는 방법 [내가 한다]

`OceanBackdrop` 과 같은 구조 — 홈 컨테이너의 **첫 자식**, `pointerEvents="none"`,
`position:absolute` 로 화면 전체. 다른 점은 SVG 대신 `<Image>` 한 장이라는 것뿐이다.

```tsx
<Image
  source={require('@/assets/images/skin-autumn-bg.webp')}
  style={{ width: '100%', height: '100%', opacity: 0.35 }}
  resizeMode="cover"
/>
```

🔴 **`StyleSheet.absoluteFill` 을 Image 에 주면 안 된다.** 이 문서가 처음에 그렇게 적어
두었고, 그대로 얹었더니 **그림이 3배로 확대돼 위쪽 30%만 화면을 채웠다**(가을은 잎 하나,
한옥은 처마만 보였다). 화면에 값을 찍어 갈랐다:

```
win 360x780  |  OUTER 360x780  |  INNER 1080x2340  |  asset 1080x2340 s1
```

감싼 View(OUTER)는 멀쩡한데 Image(INNER)만 1080×2340 **dp** 로 잡혔다. 파일명에 밀도
접미사가 없어 에셋이 scale 1 로 읽히고(`s1`), 그 고유 크기가 `absoluteFill` 의
top/bottom/left/right: 0 을 이겼다. 상자가 이미 화면보다 크니 `cover` 는 할 일이 없었고,
결과는 **왼쪽 위 모서리 기준 3배 확대**다.

`width/height: '100%'` 는 부모를 기준으로 재므로 고유 크기에 밀리지 않는다.
⚠️ **파일명에 `@3x` 를 붙이는 것은 답이 아니다** — dpr 3 기기에서만 우연히 맞고
dpr 2 기기에서 같은 증상이 다시 난다. (감싸는 View 는 `absoluteFill` 그대로 둔다.)

🔴 **층 규칙은 그대로다.** 배경 뒤 · 내용 앞. 절대 위치 요소는 DOM 순서만으로 뒤로 가지
않으므로 내용 쪽에 층을 명시해야 한다(웹 목업에서 이걸 놓쳐 낙엽이 카드 위에 그려졌다).

플래그는 `SKIN_LIST` 에서 두 스킨을 빼는 것으로 건다 — 팔레트와 이미지는 들어가 있되
선택기에 안 뜬다. 10/1 빌드에서 그 한 줄만 되돌린다.
