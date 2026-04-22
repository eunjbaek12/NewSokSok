import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    Pressable,
    Platform,
    KeyboardAvoidingView,
    ScrollView,
    StyleSheet,
    Alert,
    Linking,
    TextInput,
    ActivityIndicator,
    Modal,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
// expo-speech-recognition requires a custom dev build (not supported in standard Expo Go)
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = (_event: string, _cb: any) => {};
try {
    const mod = require('expo-speech-recognition');
    ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
    useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
} catch {
    // Native module not available
}
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useLists, selectWordsForList, createList, addWord } from '@/features/vocab';
import { useAddWord } from '@/hooks/useAddWord';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ModalPicker, PickerOption } from '@/components/ui/ModalPicker';
import { Snackbar } from '@/components/ui/Snackbar';
import BatchImportWorkflow from '@/components/BatchImportWorkflow';
import PhotoImportWorkflow from '@/components/PhotoImportWorkflow';
import { AutoFillResult } from '@/lib/types';
import { autoFillWord } from '@/lib/translation-api';
import { searchNaverDict, fetchNaverAutocomplete, fetchDatamuseAutocomplete } from '@/lib/naver-dict-api';
import { useSettings } from '@/features/settings';
import { speak } from '@/lib/tts';
import { SUPPORTED_LANGUAGES, getNaverDictCode, getNaverDictSubdomain, getPlaceholderText, getMeaningLabel, getDefinitionLabel, getExampleTranslationLabel, getLanguageLabel, getLanguageFlag, LanguageCode } from '@/constants/languages';
import Animated, {
    FadeIn,
    FadeOut,
    Layout,
    useAnimatedKeyboard,
    useAnimatedStyle,
    withSpring,
    useSharedValue,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView
} from 'react-native-gesture-handler';


// 드래그 가능한 필드 항목 컴포넌트
const DraggableFieldItem = ({
    id,
    label,
    requiredLabel,
    index,
    totalCount,
    isVisible,
    colors,
    onToggle,
    onSwap,
    isFixed = false
}: {
    id: string;
    label: string;
    requiredLabel: string;
    index: number;
    totalCount: number;
    isVisible: boolean;
    colors: any;
    onToggle: () => void;
    onSwap: (from: number, to: number) => void;
    isFixed?: boolean;
}) => {
    const translateY = useSharedValue(0);
    const isDragging = useSharedValue(false);
    const startY = useSharedValue(0);
    const scale = useSharedValue(1);

    const currentIndex = useSharedValue(index);
    useEffect(() => {
        currentIndex.value = index;
    }, [index]);

    const lastSwapY = useSharedValue(0);

    const gesture = Gesture.Pan()
        .enabled(!isFixed)
        .activateAfterLongPress(100)
        .onStart((e) => {
            isDragging.value = true;
            startY.value = translateY.value;
            lastSwapY.value = 0;
            scale.value = 1.02; // 약간 떠오르는 효과
            runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        })
        .onUpdate((e) => {
            translateY.value = startY.value + e.translationY - lastSwapY.value;

            const threshold = 40; // 항목 높이가 줄어들었으므로 조정
            const dy = e.translationY - lastSwapY.value;

            if (dy > threshold && currentIndex.value < totalCount - 1) {
                runOnJS(onSwap)(currentIndex.value, currentIndex.value + 1);
                lastSwapY.value += threshold;
            }
            else if (dy < -threshold && currentIndex.value > 0) {
                runOnJS(onSwap)(currentIndex.value, currentIndex.value - 1);
                lastSwapY.value -= threshold;
            }
        })
        .onEnd(() => {
            isDragging.value = false;
            scale.value = withTiming(1);
            translateY.value = withSpring(0);
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: translateY.value },
            { scale: scale.value }
        ],
        zIndex: isDragging.value ? 1000 : 1,
        backgroundColor: isDragging.value ? colors.surface : (isVisible ? colors.primary + '08' : 'transparent'),
        borderColor: isDragging.value ? colors.primary : (isVisible ? colors.primary + '40' : colors.borderLight),
        borderStyle: isDragging.value ? 'dashed' : 'solid',
        borderWidth: isVisible || isDragging.value ? 1.5 : 1,
        shadowOpacity: isDragging.value ? 0.1 : 0,
        shadowRadius: 10,
        elevation: isDragging.value ? 5 : 0,
        opacity: isFixed ? 0.6 : 1,
    }));

    return (
        <Animated.View
            layout={Layout.duration(200)}
            style={[styles.settingsRowCompact, animatedStyle, { borderRadius: 12, marginBottom: 2, paddingHorizontal: 4 }]}
        >
            <GestureDetector gesture={gesture}>
                <View style={{ paddingLeft: 10, paddingRight: 10, paddingVertical: 6 }}>
                    <Ionicons
                        name="reorder-four-outline"
                        size={20}
                        color={isFixed ? colors.textTertiary : (isDragging.value ? colors.primary : colors.textSecondary)}
                    />
                </View>
            </GestureDetector>

            <Pressable
                onPress={isFixed ? undefined : onToggle}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: '100%' }}
                disabled={isFixed}
            >
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.settingsRowText, { color: isFixed ? colors.textTertiary : colors.text, fontSize: 14, fontFamily: isVisible ? 'Pretendard_600SemiBold' : 'Pretendard_500Medium' }]}>
                        {label}
                    </Text>
                    {isFixed && (
                        <View style={{ backgroundColor: colors.surfaceSecondary, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, marginLeft: 6 }}>
                            <Text style={{ fontSize: 9, color: colors.textTertiary, fontFamily: 'Pretendard_600SemiBold' }}>{requiredLabel}</Text>
                        </View>
                    )}
                </View>

                <View style={{ width: 40, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 8 }}>
                    <Ionicons
                        name={isVisible ? "checkbox" : "square-outline"}
                        size={22}
                        color={isVisible ? colors.primary : colors.border}
                    />
                </View>
            </Pressable>
        </Animated.View>
    );
};

const DraggableFieldList = ({ settings, onUpdate, colors, t }: { settings: any, onUpdate: (s: any) => void, colors: any, t: (key: string, opts?: any) => string }) => {
    // 모든 필드를 포함하되, term과 meaningKr은 isFixed 처리
    const sourceLang = (settings.sourceLang || 'en') as LanguageCode;
    const targetLang = (settings.targetLang || 'ko') as LanguageCode;
    const labels: Record<string, string> = {
        term: t('addWord.wordInput'),
        meaningKr: getMeaningLabel(targetLang, t),
        pos: t('addWord.pos'),
        phonetic: t('addWord.phonetic'),
        definition: getDefinitionLabel(sourceLang, t),
        example: t('addWord.exampleAndTranslation'),
        tags: t('addWord.tags'),
    };

    const handleSwap = (from: number, to: number) => {
        // 고정 항목(0, 1)은 교체 금지
        if (from < 2 || to < 2) return;

        const newOrder = [...settings.fieldOrder];
        [newOrder[from], newOrder[to]] = [newOrder[to], newOrder[from]];
        onUpdate({ ...settings, fieldOrder: newOrder });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    return (
        <View>
            {settings.fieldOrder.map((id: string, index: number) => {
                const isFixed = id === 'term' || id === 'meaningKr';
                return (
                    <DraggableFieldItem
                        key={id}
                        id={id}
                        label={labels[id]}
                        requiredLabel={t('addWord.required')}
                        index={index}
                        totalCount={settings.fieldOrder.length}
                        isVisible={
                            id === 'term' || id === 'meaningKr' ? true :
                                id === 'pos' ? settings.showPos :
                                    id === 'phonetic' ? settings.showPhonetic :
                                        id === 'definition' ? settings.showDefinition :
                                            id === 'example' ? settings.showExample :
                                                id === 'tags' ? settings.showTags : true
                        }
                        colors={colors}
                        onToggle={() => {
                            if (isFixed) return;
                            if (id === 'pos') onUpdate({ ...settings, showPos: !settings.showPos });
                            if (id === 'phonetic') onUpdate({ ...settings, showPhonetic: !settings.showPhonetic });
                            if (id === 'definition') onUpdate({ ...settings, showDefinition: !settings.showDefinition });
                            if (id === 'example') onUpdate({ ...settings, showExample: !settings.showExample });
                            if (id === 'tags') onUpdate({ ...settings, showTags: !settings.showTags });
                        }}
                        onSwap={handleSwap}
                        isFixed={isFixed}
                    />
                );
            })}
        </View>
    );
};

export default function AddWordScreen() {
    const termInputRef = React.useRef<TextInput>(null);
    const { listId, wordId } = useLocalSearchParams<{ listId: string; wordId?: string }>();
    const { t } = useTranslation();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const lists = useLists();
    const getWordsForList = (id: string) => selectWordsForList(lists, id);
    const params = useLocalSearchParams<any>();

    const initialMode = useMemo(() => params.initialMode, [params.initialMode]);
    const draftState = useMemo(() => {
        if (!params.draft) return undefined;
        try {
            return JSON.parse(params.draft as string);
        } catch {
            return undefined;
        }
    }, [params.draft]);

    const isEditing = !!wordId;
    const existingWord = isEditing && listId ? getWordsForList(listId).find(w => w.id === wordId) : null;

    const { inputSettings, updateInputSettings, profileSettings } = useSettings();

    const {
        term, setTerm,
        definition, setDefinition,
        meaningKr, setMeaningKr,
        phonetic, setPhonetic,
        pos, setPos,
        exampleEn, setExampleEn,
        exampleKr, setExampleKr,
        tags, setTags,
        errors, setErrors,
        handleAutoFill,
        handleAutoFillWithTerm,
        startAutoFill,
        handleSaveWord,
        isPendingFill,
        isPendingSave,
    } = useAddWord(listId, wordId, existingWord, draftState, inputSettings.sourceLang, inputSettings.targetLang, profileSettings.geminiApiKey || undefined);

    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [inputWrapperHeight, setInputWrapperHeight] = useState(50);
    const autocompleteTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressBlurRef = React.useRef(false);

    const [fieldSettingsOpen, setFieldSettingsOpen] = useState(false);
    const [tempSettings, setTempSettings] = useState(inputSettings);

    // 필드 순서 보정 (단어, 뜻 항상 먼저 나오도록)
    const sortedFieldOrder = useMemo(() => {
        // 모달이 열려있을 때는 임시 설정(tempSettings)의 순서를 따름 (즉각적인 시각 피드백을 위해)
        const order = fieldSettingsOpen ? [...tempSettings.fieldOrder] : [...inputSettings.fieldOrder];
        const rest = order.filter(id => id !== 'term' && id !== 'meaningKr');
        return ['term', 'meaningKr', ...rest];
    }, [inputSettings.fieldOrder, tempSettings.fieldOrder, fieldSettingsOpen]);

    useEffect(() => {
        if (!initialMode) {
            router.setParams({ initialMode: inputSettings.addWordMode });
        }
    }, []);

    const keyboard = useAnimatedKeyboard();

    const animatedFabStyle = useAnimatedStyle(() => {
        return {
            transform: [{
                translateY: -Math.max(keyboard.height.value, 100),
            }],
            opacity: 1,
        };
    });

    const [photoSource, setPhotoSource] = useState<'camera' | 'gallery' | null>(null);
    const [showExcel, setShowExcel] = useState(false);
    const [selectedListId, setSelectedListId] = useState(listId || (lists.length > 0 ? lists[0].id : ''));
    const [listPickerOpen, setListPickerOpen] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [showNewListInput, setShowNewListInput] = useState(false);
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [tagInput, setTagInput] = useState('');
    const [isApplying, setIsApplying] = useState(false);
    const [sourceLangPickerOpen, setSourceLangPickerOpen] = useState(false);
    const [targetLangPickerOpen, setTargetLangPickerOpen] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isTermFocused, setIsTermFocused] = useState(false);

    useSpeechRecognitionEvent('start', () => setIsListening(true));
    useSpeechRecognitionEvent('end', () => setIsListening(false));
    useSpeechRecognitionEvent('result', (event: any) => {
        if (event.results[0]?.transcript) {
            setTerm(event.results[0].transcript);
        }
    });
    useSpeechRecognitionEvent('error', () => setIsListening(false));

    const handleVoiceInput = async () => {
        try {
            if (!ExpoSpeechRecognitionModule) {
                Alert.alert(t('common.error'), t('addWord.voiceNotSupported', { defaultValue: '음성 입력이 이 기기에서 지원되지 않습니다.' }));
                return;
            }
            if (isListening) {
                ExpoSpeechRecognitionModule.stop();
                return;
            }
            const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
            if (!granted) {
                Alert.alert(t('common.permissionDenied'), t('addWord.micPermissionMessage'));
                return;
            }
            Haptics.selectionAsync();
            const lang = inputSettings.sourceLang === 'ko' ? 'ko-KR' : 'en-US';
            ExpoSpeechRecognitionModule.start({ lang, interimResults: true });
        } catch {
            Alert.alert(t('common.error'), t('addWord.voiceNotSupported', { defaultValue: '음성 입력이 이 기기에서 지원되지 않습니다.' }));
        }
    };

    const selectedFieldsCount = useMemo(() => {
        let count = 2; // term, meaningKr
        if (tempSettings.showPos) count++;
        if (tempSettings.showPhonetic) count++;
        if (tempSettings.showDefinition) count++;
        if (tempSettings.showExample) count++;
        if (tempSettings.showTags) count++;
        return count;
    }, [tempSettings]);

    const modalTranslateY = useSharedValue(0);
    const modalGesture = Gesture.Pan()
        .onUpdate((e) => {
            if (e.translationY > 0) {
                modalTranslateY.value = e.translationY;
            }
        })
        .onEnd((e) => {
            if (e.translationY > 100 || e.velocityY > 500) {
                runOnJS(setFieldSettingsOpen)(false);
            }
            modalTranslateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        });

    const modalAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: modalTranslateY.value }]
    }));

    useEffect(() => {
        if (fieldSettingsOpen) {
            modalTranslateY.value = 0;
        }
    }, [fieldSettingsOpen]);

    useEffect(() => {
        if (!isEditing && !fieldSettingsOpen) {
            const timer = setTimeout(() => {
                termInputRef.current?.focus();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [fieldSettingsOpen, isEditing]);

    const handleOpenSettings = () => {
        setTempSettings(inputSettings);
        setFieldSettingsOpen(true);
    };

    const handleApplySettings = async () => {
        setIsApplying(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // 시각적 피드백을 위해 약간의 지연
        setTimeout(async () => {
            await updateInputSettings(tempSettings);
            setFieldSettingsOpen(false);
            setIsApplying(false);

            // wordId가 없을 경우 파라미터에서 제외하여 문자열 "null" 전달 방지
            const params: any = {
                listId: selectedListId,
                initialMode: tempSettings.addWordMode,
                draft: JSON.stringify({ term, meaningKr, definition, exampleEn, exampleKr, tags, pos, phonetic })
            };
            if (wordId) params.wordId = wordId;

            router.replace({
                pathname: '/add-word',
                params
            });
        }, 500);
    };

    const handleCancelSettings = () => {
        setFieldSettingsOpen(false);
    };

    useEffect(() => {
        if (existingWord) {
            setTerm(existingWord.term);
            setDefinition(existingWord.definition);
            setMeaningKr(existingWord.meaningKr);
            setExampleEn(existingWord.exampleEn);
            setExampleKr(existingWord.exampleKr || '');
            setTags(existingWord.tags || []);
            setPos(existingWord.pos || '');
            setPhonetic(existingWord.phonetic || '');
        }
    }, [existingWord, setTerm, setDefinition, setMeaningKr, setExampleEn, setExampleKr, setTags, setPos, setPhonetic]);

    const navigation = useNavigation();

    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e) => {
            if (!isEditing && showExcel) {
                e.preventDefault();
                setShowExcel(false);
            }
        });
        return unsubscribe;
    }, [navigation, showExcel, isEditing]);

    const handlePhotoSaveWords = async (words: { word: string; meaning: string; definition?: string; exampleSentence: string }[]) => {
        let addedCount = 0;
        for (const w of words) {
            if (w.word.trim()) {
                await addWord(selectedListId, {
                    term: w.word.trim(),
                    definition: w.definition || '',
                    meaningKr: w.meaning,
                    exampleEn: w.exampleSentence || '',
                    exampleKr: '',
                    isStarred: false,
                    tags: []
                });
                addedCount++;
            }
        }
        if (addedCount > 0) {
            setToastMessage(t('addWord.batchSaveComplete', { count: addedCount }));
            setToastVisible(true);
            setTimeout(() => setToastVisible(false), 2000);
        }
    };

    const handleOpenListPicker = () => {
        setShowNewListInput(false);
        setNewListName('');
        setListPickerOpen(true);
    };

    const handleSelectList = (id: string) => {
        setSelectedListId(id);
        setListPickerOpen(false);
    };


    // Use handleAutoFill from useAddWord hook instead of re-implementing it localy
    const handleSearch = () => {
        if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
        setSuggestions([]);
        setShowSuggestions(false);
        handleAutoFill();
    };

    const handleAddTag = () => {
        const newTags = tagInput
            .split(/[\s,]+/)
            .map(t => t.trim().toLowerCase())
            .filter(t => t.length > 0 && !tags.includes(t));

        if (newTags.length > 0) {
            setTags([...tags, ...newTags].slice(0, 10));
        }
        setTagInput('');
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };


    const onSave = () => {
        handleSaveWord(
            selectedListId,
            (savedTerm) => {
                if (isEditing) {
                    router.back();
                } else {
                    setToastMessage(t('addWord.addedComplete', { term: savedTerm }));
                    setToastVisible(true);
                    setTimeout(() => setToastVisible(false), 1200);

                    // 저장 후 단어 입력창에 다시 포커스 (필드 리셋 완료 후)
                    setTimeout(() => {
                        termInputRef.current?.focus();
                    }, 300);
                }
            },
            () => {
                handleOpenListPicker();
            }
        );
    };

    const handleCreateNewList = async () => {
        const trimmed = newListName.trim();
        if (!trimmed) return;
        try {
            const newList = await createList(trimmed);
            setSelectedListId(newList.id);
            setNewListName('');
            setShowNewListInput(false);
            setListPickerOpen(false);
        } catch (e: any) {
            if (e?.message === 'DUPLICATE_LIST') {
                Alert.alert(t('addWord.duplicateName'), t('addWord.duplicateNameMessage', { name: trimmed }));
            }
        }
    };

    const selectedListTitle = lists.find(l => l.id === selectedListId)?.title || t('addWord.selectList');

    const pickerOptions: PickerOption[] = lists.map(l => ({
        id: l.id,
        title: l.title,
        rightElement: !l.isVisible ? (
            <View style={[styles.pickerHiddenBadge, { backgroundColor: colors.surfaceSecondary }]}>
                <Ionicons name="eye-off-outline" size={12} color={colors.textTertiary} />
            </View>
        ) : undefined,
    }));

    const pickerFooter = showNewListInput ? (
        <View style={[styles.pickerNewRow, { borderColor: colors.border }]}>
            <TextInput
                style={[styles.pickerNewInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                placeholder={t('addWord.newListName')}
                placeholderTextColor={colors.textTertiary}
                value={newListName}
                onChangeText={setNewListName}
                onSubmitEditing={handleCreateNewList}
                autoFocus
                returnKeyType="done"
            />
            <Pressable
                onPress={handleCreateNewList}
                disabled={!newListName.trim()}
                style={[styles.pickerNewBtn, { backgroundColor: newListName.trim() ? colors.primaryButton : colors.surfaceSecondary }]}
            >
                <Text style={{ color: newListName.trim() ? colors.onPrimary : colors.textTertiary, fontSize: 14, fontFamily: 'Pretendard_600SemiBold' }}>
                    {t('common.create')}
                </Text>
            </Pressable>
        </View>
    ) : (
        <Pressable
            onPress={() => setShowNewListInput(true)}
            style={[styles.pickerOption, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 0 }]}
        >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={[styles.pickerOptionText, { color: colors.primary }]}>
                {t('addWord.createNewList')}
            </Text>
        </Pressable>
    );


    const currentMode = fieldSettingsOpen ? tempSettings.addWordMode : inputSettings.addWordMode;

    return (
        <View style={[
            styles.container,
            currentMode === 'popup' ? {
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: 'rgba(0,0,0,0.4)'
            } : { backgroundColor: colors.background }
        ]}>
            <Animated.View
                layout={Layout.duration(300)}
                style={[
                    currentMode === 'popup' ? {
                        width: '92%',
                        height: '84%',
                        maxHeight: 700,
                        backgroundColor: colors.background,
                        borderRadius: 24,
                        overflow: 'hidden',
                        shadowColor: colors.shadow,
                        shadowOffset: { width: 0, height: 10 },
                        shadowOpacity: 0.25,
                        shadowRadius: 20,
                        elevation: 10,
                    } : { flex: 1, backgroundColor: colors.background }
                ]}
            >
                <View style={[
                    styles.topBar,
                    {
                        backgroundColor: colors.background,
                        borderBottomColor: colors.borderLight,
                        paddingTop: currentMode === 'full' ? Math.max(insets.top, 4) : 10,
                        paddingBottom: currentMode === 'full' ? 6 : 8
                    }
                ]}>
                    <Pressable onPress={() => router.back()} hitSlop={8}>
                        <Text style={[styles.topBarCancel, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
                    </Pressable>
                    <Text style={[styles.topBarTitle, { color: colors.text }]}>
                        {isEditing ? t('addWord.editWord') : t('addWord.addWordTitle')}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Pressable onPress={() => setFieldSettingsOpen(true)} hitSlop={12} style={{ padding: 6 }}>
                            <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
                        </Pressable>
                    </View>
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {!isEditing && (
                        <Pressable
                            onPress={handleOpenListPicker}
                            style={[styles.listSelector, { backgroundColor: colors.surface, borderColor: selectedListId ? colors.border : colors.error }]}
                        >
                            <Ionicons name="folder-outline" size={18} color={selectedListId ? colors.textSecondary : colors.error} />
                            <Text style={[styles.listSelectorText, { color: selectedListId ? colors.text : colors.textTertiary }]} numberOfLines={1}>
                                {selectedListTitle}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
                        </Pressable>
                    )}



                    {(true) && (
                        <>
                            <View style={styles.fieldsContainer}>
                                {sortedFieldOrder.map((fieldId) => {
                                    if (fieldId === 'term') {
                                        return (
                                            <View key="term" style={styles.wordSection}>
                                                {!isEditing && (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 6 }}>
                                                        <Pressable onPress={handleVoiceInput} hitSlop={10} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: isListening ? colors.primaryButton : colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
                                                            <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={16} color={isListening ? colors.onPrimary : colors.textSecondary} />
                                                        </Pressable>
                                                        <Pressable onPress={() => setPhotoSource('camera')} hitSlop={10} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
                                                            <Ionicons name="camera-outline" size={16} color={colors.textSecondary} />
                                                        </Pressable>
                                                        <Pressable onPress={() => setPhotoSource('gallery')} hitSlop={10} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
                                                            <Ionicons name="images-outline" size={16} color={colors.textSecondary} />
                                                        </Pressable>
                                                        <Pressable onPress={() => setShowExcel(true)} hitSlop={10} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
                                                            <MaterialCommunityIcons name="microsoft-excel" size={16} color={colors.textSecondary} />
                                                        </Pressable>
                                                    </View>
                                                )}
                                                <View style={{ zIndex: showSuggestions ? 1000 : 1 }}>
                                                <View
                                                    style={styles.wordInputWrapper}
                                                    onLayout={(e) => setInputWrapperHeight(e.nativeEvent.layout.height)}
                                                >
                                                    <TextInput
                                                        ref={termInputRef}
                                                        style={[styles.wordInput, { color: colors.text, backgroundColor: colors.surface, borderColor: errors.term ? colors.error : isTermFocused ? colors.primary : colors.border }]}
                                                        onFocus={() => setIsTermFocused(true)}
                                                        onBlur={() => {
                                                            if (!suppressBlurRef.current) setIsTermFocused(false);
                                                        }}
                                                        placeholder={getPlaceholderText(inputSettings.sourceLang, t)}
                                                        placeholderTextColor={colors.textTertiary}
                                                        value={term}
                                                        maxLength={200}
                                                        onChangeText={(text) => {
                                                            setTerm(text);
                                                            if (errors.term) setErrors(e => ({ ...e, term: false }));
                                                            if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
                                                            if (!inputSettings.enableAutocomplete || text.trim().length < 2) {
                                                                setSuggestions([]);
                                                                setShowSuggestions(false);
                                                                return;
                                                            }
                                                            autocompleteTimerRef.current = setTimeout(async () => {
                                                                const dictCode = getNaverDictCode(inputSettings.sourceLang, inputSettings.targetLang);
                                                                let results: string[];
                                                                if (inputSettings.sourceLang === 'en') {
                                                                    results = await fetchDatamuseAutocomplete(text.trim());
                                                                } else if (dictCode) {
                                                                    results = await fetchNaverAutocomplete(text.trim(), inputSettings.sourceLang, inputSettings.targetLang);
                                                                } else {
                                                                    results = [];
                                                                }
                                                                setSuggestions(results);
                                                                setShowSuggestions(results.length > 0);
                                                            }, 300);
                                                        }}
                                                        autoFocus={!isEditing}
                                                        autoCapitalize="none"
                                                        autoCorrect={false}
                                                        returnKeyType="search"
                                                        onSubmitEditing={handleSearch}
                                                        blurOnSubmit={false}
                                                    />
                                                    <View style={styles.searchActions}>
                                                        <Pressable
                                                            onPress={() => {
                                                                if (term.trim()) {
                                                                    Haptics.selectionAsync();
                                                                    speak(term.trim(), inputSettings.sourceLang === 'ko' ? 'ko-KR' : 'en-US');
                                                                }
                                                            }}
                                                            disabled={!term.trim()}
                                                            style={styles.searchIconButton}
                                                        >
                                                            <Ionicons
                                                                name="volume-medium-outline"
                                                                size={22}
                                                                color={term.trim() ? colors.textSecondary : colors.textTertiary}
                                                            />
                                                        </Pressable>
                                                        <Pressable
                                                            onPressIn={() => { suppressBlurRef.current = true; }}
                                                            onPress={handleSearch}
                                                            onPressOut={() => { suppressBlurRef.current = false; }}
                                                            disabled={!term.trim() || isPendingFill}
                                                            style={styles.searchIconButton}
                                                        >
                                                            <Ionicons
                                                                name="search-outline"
                                                                size={22}
                                                                color={!term.trim() ? colors.textTertiary : isPendingFill ? colors.primary + '60' : colors.primary}
                                                            />
                                                        </Pressable>
                                                        <Pressable
                                                            onPress={() => {
                                                                if (!term.trim()) return;
                                                                Haptics.selectionAsync();
                                                                const dictCode = getNaverDictCode(inputSettings.sourceLang, inputSettings.targetLang);
                                                                const subdomain = dictCode ? getNaverDictSubdomain(dictCode) : 'en';
                                                                WebBrowser.openBrowserAsync(
                                                                    `https://${subdomain}.dict.naver.com/#/search?query=${encodeURIComponent(term.trim())}`
                                                                );
                                                            }}
                                                            disabled={!term.trim()}
                                                            style={styles.searchIconButton}
                                                        >
                                                            <Text style={[styles.naverIconText, { color: term.trim() ? colors.brand.naverGreen : colors.textTertiary }]}>N</Text>
                                                        </Pressable>
                                                    </View>
                                                </View>
                                                {showSuggestions && suggestions.length > 0 && (
                                                    <View style={[styles.suggestionDropdown, {
                                                        top: inputWrapperHeight + 2,
                                                        backgroundColor: colors.surface,
                                                        borderColor: colors.border,
                                                        shadowColor: colors.shadow,
                                                    }]}>
                                                        {suggestions.map((s) => (
                                                            <Pressable
                                                                key={s}
                                                                onPress={() => {
                                                                    if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
                                                                    setTerm(s);
                                                                    setSuggestions([]);
                                                                    setShowSuggestions(false);
                                                                    Haptics.selectionAsync();
                                                                    handleAutoFillWithTerm(s);
                                                                }}
                                                                style={({ pressed }) => [styles.suggestionItem, { backgroundColor: pressed ? colors.surfaceSecondary : 'transparent' }]}
                                                            >
                                                                <Ionicons name="search-outline" size={14} color={colors.textTertiary} />
                                                                <Text style={[styles.suggestionText, { color: colors.text }]}>{s}</Text>
                                                            </Pressable>
                                                        ))}
                                                        <Pressable
                                                            onPress={() => {
                                                                updateInputSettings({ enableAutocomplete: false });
                                                                setSuggestions([]);
                                                                setShowSuggestions(false);
                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                            }}
                                                            style={[styles.suggestionDisableBtn, { borderTopColor: colors.borderLight }]}
                                                        >
                                                            <Ionicons name="close-outline" size={14} color={colors.textTertiary} />
                                                            <Text style={[styles.suggestionDisableText, { color: colors.textTertiary }]}>{t('addWord.disableAutocomplete')}</Text>
                                                        </Pressable>
                                                    </View>
                                                )}
                                                </View>
                                                {errors.term && <Text style={[styles.errorText, { color: colors.error }]}>{t('addWord.enterWordError')}</Text>}
                                            </View>
                                        );
                                    }

                                    if (fieldId === 'meaningKr') {
                                        return (
                                            <Input
                                                key="meaningKr"
                                                label={getMeaningLabel(inputSettings.targetLang, t)}
                                                placeholder={getMeaningLabel(inputSettings.targetLang, t)}
                                                value={meaningKr}
                                                maxLength={200}
                                                onChangeText={(v: string) => { setMeaningKr(v); if (errors.meaningKr) setErrors(e => ({ ...e, meaningKr: false })); }}
                                                error={errors.meaningKr ? t('addWord.enterMeaningError') : undefined}
                                            />
                                        );
                                    }

                                    if (fieldId === 'pos' && inputSettings.showPos) {
                                        return (
                                            <Animated.View key="pos" entering={FadeIn} exiting={FadeOut} layout={Layout}>
                                                <Input
                                                    label={t('addWord.pos')}
                                                    placeholder={t('addWord.pos')}
                                                    value={pos}
                                                    onChangeText={setPos}
                                                />
                                            </Animated.View>
                                        );
                                    }

                                    if (fieldId === 'phonetic' && inputSettings.showPhonetic) {
                                        return (
                                            <Animated.View key="phonetic" entering={FadeIn} exiting={FadeOut} layout={Layout}>
                                                <Input
                                                    label={t('addWord.phonetic')}
                                                    placeholder={t('addWord.phonetic')}
                                                    value={phonetic}
                                                    onChangeText={setPhonetic}
                                                />
                                            </Animated.View>
                                        );
                                    }

                                    if (fieldId === 'example' && inputSettings.showExample) {
                                        return (
                                            <Animated.View key="example" entering={FadeIn} exiting={FadeOut} layout={Layout} style={{ gap: 10 }}>
                                                <Input
                                                    label={t('addWord.exampleLabel')}
                                                    placeholder={t('addWord.exampleLabel')}
                                                    value={exampleEn}
                                                    onChangeText={setExampleEn}
                                                    maxLength={300}
                                                    multiline
                                                    style={{ fontStyle: 'italic' }}
                                                />
                                                <Input
                                                    label={getExampleTranslationLabel(inputSettings.targetLang, t)}
                                                    placeholder={getExampleTranslationLabel(inputSettings.targetLang, t)}
                                                    value={exampleKr}
                                                    onChangeText={setExampleKr}
                                                    maxLength={300}
                                                    multiline
                                                />
                                            </Animated.View>
                                        );
                                    }

                                    if (fieldId === 'definition' && inputSettings.showDefinition) {
                                        return (
                                            <Animated.View key="definition" entering={FadeIn} exiting={FadeOut} layout={Layout}>
                                                <Input
                                                    label={getDefinitionLabel(inputSettings.sourceLang, t)}
                                                    placeholder={getDefinitionLabel(inputSettings.sourceLang, t)}
                                                    value={definition}
                                                    onChangeText={setDefinition}
                                                    maxLength={1000}
                                                    multiline
                                                />
                                            </Animated.View>
                                        );
                                    }

                                    if (fieldId === 'tags' && inputSettings.showTags) {
                                        return (
                                            <Animated.View key="tags" entering={FadeIn} exiting={FadeOut} layout={Layout} style={styles.tagsContainer}>
                                                <Text style={[styles.tagsLabel, { color: colors.textSecondary }]}>{t('addWord.tags')}</Text>
                                                <View style={styles.tagInputRow}>
                                                    <TextInput
                                                        style={[styles.tagInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                                                        placeholder={t('addWord.tags')}
                                                        placeholderTextColor={colors.textTertiary}
                                                        value={tagInput}
                                                        onChangeText={setTagInput}
                                                        onSubmitEditing={handleAddTag}
                                                        returnKeyType="done"
                                                        autoCapitalize="none"
                                                    />
                                                    <Pressable
                                                        onPress={handleAddTag}
                                                        disabled={!tagInput.trim()}
                                                        style={[styles.addTagBtn, { backgroundColor: tagInput.trim() ? colors.primaryButton : colors.surfaceSecondary }]}
                                                    >
                                                        <Ionicons name="add" size={20} color={tagInput.trim() ? colors.onPrimary : colors.textTertiary} />
                                                    </Pressable>
                                                </View>

                                                {tags.length > 0 && (
                                                    <View style={styles.tagsFlexBox}>
                                                        {tags.map((t, idx) => (
                                                            <View key={`${t}-${idx}`} style={[styles.tagChip, { backgroundColor: colors.surfaceSecondary }]}>
                                                                <Text style={[styles.tagChipText, { color: colors.text }]}>#{t}</Text>
                                                                <Pressable onPress={() => handleRemoveTag(t)} hitSlop={6} style={styles.tagChipClose}>
                                                                    <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                                                                </Pressable>
                                                            </View>
                                                        ))}
                                                    </View>
                                                )}
                                            </Animated.View>
                                        );
                                    }

                                    return null;
                                })}
                            </View>
                        </>
                    )}

                </ScrollView>

                {
                    (true) && (
                        <Animated.View style={[
                            styles.fabContainer,
                            animatedFabStyle,
                            { bottom: currentMode === 'popup' ? 20 : Math.max(insets.bottom, 20) + 20 }
                        ]}>
                            <Pressable
                                onPress={onSave}
                                disabled={isPendingSave}
                                style={({ pressed }) => [
                                    styles.fabButton,
                                    {
                                        backgroundColor: colors.primaryButton,
                                        opacity: isPendingSave || pressed ? 0.8 : 1,
                                        shadowColor: colors.primaryButton,
                                    }
                                ]}
                            >
                                {isPendingSave ? (
                                    <ActivityIndicator color={colors.onPrimary} size="small" />
                                ) : (
                                    <>
                                        <Ionicons name="checkmark" size={20} color={colors.onPrimary} />
                                        <Text style={[styles.fabText, { color: colors.onPrimary }]}>{t('common.save')}</Text>
                                    </>
                                )}
                            </Pressable>
                        </Animated.View>
                    )
                }
            </Animated.View>

            <Snackbar
                visible={toastVisible}
                message={toastMessage}
                onDismiss={() => setToastVisible(false)}
                position="bottom"
                bottomOffset={120}
                duration={2000}
            />


            <Modal
                visible={fieldSettingsOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setFieldSettingsOpen(false)}
            >
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setFieldSettingsOpen(false)}>
                        <GestureDetector gesture={modalGesture}>
                            <Animated.View
                                style={[styles.modalContainer, { backgroundColor: colors.surface, shadowColor: colors.shadow }, modalAnimatedStyle]}
                            >
                                <View style={{ alignItems: 'center', marginBottom: 8, marginTop: -12, paddingVertical: 6 }}>
                                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, opacity: 0.5 }} />
                                </View>

                                <View style={styles.modalHeader}>
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>{t('addWord.fieldSettings')}</Text>
                                    <Pressable onPress={() => setFieldSettingsOpen(false)} hitSlop={12} style={{ backgroundColor: colors.surfaceSecondary, padding: 6, borderRadius: 20 }}>
                                        <Ionicons name="close" size={20} color={colors.textSecondary} />
                                    </Pressable>
                                </View>

                                <Pressable
                                    onPress={() => setTempSettings(s => ({ ...s, addWordMode: s.addWordMode === 'full' ? 'popup' : 'full' }))}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 8,
                                        padding: 10,
                                        borderRadius: 12,
                                        backgroundColor: colors.primary + '08',
                                        borderWidth: 1,
                                        borderColor: colors.primary + '20'
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Ionicons name="expand-outline" size={18} color={colors.primary} />
                                        <Text style={[styles.settingsSectionTitle, { marginBottom: 0, color: colors.primary, fontSize: 13 }]}>{t('addWord.fullscreenMode')}</Text>
                                    </View>
                                    <View
                                        style={{
                                            width: 40,
                                            height: 22,
                                            borderRadius: 11,
                                            backgroundColor: tempSettings.addWordMode === 'full' ? colors.primaryButton : colors.border,
                                            padding: 2,
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <View style={{
                                            width: 18,
                                            height: 18,
                                            borderRadius: 9,
                                            backgroundColor: colors.onPrimary,
                                            transform: [{ translateX: tempSettings.addWordMode === 'full' ? 18 : 0 }]
                                        }} />
                                    </View>
                                </Pressable>

                                {/* 자동 완성 토글 */}
                                <Pressable
                                    onPress={() => setTempSettings(s => ({ ...s, enableAutocomplete: !s.enableAutocomplete }))}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 8,
                                        padding: 10,
                                        borderRadius: 12,
                                        backgroundColor: colors.primary + '08',
                                        borderWidth: 1,
                                        borderColor: colors.primary + '20'
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
                                        <Text style={[styles.settingsSectionTitle, { marginBottom: 0, color: colors.primary, fontSize: 13 }]}>{t('addWord.autocomplete')}</Text>
                                    </View>
                                    <View
                                        style={{
                                            width: 40,
                                            height: 22,
                                            borderRadius: 11,
                                            backgroundColor: tempSettings.enableAutocomplete ? colors.primaryButton : colors.border,
                                            padding: 2,
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <View style={{
                                            width: 18,
                                            height: 18,
                                            borderRadius: 9,
                                            backgroundColor: colors.onPrimary,
                                            transform: [{ translateX: tempSettings.enableAutocomplete ? 18 : 0 }]
                                        }} />
                                    </View>
                                </Pressable>

                                {/* 입력 언어 (출발어) */}
                                <Pressable
                                    onPress={() => setSourceLangPickerOpen(true)}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 8,
                                        padding: 10,
                                        borderRadius: 12,
                                        backgroundColor: colors.primary + '08',
                                        borderWidth: 1,
                                        borderColor: colors.primary + '20'
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={{ fontSize: 16 }}>🔤</Text>
                                        <Text style={{ fontFamily: 'Pretendard_600SemiBold', color: colors.primary, fontSize: 13 }}>{t('addWord.inputLanguage')}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <Text style={{ fontSize: 14 }}>{getLanguageFlag(tempSettings.sourceLang)}</Text>
                                        <Text style={{ fontFamily: 'Pretendard_500Medium', color: colors.text, fontSize: 13 }}>{getLanguageLabel(tempSettings.sourceLang, t)}</Text>
                                        <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                                    </View>
                                </Pressable>

                                {/* 뜻 언어 (도착어) */}
                                <Pressable
                                    onPress={() => setTargetLangPickerOpen(true)}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 12,
                                        padding: 10,
                                        borderRadius: 12,
                                        backgroundColor: colors.primary + '08',
                                        borderWidth: 1,
                                        borderColor: colors.primary + '20'
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={{ fontSize: 16 }}>🎯</Text>
                                        <Text style={{ fontFamily: 'Pretendard_600SemiBold', color: colors.primary, fontSize: 13 }}>{t('addWord.meaningLanguage')}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <Text style={{ fontSize: 14 }}>{getLanguageFlag(tempSettings.targetLang)}</Text>
                                        <Text style={{ fontFamily: 'Pretendard_500Medium', color: colors.text, fontSize: 13 }}>{getLanguageLabel(tempSettings.targetLang, t)}</Text>
                                        <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                                    </View>
                                </Pressable>

                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 4 }}>
                                    <Text style={{ fontSize: 12, fontFamily: 'Pretendard_600SemiBold', color: colors.textTertiary, letterSpacing: 0.5 }}>{t('addWord.fieldName')}</Text>
                                    <Text style={{ fontSize: 12, fontFamily: 'Pretendard_600SemiBold', color: colors.textTertiary, letterSpacing: 0.5 }}>{t('addWord.display')}</Text>
                                </View>

                                <View style={{ maxHeight: 380, paddingBottom: 12 }}>
                                    <DraggableFieldList
                                        settings={tempSettings}
                                        onUpdate={setTempSettings}
                                        colors={colors}
                                        t={t}
                                    />
                                </View>

                                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                                    <Pressable
                                        onPress={handleCancelSettings}
                                        style={[styles.modalActionBtn, { backgroundColor: colors.surfaceSecondary, flex: 1, height: 48 }]}
                                    >
                                        <Text style={[styles.modalActionBtnText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={handleApplySettings}
                                        disabled={isApplying}
                                        style={[
                                            styles.modalActionBtn,
                                            {
                                                backgroundColor: isApplying ? colors.successButton : colors.primaryButton,
                                                flex: 1,
                                                height: 48,
                                                flexDirection: 'row',
                                                gap: 8
                                            }
                                        ]}
                                    >
                                        {isApplying ? (
                                            <>
                                                <Ionicons name="checkmark" size={20} color={colors.onPrimary} />
                                                <Text style={[styles.modalActionBtnText, { color: colors.onPrimary }]}>{t('addWord.applied')}</Text>
                                            </>
                                        ) : (
                                            <>
                                                <Text style={[styles.modalActionBtnText, { color: colors.onPrimary }]}>{t('common.apply')}</Text>
                                                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                                                    <Text style={{ color: colors.onPrimary, fontSize: 12, fontFamily: 'Pretendard_700Bold' }}>{selectedFieldsCount}</Text>
                                                </View>
                                            </>
                                        )}
                                    </Pressable>
                                </View>
                            </Animated.View>
                        </GestureDetector>
                    </Pressable>
                </GestureHandlerRootView>
            </Modal>

            <ModalPicker
                visible={listPickerOpen}
                onClose={() => setListPickerOpen(false)}
                title={t('addWord.selectList')}
                options={pickerOptions}
                selectedValue={selectedListId}
                onSelect={handleSelectList}
                footer={pickerFooter}
            />

            {/* 입력 언어 선택 */}
            <ModalPicker
                visible={sourceLangPickerOpen}
                onClose={() => setSourceLangPickerOpen(false)}
                title={t('addWord.inputLanguageSelect')}
                options={SUPPORTED_LANGUAGES
                    .filter(l => l.code !== tempSettings.targetLang)
                    .map(l => ({ id: l.code, title: `${l.flag} ${getLanguageLabel(l.code, t)}` }))}
                selectedValue={tempSettings.sourceLang}
                onSelect={(code: string) => {
                    setTempSettings(s => ({ ...s, sourceLang: code as LanguageCode }));
                    setSourceLangPickerOpen(false);
                }}
            />

            {/* 뜻 언어 선택 */}
            <ModalPicker
                visible={targetLangPickerOpen}
                onClose={() => setTargetLangPickerOpen(false)}
                title={t('addWord.meaningLanguageSelect')}
                options={SUPPORTED_LANGUAGES
                    .filter(l => l.code !== tempSettings.sourceLang)
                    .map(l => ({ id: l.code, title: `${l.flag} ${getLanguageLabel(l.code, t)}` }))}
                selectedValue={tempSettings.targetLang}
                onSelect={(code: string) => {
                    setTempSettings(s => ({ ...s, targetLang: code as LanguageCode }));
                    setTargetLangPickerOpen(false);
                }}
            />

            {/* 사진 스캔 모달 */}
            <Modal
                visible={photoSource !== null}
                animationType="slide"
                onRequestClose={() => setPhotoSource(null)}
            >
                {photoSource !== null && (
                    <PhotoImportWorkflow
                        listId={selectedListId}
                        source={photoSource}
                        onClose={() => setPhotoSource(null)}
                        onSaveWords={handlePhotoSaveWords}
                    />
                )}
            </Modal>

            {/* 엑셀 일괄 추가 모달 */}
            <Modal
                visible={showExcel}
                animationType="slide"
                onRequestClose={() => setShowExcel(false)}
            >
                <BatchImportWorkflow
                    listId={selectedListId}
                    onClose={() => setShowExcel(false)}
                    onSaved={(count) => {
                        setToastMessage(t('addWord.batchSaveComplete', { count }));
                        setToastVisible(true);
                        setTimeout(() => setToastVisible(false), 2000);
                    }}
                />
            </Modal>
        </View >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
    topBarCancel: { fontSize: 16, fontFamily: 'Pretendard_400Regular' },
    topBarTitle: { fontSize: 17, fontFamily: 'Pretendard_600SemiBold' },
    topBarSave: { fontSize: 16, fontFamily: 'Pretendard_700Bold' },
    inputModeTabBar: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 20 },
    inputModeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, gap: 6 },
    inputModeTabActive: { shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    inputModeTabText: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },
    placeholderContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 10, gap: 16 },
    placeholderIconContainer: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    placeholderTitle: { fontSize: 18, fontFamily: 'Pretendard_700Bold', textAlign: 'center' },
    placeholderDesc: { fontSize: 14, fontFamily: 'Pretendard_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 10 },
    scrollContent: { padding: 20, paddingBottom: 40 },
    listSelector: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, gap: 8 },
    listSelectorText: { flex: 1, fontSize: 15, fontFamily: 'Pretendard_500Medium' },
    wordSection: { marginBottom: 8 },
    wordInputWrapper: { position: 'relative', flexDirection: 'row', alignItems: 'center' },
    wordInput: { flex: 1, fontSize: 16, fontFamily: 'Pretendard_600SemiBold', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, paddingRight: 124 },
    searchActions: { position: 'absolute', right: 4, flexDirection: 'row', alignItems: 'center' },
    searchIconButton: { padding: 8 },
    naverIconText: { fontSize: 15, fontFamily: 'Pretendard_700Bold', lineHeight: 22 },
    fieldsContainer: { gap: 10, marginTop: 4 },
    errorText: { fontSize: 12, fontFamily: 'Pretendard_400Regular', marginTop: 2 },
    loadingContainer: { alignItems: 'center', paddingVertical: 20, gap: 8 },
    loadingText: { fontSize: 14, fontFamily: 'Pretendard_500Medium' },
    tagsContainer: { marginTop: 0, gap: 6 },
    tagsLabel: { fontSize: 12, fontFamily: 'Pretendard_600SemiBold', letterSpacing: 0.8 },
    tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    tagInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: 'Pretendard_400Regular' },
    addTagBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    tagsFlexBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagChip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingLeft: 10, paddingRight: 6, borderRadius: 12, gap: 4 },
    tagChipText: { fontSize: 13, fontFamily: 'Pretendard_500Medium' },
    tagChipClose: { marginLeft: 2 },
    suggestionDropdown: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 1000,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 8,
    },
    suggestionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 11,
        gap: 10,
    },
    suggestionText: {
        fontSize: 15,
        fontFamily: 'Pretendard_500Medium',
        flex: 1,
    },
    suggestionDisableBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: 4,
    },
    suggestionDisableText: {
        fontSize: 12,
        fontFamily: 'Pretendard_400Regular',
    },
    toastContainer: { position: 'absolute', bottom: 120, left: 0, right: 0, alignItems: 'center', zIndex: 999 },
    toastText: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContainer: {
        width: '94%',
        maxWidth: 400,
        borderRadius: 20,
        padding: 16,
        paddingTop: 10,
        paddingBottom: 16,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    modalTitle: {
        fontSize: 19,
        fontFamily: 'Pretendard_700Bold',
        letterSpacing: -0.5,
    },
    settingsSectionTitle: {
        fontSize: 13,
        fontFamily: 'Pretendard_600SemiBold',
        marginBottom: 12,
        letterSpacing: 0.5,
    },
    segmentedControlContainer: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: 12,
        height: 48,
        position: 'relative',
    },
    segmentedTab: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    segmentedTabText: {
        fontSize: 14,
        fontFamily: 'Pretendard_600SemiBold',
    },
    settingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    settingsRowCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    settingsRowText: {
        fontSize: 14,
        fontFamily: 'Pretendard_500Medium',
    },
    modalCloseBtn: {
        marginTop: 16,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
    },
    modalCloseBtnText: {
        fontSize: 16,
        fontFamily: 'Pretendard_600SemiBold',
    },
    modalActionBtn: {
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalActionBtnText: {
        fontSize: 15,
        fontFamily: 'Pretendard_700Bold',
    },
    pickerHiddenBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
    pickerNewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, gap: 8 },
    pickerNewInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, fontFamily: 'Pretendard_400Regular' },
    pickerNewBtn: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    pickerOptionText: { fontSize: 15, fontFamily: 'Pretendard_500Medium' },
    pickerOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, borderRadius: 12 },
    fabContainer: {
        position: 'absolute',
        right: 20,
        zIndex: 100,
    },
    fabButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24,
        gap: 6,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    fabText: {
        fontSize: 16,
        fontFamily: 'Pretendard_700Bold',
    },
});
