# App Store Connect Listing — English

Paste into App Store Connect → Your App → App Store → English (US) locale.

> Differences from Google Play Console:
> - **Subtitle (30 chars)**, **Keywords (100 chars)**, **Promotional Text (170 chars)** are separate ASO fields
> - No "Contains ads" / "IAP" flags — handled via **App Privacy** questionnaire
> - Pricing uses **Tier** instead of arbitrary USD — see mapping below

---

## App Name (max 30 chars, search weight ★★★)

```
Avocado: Korean Vocabulary
```

26자(한도 30자). **2026-08-23 개정.** 옛 이름은 `Avocado — Vocabulary Builder`.

> **왜 한국어로 좁히나 — 넓게 두었더니 아무 밭에도 없었다.** App Store 미국을 처음 실측하니
> 우리 en-US 칸 토큰 **22개 중 21개가 죽어 있었다**(§검색 실측). 살아 있는 것은 브랜드명
> `avocado` 103위 하나뿐이고, 옛 이름이 겨냥한 `vocabulary` 는 **200위 밖**이었다.
>
> **`korean vocabulary` 를 고른 이유** (공급 173 · 이름 보유 16개 · 도달 상한 **4위**):
> 그 밭 상위 12개 중 **1·2·4·5·7·9위가 리뷰 0~95짜리**이고, 형태가 전부 같다 —
> `Korean vocabulary, TOPIK words`(리뷰 95) · `PORO - Korean Vocabulary`(48) ·
> **`Hana: Korean Vocabulary Drills`(리뷰 0)** · `TOPIK Test: Korean Vocabulary`(2) ·
> `VeryWord - Korean Vocabulary`(0). **`[브랜드]: Korean Vocabulary` 는 우리가 그대로 따라
> 할 수 있는 형태다.**
>
> 🔑 **리뷰 0 은 미국에서도 장벽이 아니다.** `korean vocabulary` 상위 20에 리뷰 0 이 5개,
> `korean flashcards` 에 3개, `toeic` 에 5개, `jlpt` 에 2개 있다. **우리가 안 잡힌 것은 리뷰가
> 없어서가 아니라 이름이 아무 밭도 안 겨냥해서다.** → 리뷰가 쌓이기를 기다릴 이유가 없다.
>
> **자산과도 맞는다** — 뜻 언어가 영어인 큐레이션 덱 **14개가 전부 ko→en** 이다. 일본어·중국어·
> 스페인어 덱은 이 로케일에 0개다. 옛 이름(`Vocabulary Builder`)은 앱이 실제로 주는 것보다
> 넓게 약속하고 있었다.
>
> **잃는 것 ①: 다국어 정체성이 이름에서 사라진다.** 키워드의 `japanese` · `chinese` · `spanish`
> 로 조합 밭(`○○ vocabulary`)만 유지한다. ⚠️ 조합은 이름 정확 일치보다 약하다 — 한국 실측에서
> 이름 정확 일치가 5위였고 조합들은 전부 하위였다.
>
> **잃는 것 ②: 🔴 한국 검색에서 en-US 경유로 잡히던 것들이 사라진다.** en-US 칸은 한국 스토어에도
> 색인되므로(`ios-ko.md` §검색 실측 ⑫) 지금 한국에서 `vocabulary` 52위 · `vocabulary builder`
> 27위 · `esl` 98위 · `vocab` 129위가 **이 칸에서 오고 있다.** 개정하면 전부 없어진다.
> **감수하기로 한 이유**: 한국인은 한글로 검색하고 그 커버리지는 KO 칸이 전담한다. 영어 질의로
> 우리를 찾는 한국 사용자는 무시할 만하다. **다만 개정 후 한국 노출이 줄면 원인 후보로 이것을
> 먼저 볼 것** — 그러라고 여기 적어 둔다.
>
> ⚠️ **브랜드 토큰의 값이 한국보다 낮다.** `avocado` 미국 검색 1위는 `Foodvisor - AI Calorie
> Counter` 이고 상위가 전부 음식·생산성 앱이다(우리는 103위). 한국에서 `아보카도` 가 5위인 것과
> 다르다 — **미국에서 브랜드명은 유입 경로가 아니다.**
>
> 🔴 **iOS 이름은 버전 메타데이터라 1.6.0 제출 _전에_ 넣어야 한다.**

## Subtitle (max 30 chars, search weight ★★★)

```
TOPIK, K-pop & your own words
```

29자(한도 30자). **2026-08-23 개정.** 옛 부제는 `AI flashcards · K-pop Korean`.

> **이름과 이어 읽으면 문장이 된다**: *"Avocado: Korean Vocabulary — TOPIK, K-pop & your own words"*.
>
> **부제가 여는 밭** (Apple 이 이름·부제·키워드를 자동 재조합한다):
> `topik vocabulary`(공급 183 · 이름 보유 15개 · 상한 **2위**) · `korean words`(174 · 13개 · 5위) ·
> `topik words`(그 밭 1위 앱의 이름이 바로 이 구절이다) · `k-pop korean`(165 · 18개 · 7위).
>
> **`your own words` 가 제품의 실제 약속이다.** 우리 앱의 무게중심은 커리큘럼이 아니라 **사용자가
> 만드는 단어장**이고(직접 만든 단어장 암기율 46.5% vs 큐레이션 12.8%), 레딧에서 받은 피드백도
> "앱이 정해준 순서대로만"에 대한 불만이었다. 검색 결과 목록에서 **사람이 읽는 유일한 칸**이므로
> 여기에 그 약속을 둔다.
>
> 🔴 **사진·AI 를 부제에서 뺐다 — 미국에서는 그 밭을 못 뚫는다.** `photo flashcards` 와
> `ai flashcards` 는 **상위 20위에 리뷰 0인 앱이 한 개도 없다**(Quizlet 110만 · CamScanner 187만이
> 지배). 한국에서 `사진 단어장` 이 우리 밭(6위 → 상한 1위)이었던 것과 **정반대 지형**이다.
> → 사진은 여전히 최대 차별점이지만, **검색 유입 경로로는 기대하지 않는다.** 키워드에 `photo` 만
> 남기고 설득은 스크린샷·설명문에 맡긴다.

## Promotional Text (max 170 chars, editable without resubmission)

```
✨ Four new Korean word lists, plus cleaner romanisation across every Korean deck. Your first day comes with 300 AI lookups — and 50 a day stays free after that.
```

> The only field you can change anytime without going through review. Use it for seasonal pushes / new features.
>
> Updated for 1.3.1 (2026-08-02). Unlike the Korean locale, English speakers **can** see the new
> ko→en decks (the catalogue filters by meaning language), so leading with them is honest here.
> The closing CTA moved from "7-day free trial" to the first-day 300-word quota — signing up no
> longer grants any trial, so the quota is what a new user actually receives.

## Keywords (max 100 chars, comma-separated, no spaces)

```
flashcards,learn,study,hangul,romanization,japanese,chinese,spanish,srs,quiz,photo,examples,notebook
```

> ⚠️ **공백 절대 사용 X. 쉼표 외 문자 X.** 현재 **100자(한도 100자, 딱 맞음)** · 13토큰.
> 이름·부제에 든 단어(avocado · korean · vocabulary · topik · k-pop · words · own · your)는
> 뺐다 — Apple 이 세 칸을 자동 재조합하므로 중복은 낭비다.
>
> **2026-08-23 전면 교체.** 옛 15개 토큰
> (`hangul,topik,toeic,jlpt,hsk,vocab,kdrama,esl,memorize,japanese,chinese,review,quiz,pinyin,kanji`)은
> **실측에서 전부 죽어 있었다**(§검색 실측). 그래서 "빼도 잃을 것이 없다"가 확정된 상태에서 새로 짰다.
>
> - **조합용 (이름의 `Korean` · `Vocabulary` 와 재조합)**: `flashcards`(→ `korean flashcards`
>   상한 4위 · 수요 143,101) · `learn`(→ `learn korean words` 상한 9위 · 207,850) ·
>   `study`(→ `korean study` 상한 5위 · 163,070) · `notebook`(→ `vocabulary notebook` 상한 **1위** ·
>   순수요 255,426)
> - **우리 기능이라 넣은 것**: `romanization`(이름 보유 **1개** · 상한 **1위** — 가장 비어 있는 밭이고
>   국립국어원 표기법으로 실제로 고쳐 둔 기능이다) · `examples`(11개 · 4위) · `srs`(20개 · 2위) ·
>   `quiz`(37개 · 37위) · `photo`
> - **다국어 조합용**: `japanese`(→ `japanese vocabulary` 18개 · 4위) · `chinese`(15개 · 5위) ·
>   `spanish`(16개 · 7위). **단독 밭은 포기한다**(각 38개 · 20위권).
> - **`hangul`**(30개 · 16위 · 154,589) 유지.
>
> **뺀 것과 이유**:
> - `toeic` · `jlpt` · `hsk` — 🔴 **덱이 없다.** 뜻 언어 en 덱 14개가 전부 ko→en 이라 JLPT·HSK
>   덱은 이 로케일에 0개다. **시험 이름은 덱을 약속하는 말**이라 첫 화면에서 어긋난다.
>   (한국 로케일에서 같은 이유로 겪은 문제다 — `ko.md` §검색 실측.)
> - `kdrama` — 이름 보유 4개로 비어 보이지만 **상위 20에 리뷰 0이 0개**이고 수요가 Netflix(712만)로
>   오염돼 있다. 어휘 앱 수요가 아니다.
> - `vocab` · `memorize` · `review` · `pinyin` · `kanji` · `esl` — 전부 실측 사망. 되살릴 근거가 없다.
> ❌ 경쟁사 브랜드(duolingo · memrise · quizlet)는 넣지 말 것 — 심사 거부 사유가 될 수 있다.

## 검색 실측 (App Store 미국, 2026-08-23)

**App Store 미국을 실제로 잰 것은 이번이 처음이다.** 그전까지 en 판단의 근거는 Play 수치뿐이었다.

🔑 **재는 법**은 한국과 같다(`ios-ko.md` §검색 실측). `country=US&lang=en_us` 로 바꾸면 된다.

### 🔴 ① 우리 en-US 칸은 사실상 작동하지 않고 있었다 — 22개 토큰 중 21개 사망

| 칸 | 토큰 | 미국 순위 |
|---|---|---|
| 이름 | `vocabulary` · `builder` | 둘 다 **없음** |
| 이름 | `avocado` | 103위 ← **유일한 생존** |
| 부제 | `flashcards` · `k-pop` · `korean` · `ai` | 전부 없음 |
| 키워드 | `hangul` `topik` `toeic` `jlpt` `hsk` `vocab` `kdrama` `esl` `memorize` `japanese` `chinese` `review` `quiz` `pinyin` `kanji` | **15개 전부 없음** |

조합으로 잡히는 것도 `vocabulary builder` 94위 하나뿐이다.
→ **한국(20개 밭에 5~129위)과 비교하면 en 은 아무것도 안 하고 있었다.**

### 🔴 ② 한국에서 얻은 결론을 미국에 옮기면 틀린다

| 밭 | 한국 | 미국 |
|---|---|---|
| 사진 → 단어장 | 우리 **6위** · 상한 **1위**(리뷰 1짜리가 1위) | 상위 20에 **리뷰 0이 0개** · Quizlet 110만이 지배 |
| `esl` | 98위(en-US 키워드 경유) | 없음 |
| `vocabulary` 계열 | `vocabulary` 52위 | 없음 |
| 브랜드명 | `아보카도` 5위 | `avocado` 103위 (1위는 칼로리 앱) |

🔑 **같은 토큰·같은 칸인데 시장이 다르면 결과가 뒤집힌다.** 밭 크기가 비슷해도(양쪽 다 150~200건)
그 안의 앱 강도가 다르다 — 미국 상위권은 리뷰 100만~500만이다.
🔴 **그러므로 `ios-ko.md` 의 "키워드 생사 = 이름 보유 22개 경계" 규칙을 미국에 그대로 쓰지 말 것.**
우리 en 토큰이 전멸이라 **기준선 자체가 없어서 검증이 불가능**하다. 이번 en 개정은 그 규칙이 아니라
**밭 기대값(수요 × 도달 상한)** 과 **상위 형태 모방**으로 짰다.

### ✅ ③ 리뷰 0 은 미국에서도 장벽이 아니다

| 밭 | 상위 20 중 리뷰 0 | 그중 최고 순위 |
|---|---|---|
| `korean vocabulary` | 5개 | **4위** `Hana: Korean Vocabulary Drills` |
| `korean flashcards` | 3개 | **4위** `TOPIK Korean Flashcards` |
| `toeic` | 5개 | **3위** `EZ TOEIC: AI Tutor & Practice` |
| `jlpt` | 2개 | **2위** `JLPT N1-N5 Exam Practice` |
| `kdrama` · `photo flashcards` | **0개** | — |

→ **뚫리는 밭과 안 뚫리는 밭이 갈린다.** 리뷰가 아니라 **그 밭이 대형 앱에 덮여 있는지**가 기준이다.
밭을 고를 때 **반드시 "상위 20에 리뷰 0이 몇 개인가"를 먼저 볼 것.**

### ④ 밭 기대값 (거대 앱 제외 수요 ÷ 도달 상한)

⚠️ 수요는 상위 30위 리뷰 합계에서 **리뷰 20만 이상(듀오링고 539만 · Memrise 21만 등)을 뺀 값**이다.
안 빼면 모든 밭이 600만대로 뭉쳐 보여 차이가 사라진다.

| 밭 | 공급 | 이름 보유 | 상한 | 순수요 | 우리 |
|---|---|---|---|---|---|
| `vocabulary notebook` | 179 | 21 | **1위** | 255,426 | 없음 |
| `korean learning` | 190 | 13 | 9위 | 439,561 | 없음 |
| `study korean` | 189 | 44 | 3위 | 155,033 | 없음 |
| `korean flashcards` | 179 | 17 | 4위 | 143,101 | 없음 |
| `korean study` | 193 | 7 | 5위 | 163,070 | 없음 |
| **`korean vocabulary`** | 173 | 16 | **4위** | 127,774 | 없음 → **이름을 바친다** |
| `learn korean words` | 184 | 9 | 9위 | 207,850 | 없음 |
| `korean words` | 174 | 13 | 5위 | 112,374 | 없음 |
| `korean vocabulary app` | 171 | **3** | 11위 | 192,792 | 없음 |
| `topik vocabulary` | 183 | 15 | **2위** | 15,497 | 없음 |
| *(참고)* `vocabulary` | 196 | 37 | 20위 | — | 없음 · 듀오링고 539만 |

🔑 **`korean vocabulary` 가 기대값 1위는 아니다.** `vocabulary notebook`(255,426 · 상한 1위)이 더
높다. 그런데도 `korean vocabulary` 를 고른 것은 ⑴ 상위 형태를 그대로 모방할 수 있고 ⑵ **우리 덱
자산과 일치**하며 ⑶ `notebook` 은 키워드로 넣어 조합만으로도 노릴 수 있기 때문이다.
⚠️ **`vocabulary notebook` 을 이름으로 하는 안은 버린 것이 아니라 보류다** — 다음 개정에서
`korean vocabulary` 성적이 안 나오면 이쪽으로 옮길 것.

### 🔴 ⑤ 남은 미해결

1. **Play en 이름은 이번에 손대지 않았다.** 라이브가 `Avocado — Vocabulary Builder` 로 App Store
   옛 이름과 같다. Play 는 설치 수가 랭킹을 지배하고 **설명문이 색인**이라 이름 효과가 작으므로,
   지금 바꾸면 **Console 작업만 늘고 효과는 불확실**하다. 8/16 에 써 둔 en 설명문 원고가 아직
   미반영이니 **그때 함께 판단할 것.** (한국은 이유가 달랐다 — 거긴 바꾸면 `토익 단어장` 을 **잃어서**
   두었다. 여기는 잃을 것이 0 이라 "안 바꾼다"가 아니라 "지금은 미룬다"이다.)
2. **미국 키워드 칸의 생사 규칙을 모른다.** 전멸이라 기준선이 없었다. **다음 실측 때 새 키워드
   13개의 생사를 재면 그때 규칙을 세울 수 있다** — 그것이 이 개정의 부수 소득이다.
3. **`vocabulary` 단독 밭은 포기했다.** 이름 보유 37개 · 듀오링고 539만. 되찾을 계획이 없다.

## Description (max 4000 chars)

```
The word list you want. The word list you've been looking for. And the cleanest way to memorize either.

Avocado is a personal vocabulary learning tool built to make every spare minute count. Whatever your native language, whatever you're learning, mix and match any direction.

• Four study modes
- Flashcards: one card at a time, the way you remember best
- Quiz: multiple choice and short answer
- Example sentences: learn words in context
- Autoplay & shadowing: listen and speak along

• A daily learning flow that fits you
- Set a daily target and Avocado distributes the words for you
- Clear graphs of progress and mastery
- Words you've nailed and words that trip you up are tracked separately
- Star a word or revisit only the ones you got wrong

• Gentle Review — right before you forget
- Memorized words quietly resurface right when you're about to forget them
- Words you know well come back rarely; ones you keep missing come back sooner
- Each day's review is capped, so nothing piles up even if you skip a few days
- A soft reminder once a day, only when there's something to review

• Streaks & stats
- Day streak, calendar, and words learned — all in "My Learning"
- Watch today's, this week's, and total memorized words add up
- Share your progress as an image

• Add words by photo or spreadsheet
- Scan a photo and pull in all the words at once
- Paste in or import a CSV file as-is
- Bulk paste: drop a line-separated list and it just works
- Voice input and manual entry also supported

• AI word generation & auto-analysis
- Type a topic and AI builds an entire list for you
  e.g. "Renting an apartment in the US", "Ordering at a cafe", "TOEIC verbs"
- Add a single word and AI auto-fills pronunciation, meaning, examples, and synonyms
- Choose language pair, difficulty, and word count

• Find what others have built
- Browse word lists shared by other learners and import the ones you love
- Official curated lists, ready to study
  · English — NGSL (foundation) · BSL (business) · NAWL · TSL (academic / exam)
  · Japanese — Basic 500 · JLPT N3
  · Chinese — HSK 1
  · Korean (for English speakers) — Basic · Intermediate · Advanced 500 series,
    TOPIK I Essentials 350, TOPIK II Essentials 300,
    Onomatopoeia & Mimetic Words 100,
    Untranslatable Korean 50, Convenience Store & Delivery 50,
    Sageuk (historical drama) 100, K-pop stan slang 100
  · Vietnamese — Basic 500
- Share your own lists to help the community

• Six languages, every direction
- English, Korean, Japanese, Chinese, Vietnamese, Spanish
- Mix any input and meaning language (EN-KR, KR-JP, EN-ZH, VI-EN, KR-VI, ES-EN — any pair)
- The app itself speaks English, Korean, and Spanish

• Make it yours with skins
- Classic, Dark, Y2K, Lab, Summer Sea, and more themes

• Offline-first with cloud sync
- Data lives on your device first — study without internet
- Sign in with Apple or Google to sync securely to the cloud
- Or use guest mode and start instantly

• Fair pricing — free is generous
- Free: 300 AI words in the first 24 hours, then 50 per day, +20 per rewarded ad (up to twice a day)
- One rewarded ad also clears banner ads for 24 hours
- Past the daily limit you can still see what a word means
- Pro: ad-free, 3,000 words per month with no daily limit — $2.99/mo or $27.99/yr (~22% off vs monthly)
- BYOK: bring your own Gemini API key for unlimited free use (Google AI Studio key is free)
- A larger 300-word quota for your first 24 hours after signing up
- 7-day free trial when you start Pro (cancel anytime, no charge)

• Transparent privacy
- Ads are shown only to non-logged-in and free users (Pro has none)
- App Tracking Transparency supported — you control whether tracking is allowed
- The only permission requested is the microphone, for voice input

Build the word list you want. Memorize it the most polished way.

Privacy policy: https://eunjbaek12.github.io/NewSokSok/privacy-policy
```

## What's New (max 4000 chars, per-version)

```
1.3.1 — Four new Korean word lists.

📚 New lists
- Onomatopoeia & Mimetic Words 100: the sounds and textures Korean does best
- Untranslatable Korean 50: 눈치, 정, 서운하다
- Convenience Store & Delivery 50: everyday Korean you'll actually use
- TOPIK I Essentials 350: organised by exam topic

🔤 Cleaner romanisation
Pronunciation across the Korean lists now follows the Revised Romanization standard.

Also
- Lists written in languages you can't read no longer clutter the catalogue.
- Fixed the Rate This App button doing nothing when tapped.
```

---

## Category & Classification

| Field | Value |
|---|---|
| **Primary Category** | Education |
| **Secondary Category** | Reference |
| Content Rating | 4+ (No objectionable content) |
| Price | Free (with In-App Purchases) |

## In-App Purchases (App Store Connect → In-App Purchases)

| Product ID | Type | KR Price | Tier | Notes |
|---|---|---|---|---|
| `pro_monthly` | Auto-Renewable Subscription | ₩3,900 | **USD $2.99** (base price point) | 7-day free trial |
| `pro_yearly` | Auto-Renewable Subscription | ₩35,900 | **USD $27.99** (base price point) | Intro offer: first week free (7 days) |

> ⚠️ **Product IDs must be exactly `pro_monthly` / `pro_yearly`** — code matches on this. Mismatch → verify-purchase returns 402 product_mismatch.
> Both products belong to the same Subscription Group: **"아보카도 Pro"**.
> Apple scopes introductory-offer eligibility to the **subscription group** — using the trial on
> monthly means it can't be claimed again on yearly. Unlike Play, no eligibility rule to configure.
> Apple's current pricing has 900 price points (not legacy tiers) — set the base country to USD and pick $2.99 / $27.99; Apple auto-fills other regions including ₩3,900 / ₩35,900. Verify the KRW row matches. Check at App Store Connect → IAP → Pricing.
> ⚠️ Keep these prices in sync with: the KO listing (`ios-ko.md`), the in-app paywall (fetches live store price — should match), and this English Description text.

## App Privacy (Privacy Questionnaire) — Data Collection

| Category | Data | Purpose | Linked to User | Used for Tracking |
|---|---|---|---|---|
| Identifiers | User ID (Supabase Auth UUID) | App Functionality | Yes | No |
| Identifiers | Advertising ID (IDFA) | Third-Party Advertising | Yes | **Yes** (when ATT allowed) |
| Purchases | Purchase History (Pro subscription) | App Functionality | Yes | No |
| User Content | Vocabulary Lists, Study Data | App Functionality | Yes | No |
| Usage Data | Product Interaction | Analytics, App Functionality | Yes | No |
| Diagnostics | Crash Data, Performance Data | App Functionality | No | No |

> ATT prompt text is localized (ko/en) automatically via the InfoPlist plugin.

## Additional Fields

| Field | Value |
|---|---|
| Support URL | https://eunjbaek12.github.io/NewSokSok/ |
| Marketing URL | (optional, leave blank) |
| Privacy Policy URL | https://eunjbaek12.github.io/NewSokSok/privacy-policy |
| Copyright | © 2026 SokSok Voca (산녀와 나무꾼) |
| Contact Email | mtgirltreeguy@gmail.com |
| Contact Phone | (your mobile) |
| App Review Notes | See below |

## App Review Notes

```
Hello reviewer. Avocado is a vocabulary learning app supporting six languages (English, Korean, Japanese, Chinese, Vietnamese, Spanish).

[Test Access]
Reviewer may use Sign in with Apple to access full app features,
including Pro subscription testing in Sandbox.
No separate demo account is required.

[Sign in with Apple]
- Full Sign in with Apple support, including hidden email relay.
- Guest mode is also offered as an alternative (full learning features without account).

[In-App Subscription Testing]
- Works in Sandbox environment automatically.
- Product IDs: pro_monthly (₩3,900 / $2.99 per month), pro_yearly (₩35,900 / $27.99 per year)
- Intro offer "first week free" (7 days) then auto-renew (Sandbox uses accelerated time).
  Live since 2026-06-05 across 175 regions.
- Subscription Group: "아보카도 Pro"

[AI Features]
- Google Vertex AI (Gemini) calls are routed through our Supabase Edge Function backend.
- BYOK mode lets users supply their own Gemini API key for direct calls.

[Ads]
- Google AdMob banner + rewarded ads.
- App Tracking Transparency prompt is shown with localized strings (ko/en).

[Demo Account]
Email: (add if needed)
Password: (add if needed)

Contact: mtgirltreeguy@gmail.com
```
