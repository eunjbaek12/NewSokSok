import { collectCandidates, splitLadder } from '../scripts/build-ko-ladder-source';
import { exampleUsesTerm } from '../scripts/translate-ko-ladder-vocab';
import { fixRomajaAspiration } from '../scripts/integrate-ko-ladder';

// 한국어 사다리 4덱의 표제어 선정 규칙을 고정한다.
//
// 이 로직이 조용히 회귀하면 눈에 띄지 않는다 — 덱은 여전히 500개쯤 되고 단어도
// 그럴듯해 보인다. 실제로 옛 스크립트 세 벌이 아래 세 결함을 몇 달 동안 달고
// 있었고, 영어권 학습자가 "Advanced 덱에 초급 단어가 섞였다"고 제보한 뒤에야
// 드러났다. 그래서 결함마다 반례를 하나씩 박아 둔다.

/** 위키텍스트 한 줄. `*<rank>. {{ko-linker|<term>|<품사>}} - <등급>` */
const line = (rank: number, term: string, pos: string, grade: string) =>
  `*${rank}. {{ko-linker|${term}|${pos}}} - ${grade}`;

describe('collectCandidates', () => {
  it('기능어(조사·어미·관형사)를 뺀다', () => {
    const got = collectCandidates([[
      line(1, '사람', '명', 'A'),
      line(2, '의', '조', 'A'),
      line(3, '그', '관', 'A'),
    ].join('\n')]);
    expect(got.map(e => e.term)).toEqual(['사람']);
  });

  it('같은 표제어가 등급이 갈려 두 번 나오면 낮은 등급을 채택한다', () => {
    // 🔴 이것이 basic ∩ intermediate 중복 18건의 정체다. 옛 스크립트들은 각자
    //    "먼저 만난 행"을 남겨서, 같은 단어가 어느 덱에 실릴지가 실행 순서에
    //    달려 있었다 — 그래서 '대하다'가 Basic 과 Intermediate 양쪽에 있었다.
    const got = collectCandidates([[
      line(800, '대하다', '동', 'B'),
      line(100, '대하다', '동', 'A'),
    ].join('\n')]);
    expect(got).toHaveLength(1);
    expect(got[0].grade).toBe('A');
  });

  it('빈도 순위가 낮은 쪽을 대표 순위로 삼는다', () => {
    const got = collectCandidates([[line(9, '보다', '동', 'A'), line(17, '보다', '동', 'A')].join('\n')]);
    expect(got[0].rank).toBe(9);
  });

  it('표제어에 붙어 오는 동음이의어 구분 번호를 뗀다', () => {
    // 원본이 `{{ko-linker|정성11|명}}` 이다. 떼지 않으면 "정성11" 이라 적힌 카드가 나간다.
    const got = collectCandidates([[line(3087, '정성11', '명', 'C'), line(3247, '유리1', '명', 'B')].join('\n')]);
    expect(got.map(e => e.term)).toEqual(['정성', '유리']);
  });

  it('번호만 다른 항목은 하나로 합친다', () => {
    // 도1 · 도11 → 도. 등급이 갈리면 낮은 쪽이 이긴다.
    const got = collectCandidates([[line(3200, '도11', '명', 'C'), line(2900, '도1', '명', 'B')].join('\n')]);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ term: '도', grade: 'B', rank: 2900 });
  });
});

describe('splitLadder', () => {
  const pool = collectCandidates([[
    line(10, '사람', '명', 'A'),
    line(3000, '나물', '명', 'A'),      // A 인데 저빈도 — 옛 Basic 은 파일 3개만 읽어 이걸 못 봤다
    line(50, '그녀', '대', 'C'),        // C 인데 초고빈도 — 제보의 발단
    line(1500, '사례', '명', 'C'),
    line(3800, '뱃사람', '명', 'C'),
    line(30, '문제', '명', 'B'),
    line(2000, '논문', '명', 'B'),
  ].join('\n')]);
  const decks = splitLadder(pool);
  const of = (key: string) => decks.find(d => d.key === key)!.entries.map(e => e.term);

  it('후보를 하나도 빠뜨리지 않고 두 번 싣지도 않는다', () => {
    const placed = decks.flatMap(d => d.entries.map(e => e.term));
    expect(placed.sort()).toEqual(pool.map(e => e.term).sort());
    expect(new Set(placed).size).toBe(placed.length);
  });

  it('A 등급은 빈도와 무관하게 전부 Basic 이다', () => {
    expect(of('basic')).toEqual(['사람', '나물']);
  });

  it('C 등급이라도 빈도가 높으면 Intermediate 로 내려간다', () => {
    // 그녀(빈도 50위)를 "고급"이라 부르면 학습자 체감과 어긋난다. 등급은 그대로
    // 두고 배치만 옮긴다 — 어느 덱에서도 사라지지 않는 것이 이 규칙의 핵심이다.
    expect(of('inter1')).toContain('그녀');
    expect(of('advanced')).not.toContain('그녀');
  });

  it('Advanced 는 하한 순위 뒤에서 시작한다', () => {
    expect(of('advanced')).toEqual(['사례', '뱃사람']);
  });

  it('Intermediate 를 둘로 나눌 때 앞쪽이 더 고빈도다', () => {
    const [i1, i2] = [decks.find(d => d.key === 'inter1')!, decks.find(d => d.key === 'inter2')!];
    const maxFirst = Math.max(...i1.entries.map(e => e.origRank));
    const minSecond = Math.min(...i2.entries.map(e => e.origRank));
    expect(maxFirst).toBeLessThan(minSecond);
  });
});

describe('exampleUsesTerm', () => {
  it('표제어 대신 비슷한 낱말을 쓴 예문을 잡는다', () => {
    // 제보된 실제 카드다 — 표제어는 '그러다'인데 예문은 '그렇게'를 쓴다.
    // 앱의 canBlankExample 은 이걸 통과시킨다(첫 음절 '그'가 걸린다).
    expect(exampleUsesTerm('그러다', '그가 그렇게 갑자기 태도를 바꿀 줄은 몰랐다.', '그렇게')).toBe(true);
    // 모델이 usedForm 을 신고하지 못하면(=표제어를 안 썼으면) 걸린다.
    expect(exampleUsesTerm('그러다', '그가 그렇게 갑자기 태도를 바꿀 줄은 몰랐다.', '그러다')).toBe(false);
  });

  it('불규칙 활용으로 어간 첫 음절이 바뀌어도 통과시킨다', () => {
    // 음절로 재던 때 이 둘이 헛되이 재생성됐다(실측 1.3%). 초성으로 재면 통과한다.
    expect(exampleUsesTerm('자르다', '종이를 잘랐어요.', '잘랐')).toBe(true);   // 르불규칙
    expect(exampleUsesTerm('끄다', '불을 껐어요.', '껐')).toBe(true);           // 으탈락
    expect(exampleUsesTerm('흔들리다', '건물이 심하게 흔들렸지만 피해는 없었다.', '흔들렸지만')).toBe(true);
  });

  it('예문에 없는 형태를 신고하면 거른다 — 이것이 실제로 막는 장치다', () => {
    expect(exampleUsesTerm('새롭다', '신기술 도입은 필수적인 요소가 될 것이다.', '새로운')).toBe(false);
  });

  it('🔴 초성이 우연히 같은 낱말을 베껴 오면 못 막는다 (알려진 한계)', () => {
    // ②는 "표제어와 아무 관계없는 낱말"만 거른다. 초성이 겹치면 통과한다 —
    // 형태만으로 그러다↔그렇게를 가를 수 없는 것과 같은 한계이고, 그래서 ①에
    // 기댄다. 이 기대값이 false 로 바뀌었다면 검사를 더 엄격하게 만든 것이니,
    // 불규칙 활용(위 케이스)이 함께 걸리지 않는지 반드시 확인할 것.
    expect(exampleUsesTerm('새롭다', '신기술 도입은 필수적인 요소가 될 것이다.', '신기술')).toBe(true);
  });
});

describe('fixRomajaAspiration', () => {
  it('-하다 앞 ㄱ/ㄷ/ㅂ 뒤 ㅎ을 거센소리로 축약한다', () => {
    // AI 가 같은 패턴을 무작위로 틀린다(실측 21개 중 12개). 규칙으로 고정한다.
    expect(fixRomajaAspiration('saenggakhada', '생각하다')).toBe('saenggakada');
    expect(fixRomajaAspiration('guiphada', '구입하다')).toBe('guipada');
  });

  it('이미 맞는 것은 건드리지 않는다', () => {
    expect(fixRomajaAspiration('bokjapada', '복잡하다')).toBe('bokjapada');
    expect(fixRomajaAspiration('noryeokada', '노력하다')).toBe('noryeokada');
  });

  it('-하다 용언이 아니면 손대지 않는다 — 체언은 ㅎ을 밝혀 적는다', () => {
    expect(fixRomajaAspiration('Mukho', '묵호')).toBe('Mukho');
    expect(fixRomajaAspiration('gihu', '기후')).toBe('gihu');
  });

  it('축약 대상이 아닌 자음 뒤에서는 아무 일도 하지 않는다', () => {
    expect(fixRomajaAspiration('malhada', '말하다')).toBe('malhada');
  });
});

describe('exampleUsesTerm 빈 입력', () => {
  it('usedForm 이나 예문이 비면 통과시키지 않는다', () => {
    expect(exampleUsesTerm('새롭다', '새로운 과목을 신청했다.', '')).toBe(false);
    expect(exampleUsesTerm('새롭다', '', '새로운')).toBe(false);
  });
});
