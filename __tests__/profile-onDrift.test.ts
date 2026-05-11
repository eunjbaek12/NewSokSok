// Migration test: a user who saved a nickname before the 20-char limit was
// introduced must keep a usable display name after upgrade. Reason: the
// pre-limit profile JSON now fails strict zod parse; without onDrift truncate,
// the user's nickname silently resets to '' (default).

import { ProfileSettingsSchema, NicknameSchema } from '@shared/contracts';

const onDrift = (raw: unknown): unknown => {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const nick = typeof r.nickname === 'string' ? r.nickname.slice(0, 20) : '';
  return ProfileSettingsSchema.parse({ ...r, nickname: nick });
};

describe('ProfileSettings onDrift — nickname migration', () => {
  test('truncates a 25-char legacy nickname to 20 chars', () => {
    const legacy = { nickname: 'a'.repeat(25), startupTab: 'index' };
    const recovered = onDrift(legacy) as { nickname: string };
    expect(recovered.nickname.length).toBe(20);
    expect(recovered.nickname).toBe('a'.repeat(20));
  });

  test('leaves a 10-char nickname untouched', () => {
    const recovered = onDrift({ nickname: 'kim', startupTab: 'index' }) as { nickname: string };
    expect(recovered.nickname).toBe('kim');
  });

  test('truncated nickname passes strict NicknameSchema', () => {
    const recovered = onDrift({ nickname: 'a'.repeat(50), startupTab: 'index' }) as { nickname: string };
    expect(NicknameSchema.safeParse(recovered.nickname).success).toBe(true);
  });

  test('falls back to empty when nickname field is missing', () => {
    const recovered = onDrift({ startupTab: 'index' }) as { nickname: string };
    expect(recovered.nickname).toBe('');
  });

  test('returns undefined for non-object raw (caller falls back to defaults)', () => {
    expect(onDrift(null)).toBeUndefined();
    expect(onDrift('garbage')).toBeUndefined();
    expect(onDrift(42)).toBeUndefined();
  });

  test('preserves other fields (startupTab)', () => {
    const recovered = onDrift({ nickname: 'a'.repeat(100), startupTab: 'vocab-lists' }) as { startupTab: string };
    expect(recovered.startupTab).toBe('vocab-lists');
  });
});
