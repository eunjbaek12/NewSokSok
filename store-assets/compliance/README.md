# 스토어 컴플라이언스 답변지

Play Console / App Store Connect의 설문에 옮겨 적을 답변지 모음.

## 파일

- [`data-safety.md`](./data-safety.md) — Play 데이터 보안 (가장 중요)
- [`app-privacy-asc.md`](./app-privacy-asc.md) — App Store Connect 앱 개인정보
- [`content-rating.md`](./content-rating.md) — 콘텐츠 등급 설문 (IARC)
- [`ai-disclosure.md`](./ai-disclosure.md) — 생성형 AI 사용 신고
- [`purchase-safety-exemption.md`](./purchase-safety-exemption.md) — 결제 관련 면제 신고

## ⚠️ 이 답변지는 한 번 크게 뒤처졌었다

`data-safety.md`는 출시 **전** 코드로 쓰인 뒤 갱신되지 않아, 구독과 AdMob이 들어간
한참 뒤까지 "인앱 결제 없음 / 광고 SDK 없음"이라고 적혀 있었습니다(2026-07-28 정정).
답변지는 코드를 따라가지 않으면 조용히 거짓이 되고, 그 거짓은 심사가 아니라
정책 위반으로 돌아옵니다.

**다음을 건드리는 PR은 이 폴더도 같이 고칠 것:** 수집 항목, 결제, 광고, 권한,
외부 전송 경로(새 Edge Function·새 처리자).

## 작성 원칙

답변지는 **현재 코드 상태**를 기준으로 씁니다. 사용자에게 보이는 문구의 정본은
`docs/privacy-policy.html`이며, 답변지가 방침과 어긋나면 방침이 이깁니다.

근거로 읽는 파일:

- `app.json` — 권한 선언
- `features/auth/store.ts` — 소셜 로그인 + 계정 삭제
- `features/sync/engine.ts` — Supabase 동기화
- `features/support/api.ts` — 문의 전송·진단 정보
- `features/billing/` — 구독·구매 검증
- `lib/ads/admob.ts` — 광고, ATT
- `components/PhotoImportWorkflow.tsx` — 사진 스캔·카메라
- `lib/ai/gemini-client.ts` — AI 호출 (사용자 API 키)
- `supabase/migrations/` — 서버 스키마
- `i18n/locales/ko.json` — 약관 텍스트

## ⚠️ 향후 개선 권장 (출시 후)

답변지 작성 중 발견된 미구현 항목 (현재는 "No" 답변):

1. **큐레이션(UGC) 신고 기능** — 부적절한 공유 단어장을 사용자가 신고할 수 있는 기능
2. **AI 결과 신고 기능** — 부적절한 AI 출력 신고
3. **콘텐츠 검토 가이드라인** — admin에게 검토 기준 제공

Play 출시 자체에 블로커는 아니지만, 1년 내 추가하면 등급 안정성·심사 통과율 향상.

## ✅ 코드와 답변이 일치하는지 빠른 체크

| 답변 내용 | 코드 위치 | 확인 |
|---|---|---|
| 이메일·이름 수집 (소셜 로그인) | `features/auth/store.ts` | ✅ |
| 계정 삭제 가능 | `features/auth/store.ts` `deleteAccount()` | ✅ |
| 카메라·마이크 권한 | `app.json` | ✅ |
| Supabase 동기화 | `features/sync/engine.ts` | ✅ |
| Gemini AI (사용자 키 / 운영자 키) | `lib/ai/gemini-client.ts`, `supabase/functions/enrich-word/` | ✅ |
| **인앱 결제 있음** | `expo-iap`, `features/billing/` | ✅ |
| **광고 있음 (AdMob + ATT)** | `react-native-google-mobile-ads`, `lib/ads/admob.ts` | ✅ |
| **문의 메시지·진단 정보 수집** | `features/support/api.ts` | ✅ |
| 분석·크래시 SDK 없음 | `package.json`에 Firebase·Sentry·AppsFlyer 부재 | ✅ |
