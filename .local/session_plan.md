# Objective
웹 프리뷰에서 "Your app encountered an error"가 계속 표시되는 문제를 디버깅하고 수정한다. 핸드폰(Expo Go)에서는 정상 작동하므로, 웹(react-native-web) 특화 런타임 에러이다.

# Context
- ErrorBoundary에 console.error 로깅을 이미 추가했지만, 워크플로우 재시작이 아직 안 되어 적용되지 않은 상태
- 직전에 ProgressBar 컴포넌트를 Reanimated `withTiming("75%")` → React Native `Animated.Value.interpolate()` 방식으로 변경함 — 이 변경이 웹에서 문제를 일으켰을 가능성 있음
- GestureHandlerRootView에 `style={{ flex: 1 }}` 추가함

# Tasks

### T001: 웹 에러 메시지 확인
- **Blocked By**: []
- **Details**:
  - Frontend 워크플로우를 재시작하여 ErrorBoundary의 console.error 로깅 적용
  - 브라우저 콘솔 로그에서 실제 에러 메시지와 스택 트레이스 확인
  - Acceptance: 에러의 정확한 원인 파악

### T002: 웹 에러 수정
- **Blocked By**: [T001]
- **Details**:
  - T001에서 확인된 에러 원인에 따라 수정
  - 가능한 원인들:
    1. ProgressBar의 `RNAnimated.Value.interpolate()` 웹 호환성 문제 → 간단한 비애니메이션 방식으로 대체
    2. `react-native-reanimated`와 `react-native` Animated API가 동일 파일에서 충돌
    3. 기타 웹 전용 런타임 에러
  - Files: `app/(tabs)/index.tsx`, 에러에 따라 추가 파일
  - Acceptance: 웹 프리뷰에서 에러 없이 정상 동작

### T003: 최종 검증
- **Blocked By**: [T002]
- **Details**:
  - 프론트엔드 재시작 후 웹 콘솔에 에러 없는지 확인
  - 핸드폰(Expo Go) 번들링도 정상인지 확인
  - Acceptance: 웹과 모바일 모두 에러 없이 정상 작동
