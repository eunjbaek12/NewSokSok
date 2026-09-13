// 문의 본문의 «대상» 한 줄 — 공식 단어장 상세의 «오류 알리기»가 들고 오는 것.
// 판단만 잡는다. 대상 줄이 화면에 뜨는지·지우기 버튼·카테고리 선택은 기기에서 확인한다.

import { composeSupportBody } from '@/features/support/target-line';

describe('composeSupportBody', () => {
  test('대상이 없으면 본문 그대로 — 설정에서 들어온 평소 문의', () => {
    expect(composeSupportBody(null, '버그가 있어요')).toBe('버그가 있어요');
  });

  test('대상이 있으면 맨 앞에 [단어장] 제목 (id) 한 줄', () => {
    expect(
      composeSupportBody({ label: '수능 필수 영단어', id: 'ngsl-core-1000' }, 'abandon 뜻이 틀렸어요'),
    ).toBe('[단어장] 수능 필수 영단어 (ngsl-core-1000)\nabandon 뜻이 틀렸어요');
  });

  test('id 가 없으면 괄호째 빠진다', () => {
    expect(composeSupportBody({ label: 'NGSL', id: '' }, '틀렸어요')).toBe('[단어장] NGSL\n틀렸어요');
    expect(composeSupportBody({ label: 'NGSL' }, '틀렸어요')).toBe('[단어장] NGSL\n틀렸어요');
  });

  test('제목이 공백뿐이면 대상이 없는 것으로 본다 — 빈 [단어장] 줄을 보내지 않는다', () => {
    expect(composeSupportBody({ label: '   ', id: 'x' }, '틀렸어요')).toBe('틀렸어요');
  });

  test('운영자가 읽는 줄이라 앱 언어와 무관하게 한국어 표지로 고정', () => {
    // 영어·스페인어 사용자가 보내도 메일함에서 같은 표지로 모인다.
    expect(composeSupportBody({ label: 'Sherlock Holmes', id: 'sherlock' }, 'wrong meaning'))
      .toMatch(/^\[단어장\] /);
  });
});
