import { segmentExample, canBlankExample, spokenExample } from '../lib/example-blank';

/** 빈칸을 [?]로 치환한 표시 문자열 — 화면에 보이는 모양 그대로 검증한다. */
function view(sentence: string, term: string): string | null {
  const segs = segmentExample(sentence, term);
  if (!segs) return null;
  // 세그먼트를 다시 이으면 항상 원문이어야 한다(글자 유실 방지).
  expect(segs.map(s => s.text).join('')).toBe(sentence);
  return segs.map(s => (s.isBlank ? '[?]' : s.text)).join('');
}

describe('라틴 — 토큰 경계', () => {
  test('정확히 일치하는 단어를 가린다', () => {
    expect(view('I ate an apple.', 'apple')).toBe('I ate an [?].');
  });

  test('굴절 어미까지 토큰 전체를 가린다', () => {
    expect(view("a family of Asian elephants.", 'elephant')).toBe('a family of Asian [?].');
    expect(view('She was yapping about her weekend.', 'yap')).toBe('She was [?] about her weekend.');
    expect(view('A red light signifies a problem.', 'signify')).toBe('A red light [?] a problem.');
    expect(view('exchanged through capillaries in the tissue', 'capillary'))
      .toBe('exchanged through [?] in the tissue');
    expect(view('ordered to cease discharging waste', 'discharge')).toBe('ordered to cease [?] waste');
  });

  test('소유격도 토큰 전체를 가린다', () => {
    expect(view("The author's latest work explores identity.", 'author'))
      .toBe('The [?] latest work explores identity.');
    expect(view('The author’s latest work explores identity.', 'author'))
      .toBe('The [?] latest work explores identity.');
    expect(view("the students' desks", 'student')).toBe('the [?] desks');
  });

  test('구동사는 앞 단어가 굴절해도 통째로 가린다', () => {
    expect(view('I am looking for my keys.', 'look for')).toBe('I am [?] my keys.');
    expect(view('She really popped off on stage!', 'pop off')).toBe('She really [?] on stage!');
  });

  test('다른 단어 안쪽은 절대 가리지 않는다', () => {
    // 이전 구현이 De[?] / inter[?]al / note[?] / tota[?][?]y 로 깨뜨리던 케이스
    expect(view('Despite the circumstances, they won.', 'spite')).toBeNull();
    expect(view('for the international conference', 'nation')).toBeNull();
    expect(view('jot it down on this notepad.', 'pad')).toBeNull();
    expect(view('I totally forgot about it.', 'L')).toBeNull();
    expect(view('Acrophobia is the fear of heights.', 'Phobia')).toBeNull();
    expect(view('We start the party.', 'art')).toBeNull();
  });

  test('굴절 폴백이 무관한 단어를 삼키지 않는다', () => {
    expect(view('He bought a new carpet.', 'car')).toBeNull();     // car + pet
    expect(view('Tom and Jerry', 'an')).toBeNull();                // an + d
    expect(view('The students finished their projects.', 'they')).toBeNull();
  });

  test('대소문자는 무시한다', () => {
    expect(view('Apples are red.', 'apple')).toBe('[?] are red.');
  });

  test('같은 단어가 두 번 나오면 둘 다 가린다', () => {
    expect(view('An apple a day; the apple is red.', 'apple'))
      .toBe('An [?] a day; the [?] is red.');
  });
});

describe('한국어 — 조사·어미는 남긴다', () => {
  test('조사는 빈칸 밖에 남는다', () => {
    expect(view('저는 의사가 되고 싶어요.', '의사')).toBe('저는 [?]가 되고 싶어요.');
    expect(view('저 여자는 제 친구입니다.', '여자')).toBe('저 [?]는 제 친구입니다.');
  });

  test('용언 기본형이 활용형으로 나와도 찾는다', () => {
    expect(view('저는 책을 매일 읽어요.', '읽다')).toBe('저는 책을 매일 [?]어요.');
    expect(view('머리가 정말 길어요.', '길다')).toBe('머리가 정말 [?]어요.');
    expect(view('아기가 엄마를 꼭 안아요.', '안다')).toBe('아기가 엄마를 꼭 [?]아요.');
  });

  test('“-하다” 용언은 어간까지 줄여 찾는다', () => {
    expect(view('비가 와도 우리는 연습을 계속해야 해요.', '계속하다'))
      .toBe('비가 와도 우리는 연습을 [?]해야 해요.');
    expect(view('저는 노래를 못해요.', '못하다')).toBe('저는 노래를 [?]해요.');
  });

  test('종성이 바뀌는 활용(르불규칙 등)도 흡수한다', () => {
    expect(view('그 사람의 연락처를 전혀 모릅니다.', '모르다'))
      .toBe('그 사람의 연락처를 전혀 [?]니다.');
  });

  test('모음이 축약되는 활용도 흡수한다', () => {
    expect(view('정류장까지 열심히 달렸어요.', '달리다')).toBe('정류장까지 열심히 [?]어요.');
    expect(view('많은 기업들이 결국 무너졌다.', '무너지다')).toBe('많은 기업들이 결국 [?]다.');
    expect(view('저는 한국어를 배웠어요.', '배우다')).toBe('저는 한국어를 [?]어요.');
    expect(view('방에서 나와서 거실로 오세요.', '나오다')).toBe('방에서 [?]서 거실로 오세요.');
    // ㅂ불규칙은 어간이 "어려"까지라 "워도"가 어미로 남는다.
    expect(view('어려워도 포기하지 마세요.', '어렵다')).toBe('[?]워도 포기하지 마세요.');
  });

  test('어절 중간에서 어간을 잡지 않는다', () => {
    // "안다"의 어간 "안"이 "안경"의 첫 글자와 겹쳐도 어절 시작이 아니면 무시
    expect(view('그는 검은 선글라스를 썼다.', '안다')).toBeNull();
  });
});

describe('중국어 · 일본어 — 띄어쓰기 없음', () => {
  test('중국어는 부분 매칭이 정상', () => {
    expect(view('你住在哪个房间？', '住')).toBe('你[?]在哪个房间？');
    expect(view('学校旁边有一家书店。', '旁边')).toBe('学校[?]有一家书店。');
  });

  test('일본어 활용은 어미를 떼고 찾는다', () => {
    expect(view('この汚れはなかなか取れない。', '取れる')).toBe('この汚れはなかなか[?]ない。');
    expect(view('毎日日本語を勉強します。', '勉強する')).toBe('毎日日本語を[?]します。');
  });
});

describe('빈칸을 못 만들면 null — 예문을 노출하지 않기 위해', () => {
  test('예문 언어가 표제어와 다르면 null', () => {
    expect(view('나는 아침으로 바나나를 먹었다.', 'banana')).toBeNull();
  });

  test('빈 입력', () => {
    expect(segmentExample('', 'apple')).toBeNull();
    expect(segmentExample('I ate an apple.', '')).toBeNull();
    expect(segmentExample('I ate an apple.', '   ')).toBeNull();
  });

  test('canBlankExample은 null/빈 값을 안전하게 처리한다', () => {
    expect(canBlankExample(null, 'apple')).toBe(false);
    expect(canBlankExample('I ate an apple.', null)).toBe(false);
    expect(canBlankExample('I ate an apple.', 'apple')).toBe(true);
    expect(canBlankExample('I ate an apple.', 'banana')).toBe(false);
  });
});

describe('동음이의어 병기 기호', () => {
  test('표제어에 섞인 ①②는 무시하고 찾는다', () => {
    expect(view('① He is a smart kid. ② You look smart.', '① smart'))
      .toBe('① He is a [?] kid. ② You look [?].');
  });
});

/**
 * 스피커 낭독(P7). 이 규칙이 깨지면 화면은 답을 가린 채 소리로만 답이 새어 나가
 * 예문 학습 자체가 성립하지 않는다 — 눈으로는 안 보이는 종류의 고장이라 테스트로 잡는다.
 */
describe('spokenExample — 정답 공개 전에는 빈칸을 읽지 않는다', () => {
  const S = 'I ate an apple this morning.';

  test('공개 전에는 표제어가 소리에 섞이지 않는다', () => {
    const spoken = spokenExample(S, 'apple', false);
    expect(spoken).toBe('I ate an this morning.');
    expect(spoken).not.toMatch(/apple/i);
  });

  test('공개 후에는 원문 그대로 읽는다 — 발음을 들을 기회를 막지 않는다', () => {
    expect(spokenExample(S, 'apple', true)).toBe(S);
  });

  test('굴절형도 빠진다 — 화면 빈칸과 같은 자리를 판단한다', () => {
    expect(spokenExample('She signifies her intent.', 'signify', false))
      .toBe('She her intent.');
  });

  test('빈칸이 여러 개면 전부 빠진다', () => {
    expect(spokenExample('An apple a day. I like apple.', 'apple', false))
      .toBe('An a day. I like .');
  });

  test('한국어 — 조사는 남고 어간만 빠진다', () => {
    const spoken = spokenExample('저는 의사가 되고 싶어요.', '의사', false);
    expect(spoken).not.toMatch(/의사/);
    expect(spoken).toBe('저는 가 되고 싶어요.');
  });

  test('빈칸을 못 만드는 예문은 빈 문자열 — 통째로 답이라 읽으면 안 된다', () => {
    expect(spokenExample('Nothing matches here.', 'apple', false)).toBe('');
    // 공개된 뒤에는 읽어도 된다(이미 화면에 보인다).
    expect(spokenExample('Nothing matches here.', 'apple', true)).toBe('Nothing matches here.');
  });

  test('①② 병기 기호는 읽지 않는다', () => {
    expect(spokenExample('① He is a smart kid.', '① smart', false)).toBe('He is a kid.');
    expect(spokenExample('① He is a smart kid.', '① smart', true)).toBe('He is a smart kid.');
  });

  test('null/빈 입력은 빈 문자열', () => {
    expect(spokenExample(null, 'apple', false)).toBe('');
    expect(spokenExample(undefined, 'apple', true)).toBe('');
    expect(spokenExample(S, null, false)).toBe('');
    // 표제어가 없어도 공개 상태면 문장은 읽을 수 있다.
    expect(spokenExample(S, null, true)).toBe(S);
  });
});
