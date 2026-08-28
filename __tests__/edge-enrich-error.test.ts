import { classifyEnrichHttpError } from '@/lib/ai/edge-enrich-error';

describe('classifyEnrichHttpError', () => {
  it('keeps a missing word distinct from an AI connection failure', () => {
    expect(classifyEnrichHttpError(404, 'not_found')).toBe('not_found');
    expect(classifyEnrichHttpError(500, 'upstream_failure')).toBe('upstream');
  });

  // 표제어 게이트(supabase/functions/enrich-word)는 깨진 표제어를 **404 not_found**
  // 로 돌려보낸다. 400 이 아닌 이유가 여기 있다 — 400 은 'invalid' 로 분류돼
  // 사전 폴백을 타고 "서버에 문제가 있습니다"로 잘못 안내되고, 일괄 추가는 빈 결과를
  // 'done' 으로 처리해 뜻 없는 카드를 완료 표시로 남긴다(빈 객체도 truthy).
  //
  // 404 는 이미 배선돼 있어 앱을 고치지 않고도 옳게 동작한다:
  //   isReal:false → 단어 추가 "찾지 못함" / 일괄 추가 enrichStatus 'failed'
  // 🔑 이 매핑이 깨지면 스토어에 나가 있는 옛 빌드의 동작이 함께 깨진다.
  it('깨진 표제어(404 not_found + detail)도 not_found 로 분류한다', () => {
    expect(classifyEnrichHttpError(404, 'not_found')).toBe('not_found');
  });

  it('🔴 400 은 not_found 가 아니다 — 게이트가 400 을 쓰면 안 되는 이유', () => {
    expect(classifyEnrichHttpError(400, 'invalid_term')).toBe('invalid');
    expect(classifyEnrichHttpError(400, 'invalid_request')).toBe('invalid');
  });
});
