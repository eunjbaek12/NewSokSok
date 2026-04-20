import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ZodError, ZodType } from 'zod';

export interface PersistedOptions<T> {
  /** Optional: called when stored data fails schema validation. Returning a value overrides the default (= defaults). Returning undefined falls back to defaults. */
  onDrift?: (raw: unknown, error: ZodError) => T | undefined;
}

export interface PersistedEntry<T> {
  load: () => Promise<T>;
  save: (value: T) => Promise<void>;
  remove: () => Promise<void>;
  key: string;
}

/**
 * Build a typed, schema-validated AsyncStorage entry.
 *
 *   const authStore = persisted('@soksok_auth', AuthStateSchema, DEFAULT_AUTH);
 *   const state = await authStore.load();
 *
 * Uses `ZodType<Output, Def, Input>` with distinct input/output so schemas
 * that rely on `.default()`/`.transform()` infer the OUTPUT type for `T`.
 *
 * On parse failure the `onDrift` callback (if provided) gets the raw value and
 * the Zod error; otherwise the defaults are returned. The store is NOT reset
 * automatically — callers can call `save(defaults)` to overwrite.
 */
export function persisted<Out, In = Out>(
  key: string,
  schema: ZodType<Out, any, In>,
  defaults: Out,
  opts: PersistedOptions<Out> = {},
): PersistedEntry<Out> {
  type T = Out;
  async function load(): Promise<T> {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw == null) return defaults;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return defaults;
      }
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      const recovered = opts.onDrift?.(parsed, result.error);
      return recovered !== undefined ? recovered : defaults;
    } catch {
      return defaults;
    }
  }

  async function save(value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  }

  async function remove(): Promise<void> {
    await AsyncStorage.removeItem(key);
  }

  return { load, save, remove, key };
}
