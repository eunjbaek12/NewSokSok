/**
 * A cloud pull can finish after its account has logged out. Its stale response
 * must never repopulate SQLite for the next guest/account session.
 */
let mockAuthState: any = { mode: 'google', user: { id: 'google-a' } };
let mockTransactionCalls = 0;
let mockStarted = 0;
let mockReleaseQueries: (() => void)[] = [];
let mockAllQueriesStarted!: () => void;

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('@/features/auth', () => ({
  useAuthStore: { getState: () => mockAuthState },
  isCloudAuthMode: (mode: string) => mode === 'google' || mode === 'apple',
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const q: any = {
        select: () => q, order: () => q, limit: () => q, gt: () => q,
        or: () => q, in: () => q, eq: () => q,
        then: (resolve: any, reject: any) => new Promise((done) => {
          mockStarted += 1;
          if (mockStarted === 4) mockAllQueriesStarted();
          mockReleaseQueries.push(() => {
            Promise.resolve({ data: [], error: null }).then(resolve, reject).then(done);
          });
        }),
      };
      return q;
    },
  },
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => {}, runAsync: async () => {}, getAllAsync: async () => [],
    getFirstAsync: async () => ({ user_version: 19 }), closeAsync: async () => {},
    withTransactionAsync: async (task: () => Promise<void>) => { mockTransactionCalls += 1; await task(); },
  }),
}));

import { pullChanges } from '@/features/sync/engine';

describe('pullChanges — stale session guard', () => {
  beforeEach(() => {
    mockAuthState = { mode: 'google', user: { id: 'google-a' } };
    mockTransactionCalls = 0;
    mockStarted = 0;
    mockReleaseQueries = [];
  });

  it('does not write a completed Google pull after logout changes the session', async () => {
    const allQueriesStarted = new Promise<void>(resolve => { mockAllQueriesStarted = resolve; });
    const pulling = pullChanges();
    await allQueriesStarted;

    mockAuthState = { mode: 'guest', user: { id: 'guest-a' } };
    mockReleaseQueries.forEach(release => release());
    await pulling;

    expect(mockTransactionCalls).toBe(0);
  });
});
