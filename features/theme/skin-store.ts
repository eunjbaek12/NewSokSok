import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SkinId } from './types';
import { LEGACY_THEME_TO_SKIN } from '@/constants/skins';

const SKIN_KEY = '@soksok_skin';
const LEGACY_KEY = '@soksok_theme';

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
    if (saved === 'classic' || saved === 'dark' || saved === 'y2k' || saved === 'lab') {
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
