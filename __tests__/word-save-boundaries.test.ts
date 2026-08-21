// 단어를 SQLite 에 쓰는 경계는 전부 정제(sanitizeWordForSave)를 타야 한다.
//
// 왜 이런 모양의 테스트인가: 정제는 원래 addWord·addBatchWords·updateWord 세 곳에만
// 걸려 있었고 createCuratedList 하나가 빠져 있었다. 그래서 같은 큐레이션 덱을
// 「기존 단어장에 추가」로 담으면 멀쩡하고 「새 단어장 만들기」로 담으면 서버 덱의
// definition 에 남은 개행이 그대로 저장됐다 — 그러면 cloud_words 의 CHECK
// (chk_cloud_words_definition_noctrl)에 걸려 **그 뒤 모든 동기화가 영구 실패**한다
// (청크 upsert 가 throw 하고 dirty 는 남으므로 다음 시도도 같은 자리에서 막힌다).
// 실제로 기기에서 재현됐다. 값 하나를 고치는 대신 **경계가 늘어나도 잡히도록** 못박는다.
//
// 🔑 파일 전체를 한 번에 훑으면 다른 함수의 sanitizeWordForSave 가 자기매치로 잡혀
//    회귀를 못 잡는다. 반드시 **함수 본문 단위**로 본다.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, '..', 'features', 'vocab', 'mutations.ts'), 'utf8');

/** db 계층에서 단어 본문을 쓰는 함수들. 여기 추가되는 것이 곧 새 경계다. */
const WORD_WRITERS = ['db.addWord(', 'db.addBatchWords(', 'db.updateWord(', 'db.createCuratedList('];

/** `export async function 이름(` … 다음 `\nexport ` 직전까지를 한 함수 본문으로 자른다. */
function splitFunctions(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /export\s+(?:async\s+)?function\s+(\w+)/g;
  const marks: { name: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) marks.push({ name: m[1], at: m.index });
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].at : src.length;
    out.push({ name: mark.name, body: src.slice(mark.at, end) });
  });
  return out;
}

describe('단어 저장 경계 — 전부 sanitizeWordForSave 를 탄다', () => {
  const fns = splitFunctions(SOURCE);

  it('함수 분해가 실제로 동작한다 (분해가 깨지면 아래 검사가 조용히 통과한다)', () => {
    expect(fns.length).toBeGreaterThan(5);
    expect(fns.map(f => f.name)).toEqual(expect.arrayContaining(['addWord', 'createCuratedList']));
    // 자기매치 방지의 증거: 한 함수 본문이 파일 전체가 아니어야 한다.
    expect(fns.find(f => f.name === 'createList')!.body).not.toContain('db.addWord(');
  });

  it('db 에 단어 본문을 쓰는 함수는 빠짐없이 정제한다', () => {
    const writers = fns.filter(f => WORD_WRITERS.some(w => f.body.includes(w)));
    // 경계가 하나라도 사라지면(이름이 바뀌면) 여기서 먼저 걸린다.
    expect(writers.map(f => f.name).sort()).toEqual(
      ['addBatchWords', 'addWord', 'createCuratedList', 'updateWord'],
    );
    const missing = writers.filter(f => !f.body.includes('sanitizeWordForSave')).map(f => f.name);
    expect(missing).toEqual([]);
  });
});
