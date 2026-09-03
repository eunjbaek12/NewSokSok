/**
 * 겹침 판정이 실패한 자리에 붙이는 **사람 판정**. 덱을 가리지 않는다.
 *
 * (2026-08-20 에 사다리 4덱 전용에서 전 덱 공용으로 넓혔다. 같은 결함이 사다리
 *  밖에도 있었다 — 실사용 덱 실측 100장: 수능 빈칸 41 · TOPIK 11 · 사극 18 등.)
 *
 * 왜 목록이 필요한가: `overlapsDeckMeaning` 은 덱 뜻(영어)과 캐시 뜻(영어)을 **문자열로**
 * 비교한다. 그래서 같은 단어를 다른 영어로 쓴 것(감독 = supervision vs Director)까지
 * "다른 단어"로 판정해 뜻풀이를 버렸다. 반대로 진짜 동음이의(개 = dog vs 접두사 '개-')도
 * 같은 자리에 섞여 있어, 형태로는 둘을 가를 수 없다. 그래서 72건을 사람이 한 번 갈랐다.
 *
 * 판정 근거: 각 단어의 캐시 뜻풀이 전문을 읽고 "이 한국어 설명이 덱의 영어 뜻과 같은
 * 단어를 설명하는가"로 갈랐다(2026-08-19, `docs/ko-ladder-sense-review.md`).
 * 확정 후 뜻풀이만 블라인드로 역추론시켜 교차 검증했고, 동음이의 오탐은 0건이었다.
 * 2026-08-20 2차: 캐시 재생성 뒤 남은 10건을 같은 기준으로 갈랐다(채움 4 · 비움 6).
 * 이 10건은 한때 "원인 미해명"으로 적어 뒀던 것인데, 값을 찍어 보니 outcome 이 전부
 * senses-skipped-nooverlap 이었다 — **별도 원인은 없었고 처음 72건과 같은 실패**다.
 * 대표 사례 `일월`: 덱 "January" · 캐시 "The first month of the year (January)". 괄호를
 * 떼고 나면 겹치는 낱말이 하나도 없다.
 *
 * 🔴 이 목록은 **뜻풀이가 이 단어를 설명하는가**만 판정한다. 뜻풀이의 품질(탈자·중복·
 *    부실)은 별개 문제다. 그런 이유로 blank 에 넣었다면 캐시를 고친 뒤 fill 로 옮겨야
 *    한다 — 옮기지 않으면 영영 빈칸으로 남는다.
 *
 * 🔴 blank 는 "손대지 않는다"가 아니라 **비운다**이다. 그중 여럿은 definition
 *    자리에 영어 뜻이 복사돼 있어 카드에 영어가 두 번 뜬다(레딧 제보 ④). 지워야 한다.
 */
export type DefinitionDecision = 'fill' | 'blank';

/** 채운다 — 캐시가 같은 단어를 설명하고 있다. */
const FILL: Record<string, string> = {
  // ── 한국어 학습 사다리 4덱 (2026-08-19 · 20 판정) ──
  'curated-ko-basic-1': '물 손 나라 눈물 쓰레기 그릇 교회 셋 일월 댁 여보세요',
  'curated-ko-intermediate-1': '점 대통령 감독 엄청나다 놀이 사물 바닥',
  'curated-ko-intermediate-2': '고모 고생 아이고 형제 콩 스타일 이동 굳이 여보 며느리 서류 쥐 통장 장 끓다',
  'curated-ko-advanced-1': '이어 실시 민간 제사 심장 추진 떼 특수 아유 완전 욕 상당 차림 잦다 건조 별도 도덕',

  // ── 실사용 덱 (2026-08-20). 임포트 실적이 있는 덱부터 결함 100장을 전량 읽고 갈랐다.
  //    ko>en 은 덱 뜻과 캐시 뜻이 둘 다 영어인데도 표현이 달라 겹침이 실패한다:
  //    삼촌 덱="uncle (father's brother)" 캐시="father's brother" — 괄호를 떼면 `uncle` 만
  //    남는다. 색깔은 덱이 영국식 `colour`, 캐시가 `color` 라서 갈렸다.
  'curated-topik1-ko-1': '자매 삼촌 고모 코트 색깔 여보세요',
  'curated-topik2-ko-1': '박사 추진 바닥 점',
  'curated-saguk-ko-1': '전하 마마 대감 영감 나리 대제학',
  'curated-krslang-ko-1': '미쳤다 ㄹㅇ 무야호',
  'curated-mimetic-ko-1': '콩닥콩닥 안절부절 히죽히죽 살금살금 울렁울렁 쾅',
  'curated-untrans-ko-1': '능청스럽다 눈도장',
  'curated-market-ko-1': '시장 국산',
  'curated-convenience-ko-1': '포장',
  'curated-hiking-ko-1': '내리막',

  // ── 주제·상황 5덱 (2026-09-03 시딩). 캐시가 같은 단어를 설명하는데 덱 뜻(영어)과
  //    표현이 달라 겹침이 실패했다: `승리` 덱="a win" 캐시="Victory in a contest or conflict".
  'curated-sports-ko-1': '승리',

  // ── 경조사·관광 2덱 (2026-09-03 시딩). 다섯 다 캐시가 **맞는 뜻을 갖고 있는데**
  //    덱 뜻(영어)과 표현이 달라 겹침이 실패했다. 비우면 멀쩡한 뜻풀이를 버리게 된다:
  //      문상 덱="condolence visit" 캐시="부고를 듣고 찾아가서 위문하는 일"
  //      조의 덱="condolences"       캐시="죽었을 때 슬퍼하며 보내는 뜻"
  //      탑   덱="a pagoda"          캐시="높이 솟아 있는 구조물"
  'curated-ceremony-ko-1': '문상 조의 제사',
  'curated-sightseeing-ko-1': '탑 일정',

  // 수능 필수 500 (en>ko) — 이 41개는 definition 이 **빈칸**이었다. 캐시엔 뜻풀이가
  // 멀쩡히 있는데(캐시 없음 0) 한국어 표현 차이로 겹침이 실패했다: `pitch` 덱="던지다"
  // 캐시="던지기" · `resign` 덱="사임하다" 캐시="직책을 그만두다".
  // 🔑 41개를 전량 읽었다 — 캐시 뜻은 동음이의가 아니라 **그 단어의 다의어**다. 한자어
  //    동음이의를 걱정해 최상위 definition 을 막아 둔 규칙은 영어 표제어에는 해당하지 않는다.
  // 🔴 다만 처음에 41개를 전부 fill 로 넣은 것은 **38/41 만 맞았다.** 다의어인지만 보고
  //    **품사가 맞는지는 안 봤다** — reverse·bar·object 는 아래 BLANK 로 옮겼다.
  'curated-suneung-1': [
    'pitch resign brew constrain dread fond fuse glare incline',
    'intrigue nanny ounce pinch pope preach rally roar shield simulate',
    'slaughter pause notice fit direct challenge pull shall beyond',
    'network match associate pattern author screen purchase content',
    'element complex',
  ].join(' '),
};

/**
 * 비운다 — 캐시가 **다른 단어**를 설명하고 있거나, 뜻 하나는 맞지만 나머지가 지어낸 것이다.
 *
 * 2026-08-20 2차에서 뺀 여섯은 뒤엣것이 많다 — ①은 맞는데 ②③이 없는 뜻이다.
 *   춤   ② "Figurative use (e.g., 'dance of fate')" — 뜻 칸에 뜻이 아니라 분류 이름이 있다
 *   거   ②③ "'가지다'·'가다'의 어근" — 거는 그 둘의 어근이 아니다
 *   저희 ①② 글자까지 같은 중복
 *   음   ① "뜻을 분명하게 나타내기 위하여 덧붙이는 소리" — 감탄사 음의 뜻이 아니다
 *   수석 ② "벼슬의 이름" · 채 ② "얇고 넓은 물건을 세는 단위" — 근거 없음
 *
 * 🔴 춤 ② 는 개별 사고가 아니라 유형이다. 뜻이 하나뿐인 단어에 모델이 "비유"라는 이름의
 *    두 번째 뜻을 만들어 낸다(가게 = basis, 식사 = effort, 부엌 = center of activity).
 *    전체 덱 기준 68장이 이 상태로 카드에 나간다. 별건으로 다룰 것 — 진짜 비유(바다·눈물·
 *    딸)가 섞여 있어 일괄 삭제는 안 된다. 캐시를 고치면 춤은 fill 로 돌아온다.
 *
 * 2026-08-20: 뜻풀이가 깨져서 잠시 여기 있던 넷(셋·장·별도·도덕)은 캐시를 재생성해
 * 고친 뒤 fill 로 옮겼다. 뜻풀이 품질 때문에 blank 로 두는 항목이 다시 생기면 **왜
 * 뺐는지와 함께** 적을 것 — 이유가 없으면 캐시가 고쳐져도 아무도 되돌리지 않는다.
 */
const BLANK: Record<string, string> = {
  // ── 한국어 학습 사다리 4덱 ──
  // `안다`(hug) 캐시는 `알다`(know) 를 설명한다. `공식`(formula) 캐시엔 수학 공식 뜻이
  // 없고, `젓다`(stir) 캐시는 동사가 아니라 **젓가락·숟가락**을 설명한다 — 뒤의 둘은
  // 2026-08-20 에 "판정 목록에 없어 조용히 빈칸이던 2건"으로 드러나 여기 넣었다.
  'curated-ko-basic-1': '개 화 어 딸 춤 거 안다',
  'curated-ko-intermediate-1': '미 한 자 양 폭 남 고개 세기 군 저희 음 삼다',
  'curated-ko-intermediate-2': '적 들 통 탑 젓다',
  'curated-ko-advanced-1': '모 대기 인 가구 짜다 에 천 성명 품 수석 채 공식',

  // ── 실사용 덱 (2026-08-20) ──
  // 사극 12건은 전부 **캐시가 다른 한자어를 설명**한다. 사극 용어는 빈도가 낮아
  // 캐시가 흔한 동음이의로 채워져 있다: 신=神(臣 아님) · 짐=화물(朕 아님) ·
  // 기생=寄生(妓生 아님) · 대비=對比 · 대군=大軍 · 나인=숫자 9 · 주리=팔다리.
  // kpop 4건은 아이돌 은어인데 캐시가 일반어로 안다(영업=상거래 · 떡밥=낚시 미끼).
  // 한=韓(恨 아님) · 넘어와 運命 은 ko>ko / ja>ko 라 뜻과 정의가 애초에 같은 문장이다.
  // TMT·오저치고는 캐시 자체가 없어 채울 수단이 없다 — 비워서 중복만 없앤다.
  // 수능 3장은 캐시가 이 단어를 알긴 하는데 **품사가 어긋나** 덱이 가르치는 뜻이 없다:
  // bar 덱="막다, 금지하다"(동사) ↔ 캐시 ①막대기 ②바 카운터 ③술집(전부 명사).
  // object("반대하다" ↔ 사물/대상/목표) · reverse("역전시키다" ↔ 반대 방향/좌절/동전 뒷면)
  // 도 같다. 채우면 정의 줄이 통째로 딴소리가 되므로 비운다.
  // 🔑 캐시에 동사 뜻이 생기면 fill 로 되돌릴 것.
  'curated-suneung-1': 'reverse bar object',
  'curated-topik2-ko-1': '미',
  'curated-saguk-ko-1': '대비 대군 판서 포도대장 나인 신 짐 어가 반정 밀지 주리 기생',
  'curated-krslang-ko-1': 'TMT 오저치고 만반잘부',
  'curated-kpop-ko-1': '영업 정규 솔로 떡밥 단콘',
  'curated-untrans-ko-1': '한',
  'curated-spelling-ko-1': '넘어',
  'curated-jp-advanced-1': '運命',

  // ── 주제·상황 5덱 (2026-09-03 시딩 검증에서 드러났다) ──
  // 앞의 셋은 **캐시가 다른 한자어를 설명**한다 — 사극 신/짐과 같은 유형이다.
  //   면 덱=noodles(麵) ↔ 캐시 ①얼굴 ②겉으로 드러난 부분 ③한쪽 면(面)
  //   골 덱=a goal(축구) ↔ 캐시 ①몸을 이루는 단단한 부분 ②중심이 되는 부분(骨)
  //   맛없다 — 캐시에 뜻풀이도 senses 도 없다(빈 문자열). 채울 수단이 없어 중복만 없앤다.
  // 뒤의 셋은 **순환 정의**라 정보가 0이다. 캐시를 고치면 fill 로 되돌릴 것:
  //   복숭아 = "① 털이 있는 복숭아 ② 털이 없는 복숭아"
  //   시다   = "① 맛이 매우 시다"
  //   김치   = "① 고춧가루를 넣은 김치 ② 젓갈을 넣지 않고 담근 김치" — 김치를 김치로 설명한다
  // 🔑 비우지 않으면 definition 자리에 덱 뜻(영어)이 그대로 남아 카드에 영어가 두 번 뜬다.
  'curated-food-ko-1': '면 맛없다 김치 시다',
  'curated-sports-ko-1': '골',
  'curated-produce-ko-1': '복숭아',

  // 상주 — 캐시가 **다른 두 한자어**를 설명한다: ①경상북도 尙州(지명) ②常住(계속 머묾).
  // 덱이 가르치는 喪主(상제)는 캐시에 아예 없다. 사극 신(神/臣)과 같은 유형이다.
  'curated-ceremony-ko-1': '상주',

  // 역사 — 캐시는 이 단어를 맞게 설명하는데도 blank 다. 뜻 둘이 다 sense-drops 에 걸려
  // (drop=[1,2] · 둘 다 덱 뜻 history 와 같은 말) senses-all-dropped 로 캐시를 통째로 못
  // 쓰고, 그러면 definition 자리에 덱 뜻 "history" 가 영어 그대로 남는다. 위 주석의
  // '아래 셋'과 같은 자리이므로 같은 처방을 한다 — 중복이라도 지우려고 비운다.
  // 🔑 sense-drops 가 고쳐지면 fill 로 되돌릴 것.
  'curated-sightseeing-ko-1': '역사',

  // 🔴 아래 셋은 **캐시가 이 단어를 맞게 설명하는데도** blank 다. 뜻이 전부
  //    `sense-drops` 에 걸려(drop=[1,2]) `senses-all-dropped` 로 캐시를 통째로 못 쓴다.
  //    fill 로 적어 두면 아무 일도 일어나지 않고 복사본만 남으므로, 중복이라도
  //    지우려고 blank 로 둔다. 셋 다 캐시 ①② 가 사실상 같은 문장이라 걸린 것이다.
  //    🔑 sense-drops 가 고쳐지면 **fill 로 되돌릴 것** — 안 되돌리면 영영 빈칸이다.
};

function toMap(src: Record<string, string>, value: DefinitionDecision): Map<string, DefinitionDecision> {
  const m = new Map<string, DefinitionDecision>();
  for (const [deckId, terms] of Object.entries(src)) {
    for (const t of terms.split(' ')) m.set(`${deckId}\t${t}`, value);
  }
  return m;
}

const DECISIONS = new Map<string, DefinitionDecision>([
  ...toMap(FILL, 'fill'),
  ...toMap(BLANK, 'blank'),
]);

/** 이 덱·이 단어에 사람이 내린 판정. 목록에 없으면 undefined — 기존 규칙대로 간다. */
export function definitionDecision(deckId: string, term: string): DefinitionDecision | undefined {
  return DECISIONS.get(`${deckId}\t${term}`);
}

/** 테스트·보고용 집계. */
export function decisionCounts(): { fill: number; blank: number } {
  let fill = 0, blank = 0;
  for (const v of DECISIONS.values()) v === 'fill' ? fill++ : blank++;
  return { fill, blank };
}
