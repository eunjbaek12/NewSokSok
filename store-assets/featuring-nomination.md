# App Store 피처링 요청 (Featuring Nomination) — 답변지

> 📌 **상태 (2026-07-21):** **아직 제출하지 않는다.** 지금 병목은 피처링이 아니라 **사용자 확보**다.
> 애플 에디터의 7가지 채점 기준 중 가장 무거운 **"사용자 경험"이 빈칸**이기 때문 — 앱 평점·리뷰가 **0개**다.
> 평점 4.0 미만은 애플이 거의 추천하지 않고(추천작 평균 4.2), 구글 플레이 지명도 평점 요건을 본다.
> **순서: ① 다음 빌드(인앱 리뷰 넛지 실기 검증) → ② 리뷰 10~20개 축적 → ③ 위젯 개발 → ④ 지명.**
> 모멘트는 신학기(3월·9월)나 새해 결심(1월)에 맞추면 가점.
>
> 이 답변지는 **복습(Gentle Review) 단독**으로 재앵글해 보존돼 있음. 위젯이 완성되면 §2·§4·§5에
> 위젯을 두 번째 헤드라인으로 복원해 제출하면 됨. (이미 출시된 업데이트도 지명 가능·무응답=탈락·손해 없음.)
>
> ⏰ **구글 플레이는 기한이 있다.** Play의 Featuring Nomination 폼은 **출시 후 약 120일 이내 신규 앱**만
> 받는다. iOS 6/12 · Android 7/1 출시 → **10월 말경 만료**. 그 이후 업데이트는 폼을 못 쓰고
> Play Console의 **프로모션 콘텐츠(Promotional Content)** 로만 홍보 가능.

App Store Connect → 사이드바 **Featuring → Nominations → `+`** 에 그대로 붙여넣기용.
(지명 유형 3종: **App Launch** 신규 출시 / **App Enhancements** 큰 업데이트 ← 우리 것 / **New Content** 콘텐츠·이벤트)

> ⚠️ 먼저 알아둘 것
> - **피처링은 심사가 아니라 "추천 후보 지명"** 이에요. 제출한다고 반드시 추천되지 않고, 선정 안 되면 보통 **답장이 없습니다**(거절 통보 없음). 손해는 없으니 부담 없이 넣으면 됩니다.
> - Apple은 **계기(모멘트)가 있는 시점** 을 좋아합니다 — 새 앱 출시, 큰 업데이트, 인앱 이벤트 등. 그 시점 **2~3주 전** 제출이 이상적.
> - Apple 에디터가 좋아하는 것: **뛰어난 디자인 / Apple 기술 활용 / 로컬라이제이션 깊이 / 접근성 / 진정성 있는 스토리**. 아보카도는 이 다섯 가지가 다 강합니다.
> - 필드 라벨은 Apple이 수시로 바꿔서 아래는 "질문의 취지"별로 정리했습니다. 실제 폼에서 비슷한 질문에 매칭해 붙여넣으세요.

---

## 1. 어떤 앱? (Select app)

- **아보카도 (Avocado — Vocabulary Builder)** / SokSok Voca
- 플랫폼: **iPhone 전용** (iOS)
  - ⚠️ **iPad를 체크하지 말 것.** `app.json`이 `supportsTablet: false` = 실제로 iPhone 전용이다.
    (2026-07-21까지 이 문서에 "iPhone, iPad"로 잘못 적혀 있었음 — 없는 지원을 주장하면 에디터
    검증에서 역효과.)
  - 📉 참고: **iPhone 전용 앱은 Today 탭 선정 확률이 낮다**(에디터가 iPad 화면도 함께 큐레이션).
    확률을 올리려면 `supportsTablet: true` + iPad 레이아웃 대응이 선행돼야 함 — 지명 전 검토 항목.

## 2. 무엇을 공유하나요? (What are you sharing?)

- ✅ **앱 업데이트 (App update)** — 결정됨.
- 이번 업데이트의 헤드라인 (단일, 집중):
  - **부드러운 복습 (Gentle Review)** — 잊을 때쯤 단어를 자동으로 다시 모아주는, 죄책감 없는 간격 반복. 밀린 복습을 한꺼번에 쏟아내지도, 빨간 배지로 압박하지도 않음.
- (+ 소폭 폴리시: 학습 기록·통계 화면, 인앱 도움말(FAQ) 정비 등)

> ⚠️ **위젯(WidgetKit)은 이번 버전에서 보류** — 다음 업데이트 모멘트로 미룹니다. 이 문서 어디에서도 위젯을 주장하지 않습니다(미구현 기술을 체크하면 에디터 검증에서 역효과).

## 3. 언제? (When is this happening?)

- 다음 버전(**부드러운 복습** 포함)의 **배포 예정일**을 기입.
- ⏰ **피처링 제출 타이밍: 배포 예정일 2~3주 전.** 가장 이상적인 상태 = **심사는 통과했지만 아직 공개 전**(수동/예약 출시로 잡아둔 상태).
  - 추천 플로우: ① 빌드 제출 → ② 승인 후 **수동/예약 출시로 홀드** → ③ 피처링 지명(예정 출시일 명시) → ④ 2~3주 뒤 공개.
  - "곧 출시"를 서둘러 **자동 공개**하면 리드타임이 사라져 피처링 효과가 약해짐 — 출시일을 리드타임 뒤로 잡는 걸 권장.
- 시즌과 엮으면 가점: 신학기(3월/9월)·새해 결심(1월).

---

## 4. 핵심 소개 — 왜 주목할 만한가 (Tell us about it) ★가장 중요

> 이 텍스트 박스가 심사의 핵심. 한/영 둘 다 준비 — Korea 스토리프론트엔 한국어, 글로벌 에디토리얼엔 영어가 유리.

### 🇰🇷 한국어 버전 (약 750자)

```
이번 업데이트의 주인공은 '부드러운 복습'입니다. 외운 단어를 잊을 때쯤 앱이 알아서 다시 모아 주되, 밀린 복습을 한꺼번에 쏟아내거나 빨간 배지로 압박하지 않습니다. 잘 외운 단어는 뜸하게, 자꾸 틀리는 단어는 자주 — 하루 분량엔 넉넉한 상한을 둔, 죄책감 없는 간격 반복입니다. 알림도 복습할 게 있는 날에만 하루 한 번 조용히 옵니다.

아보카도는 한국에서 만든, 6개 언어(한·영·일·중·베·스)를 어느 방향으로든 학습할 수 있는 어휘 앱입니다. 딱딱한 암기 앱들 사이에서 따뜻한 크림 톤과 아보카도 캐릭터·다양한 스킨(Y2K·다크 고요·실험실)으로 손맛 있는 디자인을 지향했습니다.

AI는 과하지 않게, 쓸모 있게 녹였습니다. 단어 하나만 넣으면 발음·뜻·예문·동의어까지 카드가 완성되고, 사진 한 장이면 단어장이 통째로, 주제만 적으면("카페에서 주문하기", "토익 빈출 동사") AI가 단어장을 만듭니다. 본인 Gemini 키로 AI를 무제한 무료로 쓰는 BYOK 모드는 사용자를 존중하는 흔치 않은 선택입니다.

오프라인 우선, 프라이버시 존중(광고는 비로그인·무료 사용자에게만, ATT 준수, 요청 권한은 마이크 하나), Sign in with Apple·StoreKit 구독까지 Apple 생태계에 맞게 구현했습니다. K-pop·한류 열풍 속, 한국어를 배우려는 세계인과 영·일·중을 배우려는 한국인을 한 앱으로 잇습니다.
```

### 🇺🇸 English version (~1,000 chars)

```
The star of this update is Gentle Review. It quietly resurfaces words right when you're about to forget them — but never dumps a backlog on you or nags with red badges. Words you know well come back rarely; words you keep missing come back sooner, and each day's load is capped so it never overwhelms. Reminders arrive only on days you actually have something to review, once a day, softly. Spaced repetition that stays kind.

Avocado is a Korea-made vocabulary app that lets you learn any of six languages (English, Korean, Japanese, Chinese, Vietnamese, Spanish) in any direction. Against a sea of utilitarian flashcard apps, we chased a warm, hand-crafted feel — a soft cream palette, an avocado mascot, and swappable skins (Y2K, Dark Calm, Lab).

We wove AI in tastefully and usefully: type one word and a full card appears (pronunciation, meaning, examples, synonyms); snap a photo and a whole deck is built from it; describe a topic ("ordering at a cafe", "TOEIC verbs") and AI generates the list. Our BYOK mode — bring your own Gemini key for unlimited free AI — is a rare, user-respecting stance.

It's offline-first, privacy-forward (ads only for logged-out/free users, ATT respected, the only permission is the microphone), and built for the Apple ecosystem with Sign in with Apple and StoreKit subscriptions. Riding the global K-pop and Hallyu wave, it connects people learning Korean and Koreans learning English, Japanese, or Chinese — in one thoughtfully designed app.
```

### 짧은 버전 (글자수 제한이 빡빡할 때, ~280자)

```
이번 업데이트: 부드러운 복습 — 외운 단어를 잊을 때쯤 앱이 알아서 다시 모아주는, 죄책감 없는 간격 반복(밀림·빨간 배지 압박 없음, 알림은 필요한 날만 하루 한 번). 한국에서 만든 6개 언어 어휘 앱 — 단어 하나로 AI 카드 완성, 사진 한 장으로 단어장 통째, 주제 입력으로 AI 단어장. 본인 키로 AI 무제한 무료(BYOK). 오프라인 우선·프라이버시 존중·Sign in with Apple·StoreKit. 따뜻한 크림 톤 디자인으로 딱딱한 암기 앱과 차별화. K-pop·한류 학습자와 한국인 학습자를 한 앱으로.
```

---

## 5. 어떤 Apple 기술/기능을 쓰나요? (Apple technologies & features)

> ✅ = 실제 구현됨(정직하게 체크). 과장 금지 — 없는 기술 체크하면 역효과.

| 체크 | 기술 | 비고 |
|---|---|---|
| ✅ | **User Notifications (로컬 알림)** | 이번 헤드라인과 직결 — 복습 알림. 필요한 날만 하루 한 번, 빈 날은 안 보내는 예측 스케줄 |
| ✅ | **Sign in with Apple** | 이메일 비공개(릴레이) 포함 |
| ✅ | **In-App Purchases / StoreKit** | 자동 갱신 구독(월/연), 7일 무료 체험 |
| ✅ | **App Tracking Transparency** | ko/en 로컬라이즈된 안내 문구 |
| ✅ | **Text-to-Speech (AVSpeechSynthesizer)** | 발음·쉐도잉·오토플레이 낭독 |
| ✅ | **Dark Mode** | 라이트/다크 + 다중 스킨 테마 |
| ✅ | **Localization (6개 언어)** | 앱 UI + 학습 방향 6개 언어, 강력한 셀링 포인트 |
| ✅ | **Camera / Photo** | 사진 스캔으로 단어 추출 |
| ❌ | WidgetKit / Lock Screen 위젯 / Live Activities | **이번 버전 미구현(보류)** — 다음 업데이트 모멘트로. 지금은 체크하지 말 것 |
| ❌ | iCloud / CloudKit | 클라우드는 Supabase 사용(iCloud 아님) |
| ❌ | App Clips / SharePlay / ARKit / Metal / Core ML | 미구현 |

> ⚠️ **iCloud·Live Text·Vision 프레임워크는 체크하지 마세요.** 사진 OCR은 온디바이스 Vision이 아니라 서버측 AI(Gemini)라서, "Live Text"로 표기하면 사실과 다릅니다.

## 6. 접근성 (Accessibility)

- 정직하게: **Dark Mode / 다크 테마 지원**, **음성 합성(TTS) 기반 듣기·발음 학습** 은 실제 강점.
- VoiceOver·Dynamic Type 완전 지원 여부가 확실하지 않으면 **체크하지 마세요.** (에디터가 실제로 확인합니다.)

## 7. 로컬라이제이션 (Languages / Localizations)

- 앱 UI 로컬라이제이션: 한국어, 영어 (+ 학습 콘텐츠는 일·중·베·스 포함 6개 언어)
- **강조 포인트**: 단순 번역이 아니라 "어느 언어 → 어느 언어로든" 학습 가능한 30개 언어쌍.

## 8. 국가/지역 (Regions)

- 현재 iOS **175개국+** 라이브. 특정 시장 강조하려면: **대한민국**(홈), 그리고 K-pop·한국어 학습 수요가 큰 **미국·동남아(베트남·인도네시아)·일본** 을 함께 언급.

## 9. 추가 정보 / 링크 (Anything else)

```
- 개발: 산녀와 나무꾼 (소규모 인디팀, 대한민국)
- 지원/웹: https://eunjbaek12.github.io/NewSokSok/
- 개인정보처리방침: https://eunjbaek12.github.io/NewSokSok/privacy-policy
- 디자인 특징: 아보카도 마스코트 + 크림 톤 커스텀 아트, 4종+ 스킨 테마
- 차별점: BYOK(본인 키로 AI 무제한 무료) — 사용자 존중형 과금 모델
```

---

## 제출 전 전제조건 (이게 안 되면 넣어도 확률이 없다)

애플 에디터의 **7가지 채점 기준** = 사용자 경험 · UI 디자인 · 혁신성 · 독창성 · 접근성 · 로컬라이제이션 · 제품 페이지 품질.
현재 진단(2026-07-21):

| 기준 | 상태 | 근거 |
|---|---|---|
| UI 디자인 | 🟢 강함 | 아보카도 캐릭터·크림 톤·스킨 4종 |
| 로컬라이제이션 | 🟢 매우 강함 | 6개 언어 UI + 30개 언어쌍 |
| 독창성 | 🟢 강함 | 모바일 BYOK는 사실상 유일 |
| 제품 페이지 품질 | 🟢 실측 우수 | Play 스토어 전환율 38.71%(통상 20~30%) |
| 혁신성 | 🟡 보통 | AI 어휘앱 카테고리 자체가 붐빔 |
| 접근성 | 🔴 미확인 | VoiceOver·Dynamic Type 미검증 → 체크 금지 |
| **사용자 경험** | 🔴 **증거 없음** | **평점·리뷰 0개** ← 최대 병목 |

- [ ] **평점 4.0+ / 리뷰 10~20개** ← 가장 큰 레버. 4.0 미만은 애플이 거의 추천 안 함(추천작 평균 4.2)
- [ ] 위젯(WidgetKit) 구현 — 애플이 적극 큐레이션하는 기술
- [ ] iPad 지원(`supportsTablet: true`) 검토 — iPhone 전용은 감점
- [ ] 접근성 실측 후 Helpful Details에 명시 (미검증 상태로 체크하면 역효과)

## 제출 팁 (checklist)

- [ ] 스크린샷/미리보기가 최신 마케팅본인지 확인 (에디터가 스토어 리스팅을 봄)
- [ ] 계절/모멘트와 엮기 (신학기 3월·9월, 새해 결심 1월, K-pop 이벤트 시즌)
- [ ] **출시일 최소 3주 전** 제출 (애플 공식 요구 리드타임)
- [ ] 이상적 상태 = **심사 통과 + 수동/예약 출시로 홀드**. 자동 공개하면 리드타임이 사라짐
- [ ] **Supplemental Materials(URL 최대 5개)에 TestFlight 링크 첨부** — 에디터가 실물을 만져보게 하는 가장 강한 카드
- [ ] 국가/지역은 흩뿌리지 말고 **대한민국 집중** — 스토어프론트마다 에디터 팀이 따로 큐레이션하고,
      한국 팀은 한국 개발사를 적극적으로 찾는다(글로벌보다 확률이 높은 유일한 구조적 이유)
- [ ] ⚠️ 단, **한국 스토어프론트용 앵글은 "한국인이 영·일·중을 배우는 앱"** 쪽을 세울 것.
      "한국어를 배우는 앱"은 한국 에디터에게 특별하지 않다(그 각도는 미국·동남아용)
- [ ] 한 번 넣고 답 없어도 정상 — 다음 큰 업데이트 때 또 지명 가능(반복 제출 OK)
