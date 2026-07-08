# 다음 세션 handoff

작성: 2026-07-08 (심야 세션 갱신 → 7/8 저녁 세션 추가 갱신) · 대상: 다음 작업 세션 시작 시

심야 세션에서 **5개 PR 머지(#21~#25)** + **iOS TestFlight 빌드 2회(build 23·24)**, 이어진 저녁 세션에서 **3개 PR 추가 머지(#27 문서정리 · #28 개발자섹션 숨김 · #29 동기화 유실 수정)**.
`main` HEAD `4b0b048`, 버전 **1.1.4**, 열린 PR 없음. jest 429/429.

연속성 메모리: `sync-pull-pagination-fix`, `project_study_streak_stats`, `project_naver_dict_language_pairs`, `project_word_language_display_fix`, `project_phonetic_target_independent`.

---

## 🚨 신규 (7/8 저녁) — 동기화 pull 1000행 잘림 유실 수정 머지 (#29, `4b0b048`)

**실사용자 신고**("다른 기기 로그인하면 단어장은 보이는데 단어 사라짐") 근본 원인 수정. PostgREST가 응답을 1000행에서 조용히 잘랐고, 워터마크 점프로 잘린 단어가 영구 스킵되던 것. (updated_at, id) 키셋 페이지네이션(페이지 500) + 빈 배치 워터마크 유지 + push 워터마크 점프 제거 + pull dirty-skip 가드. 상세는 PR #29 본문·메모리 `sync-pull-pagination-fix`.

- [ ] **다음 앱 빌드에 포함 필수** — build 24(`43ca53a`)엔 미포함. 엔진은 앱 코드라 빌드로만 기기 반영.
- [ ] 빌드 후 실기 E2E: 1000+ 단어 계정으로 **새 기기(또는 재설치) 로그인 → 전체 단어 도착** 확인.
- [ ] **증상 겪은 사용자 복구 안내 = 로그아웃→재로그인(또는 재설치)**. 워터마크가 유실분을 지나쳐 있어 앱 업데이트만으론 복구 안 됨.

같이 머지: **#28** 설정 '개발자' 섹션(온보딩 다시 보기) `__DEV__` 게이트 — 프로덕션에서 숨김(다음 빌드에서 실기 확인). **#27** 종료된 핸드오프 문서 12개 삭제.

---

## 🎯 다음 세션 0순위 — TestFlight build 24 실기 검증

**1.1.4 / build 24**(커밋 `43ca53a`)가 TestFlight 처리 중. 이번 세션에 머지한 **4개 기능이 처음 실기로 들어감** — 전부 로컬/jest 구동 불가라 미검증 상태다. 스토어 프로덕션엔 안 나갔으니 라이브 영향 0.

### ⭐ 자랑하기 (공유 카드, Phase 2 — 이번 빌드에 처음) `project_study_streak_stats`
- [ ] 설정 "내 학습" → 통계 화면 → "자랑하기" → **공유 시트** 뜸(카톡·인스타 등)
- [ ] 공유 이미지에 🥑아보카도·🔥연속일·외운 단어·앱명·URL 선명(1080²), 폰트·아보카도 렌더 정상
- [ ] "이미지로 저장" → 사진 권한 팝업 1회 → 갤러리 저장됨 / 거부 시 안내 문구
- [ ] 연속일 0일이어도 카드 정상, 중복 탭 시 로딩 가드
- [ ] 웹에서는 버튼 눌러도 크래시 없음(미지원 안내)

### 학습 스트릭·통계 (Phase 1) `project_study_streak_stats`
- [ ] 학습 세션(플래시/퀴즈/예문) 완료 → 설정 "내 학습" 🔥 +1, `/stats` 주간 스트립 오늘 칸 채워짐
- [ ] 단어장 상세 "외움" 체크(세션 없이)도 그날 학습일 기록
- [ ] 자정 넘겨 이틀 미학습 → 스트릭 0으로 끊김 / 어제까지면 유지
- [ ] 설정 스트립 수치 = `/stats` 수치 일치, 타일(총 외운·이번 주·이번 달·학습한 날) 정확
- [ ] 오늘의 명언 매일 교체·하루 고정·UI 언어 따라 ko/en

### 검색 필터 칩 (#21)
- [ ] 상태(전체/미암기/암기)·별표·품사·단어장·태그 칩, 필터만으로도 브라우징
- [ ] 태그 단일 선택(재탭 해제), 영어→영어 등 같은 언어쌍 정상

### 네이버 사전 언어쌍 (#22) `project_naver_dict_language_pairs`
- [ ] 비영어(일/중/베/스 등) 단어의 N 버튼이 **맞는 언어쌍 사전**으로 연결(영한 폴백 아님)
- [ ] add-word·WordDetailModal 양쪽

---

## ✅ AI 발음 Edge 재배포 — 완료 (7/8 저녁)

**PR #20(발음 표기 규칙)** 의 Edge Function 코드를 서버에 배포 완료: `supabase functions deploy generate-words` + `enrich-word` 둘 다 성공(Avocado 프로젝트). 로그인 사용자의 AI 생성/검색 발음이 새 규칙(ko=로마자, es/vi=IPA)으로 동작한다.

남은 확인(기기): 한/베/스 AI 생성 발음 채워지는지, 생성·검색 발음 통일. `project_phonetic_target_independent`.

> ⚠️ 두 배포 트랙 구분: **앱 빌드**(폰에서 도는 코드, EAS) vs **Edge 배포**(Supabase 서버, `supabase functions deploy`). 발음은 서버 트랙이라 이번 빌드들과 별개.

---

## ✅ 이번 세션(2026-07-08 심야)에 끝낸 것

### PR #21 검색 필터 칩 — 머지 `558c11f`
- 검색 모달(홈·단어장 공용)에 **상태(전체/미암기/암기)·별표·품사·단어장·태그** 필터 칩. 별표(즐겨찾기)와 암기(진행도)를 **별개 축**으로 분리(단어장 상세와 동일 어휘). `lib/search.ts`에 status/tag 선택 인자 추가(기존 시그니처 보존), 무질의 브라우징 확장. jest +9.

### PR #22 네이버 사전 언어쌍 — 머지 `41def55` · `project_naver_dict_language_pairs`
- N 버튼·WordDetailModal이 6쌍 외 영한 폴백이던 것을 `getNaverDictUrl` 단일 함수로 **36쌍 전부** 연결.

### PR #23 학습 스트릭·통계 Phase 1 — 머지 `80655c9` · `project_study_streak_stats`
- migration 016 `study_days`(하루 1행, 기기 로컬 자정 경계) + `features/stats`(date·streak·quotes·db·useStats) + 기록 훅 2곳(세션완료 study-results / 미암기→암기 전환) + 설정 "내 학습" 스트립 + `/stats` 화면(스트릭·주간·타일·명언). 로컬 전용. jest +29.

### PR #25 자랑하기 카드 Phase 2 — 머지 `43ca53a` · `project_study_streak_stats`
- 정사각 1:1 카드 캡처(`react-native-view-shot`) → `expo-sharing` 공유 / `expo-media-library` 갤러리 저장(add-only 권한). `ShareCard.tsx`(Colors.light 고정 브랜드 룩)·`share.ts`. app.json `NSPhotoLibraryAddUsageDescription`. deps는 OneDrive ENOENT로 package.json 편집+`pnpm install` 보정.

### PR #24 버전 1.1.3 → 1.1.4 — 머지 `593dcf3`
- iOS 빌드 제출용 버전 상향(아래 교훈 참조).

### iOS 빌드 2회 (EAS, `production` 프로필 autoIncrement)
| build | 버전 | 담긴 것 | 결과 |
|---|---|---|---|
| 23 | 1.1.4 | #21·#22·#23 | TestFlight 업로드 성공 |
| 24 | 1.1.4 | + #25 자랑하기 | TestFlight 업로드 성공(`43ca53a`) |

---

## 💡 교훈 — iOS 버전/빌드 번호 (중요)

- `eas.json` production은 `autoIncrement: true` → **빌드 번호(CFBundleVersion)만** 자동 증가. **마케팅 버전(expo.version)은 안 올라감**.
- **App Store에 이미 제출/출시된 버전(1.1.3)** 으로는 새 빌드 제출 불가 → EAS submit이 "You've already submitted this version" 에러. 이때만 `app.json` expo.version을 올려야 함(1.1.3→1.1.4).
- **TestFlight 전용 버전**(1.1.4처럼 심사 제출 안 한 버전)은 같은 버전에 **여러 빌드 허용**(build 23·24…) → 버전 안 올려도 됨.
- 즉 다음 iOS 빌드: 1.1.4를 **App Store 심사에 제출하기 전까지는** 버전 안 올리고 계속 빌드 가능. 심사 제출 후 새 기능 빌드는 1.1.5로.
- ⚠️ 빌드 직후 **build번호↔커밋** 즉시 기록: build 23·24 = `43ca53a`(24), 23은 `593dcf3`+#25 미포함.

---

## 🔮 남은 개발 backlog

| 항목 | 트랙 | 빌드 | 비고 |
|---|---|---|---|
| TestFlight build 24 실기 검증 | — | (완료) | **0순위**, 위 체크리스트 |
| ~~AI 발음 Edge 재배포(#20)~~ | 서버 | — | ✅ 7/8 저녁 배포 완료, 실기 확인만 남음 |
| **동기화 유실 수정(#29) 빌드 반영+실기 E2E** | 앱 | ✅ | 위 신규 섹션. 피해 사용자 재로그인 안내 |
| 개발자 섹션 숨김(#28) 실기 확인 | 앱 | ✅ | 프로덕션 빌드에서 설정 탭 '개발자' 미노출 |
| **스트릭 Phase 3** | 앱+서버 | ✅ | 클라우드 동기화(cloud_study_days, RLS·날짜별 max 병합)·캘린더 히트맵·**마일스톤 자동 축하 팝업**(7·30·100일, 중복방지)·스트릭 프리즈·알림 |
| 자랑하기 Android 저장 | 앱 | ✅ | media-library 권한/플러그인 추가 필요(Phase 2는 iOS 타깃) |
| 생성경로 responseSchema 하드닝 | 서버 | 부분 | flash-lite 드문 phonetic 누락 |
| 정적 ES덱 발음 정합 | 데이터 | — | 새 IPA 규칙과 어긋남(재생성 별도 결정) |

---

## 참고 — 현재 상태 (2026-07-08 저녁)
- `main` HEAD `4b0b048`, 버전 1.1.4, 원격 동기화됨.
- 열린 PR: **없음**(#21~#25·#27~#29 전부 머지, 브랜치 정리 완료).
- TestFlight: **build 24**(1.1.4) Apple 처리 중 → https://appstoreconnect.apple.com/apps/6776714408/testflight/ios
- ⚠️ 이번 세션 머지분 다수 실기 미검증 — 스토어 프로덕션엔 안 나감(TestFlight만). 문제 시 해당 머지 `git revert`.
- ⚠️ 로컬 앱 구동 불가(SQLite mock + OneDrive prebuild 제약) → 검증은 TestFlight로만. `env_onedrive_prebuild`.
