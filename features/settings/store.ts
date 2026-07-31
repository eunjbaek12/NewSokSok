import { create } from 'zustand';
import {
  InputSettingsSchema,
  StudySettingsSchema,
  AutoPlaySettingsSchema,
  ProfileSettingsSchema,
  DashboardFilterSchema,
  NicknameSchema,
  AiCurationSettingsSchema,
  ReviewNotificationSettingsSchema,
  type InputSettings,
  type StudySettings,
  type AutoPlaySettings,
  type ProfileSettings,
  type DashboardFilter,
  type AiCurationSettings,
  type ReviewNotificationSettings,
} from '@shared/contracts';
import { persisted } from '@/lib/storage/persisted';
import { supabase } from '@/lib/supabase';
import { loadAndMigrateApiKey, saveApiKey } from './api-key-storage';

/**
 * Back the nickname up to Supabase user_metadata so a logout (which clears the
 * local account-scoped copy for isolation) doesn't permanently lose it — the
 * next login restores it via buildUser → use-bootstrap. Best-effort and
 * fire-and-forget: guests/logged-out have no session (skip silently), and a
 * network failure must never block the local save or the settings UI.
 */
async function backupNicknameToCloud(nickname: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.auth.updateUser({ data: { nickname } });
  } catch (e: any) {
    console.warn('[settings] nickname cloud backup failed:', e?.message ?? e);
  }
}

const DEFAULT_INPUT_SETTINGS: InputSettings = InputSettingsSchema.parse({}) as InputSettings;
const DEFAULT_STUDY_SETTINGS: StudySettings = StudySettingsSchema.parse({}) as StudySettings;
const DEFAULT_AUTOPLAY_SETTINGS: AutoPlaySettings = AutoPlaySettingsSchema.parse({}) as AutoPlaySettings;
const DEFAULT_PROFILE_SETTINGS: ProfileSettings = ProfileSettingsSchema.parse({}) as ProfileSettings;
const DEFAULT_AI_CURATION_SETTINGS: AiCurationSettings = AiCurationSettingsSchema.parse({}) as AiCurationSettings;
const DEFAULT_REVIEW_NOTIFICATION_SETTINGS: ReviewNotificationSettings = ReviewNotificationSettingsSchema.parse({}) as ReviewNotificationSettings;
const DEFAULT_DASHBOARD_FILTER: DashboardFilter = 'all';

const inputStore    = persisted('@soksok_user_input_settings',    InputSettingsSchema,       DEFAULT_INPUT_SETTINGS);
const studyStore    = persisted('@soksok_user_study_settings',    StudySettingsSchema,       DEFAULT_STUDY_SETTINGS);
const autoplayStore = persisted('@soksok_user_autoplay_settings', AutoPlaySettingsSchema,    DEFAULT_AUTOPLAY_SETTINGS);
const aiCurationStore = persisted('@soksok_ai_curation_settings', AiCurationSettingsSchema, DEFAULT_AI_CURATION_SETTINGS);
// 기기 설정(알림 시각·권한 의사)이라 계정 전환 시 지우지 않는다 — clearAccountScopedSettings 참조.
const reviewNotifStore = persisted('@soksok_review_notification_settings', ReviewNotificationSettingsSchema, DEFAULT_REVIEW_NOTIFICATION_SETTINGS);
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
  profileSettings: ProfileSettings;
  aiCurationSettings: AiCurationSettings;
  reviewNotificationSettings: ReviewNotificationSettings;
  apiKey: string;
  dashboardFilterMode: DashboardFilter;
  isLoading: boolean;

  hydrate: () => Promise<void>;
  updateInputSettings: (updates: Partial<InputSettings>) => Promise<void>;
  updateStudySettings: (updates: Partial<StudySettings>) => Promise<void>;
  updateAutoPlaySettings: (updates: Partial<AutoPlaySettings>) => Promise<void>;
  updateProfileSettings: (updates: Partial<ProfileSettings>) => Promise<void>;
  updateAiCurationSettings: (updates: Partial<AiCurationSettings>) => Promise<void>;
  updateReviewNotificationSettings: (updates: Partial<ReviewNotificationSettings>) => Promise<void>;
  updateApiKey: (key: string) => Promise<void>;
  updateDashboardFilter: (mode: DashboardFilter) => Promise<void>;
  /**
   * Clear settings that belong to the previously-signed-in account so they
   * don't leak into the next account on the same device. Used by logout and
   * account-switch flows. Device preferences (typing/study/autoplay/AI gen
   * defaults, dashboard filter, BYOK key) are intentionally preserved.
   */
  clearAccountScopedSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  inputSettings: DEFAULT_INPUT_SETTINGS,
  studySettings: DEFAULT_STUDY_SETTINGS,
  autoPlaySettings: DEFAULT_AUTOPLAY_SETTINGS,
  profileSettings: DEFAULT_PROFILE_SETTINGS,
  aiCurationSettings: DEFAULT_AI_CURATION_SETTINGS,
  reviewNotificationSettings: DEFAULT_REVIEW_NOTIFICATION_SETTINGS,
  apiKey: '',
  dashboardFilterMode: DEFAULT_DASHBOARD_FILTER,
  isLoading: true,

  hydrate: async () => {
    const [inputSettings, studySettings, autoPlaySettings, profileSettings, aiCurationSettings, reviewNotificationSettings, dashboardFilterMode, apiKey] =
      await Promise.all([
        inputStore.load(),
        studyStore.load(),
        autoplayStore.load(),
        profileStore.load(),
        aiCurationStore.load(),
        reviewNotifStore.load(),
        loadDashboardFilter(),
        loadAndMigrateApiKey(),
      ]);
    set({
      inputSettings,
      studySettings,
      autoPlaySettings,
      profileSettings,
      aiCurationSettings,
      reviewNotificationSettings,
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

  updateProfileSettings: async (updates) => {
    if (typeof updates.nickname === 'string') NicknameSchema.parse(updates.nickname);
    const next = { ...get().profileSettings, ...updates };
    set({ profileSettings: next });
    await profileStore.save(next);
    if (typeof updates.nickname === 'string') void backupNicknameToCloud(updates.nickname);
  },

  updateAiCurationSettings: async (updates) => {
    const next = { ...get().aiCurationSettings, ...updates };
    set({ aiCurationSettings: next });
    await aiCurationStore.save(next);
  },

  updateReviewNotificationSettings: async (updates) => {
    const next = { ...get().reviewNotificationSettings, ...updates };
    set({ reviewNotificationSettings: next });
    await reviewNotifStore.save(next);
  },

  updateApiKey: async (key) => {
    set({ apiKey: key });
    await saveApiKey(key);
  },

  updateDashboardFilter: async (mode) => {
    set({ dashboardFilterMode: mode });
    await AsyncStorage.setItem(DASHBOARD_FILTER_KEY, mode);
  },

  clearAccountScopedSettings: async () => {
    // Nickname is account identity; clearing it stops A's name from showing
    // up under B's session on the same device. apiKey (BYOK Gemini) is also
    // account-scoped: billing/quota is on the key owner, so A's key leaking
    // into B's session would charge A for B's usage. saveApiKey('') routes
    // through deleteSecureString.
    //
    // The list IDs that used to live in the custom-study store moved to the pick
    // store, which is cleared below; the store itself is gone (see contracts.ts).
    //
    // 동적 import는 settings ↔ study 순환참조 회피용(auth의 로그아웃 경로와
    // 동일 패턴). 계정 전환 경로가 넷이라 각 호출부에 흩어놓지 않고 여기 모은다.
    const { usePickStore } = await import('@/features/study/pick/store');
    await Promise.all([
      profileStore.remove(),
      saveApiKey(''),
      usePickStore.getState().clearAll(),
    ]);
    set({
      profileSettings: DEFAULT_PROFILE_SETTINGS,
      apiKey: '',
    });
  },
}));

/** Mirrors the old useSettings() context API for drop-in replacement. */
export function useSettings() {
  return useSettingsStore();
}
