# 다음 세션 handoff

작성: 2026-07-10 (build 26 검증 진행 반영) · 대상: 다음 작업 세션 시작 시

이번 세션(7/10): **동음이의어 A안+B안 완결 + v4 토글 칩(#49)** + **#36·#37·#42·#43·#44·#47 머지** + **🚀 iOS build 26 빌드·TestFlight 제출** + **실기 검증 9건 통과**.
`main` HEAD `079d112`, 버전 1.1.4, jest 483/483.

연속성 메모리: `project_homonym_meanings`, `project_abandon_memorized_commit`, `project_study_streak_stats`, `feedback_confirm_before_prod_deploy`.

---

## 🎯 다음 세션 최우선

### 1. build 26 잔여 실기 검증
**build 26 = 1.1.4 / buildNumber 26 / 커밋 `ffdcfcb`** (TestFlight 라이브, 검증 진행 중).

**✅ 통과 (7/10 사용자 확인, 15건):**
- 암기 분류 유실(#47) · 예문 넘침+상단 여백(#44) · 품사 필터(#37) · 홈 StatsStrip(#42) · 언어쌍 표시(#43) · 중도이탈 복습 기록(#36) · 자랑하기 공유시트 · 예문 오디오(#15) · 동음이의어 칩 동작(#41 — 피드백 2건으로 #49 토글 개편, 재검증은 build 27) · **기기 간 동기화 push→pull**(멀티디바이스 인시던트로 확인, 아래 세션 기록 참조) · **① 재설치 동기화 E2E**(#35 스트릭·달력·날짜별 외운 단어 복원 + #29 pull 대량 동시 커버 — 잔여 실기 검증 중 최고 위험 항목 해소) · **② 커뮤니티 공유(#46)**(공유→수신 E2E 통과 — #46 종결) · **⑤ 게스트→로그인 업로드**(게스트 학습 후 재로그인 → 내 학습 합산 확인 — 스트릭 Phase 3 게스트 병합 흐름 커버) · **③ 비영어 3종 세트**(#20 es/vi 발음 표시·#19 편집 레이블/"단어 검색" 오탐 없음·#22 N 버튼 언어쌍 사전 — 전부 통과. 진행 중 발견한 버그 2건은 아래 PR #52/#53로 수정, 재검증은 build 27) · **④ CSV(#18) 종결**(데이터 로직=PR #56 코드 검증 + 기기 내보내기→재가져오기 왕복 성공)

**③ 검증 중 발견·수정된 버그 2건 (모두 main 머지, 실기 재검증=build 27):**
- **PR #52 — 개인 단어장 학습 TTS en-US 폴백**: +버튼 단어장은 `createList`가 언어를 저장 안 해 학습 화면 TTS 4곳이 en-US로 읽음(es 예문이 영어 음성). `getStudySourceLang`(리스트 우선→단어 폴백, 오염 덱 보호) 신설.
- **PR #53 — vi 발음 "ㅓㅓ"**: 정체=IPA Chao 성조 막대 ˧˧(U+02E7, 폰트에서 ㅓ와 동일 렌더링). 프롬프트 4곳 '성조 막대 없이'+`stripToneBars` 가드 3곳(enrichWord·AI생성·rowToWord, 강세 ˈˌ 보존)+PROMPT_VERSION 5 bump. **✅Edge v5 재배포+서버 E2E 통과(ɗi·caw 막대 0, 강세 보존, v4캐시 재생성)**. 신규 검색은 build 26에서도 이미 깨끗(서버 v5), 기존 저장 단어 표시 정리는 build 27부터(mapper).

**⬜ 남은 검증 (테스트 절차 포함):**
- [x] **⑥ 스모크 완료(7/10~11)**: ✅게스트 배너 광고 · ✅구독 상품 가격 표시 · 사진 스캔은 버그 2건 규명으로 종료(아래). 검증 중 발견 버그 2건 모두 수정 머지:
  - **PR #58 — 요금제 진입만으로 "결제 실패" 알림**: iOS 미완료 거래 자동 재생을 사용자 결제로 오인(게스트 401·만료 샌드박스 402). userInitiatedRef 침묵 정산+402 확정 거절 좀비 청소.
  - **PR #60 — 사진 스캔 "인식은 되는데 정보 없음"**: 서버는 성공·캐시(cycle 프로브로 확정)했는데 클라 12초 타임아웃이 먼저 포기 + 30단어 페이지 vs 20/분 rate limit 모순. 배치 타임아웃 30초·429 retry_after 재시도·실패분 2차 패스(캐시 히트 회복)·rate limit 40/분(`_shared/rate-limit.ts`). **✅Edge 3종 재배포 완료(7/11: enrich-word v16·scan-image v6·generate-words v10)+회귀 E2E 3/3.**
- [ ] 업그레이드 설치(25→26) 데이터 보존 — 업데이트 설치로 내 학습 멀쩡하면 사실상 통과(이미 확인됐을 수 있음)

### 2. build 27 — 실기 검증 체크리스트 (순서대로 하면 효율적)
**build 27 = 1.1.4 / buildNumber 27 / 커밋 `909abe1`** (2026-07-11 EAS 빌드, PR #62까지 전부 포함: #49 토글 칩 + 7/10~11 수정 5건 #52·#53·#56·#58·#60).

- [ ] **⓪ 업그레이드 설치(26→27) 데이터 보존**: TestFlight 업데이트 설치 → 단어장·내 학습(스트릭·달력) 그대로인지. 설치 자체가 첫 검증.
- [ ] **① 동음이의어 v4 토글 칩**(#49): 단어 추가에서 "눈"(ko→en) 또는 "사과" 검색 → 뜻마다 상태 칩(「✓ ① eye」) 토글 → 2개+ 선택 시 **예문·번역·정의까지 ①② 조립** → 전부 끄려 하면 최소 1개 힌트 → 카드학습 TTS가 ①② 기호 안 읽는지.
  - ⚠️ ① 진행 중 **신고 3건 → PR #64 수정(7/11, `2dbc4a1`)**: ⑴ ko→ko senses 예문 번역이 영어(캐시 실측 — 뜻은 정상, exampleKr만) → **같은 언어쌍 예문 번역 제거**(프롬프트 v6 빈값+add-word 필드 숨김+표시 4곳 동일 문장 생략) ⑵ 언어쌍 변경 시 검색 결과 잔존 → 신규 모드 확인 Alert 후 term만 남기고 초기화 ⑶ 뜻 개수·순서 언어쌍별 상이 → "뜻 목록=출발어 속성" 지시. **PROMPT_VERSION 6=SHARED 6. ✅Edge 재배포+서버 E2E 9/9(7/11: ko→ko exampleKr 빈값·senses 한국어·개수 일치·ko→en 회귀 없음).** 클라 변경분(필드 숨김·초기화 Alert·표시 생략) 실기=build 28. build 27에서도 ko→ko 새 검색은 이미 깨끗(서버 v6).
- [ ] **② vi 발음 성조 막대**(#53): 같은 단어 추가 화면에서 vi 단어(đi, chào) AI 검색 → 발음에 "ㅓㅓ"(˧˧) 없음 + **기존 저장 vi 단어** 표시에서도 막대 사라짐(rowToWord 정리) + en 단어(pronunciation) 강세 기호 ˈ는 유지.
- [ ] **③ 개인 단어장 학습 TTS**(#52): ①②에서 저장한 단어들이 든 **+버튼 단어장**으로 카드학습 → 단어·예문 발음이 해당 언어 음성(기존엔 en-US 폴백) + 기존 큐레이션 덱(vi/es) 학습 발음도 여전히 정상(회귀 방지).
- [ ] **④ 사진 스캔 회복**(#60): 30단어급 사진 스캔 → 전 카드 발음·뜻·예문 채워짐(일부는 배치 끝 2차 패스로 늦게 채워질 수 있음 — 그동안 저장 버튼 "보강 중" 잠김이 정상). 스캔할 사진 언어와 단어장 언어 일치 주의(vi 단어장에 한국어 사진 스캔하면 빈 결과가 정상 동작).
- [ ] **⑤ 요금제 진입 무알림**(#58): **게스트**로 요금제 화면 진입 → "결제 실패" 알림 안 뜸 → **로그인 상태로 1회 진입**(만료 샌드박스 좀비 거래 청소, 이후 재발 안 함) → "이전 구매 복원" 버튼 정상 동작.
- [ ] **⑥ (선택) BYOK 경로**: 고급 설정에 Gemini 키 넣고 ①·② 재확인(BYOK도 senses·발음 가드 적용됨).

### 3. 검증 통과 시 다음 트랙
- 1.1.4를 App Store 프로덕션 심사로 올릴지 결정(제출 후엔 다음 버전은 1.1.5). Android 트랙도 같은 커밋으로 빌드 검토.

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
- **빌드 직후 build↔커밋 기록**: build 26=`ffdcfcb`, 25=`8097e34`, 24=`43ca53a`.

---

## 🔮 남은 backlog

| 항목 | 트랙 | 비고 |
|---|---|---|
| build 26 잔여 검증 + build 27(토글 칩) | — | 위 체크리스트 |
| 1.1.4 App Store 심사 제출 여부 | 스토어 | 검증 통과 후 결정 |
| Android 빌드(vCode 갱신) | 스토어 | 같은 커밋 기반 검토 |
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

## 참고 — 현재 상태 (2026-07-10)
- `main` HEAD `079d112`(1.1.4, #49 토글 칩까지) + 이 문서 커밋. 열린 PR 없음.
- TestFlight: **build 26**(1.1.4, `ffdcfcb`) 라이브·검증 진행 중(10건 통과, 잔여 7항목은 위 절차 참조). #49는 main에만 — **build 27 필요**.
- Supabase: Edge enrich-word **v5**(vi 성조 막대 제거, 7/10 재배포·서버 E2E 통과. v4=senses) 라이브. DB 마이그레이션 `20260710000000_curation_share_fidelity`까지 원격 적용 확인.
- ⚠️ 로컬 앱 구동 불가(SQLite mock + OneDrive prebuild 제약) → 검증은 TestFlight로만. `env_onedrive_prebuild`.
