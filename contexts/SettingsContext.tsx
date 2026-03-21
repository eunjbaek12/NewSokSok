import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface InputSettings {
    showDefinition: boolean;
    showPos: boolean;
    showExample: boolean;
    showTags: boolean;
    showPhonetic: boolean;
    addWordMode: 'popup' | 'full';
    fieldOrder: string[];
}

export interface StudySettings {
    studyBatchSize: number | 'all';
    sentenceBatchSize: number | 'all';
}

interface SettingsContextType {
    inputSettings: InputSettings;
    updateInputSettings: (updates: Partial<InputSettings>) => Promise<void>;
    studySettings: StudySettings;
    updateStudySettings: (updates: Partial<StudySettings>) => Promise<void>;
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
};

const DEFAULT_STUDY_SETTINGS: StudySettings = {
    studyBatchSize: 'all',
    sentenceBatchSize: 'all',
};

const SETTINGS_KEY = '@soksok_user_input_settings';
const STUDY_SETTINGS_KEY = '@soksok_user_study_settings';

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [inputSettings, setInputSettings] = useState<InputSettings>(DEFAULT_INPUT_SETTINGS);
    const [studySettings, setStudySettings] = useState<StudySettings>(DEFAULT_STUDY_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const [savedInput, savedStudy] = await Promise.all([
                AsyncStorage.getItem(SETTINGS_KEY),
                AsyncStorage.getItem(STUDY_SETTINGS_KEY)
            ]);

            if (savedStudy) {
                const parsedStudy = JSON.parse(savedStudy);
                setStudySettings({ ...DEFAULT_STUDY_SETTINGS, ...parsedStudy });
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

    return (
        <SettingsContext.Provider value={{ inputSettings, updateInputSettings, studySettings, updateStudySettings, isLoading }}>
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
