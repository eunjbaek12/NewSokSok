// 업데이트 소식 — 언어별로 줄이 하나 빠지는 자리.
//
// 🔴 1.7.0 이 처음으로 **한 언어에서만 줄을 내리는** 소식을 낸다. 10/1 에 열리는 덱은
// 단어 모음의 **뜻 언어 필터**에 걸려 스페인어로 보는 사람에게는 목록에 아예 없다 —
// 그런데 소식은 번들에 담겨 나가므로, 잘못 적으면 찾을 수 없는 것을 약속한 채 굳는다.
//
// 그 방법이 「빈 문자열」인데, 여기에 **조용한 함정**이 있다: 키를 아예 빼면 폴백이 걸려
// **영어 문장이 스페인어 시트에 나온다**(i18n/index.ts 의 fallbackLng). 화면은 멀쩡해
// 보이고 문장도 그럴듯해서 눈으로는 안 잡힌다.
//
// 여기서 고정하는 것 셋:
//   ⑴ 모든 소식 줄은 기준 언어(ko)와 폴백(en)에 **실제 문구가 있다** — 빈 줄로 새지 않는다
//   ⑵ 빈 문자열인 줄은 visibleItems 가 내린다
//   ⑶ 키가 빠진 줄은 폴백이 메워 **안 내려간다** — 그래서 「빼기」와 「비우기」는 다르다

import { ANNOUNCEMENTS, visibleItems, type Announcement } from '@/constants/announcements';
import ko from '@/i18n/locales/ko.json';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';

type Bundle = { whatsNew: Record<string, string> };
const bundles: Record<string, Bundle> = {
  ko: ko as unknown as Bundle,
  en: en as unknown as Bundle,
  es: es as unknown as Bundle,
};

/** 시트와 같은 해석 순서: 그 언어에 없으면 폴백(en)이 메운다. */
const translator = (locale: string) => (key: string): string => {
  const name = key.replace(/^whatsNew\./, '');
  const own = bundles[locale].whatsNew[name];
  return own !== undefined ? own : (bundles.en.whatsNew[name] ?? key);
};

const allItems = ANNOUNCEMENTS.flatMap(a => a.items);

describe('소식 문구는 기준 언어와 폴백에 반드시 있다', () => {
  it.each(['ko', 'en'])('%s 에는 빈 줄이 없다', locale => {
    const bundle = bundles[locale].whatsNew;
    const empty = allItems
      .map(i => i.key.replace(/^whatsNew\./, ''))
      .filter(name => !bundle[name] || bundle[name].trim() === '');
    expect(empty).toEqual([]);
  });

  it('모든 항목 키가 세 언어 파일에 다 정의돼 있다 — 빼는 것이 아니라 비운다', () => {
    const missing: string[] = [];
    for (const locale of Object.keys(bundles)) {
      for (const item of allItems) {
        const name = item.key.replace(/^whatsNew\./, '');
        if (!(name in bundles[locale].whatsNew)) missing.push(`${locale}:${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('visibleItems', () => {
  const v170 = ANNOUNCEMENTS.find(a => a.version === '1.7.0') as Announcement;

  it('1.7.0 소식이 있다 — 감춰 뒀던 둘을 여는 릴리스다', () => {
    expect(v170).toBeDefined();
  });

  it('한국어·영어는 다섯 줄을 다 보여준다', () => {
    expect(visibleItems(v170, translator('ko'))).toHaveLength(5);
    expect(visibleItems(v170, translator('en'))).toHaveLength(5);
  });

  // 🔴 이 줄이 스페인어 시트에 뜨면, 스페인어로 보는 사람은 단어 모음에 없는 덱을
  //    찾으러 간다. 뜻 언어가 스페인어인 덱은 0개다.
  it('스페인어에서는 덱 줄이 내려간다', () => {
    const shown = visibleItems(v170, translator('es')).map(i => i.key);
    expect(shown).not.toContain('whatsNew.v170_4');
    expect(shown).toHaveLength(4);
  });

  it('빈 문자열이 아닌 줄은 그대로 남는다', () => {
    const shown = visibleItems(v170, translator('es')).map(i => i.key);
    expect(shown).toEqual([
      'whatsNew.v170_1',
      'whatsNew.v170_2',
      'whatsNew.v170_3',
      'whatsNew.v170_5',
    ]);
  });

  // ⑶ 「빼기」와 「비우기」가 다르다는 것을 고정한다 — 키를 빼면 폴백이 메워 영어가 뜬다.
  it('키를 빼면 줄이 내려가지 않고 영어가 대신 나온다', () => {
    const noKey = (key: string) => (key === 'whatsNew.v170_4' ? en.whatsNew.v170_4 : 'x');
    expect(visibleItems(v170, noKey)).toHaveLength(5);
  });

  it('소식이 없으면 빈 배열이다', () => {
    expect(visibleItems(null, () => 'x')).toEqual([]);
  });
});
