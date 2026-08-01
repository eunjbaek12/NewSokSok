# 기존 큐레이션 덱 로마자·예문 정리 (인계)

작성 2026-08-01. **아직 착수하지 않은 작업**이다.

## 왜 생겼나

ko→en 덱 4개(의성어 100·Untranslatable 50·편의점 50·TOPIK I 350)를 만들면서 로마자 오류를
전부 사람이 눈으로 잡았고, 그마저 놓치는 게 있었다. 그래서 자동 검수 인프라를 세웠다
(`scripts/lib/romanize.ts`, `scripts/lib/ko-deck-checks.ts`, 커밋 `ad6eebe`).

그 검증기를 **이미 출시된 덱에 돌렸더니 확실한 문제가 111건** 나왔다. 새로 만든 4개 덱은
0건이지만 기존 덱은 손대지 않았다 — 이 문서가 그 남은 작업이다.

## 지금 상태 확인

```bash
pnpm run diagnose:decks                 # ko→en 13개 덱 전체
pnpm run diagnose:decks --deck=ko-basic # 덱 하나만
```

`⚠️`가 확실한 문제, `📋`는 오탐일 수 있어 사람이 판단할 항목이다.

## 무엇이 남았나 (111건)

| 유형 | 건수 | 성격 |
|---|---|---|
| 로마자 | 106 | 대부분 기계적 수정 가능 |
| 당신 | 2 | 예문을 다시 써야 함 |
| 예문 중복 | 3 | 한쪽을 다시 써야 함 |

덱별 합계: Advanced Korean 500 **35** / Intermediate 500 **19** / Gen-Z Slang 100 **16** /
Basic 500 **14** / Sageuk 100 **13** / K-Pop Slang 100 **10** / Clinic 2 · Hiking 1 · Market 1.

### 로마자 — 유형별 판단

**A. 순수 오타 (그냥 고치면 된다)**
`이해하다` ihaeha**na**da → ihaehada · `알아보다` arabo**a**da → araboda · `기술` gisu**re** → gisul ·
`대제학` daejeha**gi** → daejehak · `제조상궁` jejosa**u**ngung → jejosanggung · `현감` hyeo**g**am → hyeo**ng**am ·
`타이틀곡` taiteulgo**n** → taiteulgok · `작용` ja-gyeo**ng** → jagyong

**B. 음운 변화 미반영 (변환기 결과가 맞다)**
비음화 `학년` haknyeon → hang**n**yeon, `덕메` deokme → deo**ngm**e, `컴백무대` → keomba**engm**udae ·
유음화 `관리` gwanri → gwa**ll**i, `만렙` manrep → ma**ll**ep, `언론` eon-ron → eo**ll**on ·
연음 `과몰입` gwamollip → gwamo**r**ip, `살아가다` salagada → sa**r**agada, `벌이다` → beo**r**ida ·
격음화 `많다` manhta → manta, `좋다` johda → jota

**C. 된소리를 표기해 버린 것 (개정 로마자는 된소리되기를 적지 않는다)**
`활동` hwal**tt**ong → hwaldong · `앉다` an**tt**a → anda · `맡다` ma**tt**a → matda · `미쳤다` michyeo**tt**a → michyeotda

**D. 자모 매핑 오류**
`띵작` **dd**ingjak → **tt**ingjak (ㄸ=tt) · `직캠` jik**c**aem → jik**k**aem (c는 개정 로마자에 없다) ·
`워라밸` worab**e**l → worab**ae**l (ㅐ=ae) · `농업` nong**u**p → nong**eo**p (ㅓ=eo) · `모쏠` mo**ls**ol → mo**ss**ol

**E. ⚠️ 오탐 — 고치지 말 것**
`알약` allyak, `물약` mullyak은 **현재 값이 맞다**. 합성어 ㄴ첨가로 [알략]·[물략]으로 소리 나는데
변환기가 ㄴ첨가를 구현하지 않아 aryak·muryak을 기대한다. 같은 이유로 `색연필`·`담요` 류가
앞으로도 걸릴 수 있다. (ㄴ첨가는 합성어 경계를 알아야 해서 자동 판정이 어렵다 — 구현한다면
사전 기반 예외 목록이 현실적이다.)

**F. 판단 필요 — 사극 덱의 문장형 표제어**
`성은이 망극하옵니다` = `seong-eun-i mang-geuk-ha-op-ni-da` 처럼 형태소마다 붙임표를 넣은 표기가
13건 중 상당수다. 학습자가 끊어 읽게 한 의도적 선택으로 보이므로 **표기 정책을 먼저 정할 것**.
다만 `-ni-da`는 실제로 [ㅁ니다]라 발음과 어긋나는 문제는 따로 있다.

### 당신 2건 (예문 재작성 필요)

- `Basic Korean 500` / **언제** — "당신은 언제 한국에 왔어요?"
- `Intermediate Korean 500` / **어울리다** — "그 옷은 당신에게 아주 잘 어울리니까 꼭 사세요!"

한국어는 2인칭 대명사를 이렇게 쓰지 않는다. 주어를 빼거나("언제 한국에 오셨어요?") 이름+씨로 바꾼다.
※ Intermediate 덱에는 표제어가 `당신`인 카드가 따로 있는데 그건 정상이라 검사에서 제외해 두었다.

### 예문 중복 3건 (한쪽 재작성)

- `발전` / `발전하다` — "한국은 짧은 시간 안에 경제적으로 크게 발전했습니다."
- `시간` / `지금` — "지금 몇 시예요?"
- `타다` / `버스` — "버스를 타고 학교에 가요."

## 진행 순서 제안

1. **C·D 유형부터** — 규칙이 명확해 일괄 수정이 가능하고 건수도 많다.
2. **A(오타)** — 눈으로 확인하며 고친다.
3. **B(음운)** — 변환기 기대값을 그대로 쓰되, E 유형(ㄴ첨가)인지만 확인한다.
4. **당신 2건·예문 중복 3건** — 문장을 새로 쓴다.
5. **F(사극 문장형)** — 표기 정책 결정이 먼저다. 미루어도 무방하다.

수정 대상은 **두 곳을 함께** 고쳐야 한다:
`scripts/<deck>-translated.json` 의 `romaja` 와 `constants/curationData.ts` 의 `phonetic`.
(이번에 쓴 방식: 두 파일을 같은 목록으로 치환하고 `pnpm run diagnose:decks`로 0건 확인)

끝나면 `pnpm test __tests__/romanize.test.ts`와 `pnpm run diagnose:decks`를 돌려 확인한다.

## ⚠️ 브랜치 주의

검수 인프라 커밋 `ad6eebe`는 **`feat/curation-meaning-lang`** 에 있다. 덱 4개를 추가한 커밋
(`a1d5db2`·`602c4da`·`b33b5ee`·`1bda712`)은 `feat/i18n-locale-groundwork` 에 있다. 작업 중 다른
세션이 브랜치를 만들어 전환한 결과로, 두 브랜치는 갈라진 게 아니라 일직선이다. 어느 쪽에서
이어갈지 먼저 확인할 것.
