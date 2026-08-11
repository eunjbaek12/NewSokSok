# App Store Connect Listing — English

Paste into App Store Connect → Your App → App Store → English (US) locale.

> Differences from Google Play Console:
> - **Subtitle (30 chars)**, **Keywords (100 chars)**, **Promotional Text (170 chars)** are separate ASO fields
> - No "Contains ads" / "IAP" flags — handled via **App Privacy** questionnaire
> - Pricing uses **Tier** instead of arbitrary USD — see mapping below

---

## App Name (max 30 chars, search weight ★★★)

```
Avocado — Vocabulary Builder
```

## Subtitle (max 30 chars, search weight ★★★)

```
AI flashcards · K-pop Korean
```

> High search weight, nearly equal to App Name. Two pillars compressed: AI auto-flashcards + K-pop / Korean learning.

## Promotional Text (max 170 chars, editable without resubmission)

```
✨ Four new Korean word lists, plus cleaner romanisation across every Korean deck. Your first day comes with 300 AI lookups — and 100 a day stays free after that.
```

> The only field you can change anytime without going through review. Use it for seasonal pushes / new features.
>
> Updated for 1.3.1 (2026-08-02). Unlike the Korean locale, English speakers **can** see the new
> ko→en decks (the catalogue filters by meaning language), so leading with them is honest here.
> The closing CTA moved from "7-day free trial" to the first-day 300-word quota — signing up no
> longer grants any trial, so the quota is what a new user actually receives.

## Keywords (max 100 chars, comma-separated, no spaces)

```
hangul,topik,toeic,jlpt,hsk,vocab,kdrama,esl,memorize,japanese,chinese,review,quiz,pinyin,kanji
```

> ⚠️ NO spaces, only commas. Words already in App Name / Subtitle / Category (vocabulary, builder, AI, flashcards, kpop, korean) are dropped — they recombine automatically, so repeating them wastes space.
> Current length: 95 chars (under 100 limit). **Atomic strategy**: single tokens the store recombines into phrases (hangul+topik, japanese+vocab, etc.). Added 1.2.0 term (review = spaced repetition), multi-language exam terms (jlpt/hsk/topik), and script terms (pinyin/kanji).
> ❌ Do NOT add competitor brand names (duolingo, memrise) — Apple may reject.

## Description (max 4000 chars)

```
The word list you want. The word list you've been looking for. And the cleanest way to memorize either.

Avocado is a personal vocabulary learning tool for six languages — English, Korean, Japanese, Chinese, Vietnamese, and Spanish — built to make every spare minute count. Whatever your native language, whatever you're learning, mix and match any direction.

• Four study modes
- Flashcards: one card at a time, the way you remember best
- Quiz: multiple choice and short answer
- Example sentences: learn words in context
- Autoplay & shadowing: listen and speak along for pronunciation and listening practice

• A daily learning flow that fits you
- Set a daily target and Avocado distributes the words for you
- Clear graphs of progress and mastery
- Words you've nailed and words that trip you up are tracked separately
- Star a word or revisit only the ones you got wrong

• Gentle Review — right before you forget
- Memorized words quietly resurface right when you're about to forget them
- Words you know well come back rarely; ones you keep missing come back sooner — spaced repetition that stays kind
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
- A rich set of official curated lists, ready to study
  · English — NGSL (foundation) · BSL (business) · NAWL · TSL (academic / exam)
  · Japanese — Basic 500 · JLPT N3
  · Chinese — HSK 1
  · Korean (for English speakers) — Basic · Intermediate · Advanced 500 series,
    TOPIK I Essentials 350, Onomatopoeia & Mimetic Words 100,
    Untranslatable Korean 50, Convenience Store & Delivery 50,
    Sageuk (historical drama) 100, K-pop stan slang 100
    (perfect for K-pop, Hallyu, and study-abroad learners)
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
- Free: 100 AI word lookups per day + watch an ad for +50 (up to 300/day)
- Pro: ad-free, 1,000 words per day — $2.99/mo or $27.99/yr (~22% off vs monthly)
- BYOK: bring your own Gemini API key for unlimited free use (Google AI Studio key is free)
- A larger 300-word quota for your first 24 hours after signing up
- 7-day free trial when you start Pro (cancel during the trial and you won't be charged)

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
