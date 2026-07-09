# 다음 세션 handoff

작성: 2026-07-10 · 대상: 다음 작업 세션 시작 시

이번 세션(7/10): **동음이의어 A안+B안 완결**(#39 병기 → #41 인라인 뜻 제안 머지 + Edge enrich-word v4 배포 + 서버 E2E 통과) + **#36·#37 머지** + **플래시카드 예문 넘침 수정(#44) 머지**.
`main` HEAD `6185b4f`, 버전 1.1.4, jest 468/468.

연속성 메모리: `project_homonym_meanings`, `project_pos_filter_and_example_audio`, `project_study_streak_stats`, `feedback_confirm_before_prod_deploy`.

---

## 🎯 다음 세션 최우선

### 1. 열린 PR 2개 머지 (사용자 승인 대기 — 별도 세션 산출물)
| PR | 내용 |
|---|---|
| **#42** `feat/home-stats-strip` | "내 학습" 스트립을 홈 탭 검색창 아래로 이동(상시 노출), 설정 탭은 진입 행만 유지 |
| **#43** `fix/list-lang-display` | 언어쌍 표시를 단어장 카드로 이동 + 큐레이션 저장 언어 오염 수정 |

### 2. 다음 빌드(build 26) — 실기 미검증 변경이 많이 쌓임
build 25(`8097e34`) 이후 main에 쌓인 것: #36(중도이탈 기록) · #37(품사필터 수정) · #39+#41(동음이의어) · #44(예문 넘침) — 전부 실기 미검증. #42·#43 머지 후 빌드 내는 게 효율적.

### 3. 실기 검증 체크리스트 (build 26에서)

**이번 세션 추가분:**
- [ ] **동음이의어 칩 UI**(#41): "사과" 검색 → ① 채움 + 「다른 뜻: "apology" 검색」·「모두 담기」 칩 → 교체·되돌리기·수동 편집 시 숨김. BYOK 경로도 확인
- [ ] **플래시카드 예문**(#44): 긴 예문이 카드 안에서 스크롤되는지 + 답면 상단 여백(paddingTop 48) 밸런스 — 취향에 안 맞으면 값만 조정
- [ ] 품사 필터 재확인(#37): 검색 빈질의+칩만 탭, AI 생성 단어 adj/adv 매칭

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

---

## ✅ 이번 세션(2026-07-10)에 끝낸 것

### 동음이의어 완결 — `project_homonym_meanings`
- **A안(#39, 병기)**: 프롬프트에 HOMONYMS 지시 — meaningKr·definition에 대표 뜻 ①②③ 병기(짧은 대역어). 머지 완료.
- **B안(#41, 인라인 뜻 제안)**: 검색 → ① 뜻으로 채움 → 검색창 아래 칩 「다른 뜻: "X" 검색」+「모두 담기」. 탭하면 재호출 없이 전 필드 일관 교체(뜻별 예문 어긋남 근본 해결). AI 호출 1회·차감 1단어. **수동 편집 시작 → 칩 숨김**(덮어쓰기 방지). 상위 필드는 병기 유지 → 구버전 앱·사진스캔·배치 경로 하위호환.
  - 신규 `lib/senses.ts`(normalizeSenses·senseToFill·senseChipLabel) + `AIWordResultSchema.senses` + useAddWord.sensePicker + add-word 칩 UI + i18n.
  - **PROMPT_VERSION 4 = SHARED_ENRICH_PROMPT_VERSION 4 동기화** — 앞으로 프롬프트 변경 시 **두 상수 함께** bump(`supabase/functions/enrich-word/index.ts` + `lib/enrich-cache-shared.ts`).
- **Edge enrich-word v4 배포 + 서버 E2E 통과**: 눈=senses 3개(eye/snow/겉모습, 각자 일관 예문)·사과=2개·compute=없음(과잉 트리거 없음).
- UX 결정 기록: 시트(모달) vs 인라인 재검토 → **인라인 확정**(다수 무마찰·Google/네이버 비모달 표준·iOS 모달 함정 회피). 목업 artifact 🍎. C안(카드 2장)은 migration 015 유니크 인덱스로 배제 유지.

### 플래시카드 예문 넘침 수정 — #44 머지 `6185b4f`
- 원인: #15의 스피커 버튼 anchor용 wrapper View(기본 flexShrink 0)가 **RN ScrollView 내장 flexShrink:1**을 무력화 → 카드 maxHeight 초과 시 예문 박스가 카드 밖으로.
- 수정: wrapper `flexShrink: 1`(자동 축소 복원, 긴 예문은 박스 내 스크롤) + 답면 `paddingTop` 100→48(상단 빈 띠 보정, 사용자 요청).

### PR #36·#37 머지 (7/9 세션 잔여분)
#36 중도 이탈 세션 복습 기록 · #37 품사 필터 2종 수정.

---

## 💡 교훈 (유지 + 신규)

- **프로덕션 반영은 실행 직전 별도 확인**: Edge 배포·db push·스토어 제출은 선택지 승인과 별개로 "지금 배포할까요?" 명시 확인 — `feedback_confirm_before_prod_deploy`(7/10 A안 배포 건).
- **gh 스택 PR 함정**: base 브랜치가 머지·삭제되면 스택 PR은 retarget이 아니라 **auto-close**됨(#40→#41 재생성으로 해결). 스택 PR은 base 머지 전에 `gh pr edit --base main` 먼저.
- **ScrollView를 View로 감싸면 flex 축소가 사라진다**: RN ScrollView는 flexShrink:1 내장이지만 wrapper View는 기본 0 — absolute 버튼 anchor용 wrapper엔 flexShrink 명시.
- **Supabase CLI 토큰 만료**: `!` 실행은 non-TTY라 `supabase login` 불가 → 사용자가 일반 터미널에서 로그인.
- **두 배포 트랙**: 앱 빌드(EAS) vs Edge(`supabase functions deploy`) vs DB(`supabase db push`) — 셋 다 별개.

---

## 🔮 남은 backlog

| 항목 | 트랙 | 비고 |
|---|---|---|
| #42·#43 머지 → build 26 | 앱 | 위 최우선 |
| build 26 실기 검증 | — | 위 체크리스트 |
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
- `main` HEAD `6185b4f`(1.1.4). 열린 PR: **#42·#43**(머지 대기).
- TestFlight: **build 25**(1.1.4, `8097e34`) — 이후 main 변경분은 build 26 필요.
- Supabase: Edge enrich-word **v4**(senses) 라이브·서버 E2E 통과. generate-words·scan-image는 7/9 배포분 그대로.
- ⚠️ 로컬 앱 구동 불가(SQLite mock + OneDrive prebuild 제약) → 검증은 TestFlight로만. `env_onedrive_prebuild`.
