import { create } from 'zustand';
import {
  InputSettingsSchema,
  StudySettingsSchema,
  AutoPlaySettingsSchema,
  CustomStudySettingsSchema,
  ProfileSettingsSchema,
  DashboardFilterSchema,
  NicknameSchema,
  AiCurationSettingsSchema,
  type InputSettings,
  type StudySettings,
  type AutoPlaySettings,
  type CustomStudySettings,
  type ProfileSettings,
  type DashboardFilter,
  type AiCurationSettings,
} from '@shared/contracts';
import { persisted } from '@/lib/storage/persisted';
import { loadAndMigrateApiKey, saveApiKey } from './api-key-storage';

const DEFAULT_INPUT_SETTINGS: InputSettings = InputSettingsSchema.parse({}) as InputSettings;
const DEFAULT_STUDY_SETTINGS: StudySettings = StudySettingsSchema.parse({}) as StudySettings;
const DEFAULT_AUTOPLAY_SETTINGS: AutoPlaySettings = AutoPlaySettingsSchema.parse({}) as AutoPlaySettings;
const DEFAULT_CUSTOM_STUDY_SETTINGS: CustomStudySettings = CustomStudySettingsSchema.parse({}) as CustomStudySettings;
const DEFAULT_PROFILE_SETTINGS: ProfileSettings = ProfileSettingsSchema.parse({}) as ProfileSettings;
const DEFAULT_AI_CURATION_SETTINGS: AiCurationSettings = AiCurationSettingsSchema.parse({}) as AiCurationSettings;
const DEFAULT_DASHBOARD_FILTER: DashboardFilter = 'all';

const inputStore    = persisted('@soksok_user_input_settings',    InputSettingsSchema,       DEFAULT_INPUT_SETTINGS);
const studyStore    = persisted('@soksok_user_study_settings',    StudySettingsSchema,       DEFAULT_STUDY_SETTINGS);
const autoplayStore = persisted('@soksok_user_autoplay_settings', AutoPlaySettingsSchema,    DEFAULT_AUTOPLAY_SETTINGS);
const customStore   = persisted('@soksok_custom_study_settings',  CustomStudySettingsSchema, DEFAULT_CUSTOM_STUDY_SETTINGS);
const aiCurationStore = persisted('@soksok_ai_curation_settings', AiCurationSettingsSchema, DEFAULT_AI_CURATION_SETTINGS);
const profileStore  = persisted('@soksok_profile_settings',       ProfileSettingsSchema,     DEFAULT_PROFILE_SETTINGS, {
  // Legacy nicknames written before the 20-char limit was introduced get
  // silently truncated on load so the user keeps a usable display name.
  onDrift: (raw) => {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const r = raw as Record<string, unknown>;
    const nick = typeof r.nickname === 'string' ? r.nickname.slice(0, 20) : '';
    return ProfileSettingsSchema.parse({ ...r, nickname: nick });
  },
});

// Dashboard filter is a bare string, not JSON-encoded. Handle separately.
import AsyncStorage from '@react-native-async-storage/async-storage';
const DASHBOARD_FILTER_KEY = '@soksok_dashboard_filter';

async function loadDashboardFilter(): Promise<DashboardFilter> {
  try {
    const raw = await AsyncStorage.getItem(DASHBOARD_FILTER_KEY);
    if (raw == null) return DEFAULT_DASHBOARD_FILTER;
    const parsed = DashboardFilterSchema.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_DASHBOARD_FILTER;
  } catch {
    return DEFAULT_DASHBOARD_FILTER;
  }
}

interface SettingsState {
  inputSettings: InputSettings;
  studySettings: StudySettings;
  autoPlaySettings: AutoPlaySettings;
  customStudySettings: CustomStudySettings;
  profileSettings: ProfileSettings;
  aiCurationSettings: AiCurationSettings;
  apiKey: string;
  dashboardFilterMode: DashboardFilter;
  isLoading: boolean;

  hydrate: () => Promise<void>;
  updateInputSettings: (updates: Partial<InputSettings>) => Promise<void>;
  updateStudySettings: (updates: Partial<StudySettings>) => Promise<void>;
  updateAutoPlaySettings: (updates: Partial<AutoPlaySettings>) => Promise<void>;
  updateCustomStudySettings: (updates: Partial<CustomStudySettings>) => Promise<void>;
  updateProfileSettings: (updates: Partial<ProfileSettings>) => Promise<void>;
  updateAiCurationSettings: (updates: Partial<AiCurationSettings>) => Promise<void>;
  updateApiKey: (key: string) => Promise<void>;
  updateDashboardFilter: (mode: DashboardFilter) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  inputSettings: DEFAULT_INPUT_SETTINGS,
  studySettings: DEFAULT_STUDY_SETTINGS,
  autoPlaySettings: DEFAULT_AUTOPLAY_SETTINGS,
  customStudySettings: DEFAULT_CUSTOM_STUDY_SETTINGS,
  profileSettings: DEFAULT_PROFILE_SETTINGS,
  aiCurationSettings: DEFAULT_AI_CURATION_SETTINGS,
  apiKey: '',
  dashboardFilterMode: DEFAULT_DASHBOARD_FILTER,
  isLoading: true,

  hydrate: async () => {
    const [inputSettings, studySettings, autoPlaySettings, customStudySettings, profileSettings, aiCurationSettings, dashboardFilterMode, apiKey] =
      await Promise.all([
        inputStore.load(),
        studyStore.load(),
        autoplayStore.load(),
        customStore.load(),
        profileStore.load(),
        aiCurationStore.load(),
        loadDashboardFilter(),
        loadAndMigrateApiKey(),
      ]);
    set({
      inputSettings,
      studySettings,
      autoPlaySettings,
      customStudySettings,
      profileSettings,
      aiCurationSettings,
      apiKey,
      dashboardFilterMode,
      isLoading: false,
    });
  },

  updateInputSettings: async (updates) => {
    const next = { ...get().inputSettings, ...updates };
    set({ inputSettings: next });
    await inputStore.save(next);
  },

  updateStudySettings: async (updates) => {
    const next = { ...get().studySettings, ...updates };
    set({ studySettings: next });
    await studyStore.save(next);
  },

  updateAutoPlaySettings: async (updates) => {
    const next = { ...get().autoPlaySettings, ...updates };
    set({ autoPlaySettings: next });
    await autoplayStore.save(next);
  },

  updateCustomStudySettings: async (updates) => {
    const next = { ...get().customStudySettings, ...updates };
    set({ customStudySettings: next });
    await customStore.save(next);
  },

  updateProfileSettings: async (updates) => {
    if (typeof updates.nickname === 'string') NicknameSchema.parse(updates.nickname);
    const next = { ...get().profileSettings, ...updates };
    set({ profileSettings: next });
    await profileStore.save(next);
  },

  updateAiCurationSettings: async (updates) => {
    const next = { ...get().aiCurationSettings, ...updates };
    set({ aiCurationSettings: next });
    await aiCurationStore.save(next);
  },

  updateApiKey: async (key) => {
    set({ apiKey: key });
    await saveApiKey(key);
  },

  updateDashboardFilter: async (mode) => {
    set({ dashboardFilterMode: mode });
    await AsyncStorage.setItem(DASHBOARD_FILTER_KEY, mode);
  },
}));

/** Mirrors the old useSettings() context API for drop-in replacement. */
export function useSettings() {
  return useSettingsStore();
}
