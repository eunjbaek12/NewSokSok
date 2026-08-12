# 1.4.0 정기 릴리스 체크리스트

기준일: 2026-08-12

## 이번 릴리스에 반드시 포함

- [x] `app.json` 마케팅 버전 1.4.0
- [x] BYOK 공통 모델 `gemini-3.5-flash-lite`
- [x] 단어 자동완성·사진 스캔·AI 단어 생성 세 경로 공통 모델 사용 보호 테스트
- [x] Play 7개 로케일 출시 노트 (`store-assets/listing/release-notes-1.4.0.txt`)
- [x] App Store 제출 문구 (`store-assets/listing/appstore-1.4.0.txt`)
- [x] BYOK 실제 키로 기기 스모크 테스트: 자동완성 3/3 성공 (2026-08-12)
- [x] BYOK 실제 키로 기기 스모크 테스트: 사진 스캔 2/2 성공 후 3번째 호출에서
  사용자 키 할당량 소진 안내 정상 노출 (2026-08-12)
- [ ] BYOK 실제 키로 기기 스모크 테스트: AI 단어 생성 — 같은 사용자 키의 할당량이
  소진되어 미실행. 다음 할당량 갱신 후 1회 성공 확인으로 마감한다.

## 제출 전 자동 검증

- [ ] `pnpm test -- __tests__/gemini-model-sync.test.ts __tests__/gemini-api.test.ts --runInBand`
- [ ] `pnpm run lint`
- [ ] `pnpm run i18n:check`
- [ ] Android production/preview 빌드에서 시작·로그인·결제 복원·광고 후 재개 확인
- [ ] iOS production/preview 빌드에서 시작·Apple/Google 로그인·결제 복원 확인
- [ ] Play 출시 노트 각 로케일 500자 이하 재확인

## Vertex 전환은 앱 릴리스와 분리

- 현재 운영 기본값: `gemini-2.5-flash-lite`
- 목표 후보: `gemini-3.1-flash-lite` (현재 Public Preview)
- 2026-10-02까지 GA 여부와 공식 가격을 다시 확인한다.
- GA면 `VERTEX_MODEL` Secret을 바꾸고 세 Edge 경로(enrich-word, generate-words,
  scan-image)를 반복 스모크 테스트한다. 앱 재배포는 필요 없다.
- 2.5 공식 은퇴일은 2026-10-16이다. 3.1이 계속 Preview면 대체 GA 모델까지 포함해
  10월 2일에 최종 결정을 내린다.

## 현재 알려진 검증 제약

- `photo-import-pipeline.test.ts`는 Jest가 `react-native` Flow 구문을 변환하지 못해 로드 단계에서
  실패한다. BYOK 모델 변경과 무관한 기존 Jest 설정 문제이며, 모델 보호 테스트와
  `gemini-api.test.ts`는 별도로 통과해야 한다.
