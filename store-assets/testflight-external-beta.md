# TestFlight 외부 테스트 — 베타 심사 제출 원고 (빌드 43 · v1.7.0)

**목적은 테스터 모집이 아니다.** 피처링 지명 §9 의 Supplemental URL ② 「TestFlight 공개
링크」를 만드는 것 하나뿐이다. 라이브 1.6.2 에는 §2 헤드라인 넷이 **하나도 없어서**
(접근성·스와이프는 빌드보다 뒤, 완주·스킨 3종은 플래그 뒤) 에디터가 스토어 링크로 받아도
재현이 안 된다. 이 링크가 그 구멍을 메운다.

- 대상 빌드: **1.7.0 (43)** — EAS `08e79027` · 커밋 `837e8c0` · 2026-09-08 23:38 빌드 완료
- 시계가 도는 유일한 일 = **베타 앱 심사 ~1일**. 9/10 지명 제출보다 먼저 걸어야 링크가 붙는다
- 심사가 안 끝나면 **링크 없이 그냥 제출한다** — 마감이 링크보다 우선이고 지명은 반복 제출이 된다

## ✅ 끝났다 — 2026-09-10

**베타 앱 심사 통과 · 공개 링크 = `https://testflight.apple.com/join/1ahqx7RT`**
(모두에게 공개 · 기기 필터 없음 · 테스터 상한 100명 · 답변지 §9 Supplemental ② 에 반영 완료)

🔴 **승인만으로는 링크가 생기지 않는다** — 「공개 링크」는 그룹 설정의 **별도 토글**이고,
켤 때 「모두에게 공개 / 기준별 필터링」과 인원 상한을 묻는다. **필터는 걸지 않았다**:
에디터가 어떤 기기로 열지 우리가 모르는데, 필터는 링크가 **조용히 거부되는** 경로만
만든다. 반대로 인원 상한은 유출 시 피해를 멈추는 값이라 100 으로 뒀다 — 이 링크의 유일한
실질 위험은 「10/1 의 새것이 미리 소진되는 것」이지 테스터 부족이 아니다.

이 문서의 아래 절차는 **이미 다 밟았다.** 다음에 다시 열 자리는 하나뿐이다 —
**빌드 43 이 12/7 경 만료**될 때 새 빌드를 같은 그룹에 올리는 것(링크 URL 은 그대로 산다).

## ⚠️ 먼저 읽을 것

- **TestFlight 탭 안에서만 움직인다.** 빌드 43 을 App Store 심사(배포)에 넣으면 안 된다 —
  플래그를 켜고 구운 프리뷰다.
- **공개 링크는 말 그대로 공개다.** 가진 사람이 스스로 설치한다. 10/1 전에 커뮤니티에
  뿌리면 그날의 「새것」이 미리 소진된다 → **에디터에게만.**
- 빌드는 업로드 후 **90일에 만료**된다(빌드 43 → 12/7 경). 지명 회신이 그보다 늦으면 새 빌드로 갈아야 한다.
- 수출 규정 응답은 안 물어본다 — `ITSAppUsesNonExemptEncryption: false` 가 이미 Info.plist 에 있다.
- 테스터 섭외 불필요 · 데모 계정 불필요(게스트 모드).

## 순서

앱 수준 「테스트 정보」가 **비어 있으면 심사 제출 버튼이 안 열린다.** 그래서 1 → 2 → 3 순서다.

```
1. ✅ ASC → 앱 → TestFlight 탭 → 좌측 「테스트 정보(Test Information)」   (2026-09-09 저장 완료)
      → 아래 §1 을 채운다 (베타 앱 설명 · 피드백 이메일 · URL 2개 · 심사 연락처)
2. 좌측 「테스터 및 그룹」 → ＋ → 새 그룹 → 이름 `Public Beta`
      → 그룹 설정에서 「공개 링크 사용(Enable Public Link)」 켜기
3. 그룹 안 「빌드」 → ＋ → 1.7.0 (43) 추가
      → 「테스트할 내용(What to Test)」에 §3 을 붙여넣고 → 베타 앱 심사 제출
4. (통과 후) 그룹의 공개 링크 URL 복사 → 답변지 §9 Supplemental ② 에 넣는다
```

---

## §1 · 앱 수준 테스트 정보 (Test Information)

| 칸 | 값 |
|---|---|
| 피드백 이메일 | `mtgirltreeguy@gmail.com` |
| 마케팅 URL | `https://eunjbaek12.github.io/NewSokSok/` |
| 개인정보처리방침 URL | `https://eunjbaek12.github.io/NewSokSok/privacy-policy` |
| 로그인 필요 (Sign-in required) | **체크 해제** — 게스트 진입이 있어 데모 계정이 필요 없다 |
| 심사 연락처 | 김호성 · `+82` 국제 형식 전화 · `mtgirltreeguy@gmail.com` |
| 초대 경험 「승인된 스크린샷 및 카테고리 표시」 | **켠다** |
| 사용권 계약 | 애플 표준 EULA 그대로 |

> **초대 경험을 켜는 이유**: 공개 링크가 에디터가 착지하는 페이지다. 켜면 스크린샷과
> 카테고리(교육·참고)가 같이 서고, 끄면 글자만 남는다. ⚠️ 스크린샷은 「배포 준비됨」인
> **마지막 버전에서 자동으로** 가져오므로 지금은 1.6.2 것이고 **새 스킨 3종이 안 보인다** —
> 그 구멍은 아래 §3 「테스트할 내용」이 메운다. 10/1 에 1.7.0 스크린샷이 올라가면 자동 교체된다.

### 베타 앱 설명 (Beta App Description) — 테스터/에디터가 설치 페이지에서 본다

🔴 **이 칸은 빌드가 아니라 «앱» 단위다.** 빌드 44 가 올라가도 그대로 남으므로 「이 빌드는
1.7.0 프리뷰」같은 문장을 여기 쓰면 안 된다 — 그건 §3 이 맡는다. 대신 **언어쌍 30개**를
넣었다. 애플 7기준의 로컬라이제이션이 초대 페이지에서 바로 읽히는 자리다.

```
Avocado is a vocabulary app for people who build their own word list instead of
memorizing someone else's. Type a word, paste a list, or photograph a page — AI fills
in the meaning, an example sentence and the pronunciation. Study it with flashcards,
quizzes, example sentences, or hands-free autoplay.

Korean, English, Japanese, Chinese, Vietnamese and Spanish combine in any direction,
so the app works the same whether you are a Korean learning English or an American
learning Korean. Everything works offline; you only sign in if you want the same words
on a second device.

No account is needed — tap "Get Started" on the first screen.
```

### 베타 앱 심사 참고사항 (Notes / App Review Information)

```
No account is needed — tap "Get Started" on the first screen to use the app as a guest.

The AI features (auto-fill, photo scan, AI word generation) run on a free daily quota;
signing in with Google or Apple raises it. Settings › Advanced also accepts your own
Gemini API key, which removes the limit entirely.
```

> ℹ️ **로케일**: ASC 는 앱의 기본 언어로 하나만 받아도 통과한다. 제출 ①(한국 스토어프론트)
> 에디터를 생각하면 한국어 판을 하나 더 넣어도 되지만, 공개 링크 페이지는 **에디터의 기기
> 언어**를 따르므로 영어만으로도 손해가 없다. → **영어만 넣는다.**

---

## §3 · 빌드 43 「테스트할 내용(What to Test)」 ★에디터가 읽는 자리

### B안 — 권장 (넷을 짚어 준다)

```
A preview of the 1.7.0 update, releasing October 1. No account needed — tap "Get Started".

• Seasonal themes — Settings › Display › Theme now carries Autumn, Hangul and Halloween
  next to the five existing ones. The whole app changes with it: background, palette,
  and what the avocado is wearing.
• Completion certificate — finish a study plan and the app hands you a certificate
  you can share. A five-word list finishes in one sitting.
• VoiceOver — every icon-only button is labelled; there are 109 of them.
• Swipe back from any screen.
```

### A안 — 한 줄

```
A preview of the 1.7.0 update, releasing October 1: three seasonal themes, a shareable
completion certificate, full VoiceOver labelling, and swipe-back from any screen.
```

**B안을 권한다.** 이 칸은 테스터 안내가 아니라 **에디터가 무엇을 켜 볼지 정하는 자리**다.
스킨과 VoiceOver 는 켜자마자 보이지만, 완주 상장은 **계획을 끝까지 마쳐야** 나오므로
(`getPendingCompletion` 은 계획 인스턴스 단위) 길을 안 적으면 에디터가 못 본다 —
그래서 「다섯 단어짜리는 한 번에 끝난다」한 줄이 B안의 핵심이다.

🔴 **경로 문구는 앱에서 확인한 값이다** — 게스트 진입은 `Get Started`(`login.guestStart`),
스킨 자리는 설정의 **디스플레이** 섹션 안 `Theme / Skin` 줄. 임의로 고쳐 적지 말 것.

---

## 통과 뒤

1. 공개 링크(`https://testflight.apple.com/join/XXXXXXXX`)를 답변지 §9 Supplemental ②에.
2. 그 김에 §9 ①의 괄호도 본다 — 지금은 「9/4 배포된 1.6.2가 라이브」다. 1.6.3 이 나가면 갱신.
3. 링크를 **어디에도 더 뿌리지 않는다.**
