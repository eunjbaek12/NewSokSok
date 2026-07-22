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

// 빈 목록은 "이 기기에 음성이 없다"가 아니라 "아직 모른다"일 수 있다. 안드로이드
// TextToSpeech는 엔진 초기화 전에 voices를 조회하면 예외를 던지고(expo-speech
// SpeechModule.kt getVoices), 우리는 그걸 []로 폴백한다. 이 []를 영구 캐시하면
// 앱 시작 직후 첫 speak 한 번으로 그 세션 내내 음성 고정이 죽어버린다(모든 언어가
// voice=undefined → 안드로이드는 기기 기본 언어로 폴백해 엉뚱한 음색으로 읽음).
// 그래서 비어 있으면 캐시를 비워 다음 호출에서 다시 조회한다.
function loadVoices(): Promise<Speech.Voice[]> {
  if (!voicesPromise) {
    const p: Promise<Speech.Voice[]> = Speech.getAvailableVoicesAsync()
      .then((v) => v ?? [])
      .catch(() => []) // 조회 실패(웹·엔진 미초기화) → 폴백
      .then((v) => {
        if (v.length === 0 && voicesPromise === p) voicesPromise = null;
        return v;
      });
    voicesPromise = p;
  }
  return voicesPromise;
}

// pickVoice 순수 로직은 lib/tts-voice.ts에 분리(유닛 테스트). Speech.Voice[]는
// SelectableVoice[]에 구조적 호환이라 그대로 넘긴다.
async function resolveVoice(language: string): Promise<string | undefined> {
  if (voiceByLang.has(language)) return voiceByLang.get(language);
  const voices = await loadVoices();
  const id = pickVoice(voices, language);
  // 목록을 못 받은 상태(빈 배열)에서 나온 undefined는 "이 언어 음성이 없다"가 아니라
  // "아직 모른다" — 캐시하면 목록이 채워진 뒤에도 폴백이 굳는다. loadVoices와 짝.
  if (voices.length > 0) voiceByLang.set(language, id);
  return id;
}

/** 기본 발화 속도. 원어민보다 살짝 느려 학습에 듣기 좋은 값. */
export const DEFAULT_RATE = 0.9;
/** 스피커를 길게 눌렀을 때의 속도 — 발음이 어려운 단어를 뜯어 듣는 용도. */
export const SLOW_RATE = 0.5;

/**
 * ⚠️ rate는 항상 명시해서 넘긴다(생략 금지). 안드로이드 TextToSpeech의
 * setSpeechRate는 utterance 단위가 아니라 **엔진 인스턴스 전역 상태**라,
 * 느리게 한 번 재생한 뒤 rate를 넘기지 않으면 이후 재생이 계속 느린 채로 남는다.
 */
export async function speak(
  text: string,
  language: string = 'en-US',
  options: { rate?: number } = {},
): Promise<void> {
  const rate = options.rate ?? DEFAULT_RATE;
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
      rate,
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
