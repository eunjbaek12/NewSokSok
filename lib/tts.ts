import * as Speech from 'expo-speech';

let isSpeaking = false;

export async function speak(text: string, language: string = 'en-US'): Promise<void> {
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
