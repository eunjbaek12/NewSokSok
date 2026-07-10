# 다음 세션 handoff

작성: 2026-07-10 (build 26 제출 반영) · 대상: 다음 작업 세션 시작 시

이번 세션(7/10): **동음이의어 A안+B안 완결**(#39→#41 머지 + Edge v4 배포 + 서버 E2E) + **#36·#37·#42·#43·#44·#47 머지** + **🚀 iOS build 26(1.1.4) 빌드·TestFlight 제출 완료**.
`main` HEAD `ffdcfcb`(+핸드오프 문서 커밋), 버전 1.1.4, jest 476/476.

연속성 메모리: `project_homonym_meanings`, `project_abandon_memorized_commit`, `project_study_streak_stats`, `feedback_confirm_before_prod_deploy`.

---

## 🎯 다음 세션 최우선

### 1. build 26 실기 검증 — 이번 세션의 유일한 대형 작업
**build 26 = 1.1.4 / buildNumber 26 / 커밋 `ffdcfcb`** (7/10 EAS 빌드·ASC 업로드 완료, Apple 처리 후 TestFlight 노출).
담긴 것(build 25 이후 전부): #36 중도이탈 복습기록 · #37 품사필터 수정 · #39+#41 동음이의어 · #42 홈 StatsStrip · #43 언어쌍 표시 · #44 예문 넘침 · #46 공유 유실 4종 · #47 암기 분류 유실.

**이번 세션 신규분:**
- [ ] **동음이의어 칩**(#41): "사과" 검색 → ① 채움 + 「다른 뜻: "apology" 검색」·「모두 담기」 칩 → 교체·되돌리기·수동 편집 시 칩 숨김. **BYOK 경로도** 확인
- [ ] **암기 분류 유실**(#47, 7/10 사용자 신고 건): 카드학습 분류 → 뒤로가기 → 단어장 암기 배지 반영. Android 하드웨어 백. 완주 흐름 회귀 없음
- [ ] **예문 넘침**(#44): 긴 예문이 카드 안에서 스크롤 + 답면 상단 여백(paddingTop 48) 밸런스 — 취향 조정 여지
- [ ] 품사 필터 재확인(#37): 검색 빈질의+칩만 탭, AI 단어 adj/adv 매칭
- [ ] 홈 StatsStrip(#42): 검색창 아래 표시·탭→/stats, 설정탭 진입 행
- [ ] 언어쌍 표시(#43): 단어장 카드 언어쌍, vi/es 덱 "English" 오표기 해소(오염 덱은 재저장으로 복구)
- [ ] 커뮤니티 공유(#46): 공유→수신 시 언어·아이콘·품사·태그 보존 E2E
- [ ] 중도이탈 기록(#36): 반절 학습 후 이탈 → 내학습 복습 수 반영

**build 25 이월분:**
- [ ] **재설치 동기화 E2E**(#35의 존재 이유): 로그인 학습 → 홈으로(push flush) → 앱 삭제 → 재설치 → 재로그인 → 스트릭·달력·날짜별 단어 목록 복원
- [ ] 게스트 학습 며칠치 → 로그인 → 기록 업로드
- [ ] 업그레이드 설치 후 기존 데이터·스트릭 보존(migration 016→017)
- [ ] 자랑하기 공유시트 + "이미지로 저장" 사진 권한 팝업(NSPhotoLibraryAddUsageDescription)
- [ ] CSV 내보내기/가져오기(#18): 공유시트·엑셀 한글 BOM·picker 레이스
- [ ] 예문 오디오(#15): 플래시카드 버튼·오토플레이 낭독 끊김
- [ ] 단어 언어 표시(#19): 비영어 단어 편집 레이블·저장 후 TTS 유지
- [ ] 네이버 사전(#22): vi/es 단어 N 버튼 언어쌍 연결
- [ ] AI 발음(#20): 로그인(Edge)에서 ko/vi/es 발음 표기 채워짐
- [ ] 동기화 pull(#29): 단어 많은 계정 새 기기 로그인 → 전체 도착
- [ ] 스모크: 게스트 배너 광고·세션 완주→내학습 반영·사진스캔·구독 화면

### 2. 검증 통과 시 다음 트랙
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
| build 26 실기 검증 | — | 위 체크리스트 |
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
- `main` HEAD `ffdcfcb`(1.1.4) + 이 문서 커밋. 열린 PR 없음.
- TestFlight: **build 26**(1.1.4, `ffdcfcb`) ASC 업로드 완료 → https://appstoreconnect.apple.com/apps/6776714408/testflight/ios
- Supabase: Edge enrich-word **v4**(senses) 라이브·서버 E2E 통과. DB 마이그레이션 `20260710000000_curation_share_fidelity`까지 원격 적용 확인.
- ⚠️ 로컬 앱 구동 불가(SQLite mock + OneDrive prebuild 제약) → 검증은 TestFlight로만. `env_onedrive_prebuild`.
