import { Platform } from 'react-native';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';

/** 화면 밖 카드 View를 1080×1080 PNG 임시파일로 스냅샷. */
async function captureCard(ref: RefObject<View | null>): Promise<string> {
  return captureRef(ref as RefObject<View>, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    width: 1080,
    height: 1080,
  });
}

export type ShareOutcome = 'shared' | 'unavailable' | 'error';
export type SaveOutcome = 'saved' | 'denied' | 'error';

/** 카드를 캡처해 OS 공유 시트로 전달. 웹 등 미지원 환경은 'unavailable'. */
export async function shareStatsCard(ref: RefObject<View | null>, dialogTitle: string): Promise<ShareOutcome> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    const uri = await captureCard(ref);
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle });
    return 'shared';
  } catch {
    return 'error';
  }
}

/** 카드를 캡처해 기기 갤러리에 저장. 권한 거부 시 'denied'. */
export async function saveStatsCard(ref: RefObject<View | null>): Promise<SaveOutcome> {
  if (Platform.OS === 'web') return 'error';
  try {
    // add-only 권한(writeOnly)만 요청 — 전체 라이브러리 접근 불필요.
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) return 'denied';
    const uri = await captureCard(ref);
    await MediaLibrary.saveToLibraryAsync(uri);
    return 'saved';
  } catch {
    return 'error';
  }
}
