/**
 * 앱이 휴대폰 홈 화면 위젯을 **다시 그리게** 한다 — 앱을 나갈 때마다.
 *
 * 위젯은 제 손으로는 누를 때와 30분 주기에만 다시 그려진다. 그래서 두 가지가 샜다(9/19 실기):
 *  - **앱에서 공부한 게 위젯에 늦게 온다.** 앱에서 외운 단어가 최대 30분 동안 위젯에 «미암기»로 남는다.
 *    문서 §6-2 가 이미 «학습을 마칠 때 앱이 갱신을 요청»을 요구하고 있었다.
 *  - **앱을 업데이트하면 위젯이 빈 칸이 된다.** 런처가 위젯을 초기 화면(투명)으로 되돌린 뒤 다시 그리는
 *    작업이 실패했다(라이브러리 쪽 원인은 `patches/react-native-android-widget+0.22.1.patch`). 고쳐도
 *    다시 그릴 기회가 한 번 더 있는 편이 안전하다.
 *
 * 나가는 순간 한 번이면 둘 다 막힌다 — 사용자가 위젯을 보는 건 앱을 나간 뒤다.
 *
 * 🔴 **Android 에서만, 그리고 필요할 때만 불러온다.** 위젯 모듈은 네이티브 모듈을 불러서, iOS 에서
 * import 하는 것만으로 앱이 죽을 수 있다(iOS 전용 모듈이 Android 에서 그랬던 것과 같은 함정).
 */
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

/** `app.config.js` 의 위젯 이름. 바꾸면 이미 놓인 위젯이 사라지므로 두 곳이 같아야 한다. */
export const WIDGET_NAME = 'Avocado';

export async function refreshWidgets(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const [{ requestWidgetUpdate }, { buildWidget }] = await Promise.all([
    import('react-native-android-widget'),
    import('./task-handler'),
  ]);
  await requestWidgetUpdate({
    widgetName: WIDGET_NAME,
    renderWidget: info => buildWidget(info),
  });
}

/** 앱이 뒤로 갈 때마다 위젯을 다시 그린다. 루트에 한 번만 둔다. */
export function useWidgetRefreshOnLeave(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', next => {
      if (next === 'background') {
        refreshWidgets().catch(() => {
          // 못 그려도 앱은 그대로다. 위젯은 다음 30분 주기에 다시 그려진다.
        });
      }
    });
    return () => sub.remove();
  }, []);
}
