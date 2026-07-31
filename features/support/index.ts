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
} from './api';
export type { SupportCategory, SupportMessage, SupportDiagnostics } from './api';
export { useSupportStore } from './store';
