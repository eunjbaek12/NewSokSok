export {
  sendSupportMessage,
  fetchSupportMessages,
  markSupportRead,
  collectDiagnostics,
  buildSupportMailto,
  getTicketKey,
  SupportRateLimitError,
  SUPPORT_CATEGORIES,
  SUPPORT_BODY_MIN,
  SUPPORT_BODY_MAX,
  SUPPORT_EMAIL,
} from './api';
export type { SupportCategory, SupportMessage, SupportDiagnostics } from './api';
export type { SupportTheme } from './deck-error';
export { useSupportStore } from './store';
