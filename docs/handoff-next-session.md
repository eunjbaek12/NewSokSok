# 다음 세션 handoff

작성: 2026-07-09 · 대상: 다음 작업 세션 시작 시

이번 세션(7/9): **3개 PR 머지(#32 언어레이블 · #34 내학습 달력 개편 · #35 통계 클라우드 동기화)** + **iOS build 25(1.1.4) TestFlight 제출** + **실기 검증 일부 통과** + 검증 중 발견 2건 수정 PR(#36·#37, 미머지).
`main` HEAD `8097e34`, 버전 **1.1.4**, jest 452/452(#37 브랜치 기준).

연속성 메모리: `project_study_streak_stats`, `project_pos_filter_and_example_audio`, `ios-tts-eloquence-regression`, `sync-pull-pagination-fix`.

---

## 🎯 다음 세션 최우선

### 1. 열린 PR 2개 머지 (사용자 승인 대기)
| PR | 내용 | 상태 |
|---|---|---|
| **#36** `feat/partial-session-record` | 중도 이탈 세션도 복습 수 기록(useAbandonRecord 훅, 3화면 배선). 반절 보다 나가도 학습일 인정 → 스트릭 보호 | jest 448/448, 실기는 다음 빌드 |
| **#37** `fix/pos-filter-browse` | 품사 필터 2종 수정: ①검색 빈질의+칩만 탭=빈 결과(`opts.browse` 신설) ②AI 'adj/adv' 약어 미매칭(매칭 완화+프롬프트 교정) | jest 452/452, **Edge 3종 재배포 완료**, 앱 수정은 다음 빌드 |

### 2. 동음이의어 처리 — 검토 완료, 구현 대기 (사용자 "다음 세션 진행" 지시)
"사과(과일)/사과(사죄)"처럼 AI 단어 검색이 한 뜻만 채우는 문제. 검토 결론:
- **핵심 제약 사실**: 같은 단어장·같은 언어쌍에 같은 표제어 2행은 **DB 유니크 인덱스(migration 015: listId+LOWER(term)+sourceLang+targetLang)로 불가** — 별개 카드 2장 접근(C안)은 구조상 배제.
- **A안(추천 1단계, 저비용)**: 프롬프트에 "동음이의어는 대표 뜻 ①② 병기" 지시. 스키마·DB·UI 변경 0, **Edge 재배포만**(gemini-vertex.ts — BYOK 클라이언트 gemini-client.ts도 동일 지시 필요, 프롬프트 중복 동기화 교훈).
- **B안(정공법, 다음 단계)**: AI가 뜻 후보 배열 반환 → 검색 직후 선택 시트 + "모두 담기"(병기 카드 1장). add-word 내 모달 1개(중첩 모달 아님). quota 호출 1회=1단어 유지. BYOK+Edge 응답 스키마 동시 변경.
- 권장 순서: A 먼저 → B는 별도 기획.

### 3. TestFlight build 25 잔여 실기 검증
build 25 = **1.1.4 / 커밋 `8097e34`** (담긴 것: #29 동기화수정·#32·#34·#35 + 이전 머지분 전부. **#36·#37은 미포함**).

**✅ 통과 (7/9 사용자 확인):**
- TTS 로봇 음색(#33): ko→vi "사과" + 타 언어 정상 — **종결**
- 내 학습 달력·하단 시트(#34) 정상
- 단어 추가 언어 레이블(#32) 정상

**❌ 발견 → 수정됨:** 품사 필터(검색) → PR #37

**⬜ 미확인 (다음 검증 대상):**
- [ ] **재설치 동기화 E2E**(#35의 존재 이유): 로그인 상태 학습 → 홈으로 나가기(push flush) → 앱 삭제 → 재설치 → 같은 계정 로그인 → **스트릭·달력·날짜별 단어 목록 복원**
- [ ] 게스트 학습 며칠치 → 로그인 → 기록 업로드(재설치로 재확인)
- [ ] 업그레이드 설치 후 기존 데이터·스트릭 보존(migration 016→017)
- [ ] 자랑하기 공유시트 + "이미지로 저장" 사진 권한 팝업(NSPhotoLibraryAddUsageDescription)
- [ ] CSV 내보내기/가져오기(#18): 공유시트·엑셀 한글 BOM·picker 레이스
- [ ] 예문 오디오(#15): 플래시카드 버튼·오토플레이 낭독 끊김
- [ ] 단어 언어 표시(#19): 비영어 단어 편집 레이블·저장 후 TTS 유지·편집 중 "단어 검색" 오탐
- [ ] 네이버 사전(#22): vi/es 단어 N 버튼 언어쌍 연결
- [ ] AI 발음(#20): 로그인(Edge)에서 ko/vi/es 발음 표기 채워짐
- [ ] 동기화 pull(#29): 단어 많은 계정 새 기기 로그인 → 전체 도착
- [ ] 스모크: 게스트 배너 광고·세션 완주→내학습 반영·사진스캔·구독 화면

---

## ✅ 이번 세션(2026-07-09)에 끝낸 것

### PR #34 "내 학습" 달력 개편 — 머지 `9e7713e` · `project_study_streak_stats`
목업 반복으로 확정한 설계 그대로: 제목 "내 학습" 통일 · 히어로 가로 컴팩트+캐릭터 이미지(스트릭 0=기본/1+=축하 아보카도, 크림배경 512px 합성) · 타일 4(오늘/주/총 외운+학습한 날) 달력 위 · **월 달력 이진 표시**(heatmap 농도는 사용자 명시 거부) · 날짜 탭 하단 시트("복습 N · 외운 단어 N ⓘ"+그날 외운 단어 목록, **기록 불변**+"미암기" 배지, Anki revlog 방식) · ⓘ→네이티브 Alert("복습 = 이날 학습한 단어 / 외운 단어 = 이날 암기한 단어") · **migration 017 `memorized_log`**(date+wordId 참조만, 로컬 전용, INSERT OR IGNORE changes만 study_days 가산 → 요약=목록 길이 불변식).

### PR #35 통계 클라우드 동기화 — 머지 `8097e34` · Phase 3 첫 항목
- Supabase `cloud_study_days`·`cloud_memorized_log` + **merge_study_days RPC(날짜별 GREATEST)** — plain upsert LWW는 타 기기 카운트를 깎아서 금지. 클라 pull도 같은 MAX 규칙 → **dirty-skip 가드 불필요**(카운트 단조증가 불변식).
- dirtyStatDates(영속) → 기존 30초 디바운스 합류. pull은 기존 (updated_at,id) 키셋 드레인 재사용. clearAllData가 stats도 wipe(계정 격리). 첫 로그인 markAllLocalStatsDirty(전 분기).
- **마이그레이션 호스티드 적용 완료(db push)** + **서버 E2E 18/18**(admin 테스트 계정 생성→GREATEST·no-op updated_at 불변·ignoreDuplicates·PAGE=2 키셋 드레인 무유실·RLS 격리 실검증→완전 삭제. anon signUp은 이메일 확인 때문에 불가 — service_role은 CLI `supabase projects api-keys`로).

### PR #32 단어 추가 언어 레이블 — 머지 (7/8 세션분)
언어쌍 칩(한 줄+설정 중복 경로) 삭제 → 검색창 위 왼쪽 "영어 단어" 필드 제목형 레이블(아이콘 4개와 한 줄). getWordLabel 신설, 설정 모달 "단어 입력"도 통일.

### iOS build 25 — TestFlight 제출 완료
EAS production, buildNumber 25 자동증가, ASC 업로드 성공. 제출 흐름 전부 비대화식 성공(`eas build` → `eas submit --latest`).

### PR #36·#37 생성 (미머지) — 위 최우선 섹션 참조

---

## 💡 교훈 (유지)

- **iOS 버전/빌드**: production autoIncrement는 빌드번호만. TestFlight 전용 버전(1.1.4)은 같은 버전 다중 빌드 OK. 1.1.4를 App Store 심사 제출 후엔 1.1.5로. **빌드 직후 build↔커밋 기록**: build 25=`8097e34`, 24=`43ca53a`.
- **두 배포 트랙**: 앱 빌드(EAS) vs Edge 배포(`supabase functions deploy`) vs **DB 마이그레이션(`supabase db push`)** — 셋 다 별개. #37의 Edge는 배포됐지만 앱 코드는 다음 빌드.
- **서버 E2E 패턴**: 이메일 확인이 켜져 있어 anon signUp 불가 → CLI로 service_role 취득 → admin.createUser(email_confirm)→signIn→테스트→admin.deleteUser. 스크립트는 scratchpad(레포 밖).

---

## 🔮 남은 backlog

| 항목 | 트랙 | 비고 |
|---|---|---|
| #36·#37 머지 + 다음 빌드 | 앱 | 위 참조 |
| **동음이의어 A안**(프롬프트 병기) | 서버 | Edge 재배포만. BYOK gemini-client.ts도 동일 지시 |
| 동음이의어 B안(뜻 선택 UI) | 앱+서버 | 별도 기획 |
| build 25 잔여 실기 검증 | — | 위 체크리스트 |
| **마일스톤 축하 팝업**(7·30·100일) | 앱 | **사용자가 명시적으로 다음으로 미룸(7/9)** |
| 스트릭 프리즈·알림 | 앱 | Phase 3 잔여 |
| 시트→단어 상세 이동 | 앱 | 전역 Portal 도입 후 |
| 자랑하기 Android 저장 | 앱 | media-library 권한/플러그인 |
| 생성경로 responseSchema 하드닝 | 서버 | flash-lite 드문 phonetic 누락 |

---

## 참고 — 현재 상태 (2026-07-09)
- `main` HEAD `8097e34`(1.1.4). 열린 PR: **#36·#37**(둘 다 실기 검증 중 나온 개선/수정, 머지 대기).
- TestFlight: **build 25**(1.1.4, `8097e34`) 제출 완료 → https://appstoreconnect.apple.com/apps/6776714408/testflight/ios
- Supabase: stats 동기화 테이블·RPC 라이브(서버 검증 완료). Edge 3종(generate-words·enrich-word·scan-image) 7/9 재배포(#37 프롬프트 교정 포함).
- ⚠️ 로컬 앱 구동 불가(SQLite mock + OneDrive prebuild 제약) → 검증은 TestFlight로만. `env_onedrive_prebuild`.
