import { Radius } from './tokens';

export const PopupTokens = {
  radius: {
    standard: Radius.lg,
    // 바텀시트의 위쪽 두 모서리. tokens.ts 가 xl(24)에 "bottom sheets, dialogs"라고
    // 적어 둔 그 값이다 — standard(16)를 쓰고 있었던 탓에 홈의 완주 결과 시트(24)와
    // 나란히 놓으면 한 단계 각져 보였다.
    bottomSheet: Radius.xl,
    contextMenu: Radius.md,
    toast: Radius.md,
  },
  overlay: {
    contextMenu: 'rgba(0,0,0,0.08)',
  },
  shadow: {
    color: '#000',
    offset: { width: 0, height: 4 },
    opacity: 0.12,
    radius: 16,
    elevation: 10,
  },
  maxWidth: {
    standard: 400,
    form: 500,
    // 🔴 여기가 컨텍스트 메뉴의 **실제** 폭이다. ListContextMenu 의 POPUP_WIDTH 는 팝업을
    //    ⋯ 버튼 오른쪽에 맞추는 **위치 계산에만** 쓰이므로, 그쪽만 넓히면 상자는 안 넓어지고
    //    위치만 어긋난다(27eec16 이 그랬다 — 240 으로 자리를 잡는데 상자는 192 라 48px
    //    왼쪽에 섰다). 둘은 **같은 값이라야 한다.**
    //
    //    폰트에서 잰 값(Pretendard-Medium, fontSize 14): 「뜻만 있는 단어 채우기」 = 119.2px.
    //    항목에 남는 폭 = 폭 − 패딩 28 − 아이콘 16 − gap 20 − 개수. 192 에서는 개수가 한
    //    자리일 때 여유가 **0.1~2.6px** 뿐이라 개수가 10 을 넘는 순간 두 줄이 됐다.
    //    (9/3 Android 검증이 통과한 것은 그 단어장의 개수가 한 자리였기 때문이고, iOS 라서
    //     갈린 게 아니다 — 플랫폼이 아니라 **자릿수**였다.)
    //    260 이면 개수 세 자리 + 글자 크기 1.3배에서도 한 줄로 선다.
    //    ⚠️ en(190.8px) · es(254.8px) 는 어떤 현실적 폭에도 안 들어간다 — 그쪽은 항목의
    //       numberOfLines={2} + 어절 단위 줄바꿈으로 받는다.
    contextMenu: 260,
  },
  maxHeight: {
    standard: '85%' as const,
    management: '80%' as const,
  },
  header: {
    standard: { titleSize: 18, closeSize: 24 },
    compact:  { titleSize: 15, closeSize: 20 },
  },
  button: {
    standard: { paddingVertical: 13, borderRadius: 10, fontSize: 15 },
    compact:  { paddingVertical: 8,  borderRadius: 8,  fontSize: 14 },
  },
  padding: {
    container: 24,
  },
} as const;
