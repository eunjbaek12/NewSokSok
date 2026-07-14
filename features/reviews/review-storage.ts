import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReviewState } from './should-ask';

// 인앱 리뷰 요청 상태의 로컬 저장(동기화 없음). 실패는 전부 조용히 무시 —
// 최악이 "리뷰 요청 한 번 더/한 번 덜"이라 학습 흐름에 무해(마일스톤 저장과 동일 철학).

const KEY = '@soksok_review_prompt';
const DEFAULT: ReviewState = { lastAskedAt: 0, askCount: 0 };

export async function loadReviewState(): Promise<ReviewState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw);
    const lastAskedAt = Number(parsed?.lastAskedAt);
    const askCount = Number(parsed?.askCount);
    return {
      lastAskedAt: Number.isFinite(lastAskedAt) && lastAskedAt > 0 ? lastAskedAt : 0,
      askCount: Number.isFinite(askCount) && askCount > 0 ? askCount : 0,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export async function recordReviewAsked(now: number): Promise<void> {
  try {
    const prev = await loadReviewState();
    const next: ReviewState = { lastAskedAt: now, askCount: prev.askCount + 1 };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}
