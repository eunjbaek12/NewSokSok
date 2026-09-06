# 스킨 배경 아트 브리프 — 가을 단풍 · 한글

2026-09-03 (2026-09-04 개정) · 1.7.0(10/1)
**목업 = https://claude.ai/code/artifact/8479887c-d137-4213-8a2f-faf2de47bacb**

두 스킨의 홈 배경 규격서다. 색·구도·무게가 여기서 어긋나면 좋은 그림이라도 앱에서
안 보이거나 글자를 덮는다.

둘 다 AI 로 그린다. 가을은 §4 구도, 한글은 §5 구도, 프롬프트는 §6 에 있다.
⚠️ **한글은 세 번 접었다**(수정전 그림 · 훈민정음 판식 · 자모). 왜 접었는지가
§5 에 있고, 그게 다음 시안을 고르는 기준이다.

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

### 🔴 열린 자리는 **둘**이다 — 위 그림이 아래쪽 하나를 놓치고 있었다

배경 없는 화면(`OPACITY = 0`)을 한 줄씩 훑어 재 보니, 전체 폭으로 열린 띠가 위 말고
하나 더 있다.

| 자리 | y | 열린 폭 |
|---|---|---|
| 인사말·아보카도 | 0~360 | **전체 폭** |
| 카드 구간 | 400~1130 | 좌우 **60px** + `y 580·830` 카드 틈 |
| **「나의 학습」 + 칩 줄 + 카드 틈** | **1150~1400** | **전체 폭 250px** |
| 목록 구간 | 1450~1990 | 좌우 **60px** |

🔴 **좌우 여백은 «10%(108px)»가 아니라 60px 이다.** 카드가 `x 60~1019` 를 덮는다.
프롬프트에 「outer 10%」라고 적어 두면 모델은 그 안쪽에 요소를 두고, 그 절반은 카드
뒤로 들어간다. 후보 열 장을 그렇게 날렸다 — **레일에 걸리려면 바깥 6% 안이다.**

🔑 **y 1150~1400 은 흩어진 요소를 둘 수 있는 두 번째 자리다.** 위 그림이 이를 「제목
170px」로만 적어 두어 아무도 쓰지 않았다. 실제로는 칩 줄과 카드 틈까지 250px 이 열린다.
(구름 그림은 이 자리가 거의 비어 있다 — 덮임 0.2%. 다음 판에서 채울 여지다.)

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

### 한글

| 쓰임 | 색 | 비고 |
|---|---|---|
| 바탕 | `#F4EFE3` | 한지 |
| 카드 면 | `#FCF9F2` | 창호지 |
| 먹 | `#333A3F` | **구름 윤곽선** — 기본이 되는 색 |
| 단청 청 | `#1F5C8C` | **구름 두세 점에만** 얹는 악센트 |
| 글자 | `#22201C` | 그림에 쓰지 말 것 |
| ~~나무·석간주·단청 녹~~ | ~~`#8B6A42` `#9E5A3C` `#3F6B4A`~~ | 접은 한옥 시안용 |

🔑 **구름은 선으로만 그린다**(§5). 면을 채우면 덩어리가 되고 화면이 답답해진다.

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

## §5 한글 — 무엇을 그리나

> **한 문장:** 한지 위를 **여의두 구름무늬**가 천천히 흘러가는 결.
> 위에 크게 떠 있고, 가운데를 지나며, 아래에 모인다.

### ☁️ 무엇이 이 스킨을 만드나 [프롬프트에 반드시 넣을 것]

**여의두(如意頭) 구름무늬** — 둥근 잎 서넛이 뭉친 머리에 꼬리가 말려 나가는 그 형태다.
단청·나전칠기·궁중 자수에 두루 쓰인 무늬라 **한 눈에 «우리 것»으로 읽힌다.**
그냥 뭉게구름을 그리면 어느 나라 하늘도 되므로, **여의두 형태를 지키는 것이 전부다.**

- **선묘(線描)** — 면을 채우지 않고 윤곽선으로 그린다. 채우면 무거워진다
- 먹 한 색이 기본. 단청 청(`#1F5C8C`)은 **몇 점에만** 얹어 악센트로
- 구름은 **흘러가는 중**이다 — 위는 크고 성글게, 아래로 갈수록 작고 모인다

### 🔴 왜 글자를 안 쓰나 (2026-09-04)

자모·판식·큰 글자를 다 목업으로 만들어 봤다. **배경에 글자를 두면 UI 의 한글 텍스트와
싸운다** — 인사말 뒤의 큰 ㄱ·ㅍ 이 잘려 «저게 뭐지»가 된다.

🔴 **훈민정음 판식도 같은 이유로 접었다.** 화면은 가벼워졌지만(중앙값 0.0) 변란이
그냥 네모 테두리로 읽혀 **«저게 뭔가 할 것 같다»** 는 판정을 받았다. 판식은 목판본을
아는 사람에게만 판식이다.

🔑 **여기서 얻은 규칙: 배경은 «읽는 것»이 아니라 «보는 것»이어야 한다.**
UI 가 이미 글자로 가득하다.

⚠️ 이름은 「한글」 그대로 간다(은정님 판단). 무늬는 한글 자체가 아니라 그 시대의 결이다.

### 🔴 왜 한옥 그림을 접었나 (2026-09-04 실기)

수정전 그림(처마+기둥+마루)까지 만들어 얹었는데 **화면이 답답했다.** 값으로 갈렸다:

| 좌우 여백이 원래 바탕보다 어두워진 정도 | 중앙값 | 상위10% |
|---|---|---|
| 수정전(기둥) | **54.2** | 58.3 |
| 선으로 그린 것(판식) | **0.0** | 35.9 |
| *가을 잎(잘 되는 쪽)* | *0.8* | *46.5* |

🔑 **기둥이 위아래로 이어진 «덩어리»라 띠 전체가 균일하게 어두워진다.** 잎은 흩어져
있어 대부분이 원래 바탕이고 잎이 있는 곳만 어둡다. 이 차이가 «가볍다/답답하다»를 가른다.
→ **배경 요소는 덩어리가 아니라 흩어진 것이어야 한다.**

곁가지로 헤더 부제(`textSecondary`) 대비도 **6.20 → 8.46** 으로 올랐다.

🔑 **근거도 약했다.** 수정전은 집현전 자리라는 연결이 있지만 **그 사실을 아는
사용자가 없다.** 배경 하나에 설명이 필요하면 그 배경은 진 것이다.

### ✅ 구름무늬가 들어왔다 (2026-09-04)

`assets/images/skin-hanok-bg.webp` = §6 프롬프트로 뽑은 여의두 구름. 1408×3040 →
1080×2340 · 75KB. 자리 표시용이던 수정전 그림을 교체했다.

받은 그림을 재 보니 이렇다(그림의 **실제 종이색** `#FEF8F1` 기준 · 덮인 넓이):

| 띠 | 이 그림 | 가을(통과한 것) | |
|---|---|---|---|
| 위 0~592 | 5.5% | — | 인사말 뒤에 큰 구름 서넛 ✅ |
| 가운데 한복판 | **0.4%** | 3.4% | 비어야 하는 자리 ✅ |
| 가운데 좌우끝 | 3.7% | 10.7% | 있어야 하는 자리 ✅ |
| 아래 1800~2006 | 12.8% | 35.9% | 드리프트가 **y 1750** 에서 시작 ✅ |

⚠️ **선묘라 숫자가 낮게 나온다.** 잎은 면이고 구름은 윤곽선이라 같은 잣대로 재면
절반 이하가 된다 — §7 의 경고 그대로다. **판정은 합성 목업으로 했다.**

🔑 **그림의 종이색이 토큰보다 밝다**(`#FEF8F1` vs `#F4EFE3`). 배경이 `0.35` 합성 뒤
휘도 239.2 → 242.2 로 **떠오른다.** 확인해 보니 무해했다 — 카드 테두리(y361~363,
`#DED3BE`)와의 차이가 오히려 **26.8 → 30.0** 으로 커졌다. 배경을 밝히는 그림은
테두리를 죽이지 않는다. (진하게 만드는 그림이었다면 반대였다.)

### 🏛 수정전 고증 [보류 — 스토어 이미지 등에 쓸 수 있어 남긴다]

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

### 옛 시안 이력 [닫힌 건 — 읽을 필요 없다]

1. **지붕 + 빈 벽 + 담장** — 빈 벽의 색차가 4/255 라 «지붕만 떠 있었다». 담장은
   y 2028~2336 이라 통째로 탭바 아래였고, 기둥 없이 담장만 있는 것은 구조도 안 맞았다.
2. **처마 + 기둥 + 마루** — 1번을 고쳐 만들었고 구조는 섰지만, 위의 실측대로
   **기둥 덩어리가 화면을 가뒀다.**
3. **훈민정음 판식**(사주쌍변+계선, 코드 생성) — 화면은 가벼웠으나 **변란이 그냥
   네모 테두리로 읽혔다.** → 구름무늬로.

🔑 **1·2·3 을 하나로 꿰는 교훈: 실기에 얹기 전에 목업을 본다.** 세 번 다 만들어
얹은 뒤에야 아니라는 걸 알았다. 지금은 합성 목업을 만드는 길이 있다 —
`OPACITY = 0` 으로 배경 없는 스크린샷을 받고, 바탕색(`background` 토큰)과 같은
픽셀만 마스크로 잡아 후보를 `0.35` 로 합성하면 **기기에 얹지 않고도 실제 화면을
볼 수 있다.** 후보 열 개를 한 시트로 만들어 고르는 데 몇 분이면 된다.

⚠️ 남는 교훈 하나 — **좌우 잘림 여유**: 20:9 기기에서 좌우가 각 14px 쯤 잘린다.
세로 요소는 바깥 윤곽을 화면 끝까지 흘려야 잘려도 상하지 않는다.

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

**한글(구름무늬)** — 2026-09-04. 건물·글자·판식을 다 접고 온 자리다(§5).

```
Vertical mobile wallpaper, 1080x2340, flat line illustration,
calm and low contrast, lots of empty space.
Warm cream hanji paper background with a very faint fiber texture.

Subject: yeouidu cloud motifs — the traditional Korean decorative cloud found in
dancheong painting, mother-of-pearl lacquerware and court embroidery. Each cloud is
a cluster of three or four rounded lobes with a curling tail trailing off to one
side. Draw them as OUTLINES ONLY, thin ink strokes, never filled in. This specific
lobed-and-curling shape is what makes the image read as Korean — plain fluffy
clouds would not.

The clouds drift slowly down through the frame: large and sparse at the top,
small along the edges in the middle, gathering at the bottom.

TOP 25%: three or four large clouds floating apart from one another, tilted at
different angles. Leave clear space between them — they must not overlap into a
tangle.

MIDDLE (25% to 77%): almost empty paper. A few SMALL clouds placed ALONG THE LEFT
AND RIGHT EDGES of the frame, within about the outer 10% on each side. Keep the
central area of this band completely empty — nothing there at all.

BOTTOM 23%: a drift of clouds gathering across the full width, denser toward the
bottom edge. The top of the drift begins right at the 77% line, not lower.

Muted palette: soft ink grey outlines on warm cream paper, with a single dusty blue
used on only two or three clouds as an accent. Everything desaturated and quiet.
No sky, no landscape, no buildings, no people, no letters, no text, no frame or
border. The middle of the image must stay empty.
```

🔴 **«outlines only, never filled» 를 빼지 말 것.** 면을 채우면 덩어리가 되고,
덩어리는 화면을 가둔다 — 수정전 기둥이 그래서 접혔다(§5).

🔴 **«must not overlap into a tangle» 도 마찬가지다.** 목업에서 구름 셋을 겹쳤더니
낙서처럼 엉켰다. 서로 떨어뜨려야 무늬로 읽힌다.

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

⚠️ **이 잣대는 «면으로 그린 그림»용이다.** 구름무늬·판식처럼 **선으로 된 배경**은
한복판에 선이 지나가면 「한복판 14 미만」에 걸린다(판식 실측 74). 그건 결함이 아니다
— 선은 얇아서 화면을 어둡게 하지 않는다.

🔑 **선·그림을 가리지 않는 더 나은 잣대는 기기 쪽에 있다.** 좌우 여백이 원래 바탕보다
얼마나 어두워지는지를 재고 **중앙값**을 본다. 덩어리는 중앙값이 올라가고, 흩어진 것은
0 에 머문다 — 수정전 54.2 vs 가을 0.8 vs 판식 0.0 을 가른 것이 이 값이다(§5).

```python
# 기기 스크린샷에서. BG 는 그 스킨의 background 토큰.
xs = list(range(0, 60, 3)) + list(range(1020, 1080, 3))   # 카드가 안 덮는 띠
ds = sorted(lum(BG) - lum(shot.getpixel((x, y)))
            for y in range(300, 1950, 5) for x in xs)
print('중앙값', ds[len(ds)//2], '상위10%', ds[int(len(ds)*0.9)])
# 합격선: 중앙값 5 이하. 그 위로 올라가면 화면이 답답해진다.
```

**첫 그림 두 장을 원본 잣대로 재면 이렇게 나왔다** — 새 그림에서 뒤집혀야 할 칸들이다:

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

---

## §9 할로윈 — 보랏빛 밤 [⏭️ 다음, 1.7.x]

> **한 문장:** 보랏빛 밤 속을 호박과 작은 유령이 **흩어져 내려가는** 화면.
> 위에 크게 떠 있고, 좌우 레일을 지나며, 아래에 성글게 모인다.

은정님 선택(9/6): **바탕 = 보랏빛 밤(어두운 스킨)** · **무늬 = 호박·유령 실루엣**.

### 🎃 왜 «밤»인가 — 색이 남아 있지 않았다

주황은 이미 가을(은행 노랑 `#D9A22B`·단풍 빨강 `#A8442A`)과 다크 액센트(`#D4784A`)가,
보라는 Y2K 액센트(`#8B50D4`)가 쓰고 있다. **할로윈이 혼자 가질 수 있는 축은 «밤»뿐**이고,
기존 다크 스킨은 갈색 계열(`#1C1410`)이라 보랏빛 밤과 안 겹친다.

### 🔴 어두운 스킨이라 뒤집히는 것 셋

1. **무늬가 바탕보다 밝아야 한다.** 검정 실루엣은 어두운 바탕에서 안 보인다.
   달빛을 받아 «희미하게 떠오르는» 형태로 그린다.
2. **§7 의 잣대가 뒤집힌다.** 「좌우 여백이 얼마나 **어두워졌나**」가 아니라
   **밝아졌나**를 재고, 합격선은 그대로 중앙값 5 이하다.
3. **다크 팔레트를 새로 짜야 한다**(`Colors.halloween`). 가을·한글처럼 밝은 팔레트
   하나를 얹는 것으로 끝나지 않는다 — `constants/colors.ts` 에 `Colors.dark` 급의
   한 벌이 필요하다.

### §9-1 팔레트 [제안 — 확정 아님]

| 쓰임 | 색 | 비고 |
|---|---|---|
| 바탕 | `#191327` | 보랏빛 밤 |
| 카드 면 | `#241B36` | 한 겹 밝은 보라 |
| primary | `#E8873A` | 호박 주황 |
| accent | `#7FC244` | 독 초록 — 유령·연기 몇 점에만 |
| 글자 | `#EDE6F2` | 그림에 쓰지 말 것 |
| 무늬(기본) | `#3A2C55` ~ `#4A3768` | 바탕보다 밝은 보라. 실루엣은 여기서 |
| 호박 불빛 | `#C97A34` | 두세 개에만 |

⚠️ **밝기 상한** — 무늬가 카드 면(`#241B36`)보다 밝아지면 카드가 배경에 묻힌다.
`#4A3768` 언저리가 상한이다. 밝은 스킨의 「불투명도 25% 상한」에 해당하는 자리다.

### §9-2 🔴 덩어리 금지는 «면 금지»가 아니다

호박·유령은 채운 형태라 §5 의 「덩어리」에 걸릴 것처럼 보이지만, **정확히는 «연속된»
덩어리가 문제였다.** 수정전 기둥은 위아래로 이어져 좌우 띠 전체를 균일하게 눌렀고
(중앙값 54.2), **가을 잎은 채운 면인데도 흩어져 있어 0.8** 이었다.

🔑 **가르는 것은 «면이냐 선이냐»가 아니라 «이어졌냐 흩어졌냐»다.**
호박을 쌓으면 진다. 잎처럼 흩뿌리면 이긴다 — 프롬프트에 그렇게 적었다.

### §9-3 프롬프트

🔴 앞선 두 프롬프트의 **「outer 10%」는 틀렸다**(§1). 카드가 `x 60~1019` 를 덮으므로
레일은 **바깥 6%** 다. 그리고 **49~60% 띠가 전체 폭으로 열려 있다** — 앞선 둘은
이 자리를 몰라 비워 뒀다.

```
Vertical mobile wallpaper, 1080x2340, flat illustration,
dark, calm, low contrast. A deep purple night.

Ground: deep indigo-purple night, almost black, with a soft paper-like
grain. Everything drawn on it is LIGHTER than the ground — this is a
night scene, so the shapes read as dim forms catching moonlight, never
as black on black.

Subject: jack-o'-lanterns and small ghosts drifting down through the
frame. Keep every shape SMALL and SEPARATE — never a pile, never a
heap, never a cluster that merges into one mass. Think of autumn
leaves falling one by one, not a pumpkin patch.

TOP 15% (0 to 15%): three or four larger shapes floating apart from one
another, tilted at different angles, with clear space between them.
This band is where the picture is seen most — spend the effort here.

17% to 48%: the centre must stay EMPTY. Place a few small shapes only
within the OUTER 6% of the left and right edges — narrow vertical
rails. Nothing at all between those rails.

49% to 60%: this band is open across the FULL width — spread three or
four small shapes across it, well apart.

62% to 85%: the outer 6% rails again, small shapes only, centre empty.

BOTTOM: a loose drift of shapes gathering across the full width, its
top edge beginning right at 75% and continuing off the bottom edge.
Keep it airy — separate shapes with gaps of night between them, not a
solid bank.

Palette: deep indigo-purple ground; shapes in a slightly lighter dusty
violet; a warm pumpkin glow on only two or three of the lanterns; one
or two touches of a cold pale green. Desaturated and quiet throughout.
No moon, no landscape, no trees, no houses, no people, no gravestones,
no letters, no text, no frame or border. The centre must stay empty.
```

### §9-4 받은 뒤 확인

§7 을 그대로 쓰되 **부호를 뒤집는다**(밝아짐). 더해서:

1. 🔴 **무늬가 카드 면보다 어두운가** — 밝으면 카드가 배경에 묻힌다
2. 🔴 **호박이 쌓여 있지 않은가** — 좌우 레일의 밝아짐 **중앙값 5 이하**
3. **49~60% 띠가 비어 있지 않은가** — 앞선 둘이 놓친 자리다
4. **75% 위에서 아래 모임이 시작하는가** — `y 2006`(85.7%) 아래는 안 보인다

### §9-5 배경 말고도 필요한 것

- `constants/colors.ts` 에 **`Colors.halloween` 한 벌**(다크 팔레트)
- `constants/skins.ts` 에 정의 + `SKIN_LIST` 등록 + `getSkinColors` 분기
- `components/SkinBackdrop.tsx` 의 `ART` 에 파일 등록
- `components/CharacterAccessory.tsx` 에 소품 — 마녀 모자? 호박 바구니? **미정**
- `features/theme/types.ts` 의 `SkinId`·`CharacterAccessory` 유니온
- `i18n/locales/*.json` 에 `skinHalloween`
- `__tests__/skin-registry.test.ts` 의 `ALL` 배열
