import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * 앱이 백그라운드에서 앞으로 돌아온 횟수. effect 의 의존성에 넣으면 «앱을 다시 열 때마다»가 된다.
 *
 * 알림 재예약이 이걸 쓴다 — 데이터가 안 바뀌면 다시 예약하지 않던 탓에, 매일 열기만 하고
 * 공부는 안 하는 사람의 예약이 앞보기 끝에서 끊겼다. 시간대가 바뀐 뒤 «앱을 열 때 다시 예약»도
 * 이 신호가 있어야 성립한다(docs/word-notifications-design.md §3.3).
 */
export function useForegroundCount(): number {
  const [count, setCount] = useState(0);
  const last = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      const wasAway = last.current === 'background' || last.current === 'inactive';
      last.current = next;
      if (next === 'active' && wasAway) setCount(c => c + 1);
    });
    return () => sub.remove();
  }, []);

  return count;
}
