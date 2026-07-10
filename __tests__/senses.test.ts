import {
  normalizeSenses,
  composeSenseFill,
  fitsSaveLimits,
  stripSenseMarkers,
  senseChipLabel,
  MAX_SENSES,
} from '@/lib/senses';
import { AIWordResultSchema } from '@shared/contracts';
import type { AutoFillResult } from '@/lib/types';

const eye = {
  meaningKr: 'eye (organ of sight)',
  definition: '사람의 시각 기관',
  exampleEn: '그녀는 슬픈 눈으로 나를 바라보았다.',
  exampleKr: 'She looked at me with sad eyes.',
  pos: 'noun',
  phonetic: 'nun',
};
const snow = {
  meaningKr: 'snow',
  definition: '하늘에서 내리는 얼음 결정체',
  exampleEn: '창밖으로 하얀 눈이 내리고 있다.',
  exampleKr: 'White snow is falling outside the window.',
  pos: 'noun',
  phonetic: 'nun',
};
const discern = {
  meaningKr: 'an eye (for), discernment',
  definition: '사물을 보고 분별하는 능력',
  exampleEn: '그는 그림을 보는 눈이 있다.',
  exampleKr: 'He has an eye for paintings.',
  pos: 'noun',
  phonetic: 'nun',
};

const base: AutoFillResult = {
  definition: '① 시각 기관 ② 얼음 결정체',
  meaningKr: '① eye ② snow',
  exampleEn: '그녀는 슬픈 눈으로 나를 바라보았다.',
  exampleKr: 'She looked at me with sad eyes.',
  pos: 'noun',
  phonetic: 'nun',
};

describe('normalizeSenses', () => {
  it('undefined/null/비배열 → null', () => {
    expect(normalizeSenses(undefined)).toBeNull();
    expect(normalizeSenses(null)).toBeNull();
    expect(normalizeSenses('eye')).toBeNull();
    expect(normalizeSenses({})).toBeNull();
  });

  it('빈 배열·1개 → null (칩을 띄울 이유 없음)', () => {
    expect(normalizeSenses([])).toBeNull();
    expect(normalizeSenses([eye])).toBeNull();
  });

  it('2개 이상 → 배열 그대로', () => {
    expect(normalizeSenses([eye, snow])).toEqual([eye, snow]);
  });

  it('meaningKr 없는/빈 항목은 걸러내고, 남은 게 1개면 null', () => {
    expect(normalizeSenses([eye, { definition: 'x' }])).toBeNull();
    expect(normalizeSenses([eye, { meaningKr: '   ' }])).toBeNull();
    expect(normalizeSenses([eye, { meaningKr: '' }, snow])).toEqual([eye, snow]);
  });

  it('상한(MAX_SENSES)으로 자름 — 모델 폭주 방어', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...eye, meaningKr: `sense${i}` }));
    expect(normalizeSenses(many)).toHaveLength(MAX_SENSES);
  });
});

describe('composeSenseFill', () => {
  const senses = [eye, snow, discern];

  it('1개 선택 → 그 뜻 그대로, 번호 없음', () => {
    const fill = composeSenseFill([1], senses, base);
    expect(fill.meaningKr).toBe('snow');
    expect(fill.exampleEn).toBe('창밖으로 하얀 눈이 내리고 있다.');
    expect(fill.meaningKr).not.toContain('①');
  });

  it('1개 선택 + 뜻별 필드 빈 경우 → base로 보충', () => {
    const sparse = { meaningKr: 'snow' };
    const fill = composeSenseFill([1], [eye, sparse], base);
    expect(fill.meaningKr).toBe('snow');
    expect(fill.exampleEn).toBe(base.exampleEn);
    expect(fill.pos).toBe('noun');
  });

  it('2개 선택 → 뜻·예문·번역·정의 전부 ①② 병기', () => {
    const fill = composeSenseFill([0, 1], senses, base);
    expect(fill.meaningKr).toBe('① eye (organ of sight) ② snow');
    expect(fill.exampleEn).toBe('① 그녀는 슬픈 눈으로 나를 바라보았다. ② 창밖으로 하얀 눈이 내리고 있다.');
    expect(fill.exampleKr).toBe('① She looked at me with sad eyes. ② White snow is falling outside the window.');
    expect(fill.definition).toBe('① 사람의 시각 기관 ② 하늘에서 내리는 얼음 결정체');
    expect(fill.pos).toBe('noun');
  });

  it('①+③ 선택 → 카드엔 ①②로 재번호(빈도순 유지)', () => {
    const fill = composeSenseFill([2, 0], senses, base); // 선택 순서 뒤집혀도
    expect(fill.meaningKr).toBe('① eye (organ of sight) ② an eye (for), discernment');
    expect(fill.meaningKr).not.toContain('③');
  });

  it('병기 시 예문 없는 뜻은 그 필드에서 번호째 생략', () => {
    const noEx = { meaningKr: 'snow', definition: '얼음 결정체' };
    const fill = composeSenseFill([0, 1], [eye, noEx], base);
    expect(fill.meaningKr).toBe('① eye (organ of sight) ② snow');
    expect(fill.exampleEn).toBe('① 그녀는 슬픈 눈으로 나를 바라보았다.');
  });

  it('빈 선택(방어) → base 그대로', () => {
    const fill = composeSenseFill([], senses, base);
    expect(fill.meaningKr).toBe(base.meaningKr);
  });
});

describe('fitsSaveLimits', () => {
  const okFill = composeSenseFill([0, 1], [eye, snow], base);

  it('일반 병기는 통과', () => {
    expect(fitsSaveLimits(okFill)).toBe(true);
  });

  it('예문 300자 초과 → 거부', () => {
    expect(fitsSaveLimits({ ...okFill, exampleEn: 'a'.repeat(301) })).toBe(false);
  });

  it('정의는 500자까지 허용', () => {
    expect(fitsSaveLimits({ ...okFill, definition: 'a'.repeat(500) })).toBe(true);
    expect(fitsSaveLimits({ ...okFill, definition: 'a'.repeat(501) })).toBe(false);
  });
});

describe('stripSenseMarkers (예문 TTS용)', () => {
  it('병기 기호 제거 + 공백 정리', () => {
    expect(stripSenseMarkers('① 나는 사과했다. ② 사과를 먹었다.'))
      .toBe('나는 사과했다. 사과를 먹었다.');
  });

  it('기호 없는 문장은 그대로', () => {
    expect(stripSenseMarkers('She looked at me.')).toBe('She looked at me.');
  });
});

describe('senseChipLabel', () => {
  it('짧은 대역어는 그대로', () => {
    expect(senseChipLabel(snow)).toBe('snow');
  });

  it('쉼표 나열이면 첫 항목만 — 칩은 짧게', () => {
    expect(senseChipLabel(discern)).toBe('an eye (for)');
  });

  it('①② 병기가 잘못 섞이면 첫 뜻만', () => {
    expect(senseChipLabel({ meaningKr: '① apple ② apology' })).toBe('apple');
  });

  it('과도한 길이는 말줄임', () => {
    const label = senseChipLabel({ meaningKr: 'a'.repeat(100) });
    expect(label.length).toBeLessThanOrEqual(22);
    expect(label.endsWith('…')).toBe(true);
  });
});

describe('AIWordResultSchema senses 하위호환', () => {
  const baseResult = { term: '눈', definition: 'd', exampleEn: 'e', meaningKr: 'm' };

  it('senses 없는 옛 응답/캐시도 그대로 통과', () => {
    expect(AIWordResultSchema.safeParse(baseResult).success).toBe(true);
  });

  it('senses 배열 포함 응답 통과', () => {
    const parsed = AIWordResultSchema.safeParse({ ...baseResult, senses: [eye, snow] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.senses).toHaveLength(2);
  });

  it('senses 5개 초과는 거부(max 4) — 수신 상한', () => {
    const many = Array.from({ length: 5 }, () => eye);
    expect(AIWordResultSchema.safeParse({ ...baseResult, senses: many }).success).toBe(false);
  });
});
