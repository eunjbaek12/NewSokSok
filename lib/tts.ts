import { setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';

let isSpeaking = false;
let audioModeReady: Promise<void> | null = null;

// iOS는 기본 audio session(soloAmbient)이라 무음 스위치가 켜져 있으면 TTS도 무음 처리된다.
// 학습 앱은 무음 모드에서도 발음이 나야 하므로 playsInSilentMode로 playback 카테고리를 강제한다.
// 첫 speak 호출 시 1회만 설정하고 결과를 캐시한다. (Android는 무해)
function ensureAudioMode(): Promise<void> {
  if (!audioModeReady) {
    audioModeReady = setAudioModeAsync({ playsInSilentMode: true }).catch(() => {
      // 설정 실패해도 발화 자체는 시도한다 — 다음 호출 때 재시도하도록 캐시를 비운다.
      audioModeReady = null;
    });
  }
  return audioModeReady;
}

export async function speak(text: string, language: string = 'en-US'): Promise<void> {
  await ensureAudioMode();
  if (isSpeaking) {
    await Speech.stop();
  }
  isSpeaking = true;
  return new Promise((resolve) => {
    Speech.speak(text, {
      language,
      rate: 0.9,
      onDone: () => {
        isSpeaking = false;
        resolve();
      },
      onError: () => {
        isSpeaking = false;
        resolve();
      },
      onStopped: () => {
        isSpeaking = false;
        resolve();
      },
    });
  });
}

export async function stopSpeaking(): Promise<void> {
  if (isSpeaking) {
    await Speech.stop();
    isSpeaking = false;
  }
}

export function getIsSpeaking(): boolean {
  return isSpeaking;
}
