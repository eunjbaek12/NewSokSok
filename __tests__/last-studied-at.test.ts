/**
 * "마지막 학습" 시각(`lists.lastStudiedAt`)이 **학습에서만** 갱신되는지.
 *
 * 🔴 2026-08-29 이전에는 갱신 지점이 8곳이었고 그중 학습 경로는 하나도 없었다 —
 *    덱을 담기만 하거나 별표 하나만 눌러도 목록이 "마지막 학습: 방금 전"이라고
 *    표시했다. 실사용 화면에 보이는 유일한 학습 지표라 그대로 거짓이었다.
 *
 * 이 파일이 지키는 계약은 둘이다:
 *   ① 학습 세션(commitSessionResults)은 갱신한다 — 카드를 한 장이라도 본 경우에만.
 *   ② 단어를 만지는 동작은 갱신하지 않는다(편집·별표·복사·이동·병합·목록 암기 체크).
 *
 * ②는 소스에 `SET lastStudiedAt` 이 updateStudyTime 한 곳에만 남아 있는지로 본다.
 * DB 함수를 하나씩 돌리려면 expo-sqlite 가 필요한데 이 환경에 없고(vocab-db 스위트가
 * 그래서 못 돈다), 정작 회귀는 "누가 다른 함수에 그 UPDATE 를 되살리는 것"이라
 * 소스 검사가 더 정확히 그 회귀를 잡는다.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('② lastStudiedAt 을 쓰는 곳은 updateStudyTime 하나뿐이다', () => {
  const src = read('features/vocab/db.ts');

  test('UPDATE ... SET lastStudiedAt 이 정확히 한 곳', () => {
    const hits = src.match(/SET lastStudiedAt/g) ?? [];
    expect(hits).toHaveLength(1);
  });

  test('그 한 곳이 updateStudyTime 안이다', () => {
    const fn = src.slice(src.indexOf('export async function updateStudyTime'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('SET lastStudiedAt');
  });

  test.each([
    'updateWord',
    'toggleMemorized',
    'toggleStarred',
    'mergeLists',
    'setWordsMemorized',
    'copyWords',
    'moveWords',
  ])('%s 는 갱신하지 않는다', (fnName) => {
    const start = src.indexOf(`export async function ${fnName}`);
    expect(start).toBeGreaterThan(-1);
    // 다음 export 선언 전까지를 그 함수의 본문으로 본다
    const rest = src.slice(start + 10);
    const next = rest.indexOf('\nexport ');
    const body = next === -1 ? rest : rest.slice(0, next);
    expect(body).not.toContain('SET lastStudiedAt');
  });
});

describe('① 학습 세션은 갱신한다', () => {
  const src = read('features/study/use-session-commit.ts');

  test('commitSessionResults 가 updateStudyTime 을 부른다', () => {
    expect(src).toContain('updateStudyTime');
    const fn = src.slice(src.indexOf('export async function commitSessionResults'));
    expect(fn).toContain('updateStudyTime(listId)');
  });

  test('🔑 카드를 한 장도 안 본 세션은 갱신하지 않는다', () => {
    // 학습 화면에 들어갔다 바로 나오면 results 가 비어 있다. 그것까지 "학습함"으로
    // 치면 예전처럼 학습과 무관한 갱신이 다시 생긴다.
    const fn = src.slice(src.indexOf('export async function commitSessionResults'));
    // 같은 가드 안에 학습량 기록이 함께 들어오면서 블록이 됐다(2026-08-29) —
    // 지키는 계약은 그대로다: seenIds 가 비면 갱신하지 않는다.
    expect(fn).toMatch(/if \(plan\.seenIds\.length > 0\)\s*\{?\s*await updateStudyTime\(listId\)/);
  });
});

describe('생성 직후는 "학습 기록 없음"이다', () => {
  const src = read('features/vocab/db.ts');

  test('createList 는 lastStudiedAt 에 0 을 넣는다', () => {
    const fn = src.slice(src.indexOf('export async function createList'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('lastStudiedAt: 0');
  });

  test('🔴 position 은 0 이 아니다 — 정렬 기준이라 now 를 쓴다', () => {
    // 둘을 같이 0 으로 옮기면 새 단어장이 목록 맨 아래로 간다.
    const fn = src.slice(src.indexOf('export async function createList'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('position: now');
  });

  test('ListCard 가 빈 값을 noStudyRecord 로 표시한다', () => {
    const card = read('components/ListCard.tsx');
    expect(card).toMatch(/if \(!timestamp\) return t\('listCard\.noStudyRecord'\)/);
  });

  test('🔑 문구가 "마지막 학습:" 과 겹쳐 읽히지 않는다', () => {
    // noStudyRecord 는 lastStudy("마지막 학습: {{time}}")의 time 자리에 들어간다.
    // 그래서 그 자체가 "학습 기록 없음"이면 "마지막 학습: 학습 기록 없음"이 된다 —
    // 새 단어장마다 뜨는 문구라 실기에서 눈에 띄었다.
    for (const lang of ['ko', 'en', 'es']) {
      const d = JSON.parse(read(`i18n/locales/${lang}.json`));
      const combined = d.listCard.lastStudy.replace('{{time}}', d.listCard.noStudyRecord);
      // "학습/study/estudio" 가 두 번 나오면 중복이다
      const stem = { ko: '학습', en: 'study', es: 'estudio' }[lang]!;
      const count = combined.toLowerCase().split(stem.toLowerCase()).length - 1;
      expect({ lang, combined, count }).toEqual({ lang, combined, count: 1 });
    }
  });
});

describe('🔑 정렬은 이 컬럼과 무관하다', () => {
  test('lists 조회가 position 으로 정렬한다', () => {
    const src = read('features/vocab/db.ts');
    expect(src).toContain('ORDER BY position DESC');
    // lastStudiedAt 으로 정렬하는 곳이 없어야 한다 — 있으면 이 변경이 목록 순서를 바꾼다
    expect(src).not.toMatch(/ORDER BY[^;]*lastStudiedAt/);
  });
});
