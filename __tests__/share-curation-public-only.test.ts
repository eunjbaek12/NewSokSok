// 「공유 단어장에 올리기」(shareCuration) — 게시물과 친구에게 보낸 사본을 섞지 않는다.
// docs/share-to-friend-spec.md §6.1.
//
// 친구에게 보내기가 같은 테이블(curated_themes, visibility='link')에 행을 쌓게 되면서, 게시만
// 생각하고 짠 검사 셋이 틀어졌다:
//   1. 같은 제목을 친구에게 보낸 적만 있어도 「이미 공유되어 있습니다」 → [갱신]이 그 사본을 덮었다
//   2. 같은 제목의 행이 여럿이면 maybeSingle 이 오류를 내고, 삼킨 오류 때문에 검사가 통과됐다
//   3. 50개 한도에 만료된 친구 공유까지 세서, 몇 달 뒤엔 게시가 막혔다
//
// 가짜 supabase 는 eq/ilike/or/limit 필터를 실제로 적용하고, maybeSingle 은 여러 행에 오류를
// 낸다 — 옛 코드로 되돌리면 아래 테스트가 떨어져야 한다.

type Row = Record<string, any>;

const mockDb: { curated_themes: Row[]; curated_words: Row[] } = { curated_themes: [], curated_words: [] };
let mockIdSeq = 0;

jest.mock('@/features/vocab/db', () => ({
  generateId: () => `gen-${++mockIdSeq}`,
}));

jest.mock('@/lib/supabase', () => {
  const from = (table: 'curated_themes' | 'curated_words') => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'update' | 'delete' = 'select';
    let patch: Row = {};
    let head = false;
    let returning = false;
    let limit = Infinity;

    const matched = () => mockDb[table].filter(r => filters.every(f => f(r)));
    const run = () => {
      const rows = matched();
      if (op === 'update') {
        rows.forEach(r => Object.assign(r, patch));
        return { data: returning ? rows.map(r => ({ id: r.id })) : null, error: null };
      }
      if (op === 'delete') {
        for (const r of rows) mockDb[table].splice(mockDb[table].indexOf(r), 1);
        return { data: null, error: null };
      }
      if (head) return { count: rows.length, error: null };
      return { data: rows.slice(0, limit), error: null };
    };

    const q: any = {
      select: (_cols?: string, opts?: { head?: boolean }) => {
        if (op !== 'select') returning = true;
        head = Boolean(opts?.head);
        return q;
      },
      eq: (f: string, v: unknown) => { filters.push(r => r[f] === v); return q; },
      ilike: (f: string, v: string) => { filters.push(r => String(r[f]).toLowerCase() === v.toLowerCase()); return q; },
      or: (expr: string) => {
        const m = expr.match(/^expires_at\.is\.null,expires_at\.gt\.(\d+)$/);
        if (!m) throw new Error('unexpected or(): ' + expr);
        const now = Number(m[1]);
        filters.push(r => r.expires_at == null || r.expires_at > now);
        return q;
      },
      limit: (n: number) => { limit = n; return q; },
      update: (p: Row) => { op = 'update'; patch = p; return q; },
      delete: () => { op = 'delete'; return q; },
      insert: (rows: Row | Row[]) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        // creator_id 는 서버 기본값(auth.uid())이 채운다 — 앱은 넣지 않는다.
        const defaults = table === 'curated_themes' ? { creator_id: 'u1', visibility: 'public', expires_at: null } : {};
        mockDb[table].push(...arr.map(r => ({ ...defaults, ...r })));
        return Promise.resolve({ error: null });
      },
      // PostgREST: 0행이면 null, 여러 행이면 오류(PGRST116).
      maybeSingle: () => {
        const rows = matched();
        if (rows.length > 1) return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      single: () => Promise.resolve({ data: matched()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  };

  return {
    supabase: {
      from,
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});

import { shareCuration, DuplicateCurationError, CurationCapacityError } from '@/features/vocab/api';
import type { VocaList } from '@/lib/types';

const DAY = 24 * 60 * 60 * 1000;

const list = (title: string): VocaList => ({
  id: 'L1',
  title,
  isVisible: true,
  createdAt: 0,
  words: [
    { id: 'w1', term: 'abandon', definition: '', exampleEn: '', meaningKr: '버리다', isMemorized: false, isStarred: false, tags: [] },
    { id: 'w2', term: 'absorb', definition: '', exampleEn: '', meaningKr: '흡수하다', isMemorized: false, isStarred: false, tags: [] },
  ],
});

const theme = (over: Row): Row => ({
  creator_id: 'u1',
  title: '토익',
  visibility: 'public',
  expires_at: null,
  ...over,
});

const linkShare = (id: string, over: Row = {}): Row =>
  theme({ id, visibility: 'link', expires_at: Date.now() + 30 * DAY, ...over });

beforeEach(() => {
  mockDb.curated_themes = [];
  mockDb.curated_words = [];
  mockIdSeq = 0;
});

describe('제목 중복 검사는 게시물끼리만', () => {
  test('같은 제목을 친구에게 보낸 적만 있으면 묻지 않고 올린다', async () => {
    mockDb.curated_themes.push(linkShare('sent-1'));

    await shareCuration(list('토익'), { creatorName: '은정' });

    const posted = mockDb.curated_themes.filter(t => t.visibility === 'public');
    expect(posted).toHaveLength(1);
    expect(posted[0].title).toBe('토익');
  });

  test('같은 제목의 게시물이 있으면 묻는다 — 친구 공유가 여럿 섞여 있어도', async () => {
    mockDb.curated_themes.push(linkShare('sent-1'), linkShare('sent-2'), theme({ id: 'posted' }));

    await expect(shareCuration(list('토익'), { creatorName: '은정' }))
      .rejects.toEqual(expect.objectContaining({ name: 'DuplicateCurationError', existingId: 'posted' }));
    expect(mockDb.curated_themes).toHaveLength(3);
  });

  test('남의 게시물 제목은 상관없다', async () => {
    mockDb.curated_themes.push(theme({ id: 'other', creator_id: 'u2' }));

    await shareCuration(list('토익'), { creatorName: '은정' });
    expect(mockDb.curated_themes.filter(t => t.creator_id === 'u1')).toHaveLength(1);
  });

  test('DuplicateCurationError 는 그대로 던진다(공유 창이 이 타입으로 갈라 묻는다)', async () => {
    mockDb.curated_themes.push(theme({ id: 'posted' }));
    await expect(shareCuration(list('토익'), { creatorName: '은정' })).rejects.toBeInstanceOf(DuplicateCurationError);
  });
});

describe('갱신은 게시물에만', () => {
  test('친구에게 보낸 사본은 갱신으로 덮이지 않는다 — 보낸 내용은 굳는다(§2-4)', async () => {
    mockDb.curated_themes.push(linkShare('sent-1', { creator_name: '보낸 이름' }));
    mockDb.curated_words.push({ id: 'old', theme_id: 'sent-1', term: 'original' });

    await expect(shareCuration(list('토익'), { creatorName: '은정', updateId: 'sent-1' })).rejects.toThrow();

    expect(mockDb.curated_themes[0].creator_name).toBe('보낸 이름');
    expect(mockDb.curated_words.map(w => w.term)).toEqual(['original']);
  });

  test('게시물은 갱신된다', async () => {
    mockDb.curated_themes.push(theme({ id: 'posted', creator_name: '옛 이름' }));
    mockDb.curated_words.push({ id: 'old', theme_id: 'posted', term: 'original' });

    await shareCuration(list('토익'), { creatorName: '은정', updateId: 'posted' });

    expect(mockDb.curated_themes[0].creator_name).toBe('은정');
    expect(mockDb.curated_words.map(w => w.term)).toEqual(['abandon', 'absorb']);
  });
});

describe('50개 한도는 살아 있는 공유만 센다', () => {
  test('만료된 친구 공유 50개는 게시를 막지 않는다', async () => {
    for (let i = 0; i < 50; i++) {
      mockDb.curated_themes.push(linkShare(`expired-${i}`, { title: `옛 공유 ${i}`, expires_at: Date.now() - DAY }));
    }
    await shareCuration(list('토익'), { creatorName: '은정' });
    expect(mockDb.curated_themes.filter(t => t.visibility === 'public')).toHaveLength(1);
  });

  test('살아 있는 공유가 50개면 막는다 — 게시물과 친구 공유를 합쳐서', async () => {
    for (let i = 0; i < 25; i++) mockDb.curated_themes.push(theme({ id: `p-${i}`, title: `게시 ${i}` }));
    for (let i = 0; i < 25; i++) mockDb.curated_themes.push(linkShare(`s-${i}`, { title: `보냄 ${i}` }));

    await expect(shareCuration(list('토익'), { creatorName: '은정' })).rejects.toBeInstanceOf(CurationCapacityError);
  });
});
