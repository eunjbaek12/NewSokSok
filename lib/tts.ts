import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { pickVoice } from './tts-voice';

let isSpeaking = false;
let audioModeReady: Promise<void> | null = null;

// iOS는 기본 audio session(soloAmbient)이라 무음 스위치가 켜져 있으면 TTS도 무음 처리된다.
// 학습 앱은 무음 모드에서도 발음이 나야 하므로 playsInSilentMode로 playback 카테고리를 강제한다.
// 첫 speak 호출 시 1회만 설정하고 결과를 캐시한다.
// expo-audio는 iOS에서만 필요하므로 top-level import 대신 lazy require로 가져온다.
// (네이티브 모듈이 없는 빌드에서 top-level import는 import만으로 throw → 앱 크래시)
function ensureAudioMode(): Promise<void> {
  if (Platform.OS !== 'ios') return Promise.resolve();
  if (!audioModeReady) {
    audioModeReady = (async () => {
      const { setAudioModeAsync } = require('expo-audio');
      await setAudioModeAsync({ playsInSilentMode: true });
    })().catch(() => {
      // 설정 실패해도 발화 자체는 시도한다 — 다음 호출 때 재시도하도록 캐시를 비운다.
      audioModeReady = null;
    });
  }
  return audioModeReady;
}

// ── 언어별 음성(voice) 고정 ──────────────────────────────────────
// Speech.speak에 language만 넘기면 OS가 그 언어의 음성을 호출마다 비결정적으로
// 고른다. 특히 중국어(zh-CN)는 안드로이드에 음성이 여러 개(+네트워크/로컬 변형)
// 있어 단어마다 음색이 바뀐다. 언어별로 음성을 하나 결정적으로 골라 캐시하고
// voice를 명시해 항상 같은 음성으로 재생한다. 매칭 음성이 없으면 voice=undefined로
// 두어 기존처럼 language 기준 폴백(안전).
let voicesPromise: Promise<Speech.Voice[]> | null = null;
const voiceByLang = new Map<string, string | undefined>();

function loadVoices(): Promise<Speech.Voice[]> {
  if (!voicesPromise) {
    voicesPromise = Speech.getAvailableVoicesAsync()
      .then((v) => v ?? [])
      .catch(() => []); // 조회 실패(웹·엔진 미초기화) → 폴백
  }
  return voicesPromise;
}

// pickVoice 순수 로직은 lib/tts-voice.ts에 분리(유닛 테스트). Speech.Voice[]는
// SelectableVoice[]에 구조적 호환이라 그대로 넘긴다.
async function resolveVoice(language: string): Promise<string | undefined> {
  if (voiceByLang.has(language)) return voiceByLang.get(language);
  const id = pickVoice(await loadVoices(), language);
  voiceByLang.set(language, id);
  return id;
}

export async function speak(text: string, language: string = 'en-US'): Promise<void> {
  await ensureAudioMode();
  const voice = await resolveVoice(language);
  if (isSpeaking) {
    await Speech.stop();
  }
  isSpeaking = true;
  return new Promise((resolve) => {
    Speech.speak(text, {
      language,
      voice, // 언어별 고정 음성 (undefined면 language 기준 폴백)
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
