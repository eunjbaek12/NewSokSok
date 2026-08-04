// 공식 큐레이션 덱을 앱 시작 경로에서 떼어 놓기 위한 지연 로더.
//
// 왜 필요한가 (2026-08-04 실측):
//   `constants/curationData.ts`는 8.16MB · 63덱 · 단어 13,574개짜리 단일 배열
//   리터럴이다. 이걸 화면이 정적으로 import하면 **큐레이션 탭을 한 번도 열지 않아도**
//   콜드 스타트마다 단어 객체 13,574개가 홈보다 먼저 만들어진다. expo-router의 기본
//   import mode가 `sync`(EXPO_ROUTER_IMPORT_MODE 미설정)라 `<Tabs>`가 렌더될 때
//   탭 자식 모듈을 그 자리에서 동기 require하기 때문이다.
//
//   그리고 이 파일은 계속 자란다 — 3월 149KB에서 8월 8,130KB로 56배가 됐다.
//   덱을 늘리는 일이 앱 시작을 느리게 만드는 구조라, 덱을 더 넣기 전에 끊어 둔다.
//
// 동적 import는 모듈을 번들에서 빼지 않는다(네이티브는 번들 분할이 없다). 빼는 것은
// **평가 시점**이다 — 처음 require될 때까지 객체가 만들어지지 않는다. 그래서 비용은
// 사라지는 게 아니라 큐레이션 탭에 처음 들어가는 순간으로 옮겨간다.

import { useEffect, useState } from 'react';
import type { VocaList } from '@/lib/types';

// 참조가 매번 바뀌면 이걸 의존성으로 쓰는 useMemo가 헛돈다.
const EMPTY: VocaList[] = [];

let cache: VocaList[] | null = null;
let inFlight: Promise<VocaList[]> | null = null;

/**
 * 공식 덱을 읽는다. 세션 안에서 평가는 한 번뿐이고, 로드가 겹쳐 들어와도
 * (탭 전환을 빠르게 반복하는 경우) 같은 약속을 나눠 쓴다.
 */
export function loadCurationPresets(): Promise<VocaList[]> {
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = import('@/constants/curationData')
      .then(m => {
        cache = m.curationPresets;
        inFlight = null;
        return m.curationPresets;
      })
      .catch(e => {
        // 실패해도 다시 시도할 수 있게 비워 둔다. 안 비우면 거부된 약속이 남아
        // 이후 호출이 영원히 같은 실패를 돌려받는다.
        inFlight = null;
        throw e;
      });
  }
  return inFlight;
}

/**
 * 화면용 구독. 이미 읽어 둔 뒤라면 `loading`이 처음부터 false다 — 탭을 다시 열 때
 * 스피너가 깜빡이지 않게 하려고 초기값을 캐시에서 읽는다.
 */
export function useCurationPresets(): { presets: VocaList[]; loading: boolean } {
  const [presets, setPresets] = useState<VocaList[] | null>(() => cache);

  useEffect(() => {
    if (presets) return;
    let cancelled = false;
    loadCurationPresets()
      .then(p => { if (!cancelled) setPresets(p); })
      .catch(e => {
        // 번들 안에 있는 모듈이라 실기에서 실패할 길은 사실상 없다. 그래도 여기서
        // 삼키지 않으면 스피너가 영원히 돌아 "덱이 없다"보다 나쁜 화면이 된다.
        console.warn('[curation] 공식 덱 로드 실패:', e?.message ?? e);
        if (!cancelled) setPresets(EMPTY);
      });
    return () => { cancelled = true; };
  }, [presets]);

  return { presets: presets ?? EMPTY, loading: presets === null };
}
