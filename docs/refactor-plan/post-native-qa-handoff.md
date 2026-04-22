# Native QA 후속 핸드오프

> 작성일: 2026-04-22
> 기준 커밋: `915ee46` (main)
> 이전 문서: `post-merge-followup.md`

---

## 이번 세션 완료 항목

| 항목 | 결과 |
|---|---|
| Require cycle (vocab ↔ sync) | ✅ 해소 |
| Supabase db:push | ✅ 이미 동기 상태 확인 |
| 문서 archive 정리 | ✅ |
| Dead code 삭제 (btnApply, toast 등) | ✅ |
| 네이티브 검증 2.1/2.2/2.4/2.5 (Android, 게스트) | ✅ PASS |
| 학습 설정 모달 닫기 버튼 가시성 | ✅ 수정 |
| segmented control 불필요 divider 제거 | ✅ |
| 단어 삭제 Alert 문구 단순화 | ✅ |
| ModalPicker footer 상단 이동 + 스타일 정리 | ✅ |
| "새 단어장 만들기" 중복 "+" 제거 | ✅ |

---

## 남은 작업

### 1. Sync push/pull 검증 (2.3) — Google 로그인 필요

**조건**: Google 계정으로 로그인 + 기기 2대 (또는 에뮬레이터 + 실기기)

**검증 시나리오**:
- Google 로그인 → 단어장/단어 생성/수정/삭제 → `POST /api/sync/push` 호출 여부 확인 (debounce 2초 후)
- 다른 기기에서 동일 Google 계정 로그인 → `GET /api/sync/pull` 증분 로드 확인
- **특히 주의**: `features/sync/first-login.ts` — 로컬에 데이터가 있는 상태에서 첫 Google 로그인 시 로컬 id 전수 remap + dirty flush. 중복/손실 없는지 확인.

**관련 파일**: `features/sync/engine.ts`, `features/sync/first-login.ts`

---

### 2. Shadow* / pointerEvents deprecation 정리 — 별도 PR

**우선순위**: 낮음 (경고만, 동작 정상)

#### 2.1 `shadow*` props (~30개 파일)
```
React Native Web 경고: "shadow*" style props are deprecated. Use "boxShadow".
```
- `shadowOffset` / `shadowOpacity` / `shadowRadius` → `boxShadow: '0 4px 8px rgba(0,0,0,0.2)'`
- 네이티브는 `shadow*` 유지, 웹은 `boxShadow` — `Platform.select` 래핑 필요할 수 있음
- 범위 파악:
  ```bash
  grep -r "shadowOffset\|shadowOpacity\|shadowRadius" --include="*.tsx" --include="*.ts" -l
  ```

#### 2.2 `pointerEvents` prop
```
React Native Web 경고: props.pointerEvents is deprecated. Use style.pointerEvents.
```
- `pointerEvents="box-none"` → `style={{ pointerEvents: 'box-none' }}`
- 주요 사용처: `features/study/components/BatchResultOverlay.tsx`, `app/list/[id].tsx`

**작업 방식**: 새 브랜치(`chore/deprecation-cleanup`) → PR.

---

### 3. ModalPicker 키보드 회피 인프라 — 추후 재사용 참고

이번 세션에서 추가한 `avoidKeyboard` prop이 `ModalOverlay` / `DialogModal`에 있음.
현재 ModalPicker에서는 footer 상단 이동으로 문제가 자연 해결돼 `avoidKeyboard={false}`.

TextInput이 모달 하단에 위치해야 하는 새 모달이 생기면 `avoidKeyboard={true}` 활성화.
- `ModalOverlay`: `KeyboardAvoidingView` 래핑 (iOS: `'padding'`, Android: `'height'`)
- 단, Android transparent Modal에서는 효과가 제한적 — 근본 해결은 `softwareKeyboardLayoutMode: "resize"` (app.json, 네이티브 리빌드 필요)

---

## 참고

- 이번 세션 수정 커밋: `7d9a376`, `915ee46` (main)
- 네이티브 검증 체크리스트: `docs/refactor-plan/post-refactor-test-plan.md`
- 리팩터 전체 이력: `docs/refactor-plan/archive/handoff.md`
