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
| 나무 | `#8B6A42` | 서까래·마루 널 |
| 기둥(석간주) | `#9E5A3C` | 궁궐 기둥의 붉은 갈색 |
| 단청 청 | `#1F5C8C` | 처마 밑 단청 |
| 단청 녹 | `#3F6B4A` | 처마 밑 단청 |
| 글자 | `#22201C` | 그림에 쓰지 말 것 |

🏛 **단청 두 색은 처마 밑에서만 쓴다**(§5). 거기서는 아끼지 않되 다른 데로 번지지
않게 한다 — 그 대비가 「궁궐 처마 + 조용한 나머지」를 만든다.

⚠️ **진하기 상한** — 가장 진한 색도 **불투명도 25% 를 넘지 않는다.** 배경은 배경이다.
카드가 그 위에 얹혀도 카드 테두리(`#E3CDB0` / `#C9AC82`)가 보여야 한다.

---

## §4 가을 단풍 — 무엇을 그리나

> **한 문장:** 늦가을 오후, 창으로 든 햇살 속을 잎이 **위에서 아래로 천천히 지나가는**
> 종이. 위에서 떠 있고, 가운데를 지나며, 아래에 쌓인다.

### 🍂 무엇이 이 스킨을 «가을»로 만드나 [프롬프트에 반드시 넣을 것]

**은행 노랑과 단풍 빨강이 나란히 있는 것.** 빨강만 있으면 그냥 따뜻한 종이고,
노랑이 옆에 와야 가을로 읽힌다 — 스킨 선택기의 미리보기 색을 은행 노랑으로 정한
것도 같은 이유다(`constants/skins.ts`에 근거가 적혀 있다).

- **잎은 세 종류**를 섞는다 — 단풍(손바닥) · **은행(부채꼴)** · 참나무(길쭉한 타원)
- 은행이 빠지면 계절이 흐려진다. 한옥에서 단청이 빠지면 민가가 되는 것과 같다
- 잎에 **가느다란 잎맥**을 넣으면 종이 위 그림 느낌이 산다

### 🔴 첫 그림이 왜 안 됐나 (2026-09-04 실측)

한옥과 **똑같은 두 가지**로 걸렸다.

| | 실측 | |
|---|---|---|
| 위쪽 띠 | y 0~552 · x 40~1064 | ✅ 잘 보인다. 살려 간다 |
| **가운데** | y 552~1976 (**1424px · 전체의 61%**) | 🔴 **최대 색차 7/255** = 완전한 단색. `opacity 0.35` 뒤엔 **2.4** |
| **아래쪽 띠** | y 1976~2336 (360px) | 🔴 **30px 만 보이고 330px 은 탭바 아래**(§1) |

브리프가 가운데에 "잎은 작고 성글게 몇 장"을 요구했는데 **한 장도 안 왔다.**
단어장이 없는 새 사용자는 이 61%를 통째로 보게 된다.

```
위 (0~590)        오후 햇살. 화면 위 모서리에서 비스듬히 드는 금빛.
                  그 빛 속에 잎 서넛이 크게, 흐리게 떠 있다.
                  ★ 가장 많이 보이는 곳 — 공을 들인다. 지금 것이 좋다.

가운데 (590~1800) ★ 새로 — 빛이 잦아들며 종이 바탕으로. 작은 잎이 **성글게**.
    x 0~110       🔑 **좌우 60px 띠에 걸치게 둔다.** 카드(x 60~1019)가 절대
    x 970~1080       덮지 않는 유일한 자리다. 가운데로 몰면 안 보인다.
                  ❌ 큰 잎·촘촘한 무늬 금지 — 카드 뒤가 어수선해진다.

아래 (1800~2340)  낙엽이 바닥에 쌓인다. 아래로 갈수록 촘촘하고 진하게.
                  🔴 **쌓임의 윗머리를 y 1800 에 둔다.** 첫 판은 1976 에서
                     시작해 30px 만 빼고 다 가렸다.
                  y 2006 아래는 여백(bleed) — 가로로 이어지므로 잘려도 티가 없다.
```

- 잎은 **떨어지는 중**이다 — 위는 크고 흐리고 기울고, 아래는 진하고 겹친다.
  이 «지나가는 중»이 위·가운데·아래를 하나로 잇는다(한옥의 처마→기둥→마루와 같은 몫)
- ❌ 나무 전체·풍경·사람·건물을 그리지 않는다. 잎과 빛만.

---

## §5 한글 한옥 — 무엇을 그리나

> **한 문장:** 경복궁 **수정전** 툇마루에 앉아 밖을 내다본 자리. 머리 위에 처마,
> 양옆에 기둥, 발밑에 마루. 그 사이는 비어 있다.

### 🏛 왜 수정전인가 [고증 — 프롬프트에 반드시 넣을 것]

**아무 한옥이 아니다.** 경복궁 **수정전(修政殿)** 이다. 한글 스킨이 이 건물을 쓰는
이유는 하나 — **세종 때 집현전이 있던 자리**이기 때문이다. 지금 건물은 1867년
경복궁 중건 때 세워진 것이다(국가유산청·위키 확인).

⚠️ **앱 문구에서 "집현전에서 한글을 만들었다"고 단정하지 말 것.** 세종 친제 기록이
있고, 집현전 학자 일부는 오히려 반대 상소를 올렸다. 그림은 **자리**를 가리키는 것이지
창제 장면이 아니다.

🔴 **이 고증이 첫 브리프에 없었다.** 그래서 프롬프트가 "Korean hanok" 로만 적혔고,
민가인지 궁궐인지 모를 그림이 나왔다. **건물 이름을 프롬프트에 직접 적는 것이 가장
센 지시다** — 모델이 수정전·경복궁을 안다.

**궁궐이라서 달라지는 것** (민가 한옥과 갈리는 지점):

| | 민가 | 수정전 |
|---|---|---|
| 처마 밑 | 나무색 그대로 | **단청** — 초록·청·주홍이 칸칸이 |
| 기둥 | 나무색 | **둥근 기둥에 석간주(붉은 갈색) 칠** |
| 규모 | 서너 칸 | **정면이 길다** — 기둥 사이가 넓게 반복된다 |
| 바닥 | 흙마당·쪽마루 | **돌 기단 위** |

⚠️ 지붕 형태·기단 층수 같은 **세부는 사진을 보고 확인할 것.** 여기 적은 것은
"궁궐로 읽히게 하는 최소한"이고, 정확한 실측치가 아니다.

🔑 **첫 브리프의 「단청은 처마 끝 선 한 줄·아껴 쓸 것」은 민가 기준이었다.** 수정전이라면
처마 밑 단청이 **건물의 정체 그 자체**다. 진하기는 색을 빼서가 아니라 `opacity 0.35` 로
잡는다 — 그 값은 이미 실기로 정해져 있다. §3 팔레트도 그에 맞춰 고쳤다(청+녹 두 색).

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
위 (0~590)        기와 처마 + 그 밑 단청. 지금 지붕은 잘 보이므로 ★ 살려 간다.
                  기와는 완만한 곡선 한 겹, 그 아래로 단청 띠와 서까래 마구리.
                  ★ 여기가 «수정전»을 만드는 유일한 자리다 — 공을 들인다.

좌우 (590~1850)   ★ 새로 — 궁궐 기둥 둘(석간주 붉은 갈색). 처마에서 마루까지.
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
- **단청은 처마 밑에만.** 거기서는 아끼지 않는다(궁궐의 정체다). 대신 기둥·마루·
  가운데로는 **번지지 않는다** — 진하기는 색을 빼서가 아니라 `opacity 0.35` 로 잡는다
- 한지 결은 **가는 사선 두 벌**이 겹친 느낌 — 종이를 빛에 비췄을 때의 섬유
- ❌ **담장·마당·꽃·한복 입은 사람을 그리지 않는다.** 재료와 구조만.
- ❌ 창호 격자·현판도 넣지 않는다 — 처마·기둥·마루로 이미 수정전이 된다

⚠️ **좌우 잘림 여유** — 20:9 기기에서 좌우가 각 14px 쯤 잘린다. 기둥의 **안쪽 윤곽**을
x 100 / x 980 근처에 두고 바깥은 화면 끝까지 흘리면, 잘려도 기둥이 상하지 않는다.

---

## §6 AI로 만든다면 — 프롬프트 초안

영어가 잘 먹는다. **만든 뒤 §3 색으로 보정**하는 것을 전제로 한다 — 모델은 지정 색을
정확히 내지 못한다.

**가을** — 2026-09-04 개정. 첫 판이 §4 의 이유로 안 됐다(가운데 61%가 백지, 아래 띠는 가려짐).

한옥과 같은 규칙: 좌표는 **비율(%)로**, 아래는 **y 2006 위**에, 가운데 요소는 **양 끝으로**.

```
Vertical mobile wallpaper, 1080x2340, flat illustration,
subtle, low contrast, calm.
Soft warm amber paper background.

Autumn leaves are falling THROUGH the frame from top to bottom — floating in the
light at the top, drifting past the middle, settled in a pile at the bottom.
Three leaf types throughout: maple (palmate), ginkgo (fan-shaped), oak (long oval).
The ginkgo yellow beside the maple red is what makes this read as autumn —
never drop the ginkgo. Delicate visible leaf veins.

TOP 25%: golden late-afternoon light entering diagonally from the top-left corner
and fading downward. Three or four large translucent leaves floating in that light,
tilted at different angles.

MIDDLE (25% to 77%): almost empty warm paper. Only a few SMALL leaves, sparse and
far apart, and place them ALONG THE LEFT AND RIGHT EDGES of the frame (within about
the outer 10% on each side), drifting downward. Keep the central area of this band
completely empty — no large leaves, no dense pattern, nothing busy.

BOTTOM 23%: leaves accumulating in a pile across the full width, getting denser and
deeper in color toward the bottom edge. The top edge of the pile begins right at the
77% line, not lower.

Muted palette: deep maple red, oak brown, ginkgo gold on amber cream.
No trees, no branches, no people, no landscape, no buildings, no text. Leaves and
light only. The center of the image must stay quiet.
```

**한옥** — 2026-09-04 개정. 첫 판(지붕+빈벽+담장)이 §5 의 이유로 안 됐다.

좌표를 **비율(%)로** 준다. 모델은 픽셀 좌표를 잘 못 지키지만 "위 25%" 같은 말은 지킨다.

```
Vertical mobile wallpaper, 1080x2340, flat vector illustration,
calm and low contrast, lots of empty space.
Warm cream hanji paper background with a very faint fiber texture.

Subject: Sujeongjeon Hall at Gyeongbokgung Palace, Seoul — a Joseon royal palace
building, NOT a common folk house. The viewpoint is sitting on its wooden veranda
looking outward: the painted eave is overhead, two palace pillars frame the view at
the far left and right, and the veranda floor is underfoot.

TOP 25%: the eave of Sujeongjeon seen from below, spanning the full width —
grey clay roof tiles above, and beneath them the dancheong: the traditional Korean
palace beam painting in muted green, blue and deep red, repeating panel by panel,
with round rafter ends showing in a row. This painted beam is the single most
important element; it is what makes the building read as a palace.

FAR LEFT AND FAR RIGHT EDGES, from the eave down to the floor: two round palace
pillars in muted iron-oxide reddish brown, each only about 10% of the image width,
standing at the very edges of the frame. Soft shading on one side so they read as
round. They rest on the veranda floor and do not stop in mid-air.

CENTER (between the two pillars, from below the eave down to 77%): completely
empty cream paper. No pattern, no objects, no structure at all.

BOTTOM 23%: the wooden veranda floor (maru) — simple horizontal plank lines running
across the full width, warm brown, slightly darker toward the bottom edge.

Muted palette: grey roof tiles, green-blue-red dancheong, iron-oxide red pillars,
warm brown floor, on warm cream paper. Everything desaturated and calm.
No boundary wall, no fence, no lattice window, no courtyard, no flowers, no people,
no furniture, no signboard, no text. The middle of the image must stay empty.
```

🔑 두 프롬프트 모두 **가운데를 조용히 두라는 지시**가 핵심이다. §1 의 이유다.

⚠️ 다만 **"비우라"와 "아무것도 없다"는 다르다.** 첫 판 둘 다 가운데가 통째로 백지로
왔다(한옥 색차 4/255 · 가을 7/255). 그래서 개정 프롬프트는 **비울 곳과 남길 곳을
갈라서** 적는다 — 가운데의 *한복판*은 비우되, **좌우 10% 가장자리에는 요소를 둔다**
(한옥은 기둥, 가을은 작은 잎). 거기가 카드가 절대 안 덮는 자리다.

한옥 쪽은 거기에 더해 둘이 더 있다:

1. **건물 이름을 적는다**(Sujeongjeon · Gyeongbokgung). §5 의 고증이 여기서 걸린다.
   이름을 빼고 "Korean hanok" 이라고만 하면 민가가 나온다 — 첫 판이 그랬다.
2. **기둥을 양 끝으로 밀어낸다.** 가운데로 오면 카드에 완전히 묻히고, 가장자리라야
   §1 의 열린 60px 띠에 걸린다.

⚠️ **받은 뒤 반드시 확인** — 모델은 "far left and right edges" 를 무시하고 기둥을
가운데로 모으는 일이 잦다. 단청을 통째로 빼먹기도 한다. §7 에 항목으로 넣어 뒀다.

---

## §7 받은 뒤 확인 [내가 한다]

1. **크기·용량** — 1080×2340 · WebP · 250KB 이하
2. **가운데가 조용한가** — 카드를 얹었을 때 무늬가 비쳐 어수선하지 않은가
3. **카드 테두리가 보이는가** — 배경이 진하면 테두리가 묻힌다
4. 🔴 **y 2006 아래에 공들인 것이 없는가** — §1. 첫 두 장이 여기서 걸렸다
5. 🔴 **가운데 좌우 끝에 요소가 있는가** — 한옥은 기둥, 가을은 작은 잎.
   가운데가 통째로 백지면 다시 뽑는다. **판정은 눈이 아니라 색차로**:
   가운데 띠를 훑어 **최대 색차가 14/255 미만이면 백지다**(`opacity 0.35` 뒤 5 미만).
   첫 판이 한옥 4 · 가을 7 이었고 둘 다 "비워 달라"는 지시를 그렇게 알아들었다
6. 🏛 **정체가 남았는가** — 한옥은 처마 밑 **단청**과 **붉은 기둥**(나무색뿐이면 민가다·§5).
   가을은 **은행 노랑**(빨강만 있으면 그냥 따뜻한 종이다·§4).
   수정전의 지붕·기단 세부는 사진과 대조할 것
7. 🔴 **원본을 화면과 겹쳐 볼 것** — "헤더 뒤가 비었다"만 보고 통과시켰다가
   **3배 확대된 것을 못 잡았다.** 확인은 이렇게 한다:
   `OPACITY` 를 잠깐 `1.0` 으로 올리고 스크린샷 → 원본과 나란히 놓고 대조.
   두 그림의 같은 부분이 같은 높이에 있어야 한다.

### 4·5번을 재는 스크립트

눈으로는 «옅은 무늬»와 «백지»가 안 갈린다. 값으로 잰다.

🔑 **가운데는 한복판과 좌우 끝을 따로 재야 한다.** 설계가 그 둘을 반대로 요구하기
때문이다 — 한복판은 비우고(카드가 얹힌다), 좌우 끝에는 둔다(카드가 안 덮는다).
한 덩어리로 재면 기둥이 «어수선»으로 잘못 걸린다.

```python
from PIL import Image
ART = 'assets/images/skin-hanok-bg.webp'; BG = (0xF4, 0xEF, 0xE3)
# 가을이면  'assets/images/skin-autumn-bg.webp',  (0xF7, 0xE9, 0xD7)

art = Image.open(ART).convert('RGB')
def peak(y0, y1, xs):
    return max(max(abs(art.getpixel((x, y))[i] - BG[i]) for i in range(3))
               for y in range(y0, y1, 4) for x in xs)

EDGE = list(range(0, 110, 4)) + list(range(970, 1080, 4))   # 카드가 안 덮는 좌우 띠
MID  = list(range(110, 970, 6))                             # 카드가 앉는 한복판
ALL  = list(range(0, 1080, 6))

print('위          ', peak(   0,  592, ALL),  ' 100 이상')
print('가운데 한복판 ', peak( 700, 1800, MID),  ' 14 미만 (비어야 한다)')
print('가운데 좌우끝 ', peak( 700, 1800, EDGE), ' 40 이상 (기둥·잎이 있어야 한다)')
print('아래 보임    ', peak(1800, 2006, ALL),  ' 60 이상')
print('아래 가려짐  ', peak(2006, 2340, ALL),  ' 얼마든 (안 보인다)')
```

**지금 두 그림을 이 잣대로 재면 이렇게 나온다** — 넷 다 새 그림에서 뒤집혀야 한다:

| | 위 | 가운데 한복판 | 가운데 좌우끝 | 아래 보임 |
|---|---|---|---|---|
| 합격선 | 100↑ | 14↓ | 40↑ | 60↑ |
| 한옥(첫 판) | 220 ✅ | 10 ✅ | **9 ❌** 기둥 없음 | **10 ❌** 담장이 아래로 빠짐 |
| 가을(첫 판) | 193 ✅ | 7 ✅ | **7 ❌** 잎 없음 | **56 ❌** 쌓임이 30px만 걸침 |

⚠️ **y 592 는 한옥 지붕이 실제로 끝나는 줄이다**(실측). 가운데를 590 부터 재면 지붕
끝 2px 이 섞여 184 가 나오고 «어수선»으로 오판한다 — 그래서 700 부터 잰다.
8. **실기 확인** — 갤럭시 S22 에 얹어 스크린샷. 새 사용자(빈 화면)와 카드가 찬 화면 둘 다
9. ⚠️ **`preview` 프로필로 한 번** — 릴리스 빌드에서만 나는 UI 문제를 겪은 적이 있다

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
