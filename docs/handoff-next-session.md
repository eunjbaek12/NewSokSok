# 다음 세션 handoff

작성: 2026-07-10 (build 26 검증 진행 반영) · 대상: 다음 작업 세션 시작 시

이번 세션(7/10): **동음이의어 A안+B안 완결 + v4 토글 칩(#49)** + **#36·#37·#42·#43·#44·#47 머지** + **🚀 iOS build 26 빌드·TestFlight 제출** + **실기 검증 9건 통과**.
`main` HEAD `079d112`, 버전 1.1.4, jest 483/483.

연속성 메모리: `project_homonym_meanings`, `project_abandon_memorized_commit`, `project_study_streak_stats`, `feedback_confirm_before_prod_deploy`.

---

## 🎯 다음 세션 최우선

### 1. build 26 잔여 실기 검증
**build 26 = 1.1.4 / buildNumber 26 / 커밋 `ffdcfcb`** (TestFlight 라이브, 검증 진행 중).

**✅ 통과 (7/10 사용자 확인, 9건):**
- 암기 분류 유실(#47) · 예문 넘침+상단 여백(#44) · 품사 필터(#37) · 홈 StatsStrip(#42) · 언어쌍 표시(#43) · 중도이탈 복습 기록(#36) · 자랑하기 공유시트 · 예문 오디오(#15) · 동음이의어 칩 동작(#41 — 단 이때 나온 피드백 2건으로 #49 토글 개편, 재검증은 build 27)

**⬜ 남은 검증:**
- [ ] **재설치 동기화 E2E**(#35의 존재 이유): 로그인 학습 → 홈으로(push flush, 30초 대기) → 앱 삭제 → 재설치 → 재로그인 → 스트릭·달력·날짜별 단어 목록 복원. #29(pull 대량)·게스트→로그인 업로드도 이 흐름에 묶어 확인 가능
- [ ] 커뮤니티 공유(#46): 공유→수신 시 언어·아이콘·품사·태그 보존 E2E (사용자가 "다음에 확인"으로 미룸)
- [ ] 게스트 학습 며칠치 → 로그인 → 기록 업로드
- [ ] 업그레이드 설치(25→26) 후 기존 데이터·스트릭 보존 — 업데이트 설치로 내 학습이 멀쩡하면 사실상 통과
- [ ] CSV 내보내기/가져오기(#18): 공유시트·엑셀 한글 BOM·picker 레이스
- [ ] 단어 언어 표시(#19): 비영어 단어 편집 레이블·저장 후 TTS 유지
- [ ] 네이버 사전(#22): vi/es 단어 N 버튼 언어쌍 연결
- [ ] AI 발음(#20): 로그인(Edge)에서 ko/vi/es 발음 표기 채워짐
- [ ] 스모크: 게스트 배너 광고·사진스캔·구독 화면

### 2. build 27 (main `079d112`+) — 낼 때 검증할 것
- [ ] **동음이의어 v4 토글 칩**(#49): 칩 켜고 끄기(「✓ ① eye」), 2개+ 선택 시 **예문·번역·정의 ①② 병기 조립**, 최소 1개 힌트, 저장 한도 초과 시 토글 거부 힌트, TTS가 ①② 기호 안 읽는지, BYOK 경로

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
| 생성경로 responseSchema 하드닝 | 서버 | flash-lite 드문 phonetic 누락 |
| Reddit 런칭 글 게시 | 마케팅 | BYOK를 본문 강점으로 승격 후 |
| production 관찰 + 첫 리뷰·별점 요청 | 운영 | 상시 트랙 |

---

## 참고 — 현재 상태 (2026-07-10)
- `main` HEAD `079d112`(1.1.4, #49 토글 칩까지) + 이 문서 커밋. 열린 PR 없음.
- TestFlight: **build 26**(1.1.4, `ffdcfcb`) 라이브·검증 진행 중(9건 통과). #49는 main에만 — **build 27 필요**.
- Supabase: Edge enrich-word **v4**(senses) 라이브·서버 E2E 통과. DB 마이그레이션 `20260710000000_curation_share_fidelity`까지 원격 적용 확인.
- ⚠️ 로컬 앱 구동 불가(SQLite mock + OneDrive prebuild 제약) → 검증은 TestFlight로만. `env_onedrive_prebuild`.
