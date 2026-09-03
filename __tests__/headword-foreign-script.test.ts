/**
 * isForeignScriptFor — 404 안내를 "철자 문제"와 "언어 설정 문제"로 가르는 판정.
 *
 * 🔴 2026-09-03 실측에서 나왔다. 한국어 단어장에 `running` 을 넣으면 서버가 404(한국어
 * 단어가 아님)를 주고 앱은 **"철자를 확인하세요"** 라고 안내했다 — 철자는 멀쩡했고
 * 원인은 언어 설정이라, 사용자가 확인할 방법이 없는 안내였다.
 *
 * 🔑 이 판정은 **막지 않는다.** 막으면 한국어 단어장의 `TV`·`DNA` 처럼 정당한 표제어가
 * 함께 죽는다. 시도는 그대로 하고(404 는 환불된다), 실패한 뒤 문구만 가른다.
 */

import { isForeignScriptFor } from '../utils/headword-guard';

describe('isForeignScriptFor — 배우는 언어와 문자 체계가 어긋나는가', () => {
  test('🔴 한국어 단어장에 영어 단어 (이번에 드러난 자리)', () => {
    expect(isForeignScriptFor('running', 'ko')).toBe(true);
    expect(isForeignScriptFor('apple', 'ko')).toBe(true);
  });

  test('한국어 단어장의 정상 표제어는 아니다', () => {
    expect(isForeignScriptFor('사과', 'ko')).toBe(false);
    expect(isForeignScriptFor('달리다', 'ko')).toBe(false);
    // 한자어 표기도 통과시킨다 — 애매하면 통과가 옳다(막는 판정이 아니다)
    expect(isForeignScriptFor('漢字', 'ko')).toBe(false);
    // 섞인 형태(T셔츠)는 겹치는 체계가 있으므로 통과
    expect(isForeignScriptFor('T셔츠', 'ko')).toBe(false);
  });

  test('반대 방향 — 영어 단어장에 한글 (게이트가 이미 잡지만 안전망)', () => {
    expect(isForeignScriptFor('사과', 'en')).toBe(true);
    expect(isForeignScriptFor('apple', 'en')).toBe(false);
    // es·vi 의 악센트·성조 문자는 라틴이다
    expect(isForeignScriptFor('canción', 'es')).toBe(false);
    expect(isForeignScriptFor('tiếng', 'vi')).toBe(false);
  });

  test('일본어·중국어', () => {
    expect(isForeignScriptFor('sushi', 'ja')).toBe(true);   // 로마자 입력
    expect(isForeignScriptFor('寿司', 'ja')).toBe(false);
    expect(isForeignScriptFor('たべる', 'ja')).toBe(false);
    expect(isForeignScriptFor('你好', 'zh')).toBe(false);
    expect(isForeignScriptFor('nihao', 'zh')).toBe(true);   // 병음 입력
  });

  test('판단하지 않는 경우 — 글자가 없거나 모르는 언어', () => {
    expect(isForeignScriptFor('123', 'ko')).toBe(false);
    expect(isForeignScriptFor('!!!', 'ko')).toBe(false);
    expect(isForeignScriptFor('', 'ko')).toBe(false);
    expect(isForeignScriptFor('running', 'de')).toBe(false); // 등록되지 않은 출발어
  });
});
