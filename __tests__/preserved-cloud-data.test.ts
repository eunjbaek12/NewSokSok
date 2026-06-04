/**
 * Guest-leak hardening: after an offline logout that PRESERVED a cloud-auth
 * account's un-synced data (so an un-pushed delete isn't lost), starting as a
 * guest used to silently expose that account's words. logout() now flags the
 * preserved state; the guest entry path reads it and offers re-login / discard.
 * Verifies the flag's mark/clear/has and that discard wipes every account
 * surface logout's destructive branch does + clears the flag.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: async (k: string, v: string) => { mem.set(k, v); },
      removeItem: async (k: string) => { mem.delete(k); },
    },
  };
});

// `mock`-prefixed names so the jest.mock factories may reference them (jest's
// hoisting only allows out-of-scope vars matching /^mock/).
const mockClearAllData = jest.fn(async () => {});
const mockResetAll = jest.fn(async () => {});
const mockClearAccountScopedSettings = jest.fn(async () => {});
const mockQuotaClear = jest.fn(() => {});

jest.mock('@/features/vocab/db', () => ({ clearAllData: mockClearAllData }));
jest.mock('@/features/sync/store', () => ({ useSyncStore: { getState: () => ({ resetAll: mockResetAll }) } }));
jest.mock('@/features/settings/store', () => ({ useSettingsStore: { getState: () => ({ clearAccountScopedSettings: mockClearAccountScopedSettings }) } }));
jest.mock('@/features/quota', () => ({ useQuotaStore: { getState: () => ({ clear: mockQuotaClear }) } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  markPreservedCloudData,
  clearPreservedCloudData,
  hasPreservedCloudData,
  discardPreservedCloudData,
} from '@/features/auth/preserved-cloud-data';

const KEY = '@soksok_preserved_cloud_data';

describe('preserved cloud data flag', () => {
  beforeEach(async () => {
    await AsyncStorage.removeItem(KEY);
    jest.clearAllMocks();
  });

  it('mark sets the flag and has() reflects it', async () => {
    expect(await hasPreservedCloudData()).toBe(false);
    await markPreservedCloudData();
    expect(await AsyncStorage.getItem(KEY)).toBe('1');
    expect(await hasPreservedCloudData()).toBe(true);
  });

  it('clear removes the flag', async () => {
    await markPreservedCloudData();
    await clearPreservedCloudData();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await hasPreservedCloudData()).toBe(false);
  });

  it('discard wipes every account surface and clears the flag', async () => {
    await markPreservedCloudData();
    await discardPreservedCloudData();
    expect(mockClearAllData).toHaveBeenCalledTimes(1);
    expect(mockResetAll).toHaveBeenCalledTimes(1);
    expect(mockClearAccountScopedSettings).toHaveBeenCalledTimes(1);
    expect(mockQuotaClear).toHaveBeenCalledTimes(1);
    expect(await hasPreservedCloudData()).toBe(false);
  });
});
