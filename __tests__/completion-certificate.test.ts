/**
 * 완주 상장의 «판단»만 검증한다. 상장의 치수(여백·자간·괘선 두께)는 1080²로 실제
 * 렌더해 눈으로 맞춘 것이라 테스트가 지킬 수 없다 — 여기서 지키는 건 다음 넷이다.
 *
 * 1. 긴 이름을 큰 크기로 그리지 않는다(그러면 본문이 서명란을 밀어낸다)
 * 2. 강조 표시가 문장 안에서 제 자리를 지킨다
 * 3. 도장 글자가 원을 넘치지 않는다(로마자 로케일)
 * 4. 「N일 동안」은 달력 일수가 아니라 «편 날»의 수이고, 「마지막 단어」는 실제로 마지막이다
 *
 * 4번은 SQL 한 덩어리라 순수 함수로 못 나눈다 → migration-018 테스트와 같은 방식으로
 * node:sqlite 위에 001→N 사다리를 재생해 진짜 엔진에 물어본다.
 */
import {
  deckType, sealType, splitEmphasis, deckGap, estimateEm, CONTENT_W,
  COMPLETION_DAYS_SQL, COMPLETION_LAST_TERM_SQL, COMPLETION_RECORD_SQL,
  COMPLETION_BACKFILL_SQL, COMPLETION_LIST_SQL, COMPLETION_SUMMARY_SQL,
  COMPLETION_FOR_PLAN_SQL,
} from '../features/stats/completion';
import { MIGRATIONS } from '../lib/db/migrations';
import ko from '../i18n/locales/ko.json';
import en from '../i18n/locales/en.json';
import es from '../i18n/locales/es.json';

describe('완주 상장 — 덱 이름 크기', () => {
  it('한 줄에 들어가는 이름은 크게 간다', () => {
    // 정본이 쓴 이름. 실제로 1080²에서 한 줄로 떨어졌다.
    expect(deckType('NGSL 핵심 2800').fontSize).toBe(35.5);
    expect(deckType('토익 기출 어휘').fontSize).toBe(35.5);
  });

  it('두 줄로 넘어갈 이름은 작아진다 — 큰 채로 두면 본문이 서명란을 밀어낸다', () => {
    expect(deckType('수능 필수 영단어 완전정복 1200').fontSize).toBe(25);
    expect(deckType('일본어 JLPT N2 한자 읽기와 뜻 완전 마스터 1500제').fontSize).toBe(25);
    // 로마자도 마찬가지 — 글자당 폭이 좁을 뿐 넘치는 건 같다.
    expect(deckType('Everyday Spanish 500').fontSize).toBe(25);
  });

  it('한글 폭 어림이 전각 기준이다 — 8자면 이미 한 줄을 넘는다', () => {
    expect(estimateEm('일곱글자입니다')).toBe(7);
    expect(7 * 35.5).toBeLessThanOrEqual(CONTENT_W);
    expect(8 * 35.5).toBeGreaterThan(CONTENT_W);
  });

  it('제목이 최대 길이(40자)여도 크기를 고른다', () => {
    expect(deckType('가'.repeat(40)).fontSize).toBe(25);
  });
});

describe('완주 상장 — 본문 강조', () => {
  it('별표 안쪽만 굵다', () => {
    expect(splitEmphasis('위 단어장의 단어 *2,800*개를 *11일* 동안')).toEqual([
      { text: '위 단어장의 단어 ', strong: false },
      { text: '2,800', strong: true },
      { text: '개를 ', strong: false },
      { text: '11일', strong: true },
      { text: ' 동안', strong: false },
    ]);
  });

  it('강조가 없는 문장은 그대로 한 조각이다', () => {
    expect(splitEmphasis('모두 외웠기에 이 상장을 드립니다.')).toEqual([
      { text: '모두 외웠기에 이 상장을 드립니다.', strong: false },
    ]);
  });

  it('별표 짝이 안 맞아도 문장을 잃지 않는다 — 번역이 한쪽을 빠뜨릴 수 있다', () => {
    const segs = splitEmphasis('단어 *2,800개를 모두 외웠습니다');
    expect(segs.map(s => s.text).join('')).toBe('단어 2,800개를 모두 외웠습니다');
    expect(segs.every(s => !s.strong)).toBe(true);
  });

  it('세 언어의 본문 문구가 모두 짝이 맞는 별표를 쓴다', () => {
    const keys = ['certBody1', 'certBody1NoDays', 'certLastWord'] as const;
    for (const [name, dict] of Object.entries({ ko, en, es })) {
      for (const k of keys) {
        const text: string = (dict as any).completionShare[k];
        expect(`${name}.${k}: ${text.split('*').length % 2}`).toBe(`${name}.${k}: 1`);
      }
    }
  });
});

describe('완주 상장 — 도장·여백', () => {
  it('두 글자(완주)는 크게, 로마자는 작게 — 그대로 두면 원을 넘친다', () => {
    expect(sealType(ko.completionShare.certSeal).fontSize).toBe(15.5);
    expect(sealType(en.completionShare.certSeal).fontSize).toBe(10.5);
    expect(sealType(es.completionShare.certSeal).fontSize).toBe(10.5);
  });

  it('마지막 단어 줄이 빠지면 그만큼을 위로 나눠 가운데가 비지 않게 한다', () => {
    expect(deckGap(false)).toBeGreaterThan(deckGap(true));
  });
});

// ── 여기서부터는 진짜 SQLite 엔진 ──────────────────────────────────────────
type Db = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, ...p: any[]) => Promise<void>;
  getAllAsync: (sql: string, ...p: any[]) => Promise<any[]>;
};

let DatabaseSync: any;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}
const describeIfSqlite = DatabaseSync ? describe : describe.skip;

describeIfSqlite('완주 상장 — memorized_log 에서 뽑는 두 값', () => {
  let raw: any;

  beforeEach(async () => {
    raw = new DatabaseSync(':memory:');
    // expo-sqlite 가 쓰는 표면만 얇게 흉내낸다(migration-018 테스트와 같은 shim).
    const db: Db = {
      execAsync: async (sql: string) => { raw.exec(sql); },
      runAsync: async (sql: string, ...params: any[]) => {
        const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        raw.prepare(sql).run(...flat);
      },
      getAllAsync: async (sql: string, ...params: any[]) => {
        const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return raw.prepare(sql).all(...flat);
      },
    };
    for (const m of MIGRATIONS) await m.up(db as any);

    raw.exec(`INSERT INTO lists (id, title, createdAt, lastStudiedAt) VALUES ('L1','덱',0,0), ('L2','다른 덱',0,0)`);
    const w = (id: string, listId: string, term: string) =>
      raw.prepare(`INSERT INTO words (id, listId, term, definition, exampleEn, meaningKr, isMemorized)
                   VALUES (?, ?, ?, '', '', '', 1)`).run(id, listId, term);
    w('w1', 'L1', 'alpha');
    w('w2', 'L1', 'bravo');
    w('w3', 'L1', 'charlie');
    w('w4', 'L1', 'deleted-one');
    w('w9', 'L2', 'other-deck');
    raw.exec(`UPDATE words SET deletedAt = 111 WHERE id = 'w4'`);

    const log = (date: string, wordId: string, createdAt: number) =>
      raw.prepare(`INSERT INTO memorized_log (date, wordId, createdAt) VALUES (?, ?, ?)`)
        .run(date, wordId, createdAt);
    // 같은 날 두 단어 → 하루로 센다. 하루 안에서는 createdAt 이 늦은 쪽이 마지막.
    log('2026-09-01', 'w1', 100);
    log('2026-09-01', 'w2', 200);
    log('2026-09-03', 'w3', 300);
    // 삭제된 단어와 다른 덱의 기록은 이 상장과 무관하다.
    log('2026-09-05', 'w4', 400);
    log('2026-09-07', 'w9', 500);
  });

  afterEach(() => raw?.close());

  it('「N일」은 달력 일수가 아니라 실제로 편 날의 수다', () => {
    // 9/1~9/3 은 달력으로 3일이지만 편 날은 이틀이다.
    expect(raw.prepare(COMPLETION_DAYS_SQL).get('L1').n).toBe(2);
  });

  it('삭제된 단어·다른 단어장의 기록은 세지 않는다', () => {
    expect(raw.prepare(COMPLETION_DAYS_SQL).get('L2').n).toBe(1);
  });

  it('마지막 단어는 가장 나중 날짜의, 그날 안에서도 가장 나중 것이다', () => {
    expect(raw.prepare(COMPLETION_LAST_TERM_SQL).get('L1').term).toBe('charlie');
  });

  it('같은 날뿐이면 그날 안에서 createdAt 이 가장 늦은 것을 고른다', () => {
    raw.exec(`DELETE FROM memorized_log WHERE date = '2026-09-03'`);
    expect(raw.prepare(COMPLETION_LAST_TERM_SQL).get('L1').term).toBe('bravo');
  });

  it('017 이전에 완주한 단어장 — 로그가 없으면 0과 없음이 나온다(그 줄들을 뺀다)', () => {
    raw.exec(`DELETE FROM memorized_log`);
    expect(raw.prepare(COMPLETION_DAYS_SQL).get('L1').n).toBe(0);
    expect(raw.prepare(COMPLETION_LAST_TERM_SQL).get('L1')).toBeUndefined();
  });
});

describeIfSqlite('완주 기록(022 completions) — 완주는 상태가 아니라 사건이어야 한다', () => {
  let raw: any;

  const openWithLadder = async () => {
    raw = new DatabaseSync(':memory:');
    const db: Db = {
      execAsync: async (sql: string) => { raw.exec(sql); },
      runAsync: async (sql: string, ...params: any[]) => {
        const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        raw.prepare(sql).run(...flat);
      },
      getAllAsync: async (sql: string, ...params: any[]) => {
        const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return raw.prepare(sql).all(...flat);
      },
    };
    for (const m of MIGRATIONS) await m.up(db as any);
  };

  /** 완주 상태의 단어장 하나. startedAt 이 계획 인스턴스의 신원이다. */
  const seedList = (id: string, title: string, opts: {
    startedAt?: number; updatedAt?: number; totalDays?: number; currentDay?: number;
  } = {}) => {
    const { startedAt = 1000, updatedAt = 5000, totalDays = 3, currentDay = 4 } = opts;
    raw.prepare(
      `INSERT INTO lists (id, title, createdAt, lastStudiedAt,
                          planStartedAt, planUpdatedAt, planTotalDays, planCurrentDay)
       VALUES (?, ?, 0, 0, ?, ?, ?, ?)`
    ).run(id, title, startedAt, updatedAt, totalDays, currentDay);
  };
  const seedWords = (listId: string, n: number, from = 0) => {
    for (let i = from; i < from + n; i++) {
      raw.prepare(`INSERT INTO words (id, listId, term, definition, exampleEn, meaningKr, isMemorized)
                   VALUES (?, ?, ?, '', '', '', 1)`).run(`${listId}-w${i}`, listId, `term${i}`);
    }
  };
  const rows = () => raw.prepare(`SELECT * FROM completions ORDER BY completedAt`).all();

  afterEach(() => raw?.close());

  it('022 백필 — 이미 완주해 둔 단어장에 줄을 만든다', async () => {
    raw = new DatabaseSync(':memory:');
    const db: Db = {
      execAsync: async (sql: string) => { raw.exec(sql); },
      runAsync: async (sql: string, ...p: any[]) => {
        const flat = p.length === 1 && Array.isArray(p[0]) ? p[0] : p;
        raw.prepare(sql).run(...flat);
      },
      getAllAsync: async (sql: string, ...p: any[]) => {
        const flat = p.length === 1 && Array.isArray(p[0]) ? p[0] : p;
        return raw.prepare(sql).all(...flat);
      },
    };
    // 022 «직전»까지 올린 뒤 데이터를 심고, 022 를 돌려 백필이 실제로 걸리는지 본다.
    for (const m of MIGRATIONS.filter(m => m.version < 22)) await m.up(db as any);
    seedList('L1', '완주한 덱');
    seedWords('L1', 5);
    seedList('L2', '진행 중인 덱', { currentDay: 2 });
    seedWords('L2', 5);
    raw.prepare(`INSERT INTO memorized_log (date, wordId, createdAt) VALUES (?, ?, ?)`)
      .run('2026-09-01', 'L1-w0', 10);
    raw.prepare(`INSERT INTO memorized_log (date, wordId, createdAt) VALUES (?, ?, ?)`)
      .run('2026-09-02', 'L1-w1', 20);

    await MIGRATIONS.filter(m => m.version === 22)[0].up(db as any);

    const r = rows();
    expect(r.map((x: any) => x.listId)).toEqual(['L1']);   // 진행 중인 덱은 안 들어온다
    expect(r[0].totalWords).toBe(5);
    expect(r[0].studyDays).toBe(2);
    expect(r[0].lastTerm).toBe('term1');
    expect(r[0].startedAt).toBe(1000);
    expect(r[0].completedAt).toBe(5000);
  });

  it('완주가 아닌 단어장은 기록되지 않는다', async () => {
    await openWithLadder();
    seedList('L3', '아직 진행 중', { currentDay: 2 });
    seedWords('L3', 3);
    raw.prepare(COMPLETION_RECORD_SQL).run('L3');
    expect(rows()).toHaveLength(0);
  });

  it('🔴 한 계획에 한 줄 — 완주 뒤 더 학습해 planUpdatedAt 이 움직여도 늘지 않는다', async () => {
    await openWithLadder();
    seedList('L4', '완주 덱');
    seedWords('L4', 4);
    raw.prepare(COMPLETION_RECORD_SQL).run('L4');
    raw.exec(`UPDATE lists SET planUpdatedAt = 9999 WHERE id = 'L4'`);
    raw.prepare(COMPLETION_RECORD_SQL).run('L4');
    const r = rows();
    expect(r).toHaveLength(1);
    expect(r[0].completedAt).toBe(5000);  // 처음 완주한 날이 남는다
  });

  it('🔴 계획을 지워도(clearPlan) 기록은 남는다 — 이게 이 표가 있는 이유다', async () => {
    await openWithLadder();
    seedList('L5', '지워질 계획의 덱');
    seedWords('L5', 7);
    raw.prepare(COMPLETION_RECORD_SQL).run('L5');
    // clearPlan 이 하는 그대로
    raw.exec(`UPDATE lists SET planTotalDays = 0, planCurrentDay = 1,
              planStartedAt = NULL, planUpdatedAt = NULL WHERE id = 'L5'`);
    const r = rows();
    expect(r).toHaveLength(1);
    expect(r[0].totalWords).toBe(7);
    // 다시 훑어도 (완주 상태가 아니므로) 새로 생기지 않는다
    raw.prepare(COMPLETION_BACKFILL_SQL).run();
    expect(rows()).toHaveLength(1);
  });

  it('새 계획으로 다시 완주하면 새 줄이 된다', async () => {
    await openWithLadder();
    seedList('L6', '두 번 완주할 덱');
    seedWords('L6', 2);
    raw.prepare(COMPLETION_RECORD_SQL).run('L6');
    raw.exec(`UPDATE lists SET planStartedAt = 20000, planUpdatedAt = 25000 WHERE id = 'L6'`);
    raw.prepare(COMPLETION_RECORD_SQL).run('L6');
    expect(rows().map((r: any) => r.startedAt)).toEqual([1000, 20000]);
  });

  it('숫자는 완주 «그때»의 스냅숏이다 — 나중에 단어를 더 넣어도 지난 상장이 안 바뀐다', async () => {
    await openWithLadder();
    seedList('L7', '자라는 덱');
    seedWords('L7', 3);
    raw.prepare(COMPLETION_RECORD_SQL).run('L7');
    seedWords('L7', 30, 3);                    // 완주 뒤 단어를 더 넣었다
    raw.prepare(COMPLETION_BACKFILL_SQL).run();
    expect(rows()[0].totalWords).toBe(3);
  });

  it('목록은 최신순이고, 단어장을 지우면 굳혀 둔 이름으로 떨어진다', async () => {
    await openWithLadder();
    seedList('L8', '살아 있는 덱', { updatedAt: 100 });
    seedWords('L8', 1);
    seedList('L9', '지워질 덱', { updatedAt: 200 });
    seedWords('L9', 1);
    raw.prepare(COMPLETION_RECORD_SQL).run('L8');
    raw.prepare(COMPLETION_RECORD_SQL).run('L9');
    raw.exec(`UPDATE lists SET title = '이름을 바꿨다' WHERE id = 'L8'`);
    raw.exec(`UPDATE lists SET deletedAt = 1 WHERE id = 'L9'`);

    const list = raw.prepare(COMPLETION_LIST_SQL).all();
    expect(list.map((r: any) => r.title)).toEqual(['지워질 덱', '이름을 바꿨다']);
    expect(list.map((r: any) => r.listAlive)).toEqual([0, 1]);
    const sum = raw.prepare(COMPLETION_SUMMARY_SQL).get();
    expect(sum.books).toBe(2);
    expect(sum.words).toBe(2);
  });
});

describeIfSqlite('학습결과 시트의 상장 — 살아 있는 수가 아니라 기록을 읽는다', () => {
  let raw: any;

  beforeEach(async () => {
    raw = new DatabaseSync(':memory:');
    const db: Db = {
      execAsync: async (sql: string) => { raw.exec(sql); },
      runAsync: async (sql: string, ...p: any[]) => {
        const flat = p.length === 1 && Array.isArray(p[0]) ? p[0] : p;
        raw.prepare(sql).run(...flat);
      },
      getAllAsync: async (sql: string, ...p: any[]) => {
        const flat = p.length === 1 && Array.isArray(p[0]) ? p[0] : p;
        return raw.prepare(sql).all(...flat);
      },
    };
    for (const m of MIGRATIONS) await m.up(db as any);
    raw.prepare(
      `INSERT INTO lists (id, title, createdAt, lastStudiedAt,
                          planStartedAt, planUpdatedAt, planTotalDays, planCurrentDay)
       VALUES ('L', '덱', 0, 0, 1000, 5000, 3, 4)`
    ).run();
    for (let i = 0; i < 10; i++) {
      raw.prepare(`INSERT INTO words (id, listId, term, definition, exampleEn, meaningKr, isMemorized)
                   VALUES (?, 'L', ?, '', '', '', 1)`).run(`w${i}`, `term${i}`);
    }
    raw.prepare(COMPLETION_RECORD_SQL).run('L');
  });

  afterEach(() => raw?.close());

  it('🔴 완주 뒤 단어를 더 넣어도 상장은 그때의 10개를 말한다', () => {
    for (let i = 10; i < 15; i++) {
      raw.prepare(`INSERT INTO words (id, listId, term, definition, exampleEn, meaningKr, isMemorized)
                   VALUES (?, 'L', ?, '', '', '', 0)`).run(`w${i}`, `term${i}`);
    }
    const live = raw.prepare(`SELECT COUNT(*) as n FROM words WHERE listId = 'L'`).get().n;
    const recorded = raw.prepare(COMPLETION_FOR_PLAN_SQL).get('L', 1000);
    expect(live).toBe(15);
    expect(recorded.totalWords).toBe(10);   // "15개를 모두 외웠기에" 라고 쓰지 않는다
  });

  it('완주 뒤 더 학습해 planUpdatedAt 이 움직여도 상장 날짜는 고정된다', () => {
    raw.exec(`UPDATE lists SET planUpdatedAt = 88888 WHERE id = 'L'`);
    expect(raw.prepare(COMPLETION_FOR_PLAN_SQL).get('L', 1000).completedAt).toBe(5000);
  });

  it('다른 계획(startedAt)으로 물으면 없다 — 폴백이 살아 있는 값으로 그린다', () => {
    expect(raw.prepare(COMPLETION_FOR_PLAN_SQL).get('L', 999)).toBeUndefined();
  });
});

describeIfSqlite('마지막으로 외운 단어 — 무승부가 없어야 한다', () => {
  let raw: any;

  beforeEach(async () => {
    raw = new DatabaseSync(':memory:');
    const db: Db = {
      execAsync: async (sql: string) => { raw.exec(sql); },
      runAsync: async (sql: string, ...p: any[]) => {
        const flat = p.length === 1 && Array.isArray(p[0]) ? p[0] : p;
        raw.prepare(sql).run(...flat);
      },
      getAllAsync: async (sql: string, ...p: any[]) => {
        const flat = p.length === 1 && Array.isArray(p[0]) ? p[0] : p;
        return raw.prepare(sql).all(...flat);
      },
    };
    for (const m of MIGRATIONS) await m.up(db as any);
    raw.prepare(`INSERT INTO lists (id, title, createdAt, lastStudiedAt) VALUES ('L','덱',0,0)`).run();
    ['delta', 'alpha', 'charlie', 'bravo'].forEach((term, i) => {
      raw.prepare(`INSERT INTO words (id, listId, term, definition, exampleEn, meaningKr, isMemorized)
                   VALUES (?, 'L', ?, '', '', '', 1)`).run(`w${i}`, term);
    });
  });

  afterEach(() => raw?.close());

  it('한 배치라 createdAt 이 같아도 늘 같은 답이 나온다 — 예전에 심긴 행이 그렇다', () => {
    ['w0', 'w1', 'w2', 'w3'].forEach(id =>
      raw.prepare(`INSERT INTO memorized_log (date, wordId, createdAt) VALUES ('2026-09-04', ?, 700)`).run(id));
    const first = raw.prepare(COMPLETION_LAST_TERM_SQL).get('L').term;
    expect(first).toBe('alpha');   // 무승부는 term 오름차순으로 끊는다
    // 같은 질문에 같은 답 — 상장이 열 때마다 다른 단어를 보여 주면 안 된다
    expect(raw.prepare(COMPLETION_LAST_TERM_SQL).get('L').term).toBe(first);
  });

  it('createdAt 이 순서를 담고 있으면 «진짜 마지막»이 나온다 — 지금 쓰는 방식', () => {
    // recordMemorizedWords 가 now + index 로 찍는다: 표시한 순서가 남는다.
    ['w0', 'w1', 'w2', 'w3'].forEach((id, i) =>
      raw.prepare(`INSERT INTO memorized_log (date, wordId, createdAt) VALUES ('2026-09-04', ?, ?)`)
        .run(id, 700 + i));
    expect(raw.prepare(COMPLETION_LAST_TERM_SQL).get('L').term).toBe('bravo');  // w3
  });
});
