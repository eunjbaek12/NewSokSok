/**
 * 한국어 사다리 4덱 — 겹침 판정이 실패한 72건의 사람 판정.
 *
 * 왜 목록이 필요한가: `overlapsDeckMeaning` 은 덱 뜻(영어)과 캐시 뜻(영어)을 **문자열로**
 * 비교한다. 그래서 같은 단어를 다른 영어로 쓴 것(감독 = supervision vs Director)까지
 * "다른 단어"로 판정해 뜻풀이를 버렸다. 반대로 진짜 동음이의(개 = dog vs 접두사 '개-')도
 * 같은 자리에 섞여 있어, 형태로는 둘을 가를 수 없다. 그래서 72건을 사람이 한 번 갈랐다.
 *
 * 판정 근거: 각 단어의 캐시 뜻풀이 전문을 읽고 "이 한국어 설명이 덱의 영어 뜻과 같은
 * 단어를 설명하는가"로 갈랐다(2026-08-19, `ko-ladder-sense-review.md`).
 * 확정 후 뜻풀이만 블라인드로 역추론시켜 교차 검증했고, 동음이의 오탐은 0건이었다.
 *
 * 🔴 이 목록은 **뜻풀이가 이 단어를 설명하는가**만 판정한다. 뜻풀이의 품질(탈자·중복·
 *    부실)은 별개 문제이고, 그래서 셋·장·별도·도덕은 뜻은 맞지만 blank 로 뒀다.
 *    캐시를 고친 뒤에는 fill 로 옮겨야 한다 — 옮기지 않으면 영영 빈칸으로 남는다.
 *
 * 🔴 blank 는 "손대지 않는다"가 아니라 **비운다**이다. 30건 중 15건은 지금 definition
 *    자리에 영어 뜻이 복사돼 있어 카드에 영어가 두 번 뜬다(레딧 제보 ④). 지워야 한다.
 */
export type DefinitionDecision = 'fill' | 'blank';

/** 채운다 — 캐시가 같은 단어를 설명하고 있다. */
const FILL: Record<string, string> = {
  'curated-ko-basic-1': '물 손 나라 눈물 쓰레기 그릇 교회',
  'curated-ko-intermediate-1': '점 대통령 감독 엄청나다 놀이 사물 바닥',
  'curated-ko-intermediate-2': '고모 고생 아이고 형제 콩 스타일 이동 굳이 여보 며느리 서류 쥐 통장',
  'curated-ko-advanced-1': '이어 실시 민간 제사 심장 추진 떼 특수 아유 완전 욕 상당 차림 잦다 건조',
};

/**
 * 비운다 — 캐시가 **다른 단어**를 설명하거나(동음이의), 뜻풀이 자체가 깨졌다.
 *
 * 뜻풀이가 깨져서 뺀 넷:
 *   셋   — "수량이나 순서를 나타낼 때 쓰는 말". 수사 전체의 설명이지 3의 설명이 아니다
 *   장   — 46건 중 혼자 해요체("쓰여요", "나타내요")
 *   별도 — ②③이 글자까지 같은 중복
 *   도덕 — "마땅히 지켜야 할리나" 탈자 (할 도리나)
 */
const BLANK: Record<string, string> = {
  'curated-ko-basic-1': '개 화 어 딸 셋',
  'curated-ko-intermediate-1': '미 한 자 양 폭 남 고개 세기 군',
  'curated-ko-intermediate-2': '적 들 통 탑 장',
  'curated-ko-advanced-1': '모 대기 인 가구 짜다 에 천 성명 품 별도 도덕',
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
