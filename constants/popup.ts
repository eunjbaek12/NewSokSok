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
    contextMenu: 192,
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
