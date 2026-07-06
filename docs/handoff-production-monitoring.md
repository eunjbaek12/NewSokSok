# Production 관찰 체크리스트 (출시 후 모니터링)

> 작성 2026-07-07. iOS(6/12 소프트런치) + Android(7/1 정식) 양 플랫폼 라이브, AdMob 양쪽 광고 제한 해제(7/6~7) 완료 시점 기준.

## ⚠️ 전제
- **in-app 크래시 SDK 없음**(Sentry/Crashlytics 미설치) → 크래시는 스토어 콘솔(Play Vitals / App Store Connect)로만 보인다.
- 백엔드(결제·AI·로그인)는 전부 **Supabase 대시보드**(Edge Functions Logs + Table/SQL Editor)에서 본다.
- Edge Functions: `verify-purchase`, `enrich-word`, `generate-words`, `scan-image`.
- 핵심 테이블: `user_subscriptions`, `ai_usage_daily`. RPC: `consume_ai_quota`, `grant_rewarded_bonus`, `get_ai_quota_status`, `refund_ai_quota`.

## 관찰 케이던스
- **출시 초기(~2주)**: 매일 1회 아래 6개 섹션 훑기.
- **안정화 후**: 주 1~2회 + 스토어 리뷰/크래시 알림 즉시 대응.

---

## 1. 💳 결제 (verify-purchase)

**어디서**: Supabase → Edge Functions → `verify-purchase` → Logs / SQL Editor로 `user_subscriptions` 조회.

**정상**: 구매 → 응답 `200 { tier:'pro', pro_until }` → `user_subscriptions.tier='pro'` 갱신.

**경보 시그널 (응답 코드로 원인 특정)**:

| 코드 | detail | 의미 / 대응 |
|---|---|---|
| `402` | `product_mismatch` | 결제 SKU ≠ 등록 SKU. Play/ASC 상품 ID가 `pro_monthly`/`pro_yearly`와 정확히 일치하는지 확인 |
| `402` | `expired` / `revoked` | 만료·환불(정상 흐름). 다발하면 갱신 실패 조사 |
| `402` | `bundle_mismatch` | iOS 위변조 or `APPLE_BUNDLE_ID` 오설정 |
| `500` | `upstream_failure` | **가장 주의** — Play/Apple API 통신·자격증명 문제. `PLAY_SA_*` / `APPLE_*` Secret 만료 의심 |
| `401` | — | JWT 문제(로그인 세션) |
| `429` | `rate_limited` | 분당 5건 rate limit. 정상 방어 |

**핵심 회귀 감시**: iOS sandbox 401 fallback(`project_ios_sandbox_verify_401`). TestFlight 결제가 항상 실패하면 이 fallback 회귀 의심.

**교차 확인**: Play Console → 수익 창출 → 구독 / App Store Connect → 구독 보고서의 결제 건수와 `user_subscriptions` 행 수 대조.

```sql
-- 최근 결제 전환 (Supabase SQL Editor)
select user_id, tier, play_product_id, pro_until, updated_at
from user_subscriptions where tier='pro' order by updated_at desc limit 20;
```

---

## 2. 🤖 AI quota

**어디서**: Edge Functions `enrich-word` / `generate-words` / `scan-image` Logs + `ai_usage_daily` 테이블.

**정상**: Free 100단어/일, Pro·트라이얼 1000/일, 광고 보너스 최대 +200(절대 상한 300), **KST 자정 리셋**(`kst_today()`).

**경보 시그널**:
- `consume_ai_quota` **allowed=false 급증** → 사용자가 한도에 막힘(보상형 광고 유도로 넘어가는지 확인).
- **`refund_ai_quota` 호출 빈도** = Vertex(Gemini) 호출 실패 지표. 잦으면 Vertex 자격증명/quota 문제.
- KST 자정 이후에도 `usage_date`가 안 넘어가면 `kst_today()` 리셋 오류.

```sql
-- 오늘(KST) 소진 상위 사용자
select user_id, word_count, rewarded_bonus, call_count
from ai_usage_daily
where usage_date = (now() at time zone 'Asia/Seoul')::date
order by word_count desc limit 20;
```

---

## 3. 💥 크래시 / 안정성 (SDK 없음 → 스토어 콘솔만)

**Android**: Play Console → 품질 → **Android Vitals** — 크래시율·ANR. Play 나쁜동작 임계치(크래시 1.09% · ANR 0.47%) 초과 시 검색 노출 페널티. **R8 난독화·기기 파편화는 Android 전용**(iOS에서 검증 안 된 영역).

**iOS**: App Store Connect → 분석 / Xcode Organizer → Crashes. 감시 대상: **iOS26 `ClassicTabLayout`**(native-tabs 크래시 회피본), 좀비 오버레이(`project_vocab_lists_touch_dead_ios`).

---

## 4. 🔐 로그인 / 인증

**어디서**: Supabase → Authentication → Users / Logs.

**감시**:
- Google / Apple / 게스트 로그인 성공률.
- **Apple "이메일 가리기"** = 릴레이 이메일이라 Google과 **별개 계정**으로 분리됨(버그 아님, `project_supabase_identity_autolink`).
- 로그아웃 후 세션 부활(`project_logout_session_resurrection`) 재발 여부.

---

## 5. 📊 광고 (AdMob) — 이제 관찰만

7/6(iOS)~7/7(Android)로 광고 게재 제한 해제 완료(양쪽 앱 인증 "확인됨" · 승인 "준비됨").
AdMob 콘솔 → 보고서에서 **노출수 · 일치율(match rate) · 예상 수익** 확인. 게스트/무료에서 배너 노출(Pro·트라이얼은 광고 없음). no-fill 지속 시 `EXPO_PUBLIC_AD_DEBUG=1` 진단 빌드(커밋 `e89f234`).

- iOS App ID `~2860788000`(스토어 6776714408), Android App ID `~7571600348`(`com.soksokvoca`). 앱 이름이 둘 다 "아보카도: 단어장 학습"이라 **App ID 끝자리로만 구분**.

---

## 6. 🔄 동기화 / 데이터 (보조)

30초 디바운스 push 특성상 재설치 시 미전송분 유실 신고 가능(`project_debounce_push_data_loss`). "최근 단어장 없음" 신고 시 3종 저장소(개인 `cloud_lists` / 공유 `curated_themes` / 공식 번들) 구분부터. 복구는 대개 재설치로 `lastPulledAt=0` 리셋 → 전체 재pull.

---

## 관련 문서 / 메모리
- `docs/handoff-launch-checklist.md` — 출시 게이트 전체 이력.
- 메모리: `project_play_release`, `project_admob_serving_limited_prelaunch`, `project_ios_sandbox_verify_401`, `project_debounce_push_data_loss`.
