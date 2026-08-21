/**
 * E1 회귀 — 한도 소진 뒤 다른 단어를 검색하면 앞 단어의 발음기호·예문이 남던 것.
 *
 * 2026-08-21 실기(Android preview 1.6.0)에서 나온 실제 화면:
 *   표제어 `nimble` · 뜻 `민첩한, 날렵한` · 발음기호 `kiːn` · 예문 `① She has a keen …`
 * AI 한도를 다 쓰면 서버가 뜻만 싣고 오는데(`enrichment_level: 'basic'`), 폼 반영이
 * "값이 있을 때만 덮기"라 나머지 칸에 앞 단어의 값이 그대로 남았다. 저장하면 카드 하나에
 * 두 단어가 섞인다.
 *
 * 지우면 안 되는 경우가 셋 있어서 규칙을 여기에 못 박는다 — 같은 단어 재검색(보상 광고 뒤
 * 재시도·"상세 채우기"), 사용자가 직접 고친 값, 편집 화면이 원래 갖고 있던 값.
 */
import { staleAutoFillKeys, AUTOFILL_FIELDS } from '@/lib/autofill-form';

const KEEN = {
    definition: 'having or showing eagerness',
    meaningKr: '열망하는, 예리한',
    phonetic: 'kiːn',
    pos: 'adjective',
    exampleEn: '① She has a keen interest in history. ② The knife had a keen edge.',
    exampleKr: '① 그녀는 역사에 관심이 많다. ② 그 칼은 날이 예리했다.',
};

describe('staleAutoFillKeys — 앞 단어의 잔재만 골라낸다', () => {
    it('표제어가 바뀌면, 자동완성이 쓴 그대로 남아 있는 칸을 전부 고른다', () => {
        // keen 을 채운 뒤 nimble 을 검색한 상황. 한도 초과라 새 결과에는 뜻뿐이지만,
        // 지우는 판정은 새 결과와 무관하다 — 먼저 비우고 나서 있는 값으로 덮는다.
        const stale = staleAutoFillKeys({ term: 'keen', fields: KEEN }, { ...KEEN }, 'nimble');
        expect(stale.sort()).toEqual([...AUTOFILL_FIELDS].sort());
    });

    it('같은 표제어로 다시 검색하면 아무것도 안 지운다 — 보상 광고 뒤 재시도가 여기 걸린다', () => {
        // 광고를 보고 나면 같은 단어로 재검색해 상세를 마저 채운다. 여기서 비우면
        // 이미 받아 둔 뜻이 잠깐 사라졌다가 다시 채워진다.
        expect(staleAutoFillKeys({ term: 'keen', fields: KEEN }, { ...KEEN }, 'keen')).toEqual([]);
    });

    it('사용자가 고친 칸은 남긴다', () => {
        const edited = { ...KEEN, meaningKr: '내가 직접 적은 뜻', exampleEn: '내가 쓴 예문' };
        const stale = staleAutoFillKeys({ term: 'keen', fields: KEEN }, edited, 'nimble');
        expect(stale).not.toContain('meaningKr');
        expect(stale).not.toContain('exampleEn');
        expect(stale).toContain('phonetic');
    });

    it('자동완성이 채운 적이 없으면(편집 화면의 첫 검색) 아무것도 안 지운다', () => {
        // 단어를 고치러 들어온 화면은 기존 값이 이미 들어차 있다. 우리가 쓴 게 아니므로
        // 표제어를 바꿔 검색해도 남의 데이터를 지우면 안 된다.
        expect(staleAutoFillKeys(null, { ...KEEN }, 'nimble')).toEqual([]);
    });

    it('빈 값으로 기록된 칸은 대상이 아니다', () => {
        // 사전 폴백처럼 뜻을 못 채운 결과도 있다. 그 칸은 우리가 채운 적이 없다.
        const last = { term: 'keen', fields: { ...KEEN, meaningKr: '', phonetic: '' } };
        const stale = staleAutoFillKeys(last, { ...KEEN }, 'nimble');
        expect(stale).not.toContain('meaningKr');
        expect(stale).not.toContain('phonetic');
        expect(stale).toContain('exampleEn');
    });

    it('폼이 이미 비어 있으면 지울 것이 없다', () => {
        const empty = { definition: '', meaningKr: '', phonetic: '', pos: '', exampleEn: '', exampleKr: '' };
        expect(staleAutoFillKeys({ term: 'keen', fields: KEEN }, empty, 'nimble')).toEqual([]);
    });
});
