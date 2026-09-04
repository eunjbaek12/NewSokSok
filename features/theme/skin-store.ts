import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SkinId } from './types';
import { LEGACY_THEME_TO_SKIN, SKIN_LIST } from '@/constants/skins';

const SKIN_KEY = '@soksok_skin';
const LEGACY_KEY = '@soksok_theme';

/**
 * 저장된 값이 지금 고를 수 있는 스킨인가.
 *
 * 🔴 예전에는 `saved === 'classic' || 'dark' || 'y2k' || 'lab'` 이라는 손으로 적은
 *    조건이었고, 그래서 **여름 바다를 고른 사용자는 앱을 다시 켤 때마다 기본으로
 *    돌아갔다**(ocean 을 추가할 때 이 줄을 같이 못 고친 것이다). 목록에서 파생하면
 *    스킨을 더해도 여기를 잊을 수가 없다.
 *
 * 🚩 SKIN_LIST 에서 파생하는 것이 플래그 역할도 겸한다 — 목록에 없는 스킨(지금은
 *    autumn·hangul)은 복원되지도 않으므로, 열려 있던 순간에 골라 둔 값이 남아 있어도
 *    선택기에 없는 스킨이 적용되는 일이 없다.
 */
function isSelectableSkin(v: string | null): v is SkinId {
  return !!v && SKIN_LIST.some(s => s.id === v);
}

interface SkinStore {
  skinId: SkinId;
  isLoaded: boolean;
  hydrate: () => Promise<void>;
  setSkin: (id: SkinId) => Promise<void>;
}

export const useSkinStore = create<SkinStore>((set) => ({
  skinId: 'classic',
  isLoaded: false,

  hydrate: async () => {
    const saved = await AsyncStorage.getItem(SKIN_KEY);
    if (isSelectableSkin(saved)) {
      set({ skinId: saved, isLoaded: true });
      return;
    }

    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = (LEGACY_THEME_TO_SKIN[legacy] ?? 'classic') as SkinId;
      await AsyncStorage.setItem(SKIN_KEY, migrated);
      await AsyncStorage.removeItem(LEGACY_KEY);
      set({ skinId: migrated, isLoaded: true });
      return;
    }

    set({ isLoaded: true });
  },

  setSkin: async (id: SkinId) => {
    set({ skinId: id });
    await AsyncStorage.setItem(SKIN_KEY, id);
  },
}));
