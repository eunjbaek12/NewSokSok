# Play Console — 컴플라이언스 답변지

Google Play Console 앱 등록 시 거쳐야 하는 설문들에 대한 답변지 모음.

## 파일

- [`data-safety.md`](./data-safety.md) — Data Safety 폼 (가장 중요)
- [`content-rating.md`](./content-rating.md) — 콘텐츠 등급 설문 (IARC)
- [`ai-disclosure.md`](./ai-disclosure.md) — 생성형 AI 사용 신고

## 작성 원칙

답변지는 **현재 코드 상태**를 기준으로 작성됨. 다음 파일들의 실제 구현을 검토해 작성했습니다:

- `app.json` — 권한 선언
- `features/auth/store.ts` — Google 로그인 + 계정 삭제
- `features/sync/engine.ts` — Supabase 동기화
- `lib/db/migrations/` — 로컬 SQLite 스키마
- `components/PhotoImportWorkflow.tsx` — 사진 스캔·카메라
- `lib/ai/gemini-client.ts` — AI 호출 (사용자 API 키)
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
| 이메일·이름 수집 (Google 로그인) | `features/auth/store.ts:41,53-54` | ✅ |
| 계정 삭제 가능 | `features/auth/store.ts:32` `deleteAccount()` | ✅ |
| 카메라 권한 | `app.json:33-35` (이번 커밋에서 추가됨) | ✅ |
| 마이크 권한 | `app.json:33-35` | ✅ |
| Supabase 동기화 | `features/sync/engine.ts` | ✅ |
| Gemini AI (사용자 키) | `lib/ai/gemini-client.ts` | ✅ |
| 인앱 결제 없음 | `package.json`에 `expo-iap`·`react-native-iap` 부재 | ✅ |
| 광고/트래킹 SDK 없음 | `package.json`에 Firebase·Sentry·AppsFlyer 부재 | ✅ |
