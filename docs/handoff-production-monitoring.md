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

## 0. 🚦 출시 직후 1회 작업 (버전별)

관찰이 아니라 **출시 순간에 맞춰 딱 한 번 해야 하는 일**을 여기 둔다. 잊기 쉬운 자리다 —
빌드를 올리고 승인을 기다리는 동안에는 할 일이 없어 보이지만, 서버 쪽에 밀린 변경이
있으면 앱과 서버가 어긋난 채로 남는다.

### ✅ 1.3.1 — 가입 체험 폐지 마이그레이션 (2026-08-02 완료)

> 원래 1.3.0에 맞춰 하려던 일인데 **1.3.1로 미뤄졌다**(2026-07-31). 1.3.0이 양대 스토어에
> 라이브가 된 뒤 확인해보니 **App Store 설명에 옛 문구가 그대로 살아 있었다** —
> "가입 시 Pro 7일 무료 체험, 자동 결제 없음". 뒤 문장은 마이그레이션과 무관하게
> **그때 이미 거짓**이었다(스토어 오퍼는 해지하지 않으면 자동 결제된다).

**선행 조건 — 이게 안 되면 아래를 돌리면 안 된다:**

- [x] **App Store 설명 교체** (원고 = `store-assets/listing/ios-ko.md` 외)
      ⚠️ **라이브 버전은 설명이 잠긴다.** 새 버전을 만들어야 고칠 수 있고, 새 버전을 만들면
      ASC가 빌드를 요구한다 — 그래서 1.3.1 빌드가 딸려온 것이지 빌드가 목적이 아니었다.
      (심사 없이 언제든 고칠 수 있는 건 프로모션 텍스트 170자뿐이다.)
- [x] **승인 ≠ 공개.** 심사 통과가 아니라 **실제로 스토어에 떴는지**까지 확인할 것.
      → 2026-08-04 재확인: 한국 스토어프론트 라이브 버전 1.3.1, "자동 결제 없음" 사라짐.
- ✅ Play 쪽은 이미 충족 — 설명 5로케일 갱신 완료(7/31 라이브 실측), 앱도 vCode20에
      새 약관이 담겨 라이브다.

**본 작업:**

- [x] **양대 스토어 출시 확인 후** `npx -y supabase@latest db push --linked`
      → `20260727000000_signup_boost_replaces_trial` 적용 (2026-08-02 적용, 8/3 재확인)
      ⚠️ 프로덕션 DB 변경이다. 실행 직전에 사용자에게 한 번 더 확인할 것.
- [x] 적용 확인: 신규 계정 하나로 `get_ai_quota_status` → `limit: 300`, `tier: 'free'`
- [x] 기존 체험자 보존 확인: `trial_ends_at`이 미래인 행이 그대로인지 (이 마이그레이션은
      기존 행을 UPDATE하지 않는다)
- [x] 웹 방침 2곳에서 "7일 Pro 무료 체험" 근거로 이메일 해시를 보관한다는 설명 갱신 —
      `docs/privacy-policy.html`(ko·en 두 단락), `docs/account-deletion.html`. → `3bbdcd8`
      서버 체험이 사라지면 `trial_history`/`email_hash()`는 남아 있어도 쓰이지 않는다.

**🔑 라이브 스토어 텍스트를 확인하는 가장 빠른 길**(다음 버전에도 그대로 쓴다):

```
curl -s "https://itunes.apple.com/lookup?id=6776714408&country=kr"
```

`version`·`description`·`releaseNotes`를 JSON으로 준다. `country`를 바꾸면 로케일별 설명이
나와 **로케일 등록 여부까지** 알 수 있다(ja·vi·zh는 미등록이라 다른 로케일 텍스트가 뜬다).

**왜 "제출 후"가 아니라 "출시 후"인가**: 서버는 앱 버전을 가리지 않는다. 심사 중에 적용하면
아직 라이브인 구버전 사용자에게도 즉시 적용되는데, 그 앱의 약관에는 "가입 시 7일 체험"이라고
적혀 있다 — 약속을 어기는 방향의 불일치다. 반대로 미뤄서 생기는 불일치는 "약관엔 없다는데
서버가 더 준다"라 무해하다. 반려로 출시가 밀릴 수 있다는 점까지 고려하면 출시 후가 안전하다.
RPC 인자·반환 필드는 그대로라 구버전 앱 호환성 문제는 없다.

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
- 출시 게이트 전체 이력은 `project_play_release` 메모리 참고(출시 마스터 체크리스트는 출시 완료 후 정리됨).
- 메모리: `project_play_release`, `project_admob_serving_limited_prelaunch`, `project_ios_sandbox_verify_401`, `project_debounce_push_data_loss`.
