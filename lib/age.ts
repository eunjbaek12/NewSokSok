// 만 나이 계산 헬퍼. neutral age screen 입력값을 평가.
// AdMob child-directed treatment / KR 아동 보호 규정의 14세 미만 판단에 사용.

export function computeAgeYears(birthdayISO: string, now: Date = new Date()): number {
  const [y, m, d] = birthdayISO.split('-').map(Number);
  if (!y || !m || !d) return 0;
  let age = now.getFullYear() - y;
  const monthDiff = now.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d)) age -= 1;
  return age;
}

export function isUnder14From(birthdayISO: string, now: Date = new Date()): boolean {
  return computeAgeYears(birthdayISO, now) < 14;
}

// 사용자 입력 검증용. 미래 날짜 / 너무 오래된 날짜 / 존재하지 않는 날짜 차단.
export function validateBirthday(birthdayISO: string, now: Date = new Date()): 'ok' | 'future' | 'invalid' {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdayISO)) return 'invalid';
  const parsed = new Date(birthdayISO + 'T00:00:00');
  if (Number.isNaN(parsed.getTime())) return 'invalid';
  if (parsed.getTime() > now.getTime()) return 'future';
  // 해당 날짜가 실제로 존재하는지 (예: 2-30 차단)
  const [y, m, d] = birthdayISO.split('-').map(Number);
  if (parsed.getFullYear() !== y || parsed.getMonth() + 1 !== m || parsed.getDate() !== d) return 'invalid';
  // 120세 초과 차단
  if (now.getFullYear() - y > 120) return 'invalid';
  return 'ok';
}
