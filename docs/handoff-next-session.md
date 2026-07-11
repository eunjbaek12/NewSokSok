# 다음 세션 handoff

작성: 2026-07-11 밤 (1.1.4 양대 스토어 제출 완료 반영) · 대상: 다음 작업 세션 시작 시

이번 세션(7/11 밤): **🚀🚀 1.1.4 양대 스토어 심사 제출 완료** — iOS build 28 App Store 제출(ASC 웹) + Android vCode 15 Play 프로덕션 제출(출시노트 ko/en/ja/vi/zh). 도중 Play 사진·동영상 권한 정책 폼 발생 → PR #73으로 해결 후 vCode 14→15 재빌드(§5).
`main` HEAD = `03914b9`(PR #73), 버전 1.1.4.

직전 세션(7/10~11): build 26 검증 전 항목 종료(15건+스모크) + build 27·28 빌드·실기 검증 전 항목 통과. Edge 전부 최신(enrich v6·rate limit 40/분).

연속성 메모리: `project_build27`, `project_homonym_meanings`, `project_photo_enrich_recovery`, `project_plans_replay_silent`, `feedback_confirm_before_prod_deploy`.

---

## 🎯 다음 세션 최우선 = 심사 결과 관찰 + 공개 후 확인

**1.1.4 양대 스토어 심사 제출 완료(7/11)**: iOS = build 28(`273474b`) App Store 심사 중 · Android = vCode 15(`03914b9`) Play 검토 중(vCode 14는 권한 이슈로 폐기, §5).
1. **심사 결과 관찰** — iOS는 1.1.3 기준 1~2일, Android는 라이브 앱 업데이트라 수시간~수일.
2. **Android 공개 후 실기 확인**: 사진 스캔(갤러리 선택 + 카메라 촬영)·자랑카드 갤러리 저장 — READ_MEDIA 권한 제거 영향 최종 확인(§5).
3. 이후 개발은 **1.1.5**: backlog 상단 2건(동음이의어 칩 기본 전체 선택·스킨 이름 i18n)부터.

### 1. build 26 검증 — ✅ 전 항목 종료(7/10~11)
**build 26 = 1.1.4 / buildNumber 26 / 커밋 `ffdcfcb`**. 아래는 기록용.

**✅ 통과 (7/10 사용자 확인, 15건):**
- 암기 분류 유실(#47) · 예문 넘침+상단 여백(#44) · 품사 필터(#37) · 홈 StatsStrip(#42) · 언어쌍 표시(#43) · 중도이탈 복습 기록(#36) · 자랑하기 공유시트 · 예문 오디오(#15) · 동음이의어 칩 동작(#41 — 피드백 2건으로 #49 토글 개편, 재검증은 build 27) · **기기 간 동기화 push→pull**(멀티디바이스 인시던트로 확인, 아래 세션 기록 참조) · **① 재설치 동기화 E2E**(#35 스트릭·달력·날짜별 외운 단어 복원 + #29 pull 대량 동시 커버 — 잔여 실기 검증 중 최고 위험 항목 해소) · **② 커뮤니티 공유(#46)**(공유→수신 E2E 통과 — #46 종결) · **⑤ 게스트→로그인 업로드**(게스트 학습 후 재로그인 → 내 학습 합산 확인 — 스트릭 Phase 3 게스트 병합 흐름 커버) · **③ 비영어 3종 세트**(#20 es/vi 발음 표시·#19 편집 레이블/"단어 검색" 오탐 없음·#22 N 버튼 언어쌍 사전 — 전부 통과. 진행 중 발견한 버그 2건은 아래 PR #52/#53로 수정, 재검증은 build 27) · **④ CSV(#18) 종결**(데이터 로직=PR #56 코드 검증 + 기기 내보내기→재가져오기 왕복 성공)

**③ 검증 중 발견·수정된 버그 2건 (모두 main 머지, 실기 재검증=build 27):**
- **PR #52 — 개인 단어장 학습 TTS en-US 폴백**: +버튼 단어장은 `createList`가 언어를 저장 안 해 학습 화면 TTS 4곳이 en-US로 읽음(es 예문이 영어 음성). `getStudySourceLang`(리스트 우선→단어 폴백, 오염 덱 보호) 신설.
- **PR #53 — vi 발음 "ㅓㅓ"**: 정체=IPA Chao 성조 막대 ˧˧(U+02E7, 폰트에서 ㅓ와 동일 렌더링). 프롬프트 4곳 '성조 막대 없이'+`stripToneBars` 가드 3곳(enrichWord·AI생성·rowToWord, 강세 ˈˌ 보존)+PROMPT_VERSION 5 bump. **✅Edge v5 재배포+서버 E2E 통과(ɗi·caw 막대 0, 강세 보존, v4캐시 재생성)**. 신규 검색은 build 26에서도 이미 깨끗(서버 v5), 기존 저장 단어 표시 정리는 build 27부터(mapper).

**⑥ 스모크 완료(7/10~11)**: ✅게스트 배너 광고 · ✅구독 상품 가격 표시 · 사진 스캔은 버그 2건 규명으로 종료. 검증 중 발견 버그 2건 모두 수정 머지:
- **PR #58 — 요금제 진입만으로 "결제 실패" 알림**: iOS 미완료 거래 자동 재생을 사용자 결제로 오인(게스트 401·만료 샌드박스 402). userInitiatedRef 침묵 정산+402 확정 거절 좀비 청소.
- **PR #60 — 사진 스캔 "인식은 되는데 정보 없음"**: 서버는 성공·캐시(cycle 프로브로 확정)했는데 클라 12초 타임아웃이 먼저 포기 + 30단어 페이지 vs 20/분 rate limit 모순. 배치 타임아웃 30초·429 retry_after 재시도·실패분 2차 패스(캐시 히트 회복)·rate limit 40/분(`_shared/rate-limit.ts`). **✅Edge 3종 재배포 완료(7/11: enrich-word v16·scan-image v6·generate-words v10)+회귀 E2E 3/3.**
- 참고: 요금제 가격이 달러 표시 = 샌드박스 테스터 계정 지역(미국) 탓으로 추정, 실사용자 무관. 한국 계정인데도 달러면 ASC territory 가격 재점검.

### 2. build 27 — ✅ 검증 종료(7/11 밤. ⓪①②④⑤ 통과·⑥ 스킵·③ 단일 언어 덱 통과)
③ 검증 중 사용자가 재확인한 두 증상(사진 ko→vi 덱 스피커 미스매치·혼합 덱 일부 무음)은 build 27=리스트 우선 판의 예상 동작 — PR #68이 그 수정(build 28에서 검증).
**build 27 = 1.1.4 / buildNumber 27 / 커밋 `909abe1`** (2026-07-11 EAS 빌드·TestFlight 라이브. #49 토글 칩 + #52·#53·#56·#58·#60 포함. **PR #64 클라 변경분은 미포함 → build 28**).

- [x] **⓪ 업그레이드 설치(26→27) 데이터 보존**: ✅통과(7/11 — 단어장·내 학습 정상 표시 확인).
- [x] **① 동음이의어 v4 토글 칩**(#49): ✅통과(7/11 사용자 확인 "토글 잘 돼").
  - ⚠️ ① 진행 중 **신고 3건 → PR #64 수정(7/11, `2dbc4a1`)**: ⑴ ko→ko senses 예문 번역이 영어(캐시 실측 — 뜻은 정상, exampleKr만) → **같은 언어쌍 예문 번역 제거**(프롬프트 v6 빈값+add-word 필드 숨김+표시 4곳 동일 문장 생략) ⑵ 언어쌍 변경 시 검색 결과 잔존 → 신규 모드 확인 Alert 후 term만 남기고 초기화 ⑶ 뜻 개수·순서 언어쌍별 상이 → "뜻 목록=출발어 속성" 지시. **PROMPT_VERSION 6=SHARED 6. ✅Edge 재배포+서버 E2E 9/9(7/11: ko→ko exampleKr 빈값·senses 한국어·개수 일치·ko→en 회귀 없음).** 클라 변경분(필드 숨김·초기화 Alert·표시단 중복 생략) 실기=**build 28**.
- [x] **② vi 발음 성조 막대**(#53): ✅통과(7/11 — "ㅓㅓ" 막대 없음 확인. 사용자가 vi 비화자라 발음 내용 자체의 정확성은 미평가이나, 검증 목적=막대 제거라 충분).
- [ ] **③ 개인 단어장 학습 TTS**(#52): ①②에서 저장한 단어들이 든 **+버튼 단어장**으로 카드학습 → 단어·예문 발음이 해당 언어 음성(기존엔 en-US 폴백) + 기존 큐레이션 덱(vi/es) 학습 발음도 여전히 정상(회귀 방지).
- [x] **④ 사진 스캔 회복**(#60): ✅통과(7/11 — ko→vi 재테스트 "다 잘 나왔어". 첫 시도 때 "한국어가 목적어로 보임" 신고는 재테스트에서 미재현·해소. 파생 수정 3건은 PR #69 → build 28).
- [x] **⑤ 요금제 진입 무알림**(#58): ✅통과(7/11 — 진입 시 "결제 실패" 알림 없음 확인).
- [x] ~~**⑥ (선택) BYOK 경로**~~: 사용자 판단으로 스킵(7/11 — 해당 경로 변경 없음·그간 안정적).

### 3. build 28 — ✅ 실기 검증 전 항목 통과(7/11 밤, 당일 완료)
- [x] **⓪ 업그레이드 설치(27→28) 데이터 보존**: ✅통과(7/11 — 단어장·내 학습 정상 표시).
- [x] **① 혼합 언어 덱 TTS**(#68): ✅통과(7/11 — build 27 미스매치 덱에서 단어별 자기 언어 음성 확인).
- [x] **② +버튼 단일 언어 덱 TTS 회귀**(#52+#68): ✅통과(7/11).
- [x] **③ 스킨 선택기 글자색**(#69): ✅통과(7/11).
- [x] **④ 사진 스캔 미등재 제외**(#69): ✅통과(7/11 — vi→en 설정+한국어·영어 사진 2회: 1회차 부분 제외로 카드 실시간 감소·1개 잔존, 2회차 전부 제외 Alert 문구 그대로 확인).
- [x] **⑤ 일괄 추가 미등재 표시**(#69): ✅통과(7/11 — "자동완성으로 추가"에 가짜 단어 → 카드 잔존+"사전에서 찾지 못했어요" 표시).
- [x] **⑥ #64 클라 변경분**: ✅통과(7/11 — ko→ko 예문 해석 필드 숨김 · 언어쌍 변경 시 초기화 · ko→ko 예문 번역 플래시카드 표시 생략 모두 확인).
- 관찰: **음성인식 첫 사용 오류(7/11 신고)** — 권한 허용 직후 1회 오류 알림 → 이후 정상(사용자 확인). 일시 오류 추정·수정 없음. 재발 시 팝업 문구 확보.

### 4. 검증 통과 시 다음 트랙 — ✅ 둘 다 실행 완료(7/11 밤, §5)

### 5. 1.1.4 스토어 제출 2트랙 (7/11 밤) — ✅ 완료
- **iOS**: build 28 선택 + What's New 작성 → App Store 심사 제출(ASC 웹).
- **Android**: vCode 14(`97d04a6` = 273474b+docs, 앱 코드 동일) 빌드 → Play 업로드 시 **미선언 사진·동영상 권한(READ_MEDIA_IMAGES/VIDEO) 선언 폼** 발생.
  - 원인: 자랑카드 저장용 `expo-media-library`(7/9 추가)의 config plugin 기본값(granularPermissions photo/video/audio)이 읽기 권한 3종을 매니페스트에 자동 추가. 1.1.3(vCode 12)엔 없던 라이브러리.
  - 앱은 읽기 접근 미사용: 사진 스캔 = 시스템 photo picker(API 33+ 권한 불필요, `ImagePickerModule.kt:254` emptyArray) · 자랑카드 = writeOnly 저장(API 33+ granular 읽기 요청 제외, `MediaLibraryModule.kt:309`). Google 정책상 picker 기반 일회성 접근은 선언 승인 대상이 아니라 권한 제거 대상 → 폼 미작성.
  - **PR #73(`03914b9`)**: `android.blockedPermissions`에 READ_MEDIA_IMAGES·VIDEO·AUDIO 3종 차단(API 32↓ READ/WRITE_EXTERNAL_STORAGE 경로는 유지) → **vCode 15 재빌드 + AAB 매니페스트 직접 검증**(READ_MEDIA 0건·CAMERA/RECORD_AUDIO 유지) → vCode 14 초안 폐기, vCode 15 업로드 시 권한 폼 재발 없음 → 출시노트 5개 언어 입력 후 검토 제출.
  - 가독화 파일(매핑) 경고는 무시 — EAS 기본 빌드는 R8 난독화 OFF라 매핑 파일 자체가 없음(vCode 12도 동일 경고로 정상 운영).

---

## ✅ 이번 세션(2026-07-10)에 끝낸 것

### 🚀 iOS build 26 — 빌드·TestFlight 제출 완료
EAS production(autoIncrement), **1.1.4 / build 26 / `ffdcfcb`**. `eas build` → `eas submit --latest` 비대화식 성공. ASC 업로드 완료, Apple 처리 대기.

### 동음이의어 완결 — `project_homonym_meanings`
- **A안(#39, 병기)** + **B안(#41, 인라인 뜻 제안)** 머지. 검색 → ① 뜻 채움 → 검색창 아래 칩(「다른 뜻: "X" 검색」+「모두 담기」) → 재호출 없이 전 필드 일관 교체. AI 호출 1회·차감 1단어. 수동 편집 시 칩 숨김. 상위 필드 병기 유지=하위호환(구버전·사진스캔·배치).
- **Edge enrich-word v4 배포 + 서버 E2E 통과**(눈=senses 3개·사과=2개 각자 일관 예문·compute=없음).
- **PROMPT_VERSION 4 = SHARED_ENRICH_PROMPT_VERSION 4** — 앞으로 프롬프트 변경 시 두 상수(`supabase/functions/enrich-word/index.ts` + `lib/enrich-cache-shared.ts`) **함께 bump**.
- UX 결정: 시트(모달) vs 인라인 재검토 → 인라인 확정(다수 무마찰·비모달 표준·iOS 모달 함정 회피). C안(카드 2장)은 migration 015 유니크 인덱스로 배제 유지.

### 멀티 디바이스 동기화 인시던트 진단 — `project_debounce_push_data_loss` §7/10
"아이폰에서 단어장 다운 → 안드로이드 같은 계정에 안 보임" 신고 → **버그·유실 아님, 타이밍 2중**: ①push는 30초 디바운스+백그라운드 flush라 다운로드 직후 기기 전환 시 미전송(dirty 영속 → 다음 앱 오픈 시 flush) ②**pull은 앱 시작 시에만**(포그라운드 복귀 트리거 없음) → 수신 기기 재시작 필요. 아이폰 재오픈+안드로이드 재시작으로 해소 확인. **진단법: service_role로 cloud_lists updated_at 조회(push/pull 분기)**. ⚠️테스트 기기 계정은 kimosungk/eunjbaek12가 아닌 제3 계정. → backlog 2건 추가(아래 표).

### #47 중도 이탈 암기 분류 유실 수정 — `project_abandon_memorized_commit` (7/10 사용자 실기 신고)
- 원인: 분류는 메모리에만 쌓이고 `setWordsMemorized` 커밋은 완주 전용. handleClose는 오답 카운트만(3efa9e0), Android 하드웨어 백은 handleClose조차 안 거침.
- 수정: `session-results.ts`(순수 분류) + `use-session-commit.ts`(단일 커밋: 헤더 back=await 후 back / 그 외 pop=언마운트 fallback / idempotent 가드). 3화면(플래시카드·퀴즈·예문) finishSession 중복 4블록도 치환(-100줄). 암기 전환은 memorized_log 통계까지 자동 정합.

### #44 플래시카드 예문 넘침 수정
- 원인: #15 스피커 버튼 wrapper View(기본 flexShrink 0)가 RN ScrollView 내장 flexShrink:1을 무력화. 수정: wrapper `flexShrink:1` + 답면 paddingTop 100→48.

### #49 동음이의어 v4 토글 칩 — build 26 실기 피드백 즉일 반영
- 피드백 ①: 동사 칩(「다른 뜻 검색」→「되돌리기」→「모두 담기」)이 상태마다 문구가 바뀌어 비일관 → **뜻마다 상태 칩(「✓ ① eye」) 토글**로 교체(목업 v4 승인 후 구현).
- 피드백 ②: 모두 담기 시 예문이 ① 하나만 → **2개+ 선택 시 뜻·예문·번역·정의 전부 ①② 병기 조립**(재호출·추가 차감 없음).
- 최소 1개 강제·fitsSaveLimits(저장 상한 초과 시 토글 거부 — 칩 상태=카드 내용 불변식)·병기는 공백 연결(NO_CONTROL이 줄바꿈 거부)·예문 TTS 4곳 stripSenseMarkers.

### 그 외 머지
- #36 중도이탈 복습기록·#37 품사필터(7/9 세션분) · #42 홈 StatsStrip·#43 언어쌍 표시+#46 공유 유실 4종(병행 세션분, **#46 db push 원격 적용 확인 완료** — migration list로 검증).

---

## 💡 교훈 (유지 + 신규)

- **프로덕션 반영은 실행 직전 별도 확인**: Edge 배포·db push·스토어 제출은 선택지 승인과 별개로 명시 확인 — `feedback_confirm_before_prod_deploy`.
- **db push 중복 실행은 안전**(적용 이력 기반 미적용분만 올림). 병행 세션과 **동시 실행만 회피**. 적용 여부는 `supabase migration list`(읽기 전용)로 확인.
- **gh 스택 PR 함정**: base 브랜치 머지·삭제 시 스택 PR은 auto-close(#40→#41 재생성). base 머지 전에 `gh pr edit --base main` 먼저.
- **ScrollView를 View로 감싸면 flex 축소가 사라진다**: wrapper에 flexShrink 명시 필요.
- **학습 화면 이탈 경로는 3개**: 헤더 back(handleClose)·Android 하드웨어 백(기본 pop, 핸들러 안 거침)·완주(replace). 커밋은 useSessionCommit 단일 지점 — 새 학습 화면 추가 시 이 훅 사용.
- **Supabase CLI 토큰 만료**: `!` 실행은 non-TTY라 login 불가 → 사용자가 일반 터미널에서.
- **빌드 직후 build↔커밋 기록**: iOS build 28=`273474b`, 27=`909abe1`, 26=`ffdcfcb`, 25=`8097e34`, 24=`43ca53a` · Android vCode 15=`03914b9`(14=`97d04a6` 폐기).
- **네이티브 라이브러리 추가 시 plugin이 넣는 Android 권한 확인**: 옵션 없이 autolink되면 기본값이 광범위 권한을 추가할 수 있음(expo-media-library 사례). prebuild 불가 환경이라 `node_modules/<pkg>/plugin/build/*.js` 소스로 확인. Play 정책 폼이 뜨면 설명 제출보다 `android.blockedPermissions` 제거가 정석.
- **AAB 권한 검증법**: AAB(zip)에서 `base/manifest/AndroidManifest.xml` 추출 후 grep — protobuf 인코딩이어도 권한 문자열은 평문이라 업로드 전 로컬 확인 가능.

---

## 🔮 남은 backlog

| 항목 | 트랙 | 비고 |
|---|---|---|
| **동음이의어 칩 기본 전체 선택** | 앱 1.1.5 | 사용자 제안(7/11)·검토 찬성. 현재 `selected:[0]`(useAddWord). 사진/일괄 경로는 전체 병기 저장이라 불일치. 한도 초과 시 뒤 순위 뜻부터 제외 폴백(최소 ①) 필수 |
| **스킨 이름 i18n** | 앱 1.1.5 | SkinSelector가 nameKo 하드코딩 — 영어 UI에서도 "클래식" 한글. nameEn 이미 있음, 앱 언어 따라 분기 |
| **Android 1.1.4 공개 후 실기 확인** | 스토어 | 사진 스캔(갤러리+카메라)·자랑카드 저장 — READ_MEDIA 제거 영향(§5) |
| R8/ProGuard 활성화 검토 | 앱 1.1.5+ | 앱 크기 절감. RN 라이브러리 충돌 위험 → proguard 규칙 검증+실기 필수 |
| 동음이의어 senses 안정성 관찰 | 서버 | flash-lite가 senses를 항상 주는지 실사용 관찰 |
| **마일스톤 축하 팝업**(7·30·100일) | 앱 | **사용자가 명시적으로 미룸(7/9)** |
| 스트릭 프리즈·알림 | 앱 | Phase 3 잔여 |
| 시트→단어 상세 이동 | 앱 | 전역 Portal 도입 후 |
| 자랑하기 Android 저장 | 앱 | media-library 권한/플러그인 |
| **포그라운드 복귀 시 pull 트리거** | 앱 | 7/10 인시던트 — 멀티디바이스 체감 개선 핵심(현재 pull은 앱 시작 시에만) |
| **미전송 dirty 상태 표시** | 앱 | push 실패/지연이 사용자에게 침묵 — 설정에 동기화 상태 등 |
| 생성경로 responseSchema 하드닝 | 서버 | flash-lite 드문 phonetic 누락 |
| Reddit 런칭 글 게시 | 마케팅 | BYOK를 본문 강점으로 승격 후 |
| production 관찰 + 첫 리뷰·별점 요청 | 운영 | 상시 트랙 |

---

## 참고 — 현재 상태 (2026-07-11 밤)
- `main` HEAD `03914b9`(1.1.4, PR #73 blockedPermissions까지) + 이 문서 커밋. 열린 PR 없음.
- **App Store: 1.1.4(build 28) 심사 중** · **Play: 1.1.4(vCode 15) 검토 중** — 라이브는 각각 1.1.3(build 21)·vCode 12(1.1.3).
- Supabase: Edge enrich-word **v6**(같은 언어쌍 예문 번역 제거, PROMPT_VERSION 6=SHARED 6) 라이브·rate limit 40/분. DB 마이그레이션 `20260710000000_curation_share_fidelity`까지 원격 적용 확인.
- ⚠️ 로컬 앱 구동 불가(SQLite mock + OneDrive prebuild 제약) → 검증은 TestFlight로만. `env_onedrive_prebuild`.
