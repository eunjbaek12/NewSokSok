/**
 * 학습 세션이 DB 에 남기는 기록의 **지점**이 하나인지.
 *
 * 🔴 2026-08-29 이전에는 학습량(오늘 공부한 단어 수)의 기록 지점이 둘이었다 —
 *    완주는 결과 화면(app/study-results.tsx), 이탈은 use-abandon-record 의
 *    언마운트 cleanup. completedRef 로 이중 기록은 막았지만 **세는 방법이 서로
 *    달랐다**: 완주는 results.length, 이탈은 빈 칸을 걸러낸 수. 퀴즈는 인덱스
 *    대입이라 배열이 희소할 수 있어 같은 세션인데 끝내는 방법에 따라 숫자가 갈렸다.
 *
 * 🔑 더 중요한 건 구조다. 암기 전환·오답·복습 사다리·마지막 학습 시각은 모두
 *    commitSessionResults 로 모였는데 학습량만 화면 쪽에 남아 있었다 — 새 학습
 *    모드를 만들 때 조용히 빠지는 그 구조이고, 예문 모드가 실제로 그랬다.
 *
 * 이 파일이 지키는 계약은 셋이다:
 *   ① 학습량을 기록하는 곳은 commitSessionResults 하나다.
 *   ② 화면은 직접 기록하지 않는다(결과 화면·학습 화면 3종).
 *   ③ 아무도 안 읽는 lastResult* 스냅샷은 다시 쓰지 않는다.
 *
 * 소스 검사인 이유는 [[last-studied-at.test.ts]] 와 같다 — DB 함수를 실제로 돌리려면
 * expo-sqlite 가 필요한데 이 환경에 없고(vocab-db 스위트가 그래서 못 돈다), 정작 막을
 * 회귀는 "누가 다른 곳에 기록을 되살리는 것"이라 소스 검사가 그 회귀를 더 정확히 잡는다.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/**
 * 주석 줄(`//`·`/*`·JSDoc 의 `*`)을 걷어낸 본문만 돌려준다.
 *
 * 🔑 이 검사들은 "되살리지 말라"는 이력을 주석으로 남긴 파일을 훑는다. 주석을 안
 *    걸러내면 그 이력 자체가 위반으로 잡혀, 정작 막으려는 실제 호출과 구별되지 않는다.
 */
const codeLines = (src: string) =>
  src.split('\n').filter(l => !/^\s*(\/\/|\/?\*)/.test(l));

const callsTo = (src: string, name: string) =>
  codeLines(src).filter(l => new RegExp(`\\b${name}\\b`).test(l)).map(l => l.trim());

const STUDY_SCREENS = [
  'features/study/flashcards/screen.tsx',
  'features/study/quiz/screen.tsx',
  'features/study/examples/screen.tsx',
];

describe('① 학습량 기록은 commitSessionResults 한 곳', () => {
  const src = read('features/study/use-session-commit.ts');
  const fn = src.slice(src.indexOf('export async function commitSessionResults'));

  test('commitSessionResults 가 recordStudySession 을 부른다', () => {
    expect(fn).toContain('recordStudySession(');
  });

  test('🔑 답한 카드 수(seenIds)로 센다 — results.length 가 아니다', () => {
    // 퀴즈는 인덱스 대입이라 배열이 희소할 수 있다. results.length 로 세면
    // 건너뛴 칸까지 학습량에 들어가고, 이탈 경로와 숫자가 어긋난다.
    expect(fn).toContain('recordStudySession(plan.seenIds.length)');
  });

  test('🔑 카드를 한 장도 안 본 세션은 기록하지 않는다', () => {
    // 학습 화면에 들어갔다 바로 나오면 results 가 비어 있다. 그것까지 "학습함"으로
    // 치면 학습하지 않은 날이 스트릭에 들어간다.
    const guard = fn.indexOf('if (plan.seenIds.length > 0)');
    expect(guard).toBeGreaterThan(-1);
    expect(fn.indexOf('recordStudySession(')).toBeGreaterThan(guard);
  });
});

describe('② 화면은 학습량을 직접 기록하지 않는다', () => {
  test.each(['app/study-results.tsx', ...STUDY_SCREENS])('%s', (file) => {
    // 주석의 이력 언급은 허용하고, 실제 호출만 막는다.
    expect({ file, calls: callsTo(read(file), 'recordStudySession') })
      .toEqual({ file, calls: [] });
  });
});

describe('③ lastResult* 스냅샷은 다시 쓰지 않는다', () => {
  test('saveLastResult 는 어디에도 없다', () => {
    // 완주 시점에 고정돼 이후의 단어 추가·삭제·암기 토글을 반영하지 못하는 값이라
    // 화면은 라이브 카운트를 쓴다(components/ListCard.tsx). 남아 있던 것은 쓰기뿐이었고,
    // 완주마다 아무도 안 보는 값 때문에 단어장이 dirty 로 찍혀 클라우드 push 가 일어났다.
    for (const file of ['features/vocab/db.ts', 'features/vocab/mutations.ts', ...STUDY_SCREENS]) {
      expect({ file, calls: callsTo(read(file), 'saveLastResult') })
        .toEqual({ file, calls: [] });
    }
  });

  test('🔑 컬럼과 동기화 배선은 남긴다 — 구버전 앱이 아직 올린다', () => {
    // 서버 컬럼을 지우는 변경이 아니다. 매퍼에서 빼면 pull 이 값을 잃는다.
    const mapping = read('features/sync/mapping.ts');
    expect(mapping).toContain('last_result_percent');
    expect(mapping).toContain('lastResultPercent');
  });
});

describe('🔑 낭독은 이 경로를 타지 않는다 — 통계 제외 결정', () => {
  test('autoplay 화면은 commitSessionResults 를 부르지 않는다', () => {
    const files = fs
      .readdirSync(path.join(ROOT, 'features/study/autoplay'))
      .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = read(path.join('features/study/autoplay', f));
      expect({ f, hit: src.includes('commitSessionResults') }).toEqual({ f, hit: false });
    }
  });
});
