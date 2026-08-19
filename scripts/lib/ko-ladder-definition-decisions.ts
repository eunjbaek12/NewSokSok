/**
 * 한국어 사다리 4덱 — 겹침 판정이 실패한 82건의 사람 판정.
 *
 * 왜 목록이 필요한가: `overlapsDeckMeaning` 은 덱 뜻(영어)과 캐시 뜻(영어)을 **문자열로**
 * 비교한다. 그래서 같은 단어를 다른 영어로 쓴 것(감독 = supervision vs Director)까지
 * "다른 단어"로 판정해 뜻풀이를 버렸다. 반대로 진짜 동음이의(개 = dog vs 접두사 '개-')도
 * 같은 자리에 섞여 있어, 형태로는 둘을 가를 수 없다. 그래서 72건을 사람이 한 번 갈랐다.
 *
 * 판정 근거: 각 단어의 캐시 뜻풀이 전문을 읽고 "이 한국어 설명이 덱의 영어 뜻과 같은
 * 단어를 설명하는가"로 갈랐다(2026-08-19, `ko-ladder-sense-review.md`).
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
  'curated-ko-basic-1': '물 손 나라 눈물 쓰레기 그릇 교회 셋 일월 댁 여보세요',
  'curated-ko-intermediate-1': '점 대통령 감독 엄청나다 놀이 사물 바닥',
  'curated-ko-intermediate-2': '고모 고생 아이고 형제 콩 스타일 이동 굳이 여보 며느리 서류 쥐 통장 장 끓다',
  'curated-ko-advanced-1': '이어 실시 민간 제사 심장 추진 떼 특수 아유 완전 욕 상당 차림 잦다 건조 별도 도덕',
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
  'curated-ko-basic-1': '개 화 어 딸 춤 거',
  'curated-ko-intermediate-1': '미 한 자 양 폭 남 고개 세기 군 저희 음',
  'curated-ko-intermediate-2': '적 들 통 탑',
  'curated-ko-advanced-1': '모 대기 인 가구 짜다 에 천 성명 품 수석 채',
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
