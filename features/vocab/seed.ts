import i18n from '@/i18n';

import type { SeedData } from './db';

/**
 * 첫 실행 샘플 단어장의 문구 — **UI 언어를 따른다**.
 *
 * ko 화면은 영어 단어 3개(한국어 뜻), en 화면은 한국어 단어 3개(영어 뜻)를 넣는다.
 * 예전에는 영어 단어에 한국어 뜻만 있는 목록 하나뿐이라, 영어 사용자는 앱을 처음 켜자마자
 * 읽을 수 없는 단어장을 만났다. 온보딩 데모와 같은 방향이다.
 *
 * 시드는 단어장이 0개일 때(= 새 설치)만 돈다. 그 시점엔 저장된 언어 설정 자체가 없어
 * `i18n.language`가 기기 언어 그대로이므로, LocaleContext의 비동기 복원을 기다릴 필요가 없다.
 *
 * db.ts가 아니라 여기 있는 이유는 그쪽 주석 참조 — 데이터 계층은 UI 언어를 모르게 둔다.
 */
export function buildSeedData(): SeedData {
  const word = (n: 1 | 2 | 3) => ({
    term: i18n.t(`seed.w${n}Term`),
    definition: i18n.t(`seed.w${n}Definition`),
    phonetic: i18n.t(`seed.w${n}Phonetic`),
    pos: i18n.t(`seed.w${n}Pos`),
    exampleEn: i18n.t(`seed.w${n}Example`),
    exampleKr: i18n.t(`seed.w${n}ExampleTr`),
    meaningKr: i18n.t(`seed.w${n}Meaning`),
    tags: i18n.t(`seed.w${n}Tags`).split(','),
  });

  return {
    listTitle: i18n.t('seed.listTitle'),
    words: [word(1), word(2), word(3)],
  };
}
