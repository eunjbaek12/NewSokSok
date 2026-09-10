# 인앱 이벤트 등록 문구 — 붙여넣기용

App Store Connect → 해당 앱 → **인앱 이벤트(In-App Events)** → `+` 에 그대로 붙여넣는다.
이미지는 [`final/`](./final) 에 있고, 이벤트 자체의 판단 근거는
[`featuring-nomination.md`](../featuring-nomination.md) §10 에 있다.

**한도** — 이름 30자 · 짧은 설명 50자 · 긴 설명 120자. 아래 문구는 전부
`node -e` 로 코드포인트를 세어 확인했다(가장 빠듯한 것이 ① 영문 이름 29/30).

🔴 **이름에 행동 유도문을 쓰지 않는다**(애플 규정). 긴 설명의 명령형도 피했다 —
「Finish a deck and earn…」 을 「A finished deck now earns…」 로 바꾼 이유다.

🔴 **문구를 이미지에 다시 넣지 않는다.** 스토어가 이름과 짧은 설명을 이미지 **위에** 얹는다.
그래서 카드에는 표제어·로마자·뜻만 있고, ①은 글자가 아예 없다.

---

## ① Major Update — 한국 · 미국

| | |
|---|---|
| 유형 | **Major Update** |
| 기간 | 2026-10-01 ~ 2026-10-31 |
| 지역 | 대한민국 · 미국 |
| 이미지 | `final/major-16x9.png` · `final/major-9x16.png` |
| 실체 | 1.7.0 의 새 기능 — 스킨 3종 · 완주 자랑하기 |

**English (en-US)**

| 칸 | 문구 | |
|---|---|---|
| 이름 | `Autumn, Hangul, and Halloween` | 29/30 |
| 짧은 설명 | `Three seasonal skins and a finisher's certificate` | 49/50 |
| 긴 설명 | `Autumn leaves, hanji and ink, a Halloween night: the app dresses for October. A finished deck now earns a certificate.` | 118/120 |

**한국어 (ko-KR)**

| 칸 | 문구 | |
|---|---|---|
| 이름 | `가을·한글·할로윈, 세 가지 옷` | 17/30 |
| 짧은 설명 | `계절 스킨 세 가지와 완주 상장이 생겼어요` | 23/50 |
| 긴 설명 | `10월엔 앱이 옷을 갈아입어요. 가을 단풍, 한지와 먹, 보랏빛 할로윈 밤. 단어장을 다 외우면 상장도 받습니다.` | 63/120 |

🔑 **①만 두 언어가 필요하다.** 나머지 셋은 한 지역에만 걸리므로 그 지역 언어 한 벌이면 된다.
그리고 ①의 이미지에는 글자가 없어 **두 스토어프론트가 같은 그림을 쓴다.**

---

## ② 한글날 — 미국

| | |
|---|---|
| 유형 | **Special Event** |
| 기간 | 2026-10-09 ~ 2026-10-16 |
| 지역 | 미국 |
| 이미지 | `final/hangul-16x9.png` · `final/hangul-9x16.png` |
| 실체 | `curated-hangul-ko-1` 「Hangul: King Sejong's Alphabet 50」 |

**English (en-US)**

| 칸 | 문구 | |
|---|---|---|
| 이름 | `King Sejong's Alphabet` | 22/30 |
| 짧은 설명 | `A 50-word deck chosen for Hangul Day, October 9` | 47/50 |
| 긴 설명 | `The alphabet Sejong made in 1446, and the words a Korean class actually uses — 받침, 조사, 존댓말. Fifty words with audio.` | 115/120 |

🔴 **「chosen for」이지 「new this week」가 아니다.** 덱은 10/1 에 이미 공개된다(스킨·1.7.0 과
같은 날). 「이 주에 새로 생긴다」로 쓰면 앱 안의 사실과 어긋나 반려 사유가 된다 —
**「한글날에 맞춰 고른 덱으로 이 주에 함께 공부한다」**가 안전한 틀이다.

---

## ③ 할로윈 — 미국

| | |
|---|---|
| 유형 | **Special Event** |
| 기간 | 2026-10-25 ~ 2026-10-31 |
| 지역 | 미국 |
| 이미지 | `final/horror-16x9.png` · `final/horror-9x16.png` |
| 실체 | `curated-horror-ko-1` 「Korean Ghosts & Folk Horror 50」 |

**English (en-US)**

| 칸 | 문구 | |
|---|---|---|
| 이름 | `Korean Ghosts for Halloween` | 27/30 |
| 짧은 설명 | `The ghosts Korea actually tells stories about` | 45/50 |
| 긴 설명 | `도깨비, 구미호, 저승사자 — fifty words of Korean folk horror, from village ghost stories to hair standing on end.` | 103/120 |

---

## ③-KR 할로윈 영어 — 한국

| | |
|---|---|
| 유형 | **Special Event** |
| 기간 | 2026-10-25 ~ 2026-10-31 |
| 지역 | 대한민국 |
| 이미지 | `final/halloween-en-16x9.png` · `final/halloween-en-9x16.png` |
| 실체 | `curated-halloween-en-1` 「할로윈 영어 50」 (en>ko) |

**한국어 (ko-KR)**

| 칸 | 문구 | |
|---|---|---|
| 이름 | `할로윈에 쓰는 영어 50` | 13/30 |
| 짧은 설명 | `trick or treat 부터 goosebumps 까지` | 31/50 |
| 긴 설명 | `풍습·괴물·마법·공포·밤·관용 여섯 갈래로 고른 할로윈 영어 50개. 뜻과 한글 발음, 예문을 함께 봅니다.` | 60/120 |

🔑 **③과 ③-KR 은 같은 계기를 방향만 뒤집은 것이다** — 미국에는 「한국의 귀신」을,
한국에는 「할로윈 영어」를. 덱 이벤트가 한국에 못 걸리는 이유(뜻 언어 필터)는
[README](./README.md) 의 스토어프론트 표에 있다.

---

## 🔴 딥링크 — 지금은 넣어도 홈으로 간다

이벤트마다 딥링크를 지정할 수 있고 스킴(`soksokvoca`)도 등록돼 있지만,
**어떤 경로를 넣어도 홈 화면으로 떨어진다.**

```tsx
// app/+native-intent.tsx — 첫 커밋(dc3520b)부터 그대로다
export function redirectSystemPath({ path, initial }) {
  return '/';
}
```

`redirectSystemPath` 가 **들어온 경로를 전부 버리고 `'/'` 를 돌려준다.** 스캐폴딩 그대로
남은 것이고 손댄 적이 없다. 그래서 `soksokvoca:///curation` 도 큐레이션 탭이 아니라 홈으로 간다.

**등록할 때 어떻게 할 것인가** — 딥링크 칸을 **비워 둔다.** 넣어도 홈으로 가므로 효과가 같고,
비워 두면 나중에 고쳤을 때 무엇을 바꿔야 하는지가 분명하다.

⏭️ **고치려면 1.7.0 을 타야 한다**(앱 코드라 빌드가 필요하다 — 9/26~9/28 빌드 일정 안에 든다).
`/curation` 만 통과시키면 이벤트 카드를 누른 사람이 큐레이션 탭에 도착한다.
🔴 **덱 상세까지는 못 연다** — 큐레이션 화면이 파라미터를 안 받는다
(`features/curation/screen.tsx` 에 `useLocalSearchParams` 가 없다). 탭까지가 한계다.

---

## 등록 순서

1. **덱이 서버에 있는지 먼저 확인한다.** 셋 다 지금 `is_published=false` 다.
   공개는 10/1 이므로, 등록·심사 시점에는 **앱에서 안 보인다.**
   ⚠️ 심사자가 「실체가 없다」로 볼 수 있는 지점이다. 반려되면 그 덱만 먼저 공개하면 된다.
2. 이벤트 4개를 위 표대로 만든다. **①만 두 언어**, 나머지는 한 언어.
3. 이미지 두 장씩 올린다(16:9 · 9:16). 규격은 최소 1920×1080 / 1080×1920 이고
   `final/` 의 파일이 정확히 그 크기다.
4. 딥링크는 비운다(위 참조).
5. 심사에 넣는다. **앱 버전과 독립적으로 심사**되고, 시작 **14일 전**부터 스토어에 노출된다
   → ①(10/1 시작)을 노출시키려면 **9/17 까지 승인**돼야 한다.
6. 🔴 **10/1 에 덱 셋을 공개한다.** 안 누르면 카드를 눌러 들어온 사람이 빈손으로 도착한다.
   ```bash
   npx -y tsx scripts/seed-official-decks.ts --publish \
     --deck curated-hangul-ko-1 --deck curated-horror-ko-1 --deck curated-halloween-en-1
   ```
