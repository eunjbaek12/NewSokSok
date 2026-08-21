// 인라인 한도 안내의 **슬롯 다툼** — 화면 안에 화면이 열릴 때
//
// 왜 이 테스트가 있나: 단어 추가 화면(app/add-word.tsx)은 네이티브 fullScreenModal 이라
// 전역 보상형 모달을 띄울 수 없다. 그래서 자기 핸들러를 등록해 직접 안내하는데, 그 안에서
// 사진 스캔(components/PhotoImportWorkflow.tsx)이 열리면 **같은 슬롯**을 덮어쓴다.
// 슬롯은 하나뿐이고 해제 규칙이 "내 것이면 비운다"라, 사진이 닫힐 때 자기 것을 확인하고
// null 로 만들면 바깥 화면의 등록까지 함께 사라진다 — 그 뒤로는 남은 세션 내내 전역 모달이
// 되살아나고, 그게 바로 앱이 먹통이 되는 조건이다.
//
// 여기서 재는 것은 React 가 아니라 **두 화면이 지키기로 한 규칙**이다. 그래서 effect 의
// 등록·해제를 손으로 같은 순서로 돌려 본다. 부모와 자식 중 어느 쪽 effect 가 먼저 도는지는
// React 가 정하므로, 양쪽 순서 모두에서 성립해야 한다.

jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() }, rpc: jest.fn() },
}));

import { useQuotaStore, type QuotaStatus, type QuotaBlockInfo } from '@/features/quota/store';

function status(over: Partial<QuotaStatus> = {}): QuotaStatus {
  return {
    tier: 'free',
    used: 50,
    limit: 50,
    bonus: 0,
    trial_ends_at: null,
    pro_until: null,
    reset_at: new Date().toISOString(),
    ...over,
  };
}

/** 두 화면이 실제로 쓰는 등록/해제 규칙 그대로. 해제 함수를 돌려준다. */
function register(handler: (info: QuotaBlockInfo) => void): () => void {
  useQuotaStore.getState().setInlineQuotaHandler(handler);
  return () => {
    const q = useQuotaStore.getState();
    if (q.inlineQuotaHandler === handler) q.setInlineQuotaHandler(null);
  };
}

beforeEach(() => {
  useQuotaStore.setState({
    status: null,
    quotaExceededAt: 0,
    proLimitReachedAt: 0,
    inlineQuotaHandler: null,
    retryAfterReward: null,
  });
});

describe('사진 스캔이 열렸다 닫혀도 단어 추가 화면의 안내가 살아 있어야 한다', () => {
  // 사진이 닫힌 뒤 단어 추가 화면이 **다시 등록한다**(photoSource 를 effect 의존성에 넣은 이유).
  it.each([
    ['부모 해제가 먼저', true],
    ['자식 등록이 먼저', false],
  ])('사진을 열 때: %s', (_label, parentCleanupFirst) => {
    const addWord = jest.fn();
    const photo = jest.fn();

    let stopAddWord = register(addWord);

    // photoSource: null → 'camera'
    let stopPhoto: () => void;
    if (parentCleanupFirst) {
      stopAddWord();
      stopPhoto = register(photo);
    } else {
      stopPhoto = register(photo);
      stopAddWord();
    }

    // 사진이 도는 동안은 사진 화면이 맡는다
    useQuotaStore.getState().notifyQuotaExceeded(status());
    expect(photo).toHaveBeenCalledTimes(1);
    expect(addWord).not.toHaveBeenCalled();
    expect(useQuotaStore.getState().quotaExceededAt).toBe(0);

    stopPhoto();
  });

  it.each([
    ['자식 해제가 먼저', true],
    ['부모 재등록이 먼저', false],
  ])('사진을 닫을 때: %s — 슬롯이 비어서는 안 된다', (_label, childCleanupFirst) => {
    const addWord = jest.fn();
    const photo = jest.fn();

    const stopPhoto = register(photo);

    // photoSource: 'camera' → null
    if (childCleanupFirst) {
      stopPhoto();
      register(addWord);
    } else {
      register(addWord);
      stopPhoto();
    }

    // 🔴 여기서 슬롯이 비면 전역 모달이 되살아난다 = 네이티브 모달 위 present = 먹통
    expect(useQuotaStore.getState().inlineQuotaHandler).not.toBeNull();

    useQuotaStore.getState().notifyQuotaExceeded(status());
    expect(addWord).toHaveBeenCalledWith({ kind: 'ad' });
    expect(photo).not.toHaveBeenCalled();
    expect(useQuotaStore.getState().quotaExceededAt).toBe(0);
  });

  it('재등록을 빼면 슬롯이 비고 전역 모달이 되살아난다 (고치기 전 동작)', () => {
    const photo = jest.fn();
    const stopPhoto = register(photo);
    stopPhoto(); // 사진만 닫고 아무도 다시 등록하지 않는다

    expect(useQuotaStore.getState().inlineQuotaHandler).toBeNull();
    useQuotaStore.getState().notifyQuotaExceeded(status());
    expect(useQuotaStore.getState().quotaExceededAt).toBeGreaterThan(0);
  });
});

describe('광고 보상 뒤 막혔던 작업을 잇는 계약', () => {
  // 전역 모달(app/_layout.tsx 의 handleGranted)과 인라인 화면이 같은 규칙을 쓴다:
  // 등록된 재시도를 꺼내 비우고 부른다. 비우지 않으면 다음 화면이 남의 재시도를 물려받는다.
  it('재시도는 한 번만 쓰고 비운다', () => {
    const retry = jest.fn();
    useQuotaStore.getState().setRetryAfterReward(retry);

    const quota = useQuotaStore.getState();
    const pending = quota.retryAfterReward;
    quota.setRetryAfterReward(null);
    pending?.();

    expect(retry).toHaveBeenCalledTimes(1);
    expect(useQuotaStore.getState().retryAfterReward).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 위 테스트는 두 화면이 지키기로 한 **규칙**을 재는 것이고, 화면이 실제로 그렇게 배선돼
// 있는지는 재지 못한다(이 저장소에는 컴포넌트 렌더 테스트 도구가 없다). 그래서 배선
// 자체는 소스를 읽어 고정한다 — gemini-model-sync 와 같은 방식이다.
//
// 🔴 검사 범위를 effect 하나로 좁힌다. 파일 전체에서 'photoSource' 를 찾으면 다른 곳의
//    같은 이름이 걸려 통과해 버린다(generate-prompt-legacy-field-sync 에서 겪은 함정).
describe('배선 — 단어 추가 화면이 사진이 닫힌 뒤 다시 등록하는가', () => {
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const src: string = readFileSync(join(process.cwd(), 'app/add-word.tsx'), 'utf8');

  const registerAt = src.indexOf('useQuotaStore.getState().setInlineQuotaHandler(handler)');
  const effect = src.slice(src.lastIndexOf('useEffect(() => {', registerAt), src.indexOf(');', src.indexOf('}, [', registerAt)) + 1);

  it('등록 effect 가 실제로 있다', () => {
    expect(registerAt).toBeGreaterThan(0);
  });

  it('photoSource 를 의존성으로 삼는다 — 사진이 닫히면 다시 등록된다', () => {
    expect(effect.replace(/s+/g, ' ')).toContain('}, [photoSource])');
  });

  it('사진이 열려 있는 동안에는 등록하지 않는다 — 사진 화면이 자기 것을 쥔다', () => {
    expect(effect).toContain("if (photoSource !== null) return;");
  });

  it('남의 등록을 지우지 않는다 — 내 것일 때만 비운다', () => {
    expect(effect).toContain('if (q.inlineQuotaHandler === handler)');
  });

  it('사진 화면도 같은 해제 규칙을 쓴다 (이 배선이 기대는 전제)', () => {
    const photo: string = readFileSync(join(process.cwd(), 'components/PhotoImportWorkflow.tsx'), 'utf8');
    expect(photo).toContain('if (quota.inlineQuotaHandler === handler) quota.setInlineQuotaHandler(null);');
  });
});
