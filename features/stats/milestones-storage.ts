import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CelebratedMap } from './milestones';

// 마일스톤 축하 이력의 로컬 저장. 기기 로컬 전용(동기화 없음) — 새 기기에서
// 최고 마일스톤이 1회 재축하될 수 있으나 수용(연출일 뿐 데이터가 아님).
// 실패는 전부 조용히 무시: 최악이 "축하 한 번 더/한 번 덜"이라 학습 흐름에 무해.

const KEY = '@soksok_streak_milestones';

export async function loadCelebratedMap(): Promise<CelebratedMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveCelebratedMap(map: CelebratedMap): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {}
}
