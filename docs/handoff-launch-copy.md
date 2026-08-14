# 출시 홍보 카피팩 — 커뮤니티 + Product Hunt

작성일: 2026-07-02 · 대상: 라이브 출시 후(iOS 6/12, Android 7/1) 커뮤니티/PH 홍보

붙여넣어 바로 쓰는 카피 모음. 시장 균형(국내·글로벌 영어권·아시아 언어권) 기준.
**포지셔닝 SoT**: `store-assets/listing/*.md`, `PRODUCT.md`. 톤 원칙: Duolingo식 게임화·교과서 톤 지양, "만들고 가져와서 외운다".

---

## 0. 공통 자산 (모든 글에서 재사용)

**스토어 링크**
- Google Play: `https://play.google.com/store/apps/details?id=com.soksokvoca`
- App Store: `https://apps.apple.com/app/id6776714408`
- 개인정보처리방침: `https://eunjbaek12.github.io/NewSokSok/privacy-policy`

**한 줄 후크 (언어별)**
- KO: "내가 원하는 단어장은 만들고, 내가 찾던 단어장은 가져와서 — 6개 언어, 어느 방향이든."
- EN: "Build the word list you want, or grab the one you've been looking for — 6 languages, any direction."

**핵심 차별점 (우선순위)**
1. 만들거나 가져오는 단어장(AI 생성 · 사진/엑셀 · 커뮤니티/공식 큐레이션)
2. 4가지 학습 모드(플래시카드·퀴즈·예문·오토플레이/쉐도잉) + 매일 암기 계획
3. 6개 언어 × 자유 방향(한·영·일·중·베·스)
4. 오프라인 우선 + 클라우드 동기화
5. BYOK(본인 Gemini 키) 무제한 무료 — 락인/쿼터 게임 없음
6. 안티: 스트릭 압박·팡파레·교과서 톤 없음

**가격 (정확히)**
- 무료: AI 하루 50단어 + 광고 1회당 +20(하루 최대 2회)
- Pro: 광고 없이 월 3,000단어·일일 제한 없음 — ₩3,900/월, 연간 ₩36,000(Play) · ₩35,900(App Store), 연 23%↓ / ≈ $2.99/mo, $27.99/yr
- BYOK: 본인 Gemini API 키로 무제한 무료(Google AI Studio 무료 발급)
- 가입 첫 24시간은 하루 300단어
- Pro 구독 시작 시 7일 무료 체험 (체험 중 해지하면 청구 없음)

**⚠️ 게시 전 공통 체크**
- 각 커뮤니티/서브레딧 셀프홍보 규칙 먼저 확인(요일/주1회/플레어/자기소개 필수 여부)
- "제가 만든 앱입니다" 메이커 신분 항상 명시(숨기면 역효과)
- 같은 날 여러 서브레딧 도배 금지 — 3~5일 간격 분산
- 가치 제공 먼저(질문·팁·비하인드), 링크는 본문 끝 1회

---

## 1. Product Hunt

> 정석: 화/수 00:01 PST 론칭. 갤러리(스크린샷 `store-assets/screenshots/final/en/`)·태그라인·first comment 미리 세팅. 헌터 섭외 or 셀프 포스트.

**Name**
```
Avocado — Vocabulary Builder
```

**Tagline** (max 60 chars)
```
Build any word list with AI, memorize it your way
```
대안:
```
AI-built flashcards in 6 languages — no streak guilt
```

**Description** (max 260 chars)
```
Turn a topic, a photo, or a single word into a ready-to-study vocab list — in 6 languages, any direction. Four study modes, offline-first with cloud sync. Bring your own Gemini key for unlimited free use. No streak pressure, no textbook feel.
```

**Topics/Tags**: Education, Language Learning, Productivity, Artificial Intelligence, iOS, Android

**First comment (Maker's story)**
```
Hey Product Hunt 👋 I'm the solo dev behind Avocado.

I kept bouncing off vocab apps for two reasons: they either turn learning into a game with streak guilt and confetti, or they feel like a textbook. And none of them let me just *build the exact list I wanted* — the words from the article I read this morning, the chapter I'm on, the topic I'm about to be tested on.

So Avocado is built around one idea: the list you want, you build; the list you've been looking for, you grab — then memorize either the cleanest way.

- Type a topic ("ordering at a cafe", "TOEIC verbs") → AI builds the whole list
- Snap a photo of a textbook page → words pulled out and enriched
- Add one word → AI fills pronunciation, meaning, examples, synonyms
- Or grab a curated/community list (NGSL, JLPT N3, HSK 1, TOPIK A/B/C…)
- Study with flashcards, quiz, example sentences, and autoplay/shadowing

Six languages (EN, KO, JA, ZH, VI, ES), any direction. Offline-first — everything is in local SQLite first, then syncs to Supabase when you sign in.

On AI: you can bring your own Gemini key (free from Google AI Studio) for unlimited use — no quota games, your key, your data. There's a generous free tier too, and an optional Pro plan.

It's live on both stores. I'd love feedback on the study flow and what languages/curations to add next. AMA about building offline-first RN + Supabase + BYOK AI as a one-person team.

📱 iOS: https://apps.apple.com/app/id6776714408
🤖 Android: https://play.google.com/store/apps/details?id=com.soksokvoca
```

**갤러리 캡션 제안** (스크린샷 순서대로)
1. Build a list from a topic — AI generates it
2. Snap a photo → instant word list
3. Four study modes, one clean flow
4. Any language, any direction
5. Offline-first, syncs when you're back

---

## 2. Reddit (영어권)

> ⚠️ 서브레딧별 규칙 천차만별. 대부분 "메이커 신분 공개 + 가치 제공"이면 허용하지만, 일부는 전용 요일/주간 스레드/플레어 필수. **게시 전 각 sub 규칙 필독.** 톤은 광고가 아니라 "무료로 만든 툴 공유 + 피드백 요청".

### r/languagelearning
**Title**
```
I built a free vocab app where you build your own lists (or grab others') — 6 languages, any direction, offline-first
```
**Body**
```
I'm a solo dev and I made this mostly to scratch my own itch, so sharing in case it's useful — happy to hear it's not, too.

Most vocab apps either gamify everything (streak guilt, confetti) or feel like a textbook, and none let me just build the *exact* list I wanted. So I made Avocado around that: build the list you want, or import a curated/community one, then study it.

- Make a list from a topic, a photo of a page, or one word at a time (AI fills meaning/examples/pronunciation)
- Or import curated lists: NGSL/BSL/NAWL/TSL (EN), JLPT N3 + basics (JA), HSK 1 (ZH), TOPIK A/B/C (KO), basics (VI)
- 6 languages, mix any input/meaning pair (EN↔KR, KR↔JP, ES↔EN, etc.)
- Study modes: flashcards, quiz, example sentences, autoplay/shadowing
- Offline-first (local DB first, cloud sync optional). Guest mode, no signup needed to start.

It's free — there's an AI daily limit on the free tier, but you can plug in your own free Gemini key for unlimited use. Optional Pro if you want ad-free + higher AI limits.

Would love feedback on the study flow, and which languages/curations to prioritize next.

iOS: https://apps.apple.com/app/id6776714408
Android: https://play.google.com/store/apps/details?id=com.soksokvoca
```

### r/EnglishLearning
**Title**
```
Free app: turn a photo of your textbook (or a topic like "TOEIC verbs") into a study-ready word list
```
**Body**
```
Solo dev here. I built a vocab app and the two features English learners seem to like most:

1. Photo → word list: snap a textbook/article page and it pulls the words out and fills in meaning, example sentences, and pronunciation.
2. Topic → list: type "TOEIC verbs" or "phrasal verbs for emails" and AI builds a set you can edit.

There are also ready-made curated English lists (NGSL foundation, BSL business, NAWL/TSL academic & exam), and 4 ways to study each list (flashcards, quiz, fill-in examples, listen-and-repeat).

Free with a daily AI limit, or bring your own free Gemini key for unlimited. Works offline once words are saved.

Feedback welcome — especially on the example sentences quality.

iOS: https://apps.apple.com/app/id6776714408 · Android: https://play.google.com/store/apps/details?id=com.soksokvoca
```

### r/LearnJapanese
**Title**
```
Free vocab tool with JLPT N3 + basics, and you can build custom lists in any direction (EN↔JP, KR↔JP)
```
**Body**
```
Sharing a free app I built. For Japanese it ships with a Basic 500 and a JLPT N3 list, but the part I use most is building my own: type a topic or add words and it fills readings, meaning, and example sentences. You pick the direction — EN↔JP, and KR↔JP too if Korean is your base.

Study modes: flashcards, quiz, example sentences, autoplay/shadowing (good for reading practice + listening). Offline-first, optional cloud sync.

Free tier has a daily AI limit; you can use your own free Gemini key for unlimited. Honest heads-up: kanji/reading edge cases can slip, so I'd genuinely value bug reports on readings.

iOS: https://apps.apple.com/app/id6776714408 · Android: https://play.google.com/store/apps/details?id=com.soksokvoca
```

### r/ChineseLanguage
**Title**
```
Made a free vocab app — HSK 1 built in, plus AI-built custom lists (any direction)
```
**Body**
```
Solo dev, sharing a free app. Chinese support is still early — it ships with an HSK 1 list — but you can build any list yourself: type a topic or add words and AI fills pinyin, meaning, and examples, in any direction (EN↔ZH, KR↔ZH…).

4 study modes (flashcards, quiz, examples, autoplay/shadowing), offline-first, optional sync. Free with a daily AI limit, or your own free Gemini key for unlimited.

I'd love input on what Chinese curations to add next (HSK 2–4? radicals? topic packs?).

iOS: https://apps.apple.com/app/id6776714408 · Android: https://play.google.com/store/apps/details?id=com.soksokvoca
```

### r/Korean  (⭐ 강한 앵글 — 한국어 배우는 외국인)
**Title**
```
Free app for learning Korean vocab — TOPIK A/B/C series (NIKL frequency), any base language, offline-first
```
**Body**
```
I built a vocab app and Korean is a first-class language in it, not an afterthought — figured this sub might find it useful.

- Curated TOPIK Basic/Intermediate/Advanced series, built on NIKL (국립국어원) A/B/C frequency lists
- Your base language can be anything — EN↔KR, JA↔KR, VI↔KR, ZH↔KR — so it works whether you're here for K-pop, Hallyu, study-abroad, or living in Korea
- Build your own list from a topic ("cafe ordering", "drama slang") or add words one by one with AI-filled meaning/examples/pronunciation
- Study modes: flashcards, quiz, example sentences, autoplay/shadowing (great for pronunciation)
- Offline-first, guest mode, optional cloud sync

Free with a daily AI limit, or your own free Gemini key for unlimited. Would love feedback from actual Korean learners on the curations and example sentences.

iOS: https://apps.apple.com/app/id6776714408 · Android: https://play.google.com/store/apps/details?id=com.soksokvoca
```

> 그 외 후보: r/vocabulary, r/languagelearningjerk(X, 유머 sub 금지), r/TOEIC, r/topikexam, r/LearnKorean(있으면). 각 sub 규칙 확인 후.

---

## 3. Show HN (Hacker News) — 개발자 앵글

> 제목 규칙: "Show HN: " 접두. 과장 금지, 기술/트레이드오프 솔직히. 코멘트에서 스택·의사결정 풀어쓰기.

**Title**
```
Show HN: Avocado – offline-first vocab app with bring-your-own-key Gemini
```
**URL**: `https://apps.apple.com/app/id6776714408` (또는 링크 허브)

**Text / first comment**
```
Solo dev. Avocado is a vocabulary-learning app (iOS + Android) built around two decisions I care about:

1. Offline-first. Everything writes to local SQLite first; if you sign in, it syncs to Supabase Postgres (RLS per-user) on a debounce. Guest mode is fully local. The app is usable on a subway with no signal, and the network is an enhancement, not a dependency.

2. Bring-your-own-key AI. The AI features (generate a list from a topic, enrich a word, OCR a photo into words) run on Gemini. You can paste your own free Google AI Studio key and get unlimited use with your own quota and data — no server in the middle for that path. For non-BYOK users, calls go through Supabase Edge Functions with the operator key, quota-gated.

Stack: React Native + Expo (SDK 54, new architecture), expo-router, Zustand + Context, Expo SQLite with a hand-rolled migration system, Supabase for auth/DB/edge. No long-running server — it's BaaS/serverless end to end, which keeps hosting at ~$0 until real scale.

Things I'd do differently / open questions: LWW sync with mixed clocks was a trap (moved to tombstone-based deletes); nested SQLite transactions on a shared connection bit me; and BYOK vs. metered AI makes pricing messaging tricky.

Happy to go deep on the sync engine, the BYOK tradeoffs, or shipping RN as one person. Feedback welcome.

Android: https://play.google.com/store/apps/details?id=com.soksokvoca
```

---

## 4. X / Threads — 출시 스토리 스레드

**Thread (EN)**
```
1/ I shipped Avocado 🥑 — a vocab app for people who want to build their own word lists, not grind someone else's.

iOS + Android, 6 languages, offline-first. Solo dev. Here's the why 🧵

2/ Every vocab app I tried did one of two things: turned learning into a slot machine (streaks! confetti!) or felt like a textbook. Neither helped me actually memorize the words *I* needed.

3/ So the core idea: the list you want, you build. The list you've been looking for, you grab.
- Topic → AI builds a list
- Photo of a page → words pulled out
- One word → meaning, examples, pronunciation auto-filled
- Or import curated/community lists

4/ Then study it 4 ways — flashcards, quiz, example sentences, autoplay/shadowing — with a daily plan that splits your words for you. No streak guilt.

5/ Nerdy bits: offline-first (local SQLite → Supabase sync), and you can bring your own Gemini key for unlimited free AI. Your key, your data.

6/ It's live. Free to start, no signup needed.
📱 https://apps.apple.com/app/id6776714408
🤖 https://play.google.com/store/apps/details?id=com.soksokvoca

Would love your feedback — what language/curation should I add next?
```

**Threads/X (KO, 국내용 단문)**
```
단어장 앱 '아보카도 🥑' 출시했어요.

외우고 싶은 단어장을 직접 만들거나(주제·사진·AI), 이미 잘 만든 단어장을 가져와서 — 플래시카드·퀴즈·예문·쉐도잉으로 외우는 앱이에요. 스트릭 압박 없고, 교과서 느낌도 없어요.

한·영·일·중·베·스 6개 언어, 오프라인에서도 학습 가능. 무료로 시작하세요.
▶ Android: https://play.google.com/store/apps/details?id=com.soksokvoca
▶ iOS: https://apps.apple.com/app/id6776714408
```

---

## 5. 국내 커뮤니티 (한국)

> ⚠️ 셀프홍보 규칙 강함. 정보성/후기형으로, 링크는 끝에 1회. 네이버 카페는 등업/자기소개 게시판 여부 확인. 클리앙은 '아무거나'가 그나마 관대(그래도 겸손한 출시기 톤).

### 네이버 카페 (영어공부·어학) / 후기·정보형
**제목**
```
사진 찍으면 단어장 만들어주는 무료 앱 써봤어요 (토익·수능 단어 정리용)
```
**본문**
```
혼자 단어 정리하는 게 귀찮아서 이것저것 써보다가 괜찮은 무료 앱 찾아서 공유해요. (직접 개발한 앱이라 홍보 성격도 있어요, 미리 밝혀요!)

제일 편했던 기능:
- 교재 페이지 사진 한 장 찍으면 단어들을 알아서 뽑아서 뜻·예문·발음까지 채워줌
- "토익 빈출 동사" 같은 주제만 입력하면 AI가 단어장 통째로 만들어줌
- 단어 1개 추가하면 뜻·예문·동의어 자동 완성
- 외울 땐 플래시카드/퀴즈/예문/듣고따라하기 4가지 모드 + 매일 학습량 자동 분배

기본 제공 단어장도 있어요(NGSL 기초, 비즈니스, 학술/시험). 스트릭 압박이나 요란한 애니메이션 없이 깔끔한 게 마음에 들어서요.

무료로 쓸 수 있고(하루 AI 50단어), 본인 Gemini 키를 넣으면 무제한 무료예요.
안드로이드: https://play.google.com/store/apps/details?id=com.soksokvoca
아이폰: https://apps.apple.com/app/id6776714408
```

### 클리앙 '아무거나' / 1인 개발 출시기
**제목**
```
1인 개발로 단어장 앱 하나 출시했습니다 🥑 (오프라인 우선 + BYOK AI 이야기)
```
**본문**
```
안녕하세요. 혼자 만든 단어장 앱 '아보카도'를 iOS/안드로이드에 출시해서 출시기 겸 공유드려요.

만들게 된 이유는 단순해요. 기존 단어 앱들이 스트릭·팡파레로 게임처럼 몰아붙이거나, 반대로 교과서처럼 딱딱해서 정작 "내가 필요한 단어"를 못 외우겠더라고요. 그래서 "원하는 단어장은 만들고, 찾던 단어장은 가져와서 외운다"는 컨셉 하나로 팠습니다.

기술적으로 신경 쓴 부분:
- 오프라인 우선: 로컬 SQLite에 먼저 저장하고 로그인 시 Supabase로 동기화. 지하철에서도 학습됨.
- BYOK: 본인 Gemini 키를 넣으면 AI 기능(주제→단어장 생성, 사진→단어 추출, 단어 자동 분석)을 본인 키·본인 데이터로 무제한 사용. 서버가 가로채지 않아요.
- RN/Expo + Supabase(Edge Functions)라 상시 서버 없이 운영비 거의 0.

무료로 시작 가능(게스트 모드, 가입 불필요)하고, 6개 언어 지원합니다.
안드로이드: https://play.google.com/store/apps/details?id=com.soksokvoca
아이폰: https://apps.apple.com/app/id6776714408

피드백 주시면 정말 감사하겠습니다. 특히 예문 품질이랑 다음에 추가할 언어/단어장 의견요!
```

### 디시/뽐뿌 등 / 짧고 가볍게
**제목**
```
사진 찍으면 단어장 만들어주는 앱 만들었다 (무료)
```
**본문**
```
혼자 만든 단어장 앱임. 교재 사진 찍으면 단어 뽑아서 뜻·예문 채워주고, 주제만 치면 AI가 단어장 만들어줌. 플래시카드·퀴즈·예문·쉐도잉으로 외우는 거. 한영일중베스 6개 언어. 무료(본인 Gemini 키 넣으면 무제한).
안드: https://play.google.com/store/apps/details?id=com.soksokvoca
아이폰: https://apps.apple.com/app/id6776714408
```

---

## 6. 아시아 언어권 (일/중/베) — 현지 커뮤니티용 짧은 소개

> 스토어 리스팅 전문은 `store-assets/listing/{ja,zh,vi}.md`에 이미 있음. 아래는 커뮤니티 게시용 단문. 현지 커뮤니티(예: JP - X/reddit r/Korean, ZH - 小红书/reddit, VI - Facebook 그룹)에서 "한국어 배우는 현지인" 앵글로.

**JA (일본어 — 한국어 학습자용)**
```
韓国語の単語アプリ「Avocado 🥑」を作りました。TOPIK A/B/Cの単語帳が入っていて、写真やトピックから自分だけの単語帳もAIで作れます。フラッシュカード・クイズ・例文・シャドーイングで暗記。オフライン対応・無料。
Android: https://play.google.com/store/apps/details?id=com.soksokvoca
iOS: https://apps.apple.com/app/id6776714408
```

**ZH (중국어 — 한국어 학습자용)**
```
做了一个韩语单词App「Avocado 🥑」。内置TOPIK初/中/高级词表，也能用主题或拍照让AI帮你生成专属单词本。抽认卡·测验·例句·跟读四种模式，支持离线，免费使用。
安卓: https://play.google.com/store/apps/details?id=com.soksokvoca
iOS: https://apps.apple.com/app/id6776714408
```

**VI (베트남어 — 한국어 학습자용)**
```
Mình làm app học từ vựng tiếng Hàn "Avocado 🥑". Có sẵn bộ từ TOPIK sơ/trung/cao cấp, và bạn có thể tự tạo danh sách từ theo chủ đề hoặc chụp ảnh nhờ AI. Học bằng thẻ ghi nhớ, quiz, câu ví dụ, shadowing. Dùng offline, miễn phí.
Android: https://play.google.com/store/apps/details?id=com.soksokvoca
iOS: https://apps.apple.com/app/id6776714408
```

---

## 7. 보너스 — 테스터/지인 리뷰 요청 메시지

> 초기 별점·리뷰는 스토어 랭킹 부스트에 직접적. 비공개 테스터 20명 + 지인에게 개별 발송. "정직한 후기" 요청(별점 강요 X = 정책 위반 소지).

**KO (카톡/문자용)**
```
안녕하세요! 만들던 단어장 앱 '아보카도'가 드디어 정식 출시됐어요 🥑
혹시 잠깐 써보시고 스토어에 솔직한 후기 한 줄 남겨주실 수 있을까요? 초반 리뷰가 정말 큰 힘이 돼요. 별점만이라도 감사해요!
안드: https://play.google.com/store/apps/details?id=com.soksokvoca
아이폰: https://apps.apple.com/app/id6776714408
```

**EN**
```
Hey! My vocab app Avocado 🥑 is officially live. If you have a minute, I'd hugely appreciate an honest review on the store — early reviews make a real difference. Even just a rating helps 🙏
iOS: https://apps.apple.com/app/id6776714408 · Android: https://play.google.com/store/apps/details?id=com.soksokvoca
```

---

## 게시 순서 제안 (도배 방지, 3~5일 분산)

1. **D0**: 테스터/지인 리뷰 요청(§7) + 본인 X/Threads 출시 스레드(§4) + 클리앙 출시기(§5)
2. **D+1~2**: Product Hunt 론칭(§1, 화/수 00:01 PST) → 당일 X/Threads로 PH 링크 부스트
3. **D+3**: r/languagelearning(§2) — 가장 큰 sub 먼저
4. **D+4~5**: 언어별 sub 분산(r/Korean, r/EnglishLearning, r/LearnJapanese, r/ChineseLanguage) + 네이버 카페(§5)
5. **D+6~7**: Show HN(§3) + 아시아 현지 커뮤니티(§6)
6. **상시**: 리뷰 응대(★1~2 즉시), UTM/유입 모니터링

> 채널·모니터링 큰 그림은 `docs/handoff-marketing-teasers.md` "Phase 2 출시일 채널" 참조.
