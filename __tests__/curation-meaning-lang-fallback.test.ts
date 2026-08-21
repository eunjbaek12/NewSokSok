// 뜻 언어에 덱이 하나도 없을 때의 안내 (features/curation/meaning-lang-fallback.ts)
//
// 왜 이 테스트가 있나: 스페인어 UI 가 1.4.0 에 나가면서 스페인어 기기는 뜻 언어가 자동으로
// es 가 되는데(deriveTargetLang), 도착어 es 인 공식 덱은 0개다. 그래서 첫 큐레이션 화면이
// "검색 결과가 없습니다"였다 — 검색한 적도 없는데. 이 판정이 조용히 무너지면 증상이
// "빈 화면"이라 아무도 신고하지 않고, 그 사용자는 그냥 떠난다.

import { pickMeaningLangFallback } from '@/features/curation/meaning-lang-fallback';

/** 2026-08-21 실측(공식 65덱). */
const REAL = new Map<string, number>([['ko', 46], ['en', 15], ['vi', 2], ['zh', 1], ['ja', 1]]);

describe('pickMeaningLangFallback', () => {
  it('덱이 0개인 언어(es)에는 영어를 권한다', () => {
    expect(pickMeaningLangFallback(REAL, 'es')).toEqual({ code: 'en', count: 15 });
  });

  it('🔴 덱이 가장 많은 언어(ko 46)를 권하지 않는다 — 읽을 수 있어야 의미가 있다', () => {
    expect(pickMeaningLangFallback(REAL, 'es')?.code).not.toBe('ko');
  });

  it('덱이 있는 언어에는 아무 말도 하지 않는다', () => {
    expect(pickMeaningLangFallback(REAL, 'ko')).toBeNull();
    expect(pickMeaningLangFallback(REAL, 'en')).toBeNull();
    expect(pickMeaningLangFallback(REAL, 'vi')).toBeNull();
  });

  it('이미 영어를 보고 있는데 0이면 더 권할 곳이 없다', () => {
    expect(pickMeaningLangFallback(new Map([['ko', 46]]), 'en')).toBeNull();
  });

  it('🔴 목록이 아직 안 왔으면(counts 비어 있음) 안내하지 않는다 — 로딩을 "덱 없음"으로 말하면 안 된다', () => {
    expect(pickMeaningLangFallback(new Map(), 'es')).toBeNull();
  });

  it('영어 덱이 0이 되면 권하지 않는다 — 눌러도 빈 화면인 버튼은 내지 않는다', () => {
    expect(pickMeaningLangFallback(new Map([['ko', 46]]), 'es')).toBeNull();
  });
});

// 화면이 실제로 이 판정을 쓰는지는 소스를 읽어 고정한다(컴포넌트 렌더 도구가 없다).
// 🔴 검사 범위를 좁힌다 — 파일 전체에서 이름만 찾으면 import 줄이 걸려 통과해 버린다.
describe('배선 — 큐레이션 화면이 이 판정을 쓰는가', () => {
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const src: string = readFileSync(join(process.cwd(), 'features/curation/screen.tsx'), 'utf8');

  it('빈 목록의 두 이유를 갈라 그린다', () => {
    // ①뜻 언어에 덱이 없음 ②그 밖(검색어·언어 칩). 하나로 합치면 다시 "결과 없음"이 된다.
    expect(src).toContain('{showMeaningLangEmpty && (');
    expect(src).toContain('{filteredThemes.length === 0 && !showMeaningLangEmpty && (');
  });

  it('공식 탭에서만 쓴다 — 커뮤니티 탭은 뜻 언어로 거르지 않는다', () => {
    const flag = src.slice(src.indexOf('const showMeaningLangEmpty'), src.indexOf(';', src.indexOf('const showMeaningLangEmpty')));
    expect(flag).toContain("activeTab === 'official'");
    expect(flag).toContain('meaningLangFallback !== null');
  });

  it('설정을 몰래 바꾸지 않는다 — 뜻 언어 변경은 사용자가 누른 뒤에만 일어난다', () => {
    // deriveTargetLang 을 건드려 자동 폴백을 넣으면 add-word 의 뜻 언어까지 영어가 된다.
    const settings: string = readFileSync(join(process.cwd(), 'features/settings/store.ts'), 'utf8');
    const derive = settings.slice(settings.indexOf('async function deriveTargetLang'), settings.indexOf('const inputStore'));
    expect(derive).not.toContain('curation');
    expect(derive).not.toContain('deck');
  });
});
