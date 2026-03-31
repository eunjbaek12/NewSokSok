export const PopupTokens = {
  radius: {
    standard: 20,
    contextMenu: 12,
    toast: 12,
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
