import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecureString, setSecureString, deleteSecureString } from '@/lib/storage/secure-string';

export const PROFILE_STORAGE_KEY = '@soksok_profile_settings';
export const SECURE_API_KEY = 'soksok.gemini_api_key';

// Loads the Gemini API key from SecureStore. On first run after the v1
// SecureStore migration, moves any plaintext key found in the legacy
// AsyncStorage profile JSON into SecureStore and strips it from the JSON.
// Idempotent — re-running is a no-op once a key is in SecureStore.
export async function loadAndMigrateApiKey(): Promise<string> {
  const existing = await getSecureString(SECURE_API_KEY);
  if (existing != null) return existing;
  try {
    const raw = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw == null) return '';
    const parsed = JSON.parse(raw);
    const legacy = typeof parsed?.geminiApiKey === 'string' ? parsed.geminiApiKey : '';
    if (legacy.length > 0) await setSecureString(SECURE_API_KEY, legacy);
    if (parsed && 'geminiApiKey' in parsed) {
      delete parsed.geminiApiKey;
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(parsed));
    }
    return legacy;
  } catch {
    return '';
  }
}

export async function saveApiKey(key: string): Promise<void> {
  if (key.length > 0) {
    await setSecureString(SECURE_API_KEY, key);
  } else {
    await deleteSecureString(SECURE_API_KEY);
  }
}
