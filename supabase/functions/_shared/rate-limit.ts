// 같은 isolate 인스턴스 안에서 사용자별 분당 호출 cap.
// Edge Function isolate가 다중일 수 있어 완벽한 글로벌 cap은 아니지만
// 단일 인스턴스에 몰린 자동화 트래픽을 늦추는 데 충분.
// 강한 글로벌 cap이 필요하면 DB 카운터 RPC로 보강.

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

export function checkRateLimit(userId: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const b = buckets.get(userId);
  if (!b || b.resetAt <= now) {
    buckets.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (b.count >= MAX_PER_WINDOW) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true };
}
