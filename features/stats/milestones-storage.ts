import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StreakMilestone } from './milestones';

// 평생 최고 축하 마일스톤의 로컬 저장. 기기 로컬 전용(동기화 없음) — 새 기기에서
// 최고 마일스톤이 1회 재축하될 수 있으나 수용(연출일 뿐 데이터가 아님).
// 실패는 전부 조용히 무시: 최악이 "축하 한 번 더/한 번 덜"이라 학습 흐름에 무해.

const KEY = '@soksok_streak_milestones';

/** 지금까지 축하한 최고 마일스톤. 기록 없음·손상 시 0(아무것도 축하 안 한 상태). */
export async function loadMaxCelebrated(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function saveMaxCelebrated(milestone: StreakMilestone): Promise<void> {
  try {
    // 단조 증가 보장 — 동시 호출·손상 값에도 기록이 뒤로 가지 않는다.
    const prev = await loadMaxCelebrated();
    if (milestone > prev) await AsyncStorage.setItem(KEY, String(milestone));
  } catch {}
}
