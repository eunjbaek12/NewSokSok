import { Alert } from 'react-native';

/**
 * TEMPORARY login-latency instrumentation. Remove once the "로그인이 오래 걸린다"
 * report is diagnosed. Timing spans two disconnected async contexts (the
 * signInWith* call in app/login.tsx AND the post-login bootstrap in
 * features/vocab/use-bootstrap.ts), so the clock lives at module scope and is
 * shared across scopes to produce one continuous timeline.
 *
 * How to read it on a real device:
 *   1. An Alert titled "로그인 소요 N.Ns" pops the moment the home screen is
 *      ready, listing every step (cumulative ms + per-step delta).
 *   2. Every step is also logged via console.warn "[login-timing] …" — warn
 *      survives production's transform-remove-console (which strips console.log),
 *      so it shows in Metro/Xcode logs on any build type.
 *
 * A session is bounded by resetLoginTiming() (button tap) → showLoginTimingSummary()
 * (home ready). Marks recorded while no session is active are ignored, so the
 * cold-start bootstrap of an already-logged-in user produces no Alert/logs.
 */
type Mark = { scope: string; label: string; delta: number; total: number };

let active = false;
let epoch = 0;
let lastAt = 0;
let marks: Mark[] = [];

/** Begin a timing session — call the instant a login button is tapped. */
export function resetLoginTiming(): void {
  active = true;
  epoch = Date.now();
  lastAt = epoch;
  marks = [];
  console.warn('[login-timing] ── session start ──');
}

/** End the session without a summary (e.g. login threw / was cancelled). */
export function endLoginTiming(): void {
  active = false;
}

/** Returns a mark() bound to `scope`. No-ops when no session is active. */
export function startLoginTimer(scope: string): (label: string) => void {
  return (label: string) => {
    if (!active) return;
    const now = Date.now();
    const delta = now - lastAt;
    const total = now - epoch;
    lastAt = now;
    marks.push({ scope, label, delta, total });
    console.warn(`[login-timing] ${scope} · ${label}: +${delta}ms (total ${total}ms)`);
  };
}

/** Show the breakdown once and end the session. No-op when inactive. */
export function showLoginTimingSummary(): void {
  if (!active) return;
  active = false;
  const total = marks.length ? marks[marks.length - 1].total : 0;
  const body = marks.length
    ? marks
        .map(m => `${String(m.total).padStart(5)}ms  (+${m.delta})  ${m.scope}·${m.label}`)
        .join('\n')
    : '(측정된 단계 없음)';
  console.warn(`[login-timing] ── session end, total ${total}ms ──`);
  Alert.alert(`로그인 소요 ${(total / 1000).toFixed(1)}s`, body);
}
