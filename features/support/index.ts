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
export { composeSupportBody } from './target-line';
export type { SupportTarget } from './target-line';
export { useSupportStore } from './store';
