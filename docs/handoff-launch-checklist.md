# 출시 마스터 체크리스트 (Play Store v1.1)

**이 문서가 출시까지 남은 작업의 단일 기준(master)이다.** 2026-05-26 기준 작성.

> ⚠️ **문서 신뢰도 주의**: 기존 handoff 문서·자동 메모가 시점별로 작성돼 서로 **상충**한다
> (예: `handoff-v1.1-progress.md`는 "AdMob 발급·EAS Secret 완료 ✅"라 하지만, 2026-05-26
> 실제 `eas env:list`엔 AdMob Secret이 없었고 사용자는 "빌드 막혀 미뤘다"고 함 — 셋이 불일치).
> 따라서 아래는 **(A) CLI로 직접 검증된 사실 / (B) 사용자 구두 확인 / (C) 상충·미확정**으로
> 구분한다. C 항목은 반드시 직접 확인 후 진행할 것.

관련 상세 문서:
- `handoff-monetization-setup.md` — GCP/Vertex·AdMob·Play 구독 등록 상세 절차
- `handoff-play-console-setup.md` — Play Console 앱 등록·트랙·OAuth SHA-1
- `handoff-subscription-testing.md` — 결제 테스트 전략 + ④ 결제 E2E 체크리스트
- `handoff-v1.1-progress.md` — v1.1 구현 상세 (구버전 진행 기록, 상태는 본 문서가 우선)
- `handoff-play-release.md` — v1.0 출시 기록 (구버전, 환경/계정 메모만 유효)

---

## 1. 현재 상태

### ✅ (A) CLI로 검증된 사실 (2026-05-26)
| 항목 | 검증 |
|---|---|
| v1.1 코드 (구독·결제·quota·광고) | 레포 |
| 구독 시스템 테스트 101케이스 (①②③) | Jest + 원격 pgTAP 통과, main 머지 (PR #2/#3/#4) |
| verify-purchase Edge **배포 v3** | `supabase functions list` (ACTIVE) |
| Edge Secret: `PLAY_SA_CLIENT_EMAIL`·`PLAY_SA_PRIVATE_KEY`·`ANDROID_PACKAGE_NAME`·`VERTEX_*` | `supabase secrets list` |
| EAS Secret: `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY`·`GOOGLE_CLIENT_ID`·`GOOGLE_SERVICES_JSON` | `eas secret:list` |
| EAS Secret: `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`/`BANNER_ID`/`REWARDED_ID` | **테스트 ID 임시 등록**(2026-05-26) — 빌드 가드 통과용, 실 ID 아님 |
| 코드 SKU 정합성 (`pro_monthly`/`pro_yearly`, 단일 출처) | `lib/billing/skus.ts` 점검 |
| 최근 production 빌드 | versionCode 4 (2026-05-21) |

### 🟡 (B) 사용자 구두 확인 (2026-05-26)
| 항목 | 비고 |
|---|---|
| Play Console **구독 상품 등록·활성화** (`pro_monthly`/`pro_yearly` + 7일 체험) | Product ID 정확성은 미검증 — §3 주의 참조 |
| Play Console **정책 폼** (광고·데이터보안·콘텐츠등급) | — |
| Supabase 마이그레이션 remote 적용 / OAuth SHA-1 등록 | 자동 메모(2026-05-25 검증 기록) |

### ❓ (C) 상충·미확정 — **직접 확인 필요**
| 항목 | 왜 미확정 |
|---|---|
| **AdMob 광고 단위 실제 발급 여부** | 문서 "발급 완료" vs EAS Secret 없음 vs 사용자 "미뤘다" — 셋 불일치. AdMob 콘솔에서 직접 확인 필요(§확인법) |
| **라이선스 테스터 등록** | 결제 E2E(가짜결제) 필수인데 상태 불명 |
| **비공개 테스트 테스터 20명 모집** | 신규 개인계정 출시 게이트(14일). 진행 상황 불명 |

---

## 2. 6/1 이후 실행 순서

EAS 무료 빌드 한도가 6/1 리셋(사용자 결정). 그 이후:

```
1. production AAB 빌드
   $env:EAS_SKIP_AUTO_FINGERPRINT=1
   eas build --profile production --platform android --non-interactive
   (재빌드 시에도 EAS_SKIP_AUTO_FINGERPRINT 필요 — handoff-play-release.md 참조)

2. 내부 테스트 트랙에 AAB 업로드  (eas submit -p android --latest 또는 수동)

3. 라이선스 테스터 등록 확인 + 결제 E2E 실행
   → handoff-subscription-testing.md ④ 체크리스트

4. (앱이 Play에 올라갔으니) AdMob 정식 발급 → 광고 단위 ID 3개 확보
   → 활성화 ~24h

5. 실 AdMob ID로 EAS Secret 교체
   eas secret:create --scope project --force --name EXPO_PUBLIC_ADMOB_ANDROID_APP_ID --value <실ID> --type string
   (BANNER_ID / REWARDED_ID 동일)

6. 비공개 테스트 14일 시계 (테스터 20명 유지) — 빌드 갱신은 시계 리셋 안 함

7. 실 ID로 재빌드 → 프로덕션 트랙 승격 → 심사
```

> 진짜 병목은 **테스터 20명·14일**(신규 개인계정 의무). 빌드보다 이게 일정을 좌우하므로 테스터 모집을 6/1 전부터 진행.

---

## 3. 결제 관련 주의 (점검 완료 사항)

**SKU / Product ID** — 코드가 매칭하는 건 **Product ID뿐**:
- Product ID = **`pro_monthly` / `pro_yearly`** 정확히 (Play Console 등록값과 일치해야)
- Base Plan ID는 `offerToken`으로 자동 처리 → 코드 무관, 아무 이름 OK
- Product ID 자리에 base plan/변형 ID를 넣으면 결제는 되나 **verify에서 402 product_mismatch로 강등**
- 가격은 코드 하드코딩 없음 — Play Console 설정값을 `priceFor()`로 표시

→ 구독 상품을 이미 등록했다면, Play Console에서 **Product ID가 정확히 `pro_monthly`/`pro_yearly`인지** 눈으로 확인. (첫 결제 E2E에서 402 안 나면 최종 확정)

**AdMob 테스트 ID는 임시** — 정식 출시(프로덕션 트랙) 전 반드시 실 ID로 교체. 테스트 ID로 출시 시 수익 0 + AdMob 정책 위반.

---

## AdMob 광고 단위 발급 여부 확인법

[admob.google.com](https://admob.google.com) → 앱(Apps):
- 앱 목록에 `아보카도`/`com.soksokvoca` **없으면** → 미발급
- 있으면 → 광고 단위(Ad units)에서 배너·보상형 단위 확인
- **ID 앞부분으로 테스트/실 구분**: `ca-app-pub-`**`3940256099942544`**`...` = Google 테스트 ID(현재 등록된 것) / **다른 숫자** = 본인 실 ID(정식 발급됨)

실 ID가 있으면 알려주면 EAS Secret을 `--force`로 교체. 없으면 §2의 4단계에서 발급.

---

## 환경 / 계정 메모

| 항목 | 값 |
|---|---|
| Expo/EAS 프로젝트 | `@baekeunjoeng/soksok-voca` |
| Expo projectId | `2d560de2-a41b-4ac1-a019-d287f7aaa2d6` |
| Play 패키지명 | `com.soksokvoca` (변경 금지) |
| Firebase/GCP 프로젝트 | `avocado-491710` |
| Supabase 프로젝트 (프로덕션) | `ithqbclnwvyeultkyxbn` (Avocado) |
| Supabase URL | `https://ithqbclnwvyeultkyxbn.supabase.co` |
| 개인정보 처리방침 | https://eunjbaek12.github.io/NewSokSok/privacy-policy.html |
| 앱 버전 | 1.1.0 (versionCode는 EAS 원격 관리, 최근 4) |
| Play Developer 계정 | 가입 완료. **신규 개인계정 → 비공개 테스트 20명·14일 의무** |

---

## 알려진 이슈

- **fingerprint 우회**: 재빌드 시 `EAS_SKIP_AUTO_FINGERPRINT=1` 필요 (`@expo/fingerprint`의 brace-expansion 해소 버그). 근본 해결은 pnpm overrides `brace-expansion: "^4.0.0"`, 출시 후로 미뤄도 무방.
- **OneDrive 간섭**: 로컬 빌드/`expo prebuild`/`pnpm add` 실패 → EAS 클라우드 빌드 사용. DB 테스트도 로컬 Docker 대신 클라우드(`scripts/run-db-tests.mjs`).
- **EAS 빌드 시 정보성 경고**(정상): SECRET 가시성으로 env 목록 안 보임, `googleServicesFile not checked in`, versionCode 자동 증가.
