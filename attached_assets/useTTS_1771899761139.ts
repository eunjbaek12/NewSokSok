import { useState, useEffect, useCallback } from 'react';

interface TTSHookRestult {
    speak: (text: string) => void;
    cancel: () => void;
    isSupported: boolean;
    isSpeaking: boolean;
}

export const useTTS = (): TTSHookRestult => {
    const [isSupported, setIsSupported] = useState<boolean>(true);
    const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

    // Initialize SpeechSynthesis and check for support
    useEffect(() => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
            setIsSupported(false);
            return;
        }

        const synth = window.speechSynthesis;

        // Load voices. Sometimes this takes a moment, so we also listen for the event.
        const loadVoices = () => {
            setVoices(synth.getVoices());
        };

        loadVoices();

        // Some browsers need this event to load voices asynchronously
        if (synth.onvoiceschanged !== undefined) {
            synth.onvoiceschanged = loadVoices;
        }

        // Cleanup when component unmounts
        return () => {
            if (synth.onvoiceschanged !== undefined) {
                synth.onvoiceschanged = null;
            }
            synth.cancel();
        };
    }, []);

    const cancel = useCallback(() => {
        if (isSupported && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
        }
    }, [isSupported]);

    const speak = useCallback((text: string) => {
        if (!isSupported || !window.speechSynthesis) return;

        // Cancel any ongoing speech before starting a new one
        cancel();

        // Small timeout ensures the cancel operation completes before speaking
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);

            // Try to find a natural/good English voice
            let selectedVoice = voices.find(voice => voice.lang === 'en-US' && voice.name.toLowerCase().includes('google'));

            if (!selectedVoice) {
                selectedVoice = voices.find(voice => voice.lang.startsWith('en'));
            }

            if (selectedVoice) {
                utterance.voice = selectedVoice;
            } else {
                // Fallback language if no specific English voice is found
                utterance.lang = 'en-US';
            }

            // Event listeners for UI feedback
            utterance.onstart = () => setIsSpeaking(true);

            // Both onend and onerror should reset the speaking state
            utterance.onend = () => setIsSpeaking(false);
            utterance.onerror = (e) => {
                console.error('SpeechSynthesis error:', e);
                setIsSpeaking(false);
            };

            window.speechSynthesis.speak(utterance);
        }, 50);

    }, [isSupported, voices, cancel]);

    return { speak, cancel, isSupported, isSpeaking };
};
