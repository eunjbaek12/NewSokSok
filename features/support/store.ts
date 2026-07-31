// 답장 배지 상태.
//
// 벨도 알림함도 만들지 않는다 — 설정의 "문의하기" 행이 답장이 있을 때만
// 모습을 바꾼다. 답장이 없으면 아무것도 늘어나지 않고 빈 화면도 생기지 않는다.
//
// 조회는 앱 시작 세션 1회(features/billing/launchReconcile.ts와 같은 자리) +
// 문의 화면에 들어갈 때. 답장은 몇 시간~며칠 단위 일이라 실시간 구독이 필요 없고,
// 원격 푸시는 쓰지 않는다(plugins/withNoApsEnvironment.js — 이 앱은 로컬 알림
// 전용으로 서명되어 있고, 그걸 되돌리는 비용이 답장 몇 건보다 크다).

import { create } from 'zustand';
import { fetchSupportMessages, markSupportRead, type SupportMessage } from './api';

interface SupportState {
  messages: SupportMessage[];
  loaded: boolean;
  loading: boolean;
  /** 답장이 왔고 아직 안 읽은 것이 있는가 — 설정 행의 배지 조건. */
  hasUnreadReply: boolean;
  refresh: (force?: boolean) => Promise<void>;
  markRead: () => Promise<void>;
}

function computeUnread(messages: SupportMessage[]): boolean {
  return messages.some(m => m.reply_body && !m.read_at);
}

// 앱 시작 세션 1회. 앱을 다시 켜면 다시 시도한다(그때가 새 답장을 잡을 시점이기도 하다).
let attemptedThisSession = false;

export const useSupportStore = create<SupportState>()((set, get) => ({
  messages: [],
  loaded: false,
  loading: false,
  hasUnreadReply: false,

  refresh: async (force = false) => {
    if (get().loading) return;
    if (!force && attemptedThisSession) return;
    attemptedThisSession = true;
    set({ loading: true });
    try {
      const messages = await fetchSupportMessages();
      set({ messages, hasUnreadReply: computeUnread(messages), loaded: true });
    } catch {
      // 조용히 삼킨다 — 배지가 안 뜨는 것뿐이고, 화면에 들어가면 다시 조회한다.
    } finally {
      set({ loading: false });
    }
  },

  markRead: async () => {
    // 배지는 서버 왕복을 기다리지 않고 먼저 끈다. 실패해도 다음 조회가 바로잡는다.
    set(s => ({
      hasUnreadReply: false,
      messages: s.messages.map(m =>
        m.reply_body && !m.read_at ? { ...m, read_at: new Date().toISOString() } : m,
      ),
    }));
    try {
      await markSupportRead();
    } catch {}
  },
}));
