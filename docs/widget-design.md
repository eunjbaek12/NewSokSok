# 위젯 설계 — 타당성 검토와 결정

> 🔬 **2026-09-03 spike 결과 — 이 문서의 전제 두 개가 틀렸다. 아래 §-1 을 먼저 읽을 것.**
> 요약: **Android 먼저**로 방향을 바꿨고, iOS 는 1 월로 미뤘다.

---

## §-1. spike 결과 (2026-09-03) — 실제로 돌려 보고 알아낸 것

10/1 피처링 모멘트에 위젯을 넣을 수 있는지 이틀 예산으로 재 봤다. 판단 기준은 하나였다:
**"Hello World 위젯이 실기 홈 화면에 뜨는가."** 거기까진 못 갔지만, **그 전에 갈림길이
드러나** 반나절에 결론이 났다.

방법: 본 저장소를 건드리지 않으려고 **OneDrive 밖에 클론**을 떠서 실험했다
(`C:\Users\kimos\dev\soksok-widget-spike`, bundle id `com.soksokvoca.spike`).

### 🔴 틀린 전제 ① — "OneDrive 때문에 prebuild 가 안 된다"

**iOS 는 OneDrive 와 무관하게 Windows 에서 원천 불가다.**

```
$ npx expo prebuild -p ios --no-install --clean
⚠️ Skipping generating the iOS native project files.
   Run npx expo prebuild again from macOS or Linux to generate the iOS project.
```

OneDrive 밖에서도 똑같이 건너뛴다. 이게 §2 가 말한 "여백 하나에 EAS 빌드 30분"보다
나쁜 이유는 — **Xcode 프로젝트가 어떻게 생성되는지 로컬에서 볼 수조차 없다.** 검증 수단이
0 이고 오류는 EAS 빌드 로그로만 진단해야 한다.

**반면 Android 는 Windows 에서 성공한다.**

```
$ npx expo prebuild -p android --no-install --clean
✔ Finished prebuild            # android/app/src/main 생성 확인
```

처음엔 실패했는데 원인이 플랫폼이 아니라 **`google-services.json` 이 없어서**였다
(gitignore 라 클론에 안 따라온다). 원본에서 복사하니 통과했다.
🔑 환경도 이미 갖춰져 있다 — Android SDK(`%LOCALAPPDATA%\Android\Sdk`) · JDK 17 · `gradlew`.
**Android Studio 실시간 프리뷰로 개발할 수 있다.**

### 🔴 틀린 전제 ② — "iOS 위젯은 100% SwiftUI, RN 재사용 0%"

**Expo 가 공식 `expo-widgets` SDK 를 냈다**(iOS 전용). SwiftUI 를 손으로 짜지 않고
**TSX 로 위젯을 쓴다**(`@expo/ui/swift-ui` 컴포넌트). `addUserInteractionListener` 로
버튼 탭도 되므로 **W1(인터랙티브 위젯)이 지원된다.**

→ **"Mac 확보가 전제"라는 이 문서의 판단은 이제 낡았을 수 있다.** 막는 것은 언어가 아니라
검증(prebuild 불가)이다. 1 월 iOS 이식은 SwiftUI 학습도 Mac 대여도 없이 될 가능성이 있다.

### `@bacons/apple-targets` 를 쓸 때의 함정 (iOS 를 다시 시도할 때 볼 것)

- 버전 5.0.0. 플러그인이 프로비저닝에 필요한
  `extra.eas.build.experimental.ios.appExtensions` 를 **자동으로 채우는데, 그게 prebuild
  단계(`withXcodeProjectBeta`)에서 돈다.** EAS 는 빌드를 **시작하기 전에** 인증서를
  준비하므로 그 시점엔 비어 있다 → 널리 보고된 "확장 프로파일 자동 생성 실패"가 이것이다.
  **수동으로 선언해야 한다.**
- `ios.appleTeamId` 가 없으면 경고와 함께 "iOS builds may fail" 이 뜬다.
  **저장소 어디에도 Team ID 가 없다** — 은정님만 알 수 있다.
- App Group 은 spike 에서 일부러 뺐다. 데이터 공유는 다음 문제이고, Apple Developer 에
  그룹을 따로 등록해야 할 수 있어 실패 지점만 늘린다.

### ✅ 결정 (2026-09-03)

| | |
|---|---|
| **10/1 피처링 §5 의 WidgetKit** | ❌ **체크하지 않는다.** 로컬 검증 0 인 채로 4 주에 완성하는 건 도박이고, 못 나가면 없는 기능을 주장한 게 된다 |
| **Android 위젯** | ✅ **먼저 만든다.** Windows 에서 실시간 개발 가능 · 주력 사용자층 · Play 지명(10/29 만료)에 실을 수 있다 |
| **iOS 위젯** | ⏭️ **1 월 모멘트.** Android 에서 §6 데이터 질문 6 개를 풀어 두면 화면만 옮기면 된다 |
| 도구 후보 | Android = `react-native-android-widget`(Expo config plugin · JSX · `WIDGET_CLICK`) · iOS = `expo-widgets` |

⚠️ **`android/` 는 커밋하지 않는다.** prebuild 로 언제든 재생성되고, 여러 세션이 공유하는
트리를 bare workflow 로 바꾸는 건 되돌리기 어렵다. 위젯 소스와 매니페스트 변경은
**config plugin 으로** 저장소에 남긴다.

---

> 📌 **상태 (2026-07-22): 화면 확정. 데이터 설계 남음. 구현 금지.**
> ⚠️ 아래는 spike 이전 기록이다. §-1 과 어긋나는 곳은 §-1 이 최신이다.
> 은정님 지시 — **목업이 완성되기 전까지 코드를 쓰지 않는다.** 이유는 §2에 있다(Mac이
> 없어 시행착오 비용이 비정상적으로 비싸므로, 화면을 먼저 확정하고 한 번에 옮겨야 한다).
> 화면은 확정됐으나 **§6 데이터 질문 6개가 미해결**이라 아직 구현 단계가 아니다.
>
> 🎨 **목업(설계도) = https://claude.ai/code/artifact/c111d905-4557-4647-aef8-5ead8443d7fc**
> 실물 크기·실제 클릭 가능·앱 토큰 색. **여기 없는 것은 구현하지 않는다.**

## 0. 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 위젯 | ✅ **한다** | 홈 화면 상시 노출 → 리텐션. 피처링 훅 |
| **Apple Watch 앱** | ❌ **하지 않는다** | §5 — 도달 범위 극소 + Mac 없음 + RN 재사용 0% |
| Watch 오토플레이 | ❌ **하지 않는다** | §5 — watchOS 백그라운드 제약 + 유즈케이스가 폰과 겹침 |
| 개발 환경 | ⚠️ **Mac 없음 (Windows 10)** | 모든 판단의 전제. §2 |

### 0.1 화면 결정 (2026-07-22 확정)

| # | 결정 | 근거 |
|---|---|---|
| **W1** | 종류 = **인터랙티브 위젯**(위젯 안에서 판정 처리) | Watch 카드학습의 90%를 훨씬 싸게 대체. 도달 범위가 비교 불가 |
| **W2** | 내용 = **복습 우선, 없으면 미암기 단어**, 그것도 없으면 앱 열기 | 복습 전용이면 **신규 사용자에게 영구 빈 화면**. §4.1 |
| **W3** | 미암기 출처 = **마지막으로 공부한 단어장**(`lastStudiedAt`) | 인덱스가 이미 있음(001_init) · **언어 섞임 방지**(6개 언어·30개 언어쌍) |
| **W4** | 구분 표시 = **칩**(복습 `#488325` / 새 단어 `#2A7B78`) | 앱의 복습 배너·맞춤학습 카드 색 그대로 — 새로 배울 것이 없음 |
| **W5** | 뜻은 **가렸다가 탭하면 공개** 후 판정 | 인출 연습이 실제로 일어나야 복습 기록이 정직해짐 |
| **W6** | 버튼 문구가 모드별로 다름 — 복습 `다시`/`외웠어요`, 새 단어 `아직`/`외웠어요` | "다시"는 암기 해제, "아직"은 상태 불변. **결과가 다르므로 같은 글씨를 쓰면 안 됨** |
| **W7** | 위젯 설정(복습만/새 단어만/단어장 고르기)은 **2차** | 나중에 얹어도 기존 위젯이 안 깨짐. Mac 없는 상황에서 1차 범위를 줄임 |
| — | 가로형(Medium) 제작 여부 | **미정.** 만들면 탭 2번이 1번이 되지만 검증할 화면이 두 배 |

### 0.2 ⚠️ W2는 `gentle-srs-design.md` D7b와 긴장 관계다

D7b는 **"due = 0이면 아무것도 안 보임(대체 카드 없음) — 빈 자리를 빈 카드로 채우는 건 모순"** 이고,
D2는 **"미암기는 맞춤/오답/별표가 담당"** 이다. W2의 폴백은 그 원칙을 위젯에서만 예외로 둔 것이다.

**예외를 둔 이유 — 배너와 위젯은 사라질 수 있느냐가 다르다:**

| | 홈 배너 | 홈 화면 위젯 |
|---|---|---|
| 보여줄 게 없을 때 | 사라짐. 자리도 없어짐 | **자리를 차지한 채 빈 얼굴로 남음** |
| 다른 진입점 | 화면에 단어장·맞춤학습이 함께 있음 | 없음. 위젯이 전부 |
| 비었을 때 대가 | 없음 | **죽은 픽셀 → 삭제 대상** |

즉 D7b의 근거("빈 자리를 억지로 채우지 않는다")는 **사라질 수 있는 UI에서만 성립**한다.
사용자 대부분이 신규인 현재, 복습 전용 위젯은 "외운 단어가 생긴 뒤에나 쓸 수 있는 물건"이 된다.

> 🔜 **`gentle-srs-design.md`에 D17로 옮겨 적을 것.** D7b 바로 아래 놓여야 나중에
> "왜 위젯만 규칙이 다르지?"가 설명된다. (이 문서 단독으로는 SRS 설계 SoT를 갱신하지 않는다.)

---

## 1. 위젯은 무엇으로 만드는가

**React Native 코드는 한 줄도 재사용되지 않는다.** 위젯은 100% 네이티브다.

| | iOS | Android |
|---|---|---|
| 프레임워크 | **SwiftUI / WidgetKit** | **Kotlin / Jetpack Glance** |
| Expo 연결 | `@bacons/apple-targets` (config plugin) | config plugin 직접 작성 또는 `expo-widgets` 계열 |
| 개발 도구 | **Xcode 16 + macOS 15** 🔴 | **Android Studio (Windows 가능)** 🟢 |
| 데이터 전달 | App Group + `UserDefaults` | `SharedPreferences` / DataStore |
| 공유 코드 | — | **0%. 서로 완전 별개 작업** |

### iOS 상세

- `npx create-target widget` → 루트 `targets/` 에 SwiftUI 파일 생성, `/ios` 밖에 보존(CNG).
- 요구 SDK: Expo **53+** → 우리는 `~54.0.34` ✅
- RN → 위젯 데이터 쓰기: `ExtensionStorage`, SwiftUI 쪽에서 `UserDefaults(suiteName:)` 읽기.
- ⚠️ `app.json`에 **App Group entitlement가 아직 없다.** Apple Developer 포털 등록 + entitlement 추가가 선행 작업.

---

## 2. 🔴 최대 리스크 — Mac이 없다

이것이 기술적 난이도보다 큰 문제다. 위젯은 **레이아웃이 전부인 작업**인데, Mac이 없으면
그 레이아웃을 **눈으로 보면서 고칠 수 없다.**

```
Mac 있을 때:  SwiftUI 프리뷰로 1초 만에 확인 → 즉시 수정
Mac 없을 때:  코드를 감으로 작성 → EAS 빌드 20~40분 → 실기 설치 → 어긋남 → 다시 20~40분
```

한 번의 여백 조정에 30분이 든다. 이 레포에는 이미 **"실기 미검증 상태로 main에 들어간"**
전례가 여러 건 있고(달력 원형, Android 음성입력), 위젯은 그 실패 양식이 가장 잘 일어나는 종류다.

### 완화책 (효과 순)

1. **목업을 픽셀 단위로 먼저 확정한다** ← 지금 채택한 방침.
   글자 크기·여백·줄 수·잘림 규칙까지 정해 두고 SwiftUI로 **번역만** 한다.
2. **디자인을 의도적으로 단순하게.** 텍스트 2줄 + 배경 + 아이콘 하나 수준으로 묶으면
   어긋날 여지 자체가 작아진다. 그라데이션·커스텀 도형·정밀 정렬은 Mac 없이는 비싸다.
3. **클라우드 Mac 대여**(MacinCloud, Scaleway Mac mini, AWS EC2 Mac). 시간당~월정액.
   위젯 마무리 단계에 **며칠만** 빌리는 것이 현실적. 상시 구독은 불필요.
4. **Android 위젯을 먼저 한다** — 아래 §3.

---

## 3. 💡 Mac이 없다면 Android 위젯이 먼저다

Mac 부재를 전제하면 우선순위가 뒤집힌다:

- **Android Studio는 Windows에서 완전히 동작한다.** 실시간 프리뷰·에뮬레이터·디버거 전부 사용 가능
  → iOS에서 30분 걸리는 반복이 **몇 초**로 줄어든다.
- **주력 사용자층이 Android다** (Play 설치가 대부분).
- 즉 *더 쉽고 · 더 많은 사용자에게 닿는다.*

**⚠️ 단 선결 과제:** 로컬 네이티브 빌드가 필요한데, `expo prebuild`가 **OneDrive 경로에서
`fs.cpSync` 실패**한다(기존에 확인된 이슈 — 그래서 로컬 빌드를 포기하고 EAS를 쓰고 있다).
Android 위젯을 하려면 **레포를 OneDrive 밖으로 옮기는 것**이 사실상 전제 조건이다.
이건 위젯과 무관하게 언젠가 해야 할 일이기도 하다.

**iOS를 포기한다는 뜻은 아니다.** 피처링은 App Store 전용이고 애플이 WidgetKit을 적극
큐레이션하므로, iOS 위젯의 마케팅 가치는 Android보다 크다. 순서의 문제일 뿐이다.

---

## 4. 확정안 — 인터랙티브 학습 위젯

**모든 화면은 목업이 정본이다** → https://claude.ai/code/artifact/c111d905-4557-4647-aef8-5ead8443d7fc
(치수·글자 크기·굵기·여백까지 표로 명세돼 있다. 아래는 로직만 요약.)

### 4.1 무엇을 보여주는가 (W2)

```
① 복습할 단어(due)가 있으면   → 복습     [다시] [외웠어요]
② 없으면 미암기 단어           → 새 단어  [아직] [외웠어요]
③ 단어장 자체가 비었으면       → 앱 열기
④ ①②가 모두 소진되면          → "오늘 끝!" (유일하게 보상으로 그린 화면)
```

②에서 "외웠어요"를 누르면 `isMemorized`가 켜지고 SRS 사다리에 올라타므로,
**위젯만 써도 학습이 시작되고 자연히 ①로 넘어간다.** 이것이 폴백을 둔 실질적 이유다.

### 4.2 왜 복습이 중심인가 (오답·별표가 아니라)

`isStarred`(003) · `wrongCount`(007)도 있지만 위젯 콘텐츠로는 복습이 낫다:

| 기준 | 복습 | 오답 | 별표 |
|---|---|---|---|
| 가만 둬도 매일 채워지나 | ✅ 시간이 지나면 자동 due | ❌ **앱에서 퀴즈를 풀어야 생김** | ❌ 사용자가 눌러야 생김 |
| 고갈되지 않나 | ✅ 3→10→30→90→365일 순환 | ❌ 다 맞히면 0 | ❌ 다 보면 0 |
| 탭 결과를 되먹일 곳이 있나 | ✅ `lastReviewedAt`·`reviewSuccessCount` | ⚠️ `wrongCount`를 깎으면 **퀴즈 통계 오염** | ❌ 없음(별표를 뗄 근거가 없음) |

특히 **오답 위젯은 순환 모순**이다 — 위젯의 존재 이유가 "앱을 안 열어도 학습이 굴러가게"인데,
오답은 앱에서 퀴즈를 풀어야 생긴다.

**대신 오답·별표는 §4.1 ②의 선택 가중치로 쓴다** — 미암기 단어를 고를 때 `wrongCount`가 높은 것,
그다음 `isStarred` 우선. 세 축이 다 쓰이면서 위젯은 하나로 유지된다. (구체 순서는 §6 미해결.)

### 4.3 나중 후보 (1차 범위 밖)

- **잠금화면 / 컨트롤 센터 위젯** — `accessoryCircular`·`accessoryRectangular`·`accessoryInline`,
  iOS 18 컨트롤 센터까지 같은 플러그인이 지원한다. 홈 위젯과 **같은 타겟에 얹으므로 한계비용이 낮다.**
- **스트릭 위젯** — `StatsStrip` 데이터 재사용 가능. 다만 동기 부여 외의 기능이 없다.

---

## 5. Apple Watch를 하지 않는 이유 (기록용)

기술적으로는 **가능하다** — `@bacons/apple-targets`가 watch 타겟을 지원한다. 그럼에도 배제한다.

- **오토플레이가 watchOS와 충돌한다.** 백그라운드 모드는 4가지만 허용된다
  (`BGAppRefreshTask` / `HKWorkoutSession` / `WKExtendedRuntimeSession` / `URLSession`).
  손목을 내리면 앱이 멈추고, `WKExtendedRuntimeSession`은 앱이 활성일 때만 시작할 수 있으며
  시간 상한이 있다. 애플이 이렇게 조인 이유가 배터리·발열이라 우회로가 없다.
- **유즈케이스가 폰과 겹친다.** 오토플레이를 들으려면 이어폰이 필요하고, 이어폰을 꼈다면
  아이폰도 주머니에 있다. 시계의 존재 이유("폰을 안 꺼냄")가 성립하지 않는다.
- **카드학습은 watchOS에 잘 맞지만**(짧은 인터랙션·크라운·큰 탭 타겟), 도달 가능한 사용자가
  현재 사실상 한 자릿수다. 그리고 §4-D 인터랙티브 위젯이 같은 가치를 훨씬 싸게 준다.
- **비용이 크다.** 순수 Swift/SwiftUI + WatchConnectivity 계층 + Mac 부재.
  ⚠️ 참고: 플러그인 문서는 App Group을 안내하지만 **watchOS 2 이후 시계와 폰은 별도 기기라
  App Group 컨테이너가 공유되지 않는다.** `WCSession`이 정석이며 층이 하나 더 늘어난다.
  또한 이 구성의 워치 앱은 페어링된 iOS 앱 없이 단독 실행되지 않는다.

**되살릴 조건:** 사용자 규모가 자리잡고 + Mac이 확보되고 + 인터랙티브 위젯이 이미 성공한 뒤.
그때의 형태도 "오토플레이 전체"가 아니라 **"시계는 리모컨"**(재생/일시정지/다음만 조작하고
소리는 아이폰이 냄)이 안정적이다.

---

## 6. 데이터 계층 — 새로 만들어야 하는 것

단어는 **SQLite**에 있고 위젯은 SQLite에 접근하지 않는다. 그래서 "위젯에 보여줄 것만"
App Group에 내보내는 **동기화 계층**이 필요하다.

```
SQLite (words.isMemorized, memorized_log, SRS 스케줄)
  └→ [신설] 위젯 스냅샷 추출  ─→ App Group / UserDefaults (JSON, 수 KB)
                                    └→ WidgetKit(Swift) 읽기
```

위젯이 **쓰기**까지 하므로(W1) 데이터 흐름이 단방향이 아니라 양방향이다. 이게 남은 난제 전부다.

**🔴 미해결 — 이걸 답해야 구현에 들어간다:**

1. **쓰기 경로.** 위젯이 App Group에 기록해 두고 앱이 다음 실행에 흡수할지, App Intent가 앱
   프로세스를 깨워 SQLite에 직접 쓸지. **동기화 엔진의 dirty-set과 충돌하지 않아야 한다.**
   (위젯이 쓴 변경이 dirty로 잡히지 않으면 클라우드에 안 올라가고, 이중으로 잡히면 충돌한다.)
2. **갱신 시점.** WidgetKit은 타임라인 기반이라 즉시 갱신이 보장되지 않는다.
   `WidgetCenter.reloadTimelines` 호출 지점 — 학습 종료 시? 앱 백그라운드 진입 시? 자정?
3. **미리 담아둘 개수.** 위젯은 네트워크를 못 쓰므로 App Group에 미리 넣어둔 단어만 처리한다.
   5개? 20개? 소진되면 "앱에서 계속하기"로 유도할지.
4. **미암기 선택 순서.** `lastStudiedAt` 단어장 안에서 — 순서대로? `wrongCount` 높은 순?
   `isStarred` 우선? (§4.2에서 오답·별표를 여기 쓰기로 했으나 구체 규칙은 미정)
5. **로그아웃 / 게스트** — 위젯에 남은 단어를 지울 것인가.
6. **테마와 언어** — 앱 스킨(Y2K·다크 고요·실험실)을 따라갈지 고정 팔레트로 갈지.
   따라가려면 스킨 값도 App Group으로 넘겨야 한다. 위젯 문자열은 ko/en.

---

## 7. 다음 단계

1. ~~목업 확정~~ ✅ **완료 (2026-07-22)** — 화면·문구·치수 전부 확정. 링크는 문서 최상단.
2. **데이터 계층 설계** ← 지금 여기. §6의 6개에 답하기. 특히 1번(쓰기 경로)이 가장 무겁다.
3. `gentle-srs-design.md`에 **D17** 추가 (§0.2 — W2가 D7b의 위젯 예외임을 기록)
4. App Group entitlement 등록 (Apple Developer 포털) + `app.json` 반영
5. 플랫폼 선택 (§3 — Mac이 없으므로 Android 우선 검토. 단 OneDrive 밖 이전이 전제)
6. 구현 — **§6이 안 끝났으면 시작하지 않는다**

### 위젯과 무관하게 먼저 할 수 있는 값싼 대안

**알림 액션** — 복습 알림을 길게 눌렀을 때 나오는 `[알아요] [나중에]` 버튼.
`expo-notifications`의 notification categories로 **네이티브 코드 없이** 된다. Gentle SRS
알림이 이미 있으므로 얹기만 하면 되고, **Mac이 필요 없다.** 위젯의 핵심 가치(마찰 감소)를
일부 선취할 수 있는 가장 저렴한 수단.

---

## 참고

- [Watch Apps — Expo Apple Targets](https://mintlify.wiki/EvanBacon/expo-apple-targets/guides/watch-apps)
- [expo-apple-targets — GitHub](https://github.com/EvanBacon/expo-apple-targets)
- [Enabling Background Sessions — Apple Developer](https://developer.apple.com/documentation/watchkit/enabling-background-sessions)
- [Using extended runtime sessions — Apple Developer](https://developer.apple.com/documentation/watchkit/using-extended-runtime-sessions)

관련 문서: `docs/gentle-srs-design.md`(복습 스케줄 SoT) · `store-assets/featuring-nomination.md`(피처링 답변지)
