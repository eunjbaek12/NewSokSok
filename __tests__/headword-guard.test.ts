import {
  normalizeHeadword,
  headwordDefectOf,
  inspectHeadword,
} from '../utils/headword-guard';
import {
  normalizeHeadword as edgeNormalize,
  headwordDefectOf as edgeDefectOf,
} from '../supabase/functions/_shared/headword-guard';

// ─────────────────────────────────────────────────────────────────────
// 허용 목록을 **먼저** 둔다.
//
// 이 게이트의 실패 방식은 두 가지인데 무게가 다르다. 결함을 놓치면 한도 1이 나가고,
// 정상 표제어를 막으면 사용자가 그 단어를 영영 못 배운다. 그래서 규칙을 넓히려는
// 모든 변경은 여기부터 통과해야 한다.
//
// 목록은 전부 enrich_cache 84,102행 전수 실측에서 뽑은 **실물**이다(추측 아님).
// ─────────────────────────────────────────────────────────────────────
describe('허용 — 정상 표제어는 절대 막지 않는다', () => {
  const allowed: [string, string][] = [
    // 단어 내부 하이픈·아포스트로피
    ['e-mail', 'en'],
    ['self-esteem', 'en'],
    ['K-pop', 'en'],
    ['T-shirt', 'en'],
    ["don't", 'en'],
    ["dogs'", 'en'],

    // 괄호 약어 — 24자·3토큰 규칙을 기각시킨 실물들
    ['activities of daily living (adls)', 'en'],
    ['cognitive behavioral therapy (cbt)', 'en'],
    ['hormone replacement therapy (hrt)', 'en'],
    ['in vitro fertilization (ivf)', 'en'],
    ['intellectual property (ip)', 'en'],
    ['irritable bowel syndrome (ibs)', 'en'],
    ['kpi (key performance indicator)', 'en'],

    // 기호가 단어에 붙어 있는 형태 — 공백에 둘러싸이지 않았으므로 구분자가 아니다
    ['shift+tab', 'en'],
    ['km/h', 'en'],
    ['and/or', 'en'],
    ['C#', 'en'],
    ['github.io', 'en'],

    // ja 접미사 표기 — `~` 는 일본어 학습 자료의 표준 표기다
    ['~匹', 'ja'],
    ['~杯', 'ja'],
    ['~際', 'ja'],

    // 덱의 표현·인용 카드 — 구두점이 의미의 일부
    ['off with their heads!', 'en'],
    ['데워 드릴까요?', 'ko'],
    ['How are you?', 'en'],

    // 한 토큰 안의 문자 체계 혼재는 정당하다
    ['反덤핑', 'ja'],
    ['食べる', 'ja'],
    ['T셔츠', 'ko'],
    ['A형', 'ko'],
    ['24시간', 'ko'],
    ['1도 없다', 'ko'],

    // 다어절 정상 표제어
    ['ice cream', 'en'],
    ['sinh viên', 'vi'],
    // 🔑 모드 불일치 판정이 **출발어에 맞는 표제어**를 죽이지 않는지 — 위 script_mix
    //    케이스와 짝을 이룬다. 같은 단어라도 출발어가 맞으면 통과해야 한다.
    ['독일', 'ko'],
    ['ターゲット', 'ja'],
    ['거래자', 'ko'],
    ['a piece of cake', 'en'],
    ['kick the bucket', 'en'],
    ['몸을 풀다', 'ko'],
    ['学校', 'zh'],
    ['escuela', 'es'],
  ];

  test.each(allowed)('%s (%s) — 결함 없음', (term, lang) => {
    expect(headwordDefectOf(term, lang)).toBeNull();
  });

  test.each(allowed)('%s (%s) — 정규화가 표제어를 바꾸지 않음', (term) => {
    expect(normalizeHeadword(term)).toBe(term);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 실측 사고 4건 회귀. 전부 캐시에 실제로 굳었던 표제어다.
// ─────────────────────────────────────────────────────────────────────
describe('차단 — 실측 사고 회귀', () => {
  test('7/6 일괄 추가: 콜론이 공백에 둘러싸인 형태 13건', () => {
    expect(headwordDefectOf('appropriate : 적절한', 'en')).toBe('separator');
    expect(headwordDefectOf('acquire : 습득하다 manner : 방식', 'en')).toBe('separator');
    expect(headwordDefectOf('society : 사회', 'en')).toBe('separator');
  });

  test('7/6 일괄 추가: 콜론이 붙어 있어도 문자 체계 혼재로 잡힌다', () => {
    // soft 구분자 규칙(공백 둘러쌈)은 못 잡는 형태 — G2가 받는다
    expect(headwordDefectOf('encouragement:격려', 'en')).toBe('script_mix');
    expect(headwordDefectOf('values: 가치', 'en')).toBe('script_mix');
  });

  test('7/24 일괄 추가: + 구분자', () => {
    expect(headwordDefectOf('in the last + 시간', 'en')).not.toBeNull();
  });

  test('8/26 일괄 추가: em dash 83건', () => {
    expect(headwordDefectOf('lemon — 레몬', 'en')).toBe('separator');
    expect(headwordDefectOf('apple — 사과', 'en')).toBe('separator');
  });

  test('기호 없이 붙은 이중언어 표제어', () => {
    expect(headwordDefectOf('apple 사과', 'en')).toBe('script_mix');
    expect(headwordDefectOf('사과 apple', 'ko')).toBe('script_mix');
  });

  test('🔑 모드 불일치 — 배우는 언어와 다른 문자로 쓴 표제어', () => {
    // 게이트를 캐시 42,037쌍 전량에 돌려 새로 찾은 오염 17건. 전부 앞뒤가 같은
    // 언어라 외울 게 없는 카드였고 hit_count 는 모두 0이었다. 실물:
    //   독일        [en>ko]  뜻 "독일 (유럽의 나라)"   ← 앞면도 뒷면도 독일
    //   ターゲット   [en>ko]  뜻 "목표, 대상"          ← 영어를 배우는데 앞면이 일본어
    //   캄부디아     [en>ko]  뜻 "캄보디아 (국가)"      ← 오타 난 한국어를 영어 모드에서
    expect(headwordDefectOf('독일', 'en')).toBe('script_mix');
    expect(headwordDefectOf('미국', 'en')).toBe('script_mix');
    expect(headwordDefectOf('캄부디아', 'en')).toBe('script_mix');
    expect(headwordDefectOf('ターゲット', 'en')).toBe('script_mix');
    expect(headwordDefectOf('為替レート', 'en')).toBe('script_mix');
    expect(headwordDefectOf('カスタマージャーニー', 'en')).toBe('script_mix');
    expect(headwordDefectOf('거래자', 'vi')).toBe('script_mix');
    expect(headwordDefectOf('좀비', 'vi')).toBe('script_mix');
  });

  test('탭·파이프·쉼표는 위치와 무관하게 차단', () => {
    expect(headwordDefectOf('apple\t사과', 'en')).toBe('separator');
    expect(headwordDefectOf('apple|사과', 'en')).toBe('separator');
    expect(headwordDefectOf('apple,사과', 'en')).toBe('separator');
  });

  test('서버는 목록 표지를 벗기지 않고 막는다', () => {
    // 클라이언트는 normalizeHeadword 로 벗기므로 여기 오지 않는다.
    // 옛 앱이 보낸 요청만 이 분기를 탄다 — 조용히 고치면 기기에 저장된
    // 표제어와 어긋나므로 '찾지 못함'으로 되돌린다.
    expect(headwordDefectOf('1. apple', 'en')).toBe('list_marker');
    expect(headwordDefectOf('2) banana', 'en')).toBe('list_marker');
    expect(headwordDefectOf('• apple', 'en')).toBe('list_marker');
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('정규화 — 잡티는 벗기고 의미는 남긴다', () => {
  test('목록 표지 접두를 벗긴다', () => {
    expect(normalizeHeadword('1. apple')).toBe('apple');
    expect(normalizeHeadword('12) banana')).toBe('banana');
    expect(normalizeHeadword('• apple')).toBe('apple');
    expect(normalizeHeadword('- apple')).toBe('apple');
    expect(normalizeHeadword('#1 apple')).toBe('apple');
    expect(normalizeHeadword('3. 사과')).toBe('사과');
  });

  test('🔴 목록 표지처럼 보이는 정상 표제어는 건드리지 않는다', () => {
    // 표지 뒤 공백을 필수로 둔 이유 — 이게 깨지면 조용히 단어가 잘린다
    expect(normalizeHeadword('1.5kg')).toBe('1.5kg');
    expect(normalizeHeadword('-apple')).toBe('-apple');
    expect(normalizeHeadword('e-mail')).toBe('e-mail');
    expect(normalizeHeadword('1도 없다')).toBe('1도 없다');
    expect(normalizeHeadword('24시간')).toBe('24시간');
  });

  test('단일 토큰의 끝 구두점을 벗긴다', () => {
    expect(normalizeHeadword('Apple?')).toBe('Apple');
    expect(normalizeHeadword('session?')).toBe('session');
    expect(normalizeHeadword('날.')).toBe('날');
    expect(normalizeHeadword('걸렸습니다.')).toBe('걸렸습니다');
    expect(normalizeHeadword('hello!')).toBe('hello');
  });

  test('🔴 두 단어 이상의 구두점은 의미다 — 남긴다', () => {
    expect(normalizeHeadword('How are you?')).toBe('How are you?');
    expect(normalizeHeadword('데워 드릴까요?')).toBe('데워 드릴까요?');
    expect(normalizeHeadword('off with their heads!')).toBe('off with their heads!');
  });

  test('감싼 따옴표를 벗긴다 — 아포스트로피는 보존', () => {
    expect(normalizeHeadword('"자랑스러운')).toBe('자랑스러운');
    expect(normalizeHeadword('"apple"')).toBe('apple');
    expect(normalizeHeadword('「学校」')).toBe('学校');
    expect(normalizeHeadword("dogs'")).toBe("dogs'");
    expect(normalizeHeadword("'tis")).toBe("'tis");
  });

  test('연속 공백을 하나로 정리한다', () => {
    expect(normalizeHeadword('apple   사과')).toBe('apple 사과');
    expect(normalizeHeadword('  apple  ')).toBe('apple');
  });

  test('빈 입력', () => {
    expect(normalizeHeadword('')).toBe('');
    expect(normalizeHeadword('   ')).toBe('');
    expect(headwordDefectOf('', 'en')).toBeNull();
  });
});

describe('inspectHeadword — 정규화 후 판정', () => {
  test('목록 표지는 벗겨진 뒤라 결함으로 남지 않는다', () => {
    expect(inspectHeadword('1. apple', 'en')).toEqual({ term: 'apple', defect: null });
  });

  test('벗겨도 남는 결함은 잡는다', () => {
    expect(inspectHeadword('1. lemon — 레몬', 'en')).toEqual({
      term: 'lemon — 레몬',
      defect: 'separator',
    });
  });

  test('session? 는 정규화만으로 정상 표제어가 된다 — 기존 캐시를 히트한다', () => {
    expect(inspectHeadword('session?', 'en')).toEqual({ term: 'session', defect: null });
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('🔴 알려진 한계 — 라틴↔라틴은 판별 불가', () => {
  test('같은 문자 체계끼리 기호 없이 붙으면 통과한다', () => {
    // `apple manzana`(en>es)는 정상 표제어 `ice cream`과 구별할 근거가 없다.
    // 실측 오염 `generate-words/scan-image/enrich-word` 도 같은 이유로 통과한다
    // (슬래시가 공백에 둘러싸이지 않았고, 전부 라틴 문자다).
    // 이걸 잡으려면 길이·토큰 수를 봐야 하는데, 그 규칙은 정상 표제어 289건을
    // 죽인다는 것이 실측으로 확인됐다. 통과시키는 쪽이 옳다.
    expect(headwordDefectOf('apple manzana', 'en')).toBeNull();
    expect(headwordDefectOf('generate-words/scan-image/enrich-word', 'en')).toBeNull();
  });

  test('다만 공백에 둘러싸인 기호는 라틴끼리도 잡는다', () => {
    expect(headwordDefectOf('apple = manzana', 'en')).toBe('separator');
    expect(headwordDefectOf('apple / manzana', 'en')).toBe('separator');
    expect(headwordDefectOf('apple - manzana', 'en')).toBe('separator');
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('패리티 — utils 와 Edge _shared 구현이 일치', () => {
  const corpus = [
    'e-mail', "don't", "dogs'", 'shift+tab', 'km/h', 'C#', 'github.io',
    '~匹', 'off with their heads!', '데워 드릴까요?', 'How are you?',
    '反덤핑', '食べる', 'T셔츠', '24시간', '1도 없다', 'ice cream', 'sinh viên',
    'cognitive behavioral therapy (cbt)', 'a piece of cake', '몸을 풀다',
    'appropriate : 적절한', 'encouragement:격려', 'values: 가치',
    'in the last + 시간', 'lemon — 레몬', 'apple 사과', '사과 apple',
    'apple\t사과', 'apple|사과', 'apple,사과',
    '독일', 'ターゲット', '거래자', '캄부디아', '為替レート',
    '1. apple', '2) banana', '• apple', '#1 apple', '- apple', '1.5kg', '-apple',
    'Apple?', 'session?', '날.', '걸렸습니다.', '"자랑스러운', '"apple"', '「学校」',
    'apple   사과', '  apple  ', '', '   ', 'apple manzana', 'apple = manzana',
  ];
  const langs = ['ko', 'ja', 'zh', 'en', 'es', 'vi', 'fr'];

  test('normalizeHeadword 가 두 구현에서 같다', () => {
    for (const term of corpus) {
      expect(edgeNormalize(term)).toBe(normalizeHeadword(term));
    }
  });

  test.each(langs)('headwordDefectOf 가 lang=%s 에서 같다', (lang) => {
    for (const term of corpus) {
      expect(edgeDefectOf(term, lang)).toBe(headwordDefectOf(term, lang));
    }
  });
});
