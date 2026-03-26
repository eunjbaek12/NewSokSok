import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LanguageCode } from '@/constants/languages';

export interface InputSettings {
    showDefinition: boolean;
    showPos: boolean;
    showExample: boolean;
    showTags: boolean;
    showPhonetic: boolean;
    addWordMode: 'popup' | 'full';
    fieldOrder: string[];
    sourceLang: LanguageCode;
    targetLang: LanguageCode;
}

export interface StudySettings {
    studyBatchSize: number | 'all';
    sentenceBatchSize: number | 'all';
}

export interface AutoPlaySettings {
    filter: 'all' | 'learning' | 'memorized';
    isStarred: boolean;
    showTerm: boolean;
    showMeaning: boolean;
    showPos: boolean;
    showExample: boolean;
    showExampleKr: boolean;
    autoPlaySound: boolean;
    delay: '1s' | '2s' | '3s';
    shuffle: boolean;
}

export interface CustomStudySettings {
    useAllLists: boolean;
    selectedListIds: string[];
    selectedDaysByList: Record<string, number[] | 'all'>;
    wordFilter: 'all' | 'learning' | 'wrongCount' | 'recent' | 'starred';
    studyMode: 'flashcard' | 'quiz';
}

interface SettingsContextType {
    inputSettings: InputSettings;
    updateInputSettings: (updates: Partial<InputSettings>) => Promise<void>;
    studySettings: StudySettings;
    updateStudySettings: (updates: Partial<StudySettings>) => Promise<void>;
    autoPlaySettings: AutoPlaySettings;
    updateAutoPlaySettings: (updates: Partial<AutoPlaySettings>) => Promise<void>;
    customStudySettings: CustomStudySettings;
    updateCustomStudySettings: (updates: Partial<CustomStudySettings>) => Promise<void>;
    isLoading: boolean;
}

const DEFAULT_INPUT_SETTINGS: InputSettings = {
    showDefinition: false, // Beginner friendly: default to off
    showPos: false, // Default to off as requested
    showExample: true,
    showTags: true,
    showPhonetic: true,
    addWordMode: 'popup',
    fieldOrder: ['term', 'meaningKr', 'pos', 'phonetic', 'definition', 'example', 'tags'],
    sourceLang: 'en',
    targetLang: 'ko',
};

const DEFAULT_STUDY_SETTINGS: StudySettings = {
    studyBatchSize: 'all',
    sentenceBatchSize: 'all',
};

const DEFAULT_AUTOPLAY_SETTINGS: AutoPlaySettings = {
    filter: 'all',
    isStarred: false,
    showTerm: true,
    showMeaning: true,
    showPos: true,
    showExample: true,
    showExampleKr: true,
    autoPlaySound: true,
    delay: '2s',
    shuffle: false,
};

const DEFAULT_CUSTOM_STUDY_SETTINGS: CustomStudySettings = {
    useAllLists: true,
    selectedListIds: [],
    selectedDaysByList: {},
    wordFilter: 'all',
    studyMode: 'flashcard',
};

const SETTINGS_KEY = '@soksok_user_input_settings';
const STUDY_SETTINGS_KEY = '@soksok_user_study_settings';
const AUTOPLAY_SETTINGS_KEY = '@soksok_user_autoplay_settings';
const CUSTOM_STUDY_KEY = '@soksok_custom_study_settings';

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [inputSettings, setInputSettings] = useState<InputSettings>(DEFAULT_INPUT_SETTINGS);
    const [studySettings, setStudySettings] = useState<StudySettings>(DEFAULT_STUDY_SETTINGS);
    const [autoPlaySettings, setAutoPlaySettings] = useState<AutoPlaySettings>(DEFAULT_AUTOPLAY_SETTINGS);
    const [customStudySettings, setCustomStudySettings] = useState<CustomStudySettings>(DEFAULT_CUSTOM_STUDY_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const [savedInput, savedStudy, savedAutoPlay, savedCustomStudy] = await Promise.all([
                AsyncStorage.getItem(SETTINGS_KEY),
                AsyncStorage.getItem(STUDY_SETTINGS_KEY),
                AsyncStorage.getItem(AUTOPLAY_SETTINGS_KEY),
                AsyncStorage.getItem(CUSTOM_STUDY_KEY),
            ]);

            if (savedStudy) {
                const parsedStudy = JSON.parse(savedStudy);
                setStudySettings({ ...DEFAULT_STUDY_SETTINGS, ...parsedStudy });
            }

            if (savedAutoPlay) {
                const parsedAutoPlay = JSON.parse(savedAutoPlay);
                setAutoPlaySettings({ ...DEFAULT_AUTOPLAY_SETTINGS, ...parsedAutoPlay });
            }

            if (savedCustomStudy) {
                const parsedCustomStudy = JSON.parse(savedCustomStudy);
                setCustomStudySettings({ ...DEFAULT_CUSTOM_STUDY_SETTINGS, ...parsedCustomStudy });
            }

            if (savedInput) {
                const parsed = JSON.parse(savedInput);
                const mergedFieldOrder = [...(parsed.fieldOrder || [])];

                // Ensure all default fields exist
                DEFAULT_INPUT_SETTINGS.fieldOrder.forEach(field => {
                    if (!mergedFieldOrder.includes(field)) {
                        if (field === 'pos') {
                            // Place pos after meaningKr
                            const meaningIndex = mergedFieldOrder.indexOf('meaningKr');
                            if (meaningIndex !== -1) {
                                mergedFieldOrder.splice(meaningIndex + 1, 0, 'pos');
                            } else {
                                mergedFieldOrder.push('pos');
                            }
                        } else if (field === 'phonetic') {
                            // Special case: place phonetic after pos (or meaningKr)
                            const posIndex = mergedFieldOrder.indexOf('pos');
                            const meaningIndex = mergedFieldOrder.indexOf('meaningKr');
                            const insertAt = posIndex !== -1 ? posIndex + 1 : (meaningIndex !== -1 ? meaningIndex + 1 : -1);

                            if (insertAt !== -1) {
                                mergedFieldOrder.splice(insertAt, 0, 'phonetic');
                            } else {
                                mergedFieldOrder.push('phonetic');
                            }
                        } else {
                            mergedFieldOrder.push(field);
                        }
                    }
                });

                setInputSettings({
                    ...DEFAULT_INPUT_SETTINGS,
                    ...parsed,
                    fieldOrder: mergedFieldOrder
                });
            }
        } catch (e) {
            console.error('Failed to load settings', e);
        } finally {
            setIsLoading(false);
        }
    };

    const updateInputSettings = async (updates: Partial<InputSettings>) => {
        try {
            const newSettings = { ...inputSettings, ...updates };
            setInputSettings(newSettings);
            await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
        } catch (e) {
            console.error('Failed to save settings', e);
        }
    };

    const updateStudySettings = async (updates: Partial<StudySettings>) => {
        try {
            const newSettings = { ...studySettings, ...updates };
            setStudySettings(newSettings);
            await AsyncStorage.setItem(STUDY_SETTINGS_KEY, JSON.stringify(newSettings));
        } catch (e) {
            console.error('Failed to save study settings', e);
        }
    };

    const updateAutoPlaySettings = async (updates: Partial<AutoPlaySettings>) => {
        try {
            const newSettings = { ...autoPlaySettings, ...updates };
            setAutoPlaySettings(newSettings);
            await AsyncStorage.setItem(AUTOPLAY_SETTINGS_KEY, JSON.stringify(newSettings));
        } catch (e) {
            console.error('Failed to save autoplay settings', e);
        }
    };

    const updateCustomStudySettings = async (updates: Partial<CustomStudySettings>) => {
        try {
            const newSettings = { ...customStudySettings, ...updates };
            setCustomStudySettings(newSettings);
            await AsyncStorage.setItem(CUSTOM_STUDY_KEY, JSON.stringify(newSettings));
        } catch (e) {
            console.error('Failed to save custom study settings', e);
        }
    };

    return (
        <SettingsContext.Provider value={{
            inputSettings,
            updateInputSettings,
            studySettings,
            updateStudySettings,
            autoPlaySettings,
            updateAutoPlaySettings,
            customStudySettings,
            updateCustomStudySettings,
            isLoading
        }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
