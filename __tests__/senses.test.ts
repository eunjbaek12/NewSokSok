import { normalizeSenses, senseToFill, senseChipLabel, MAX_SENSES } from '@/lib/senses';
import { AIWordResultSchema } from '@shared/contracts';
import type { AutoFillResult } from '@/lib/types';

const apple = {
  meaningKr: 'apple (fruit)',
  definition: '둥글고 붉은 과일',
  exampleEn: '나는 아침에 사과를 먹었다.',
  exampleKr: 'I ate an apple in the morning.',
  pos: 'noun',
  phonetic: 'sagwa',
};
const apology = {
  meaningKr: 'apology',
  definition: '잘못을 인정하고 용서를 구하는 일',
  exampleEn: '나는 친구에게 사과했다.',
  exampleKr: 'I apologized to my friend.',
  pos: 'noun',
  phonetic: 'sagwa',
};

const base: AutoFillResult = {
  definition: '① 둥글고 붉은 과일 ② 잘못을 빎',
  meaningKr: '① apple (fruit) ② apology',
  exampleEn: '나는 아침에 사과를 먹었다.',
  exampleKr: 'I ate an apple in the morning.',
  pos: 'noun',
  phonetic: 'sagwa',
};

describe('normalizeSenses', () => {
  it('undefined/null/비배열 → null', () => {
    expect(normalizeSenses(undefined)).toBeNull();
    expect(normalizeSenses(null)).toBeNull();
    expect(normalizeSenses('apple')).toBeNull();
    expect(normalizeSenses({})).toBeNull();
  });

  it('빈 배열·1개 → null (칩을 띄울 이유 없음)', () => {
    expect(normalizeSenses([])).toBeNull();
    expect(normalizeSenses([apple])).toBeNull();
  });

  it('2개 이상 → 배열 그대로', () => {
    expect(normalizeSenses([apple, apology])).toEqual([apple, apology]);
  });

  it('meaningKr 없는/빈 항목은 걸러내고, 남은 게 1개면 null', () => {
    expect(normalizeSenses([apple, { definition: 'x' }])).toBeNull();
    expect(normalizeSenses([apple, { meaningKr: '   ' }])).toBeNull();
    expect(normalizeSenses([apple, { meaningKr: '' }, apology])).toEqual([apple, apology]);
  });

  it('상한(MAX_SENSES)으로 자름 — 모델 폭주 방어', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...apple, meaningKr: `sense${i}` }));
    expect(normalizeSenses(many)).toHaveLength(MAX_SENSES);
  });
});

describe('senseToFill', () => {
  it('인덱스 선택 → 그 뜻의 필드로 채움', () => {
    const fill = senseToFill(1, [apple, apology], base);
    expect(fill.meaningKr).toBe('apology');
    expect(fill.exampleEn).toBe('나는 친구에게 사과했다.');
    expect(fill.definition).toBe('잘못을 인정하고 용서를 구하는 일');
  });

  it("'all' → 병기(base) 결과 그대로", () => {
    const fill = senseToFill('all', [apple, apology], base);
    expect(fill.meaningKr).toBe('① apple (fruit) ② apology');
    expect(fill.exampleEn).toBe(base.exampleEn);
  });

  it('뜻별 필드가 비면 base로 보충 — 칩 탭으로 필드가 사라지지 않음', () => {
    const sparse = { meaningKr: 'apology' };
    const fill = senseToFill(1, [apple, sparse], base);
    expect(fill.meaningKr).toBe('apology');
    expect(fill.exampleEn).toBe(base.exampleEn);
    expect(fill.pos).toBe('noun');
    expect(fill.phonetic).toBe('sagwa');
  });

  it('범위 밖 인덱스 → base로 안전 폴백', () => {
    const fill = senseToFill(9, [apple, apology], base);
    expect(fill.meaningKr).toBe(base.meaningKr);
  });
});

describe('senseChipLabel', () => {
  it('짧은 대역어는 그대로', () => {
    expect(senseChipLabel(apple)).toBe('apple (fruit)');
  });

  it('①② 병기가 잘못 섞이면 첫 뜻만', () => {
    expect(senseChipLabel({ meaningKr: '① apple ② apology' })).toBe('apple');
  });

  it('쉼표 나열은 앞 2개까지', () => {
    expect(senseChipLabel({ meaningKr: 'to speak, to talk, to say, to tell' })).toBe('to speak, to talk');
  });

  it('과도한 길이는 말줄임', () => {
    const label = senseChipLabel({ meaningKr: 'a'.repeat(100) });
    expect(label.length).toBeLessThanOrEqual(28);
    expect(label.endsWith('…')).toBe(true);
  });
});

describe('AIWordResultSchema senses 하위호환', () => {
  const baseResult = {
    term: '사과',
    definition: 'd',
    exampleEn: 'e',
    meaningKr: 'm',
  };

  it('senses 없는 옛 응답/캐시도 그대로 통과', () => {
    expect(AIWordResultSchema.safeParse(baseResult).success).toBe(true);
  });

  it('senses 배열 포함 응답 통과', () => {
    const parsed = AIWordResultSchema.safeParse({ ...baseResult, senses: [apple, apology] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.senses).toHaveLength(2);
  });

  it('senses 5개 초과는 거부(max 4) — 수신 상한', () => {
    const many = Array.from({ length: 5 }, () => apple);
    expect(AIWordResultSchema.safeParse({ ...baseResult, senses: many }).success).toBe(false);
  });
});
