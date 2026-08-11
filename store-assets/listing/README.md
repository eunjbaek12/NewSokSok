# Google Play Console — 스토어 등록 텍스트

Play Console에 앱 등록할 때 입력해야 하는 텍스트들을 언어별로 정리한 폴더.

## 파일

**Play 용** — `<lang>.md`

- [`ko.md`](./ko.md) — 한국어 (기본 언어)
- [`en.md`](./en.md) — 영어
- [`ja.md`](./ja.md) · [`vi.md`](./vi.md) · [`zh.md`](./zh.md)
- [`es.md`](./es.md) — 스페인어 (`es-ES` · `es-419`, 2026-08-05 신설)
- `play-description-1.3.0/*.txt` — 실제 붙여넣은 전체 설명 스냅샷

**App Store 용** — `ios-<lang>.md`

- [`ios-ko.md`](./ios-ko.md) · [`ios-en.md`](./ios-en.md) — ASC 등록 로케일
- [`ios-es.md`](./ios-es.md) — 스페인어 (Spain · Mexico, 2026-08-05 신설)
- [`ios-ja.md`](./ios-ja.md) · [`ios-vi.md`](./ios-vi.md) · [`ios-zh.md`](./ios-zh.md) — **ASC 미등록**(원고만 있음)

**버전별**

- `release-notes-<ver>.txt` — Play 출시 노트, `<로케일>` 태그 형식 그대로 붙여넣기
- `appstore-<ver>.txt` — App Store "이번 버전의 새로운 기능" + 홍보 텍스트

> ⚠️ **같은 로케일 원고가 Play 용·iOS 용 두 벌 있다.** 문구를 바꿀 땐
> `grep -rn "<문구>" store-assets/listing/` 로 **양쪽 다** 확인할 것 — 한쪽만 고쳐서
> iOS 원고 3개에 거짓 문구가 남았던 이력이 있다(2026-08-02).

## Play Console 입력 위치

각 텍스트가 어디에 들어가는지:

| 텍스트 항목 | Play Console 경로 |
|---|---|
| 앱 이름 | 앱 상세정보 → 앱 이름 |
| 짧은 설명 | 스토어 등록정보 → 짧은 설명 |
| 전체 설명 | 스토어 등록정보 → 전체 설명 |
| 출시 노트 | 프로덕션 → 출시 만들기 → 출시 노트 |
| 카테고리·등급·광고·결제 | 앱 콘텐츠 / 등급 |

## 톤·메시지 원칙

- **핵심 메시지**: "내가 원하는 단어장은 만들고, 내가 찾던 단어장은 가져와서"
- **차별점 우선순위** (PRODUCT.md 기준):
  1. 4가지 학습 모드
  2. 학습하기 (매일 흐름)
  3. 사진·엑셀 단어 추가
  4. AI 단어 생성
  5. 단어 모음 다운
  6. 다국어 (한·영·일·중)
  7. 스킨
- **anti-references**: Duolingo식 게임화·팝업 X, 교과서 톤 X

## 변경 시

스토어 텍스트는 Play Console 업로드 후에도 언제든 수정 가능하지만, 출시 노트만은 각 빌드별로 고정됩니다.
