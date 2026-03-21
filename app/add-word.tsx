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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { useAddWord } from '@/hooks/useAddWord';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ModalPicker, PickerOption } from '@/components/ui/ModalPicker';
import BatchImportWorkflow from '@/components/BatchImportWorkflow';
import PhotoImportWorkflow from '@/components/PhotoImportWorkflow';
import { AutoFillResult } from '@/lib/types';
import { autoFillWord } from '@/lib/translation-api';
import { searchNaverDict } from '@/lib/naver-dict-api';
import { useSettings } from '@/contexts/SettingsContext';
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

type InputMode = 'manual' | 'photo' | 'excel';

// 드래그 가능한 필드 항목 컴포넌트
const DraggableFieldItem = ({
    id,
    label,
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
                            <Text style={{ fontSize: 9, color: colors.textTertiary, fontFamily: 'Pretendard_600SemiBold' }}>필수</Text>
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

const DraggableFieldList = ({ settings, onUpdate, colors }: { settings: any, onUpdate: (s: any) => void, colors: any }) => {
    // 모든 필드를 포함하되, term과 meaningKr은 isFixed 처리
    const labels: Record<string, string> = {
        term: '단어 입력',
        meaningKr: '한국어 뜻',
        pos: '품사',
        phonetic: '발음기호',
        definition: '영문 정의',
        example: '예문 및 해석',
        tags: '태그',
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
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { lists, getWordsForList, createList, addWord } = useVocab();
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
        startAutoFill,
        handleSaveWord,
        isPendingFill,
        isPendingSave,
    } = useAddWord(listId, wordId, existingWord, draftState);

    const { inputSettings, updateInputSettings } = useSettings();
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
            transform: [
                { translateY: -keyboard.height.value }
            ],
            opacity: keyboard.height.value > 0 ? 1 : 0.9,
        };
    });

    const [inputMode, setInputMode] = useState<'manual' | 'photo' | 'excel'>('manual');
    const [enginePickerOpen, setEnginePickerOpen] = useState(false);
    const [selectedListId, setSelectedListId] = useState(listId || (lists.length > 0 ? lists[0].id : ''));
    const [listPickerOpen, setListPickerOpen] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [showNewListInput, setShowNewListInput] = useState(false);
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [tagInput, setTagInput] = useState('');
    const [isApplying, setIsApplying] = useState(false);

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
        if (!isEditing && inputMode === 'manual' && !fieldSettingsOpen) {
            const timer = setTimeout(() => {
                termInputRef.current?.focus();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [inputMode, fieldSettingsOpen, isEditing]);

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
            if (!isEditing && inputMode !== 'manual') {
                e.preventDefault();
                setInputMode('manual');
            }
        });
        return unsubscribe;
    }, [navigation, inputMode, isEditing]);

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
    const handleSearch = handleAutoFill;

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
                    setToastMessage(`"${savedTerm}" 추가 완료!`);
                    setToastVisible(true);
                    setTimeout(() => setToastVisible(false), 1200);

                    // 저장 후 단어 입력창에 다시 포커스 (약간의 지연 필요)
                    setTimeout(() => {
                        termInputRef.current?.focus();
                    }, 100);
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
                Alert.alert('중복된 이름', `"${trimmed}" 단어장이 이미 있습니다. 다른 이름을 사용해 주세요.`);
            }
        }
    };

    const selectedListTitle = lists.find(l => l.id === selectedListId)?.title || '단어장 고르기';

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
                placeholder="새 단어장 이름"
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
                style={[styles.pickerNewBtn, { backgroundColor: newListName.trim() ? colors.primary : colors.surfaceSecondary }]}
            >
                <Text style={{ color: newListName.trim() ? '#FFFFFF' : colors.textTertiary, fontSize: 14, fontFamily: 'Pretendard_600SemiBold' }}>
                    만들기
                </Text>
            </Pressable>
        </View>
    ) : (
        <Pressable
            onPress={() => setShowNewListInput(true)}
            style={[styles.pickerOption, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
        >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={[styles.pickerOptionText, { color: colors.primary }]}>
                + 새 단어장 만들기
            </Text>
        </Pressable>
    );

    // If excel mode is selected, we replace the screen content with BatchImportWorkflow
    if (!isEditing && inputMode === 'excel') {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background }}>
                {!selectedListId ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                        <Ionicons name="warning-outline" size={48} color={colors.warning} style={{ marginBottom: 16 }} />
                        <Text style={{ fontSize: 16, color: colors.text, fontFamily: 'Pretendard_500Medium', textAlign: 'center' }}>
                            먼저 단어장을 선택해주세요.
                        </Text>
                        <Button
                            title="단어장 선택하기"
                            onPress={() => setInputMode('manual')}
                            style={{ marginTop: 20 }}
                        />
                    </View>
                ) : (
                    <BatchImportWorkflow
                        listId={selectedListId}
                        onClose={() => setInputMode('manual')}
                    />
                )}
            </View>
        );
    }

    // If photo mode is selected, replace screen content with PhotoImportWorkflow
    if (!isEditing && inputMode === 'photo') {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background }}>
                {!selectedListId ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                        <Ionicons name="warning-outline" size={48} color={colors.warning} style={{ marginBottom: 16 }} />
                        <Text style={{ fontSize: 16, color: colors.text, fontFamily: 'Pretendard_500Medium', textAlign: 'center' }}>
                            먼저 단어장을 선택해주세요.
                        </Text>
                        <Button
                            title="단어장 선택하기"
                            onPress={() => setInputMode('manual')}
                            style={{ marginTop: 20 }}
                        />
                    </View>
                ) : (
                    <PhotoImportWorkflow
                        listId={selectedListId}
                        onClose={() => setInputMode('manual')}
                        onSaveWords={async (words) => {
                            let addedCount = 0;
                            for (const w of words) {
                                if (w.word.trim()) {
                                    await addWord(selectedListId, {
                                        term: w.word.trim(),
                                        definition: w.definition || '', // Note: API prompt returned 'meaning' mostly, but type ScannedWord currently uses meaning. I'll map meaning to meaningKr and definition.
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
                                setToastMessage(`${addedCount}개 추출 단어 저장 완료!`);
                                setToastVisible(true);
                                setTimeout(() => setToastVisible(false), 2000);
                            }
                        }}
                    />
                )}
            </View>
        );
    }

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
                        shadowColor: '#000',
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
                        borderBottomColor: colors.borderLight,
                        paddingTop: currentMode === 'full' ? Math.max(insets.top, 4) : 16,
                        paddingBottom: currentMode === 'full' ? 6 : 12
                    }
                ]}>
                    <Pressable onPress={() => router.back()} hitSlop={8}>
                        <Text style={[styles.topBarCancel, { color: colors.textSecondary }]}>취소</Text>
                    </Pressable>
                    <Text style={[styles.topBarTitle, { color: colors.text }]}>
                        {isEditing ? '단어 편집' : '단어 추가'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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



                    {(isEditing || inputMode === 'manual') && (
                        <>
                            <View style={styles.fieldsContainer}>
                                {sortedFieldOrder.map((fieldId) => {
                                    if (fieldId === 'term') {
                                        return (
                                            <View key="term" style={styles.wordSection}>
                                                <View style={styles.wordInputWrapper}>
                                                    <TextInput
                                                        ref={termInputRef}
                                                        style={[styles.wordInput, { color: colors.text, borderColor: errors.term ? colors.error : colors.border }]}
                                                        placeholder="단어 입력"
                                                        placeholderTextColor={colors.textTertiary}
                                                        value={term}
                                                        onChangeText={(t) => {
                                                            setTerm(t);
                                                            if (errors.term) setErrors(e => ({ ...e, term: false }));
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
                                                            onPress={handleSearch}
                                                            disabled={!term.trim() || isPendingFill}
                                                            style={styles.searchIconButton}
                                                        >
                                                            {isPendingFill ? (
                                                                <ActivityIndicator size="small" color={colors.primary} />
                                                            ) : (
                                                                <Ionicons
                                                                    name="search-outline"
                                                                    size={22}
                                                                    color={term.trim() ? colors.primary : colors.textTertiary}
                                                                />
                                                            )}
                                                        </Pressable>
                                                        <Pressable
                                                            onPress={() => setEnginePickerOpen(true)}
                                                            style={styles.moreIconButton}
                                                        >
                                                            <Ionicons
                                                                name="ellipsis-horizontal"
                                                                size={20}
                                                                color={colors.textTertiary}
                                                            />
                                                        </Pressable>
                                                    </View>
                                                </View>
                                                {errors.term && <Text style={[styles.errorText, { color: colors.error }]}>단어를 입력해주세요</Text>}
                                            </View>
                                        );
                                    }

                                    if (fieldId === 'meaningKr') {
                                        return (
                                            <Input
                                                key="meaningKr"
                                                label="한국어 뜻"
                                                placeholder="한국어 뜻 입력"
                                                value={meaningKr}
                                                onChangeText={(t: string) => { setMeaningKr(t); if (errors.meaningKr) setErrors(e => ({ ...e, meaningKr: false })); }}
                                                error={errors.meaningKr ? "뜻을 입력해주세요" : undefined}
                                            />
                                        );
                                    }

                                    if (fieldId === 'pos' && inputSettings.showPos) {
                                        return (
                                            <Animated.View key="pos" entering={FadeIn} exiting={FadeOut} layout={Layout}>
                                                <Input
                                                    label="품사"
                                                    placeholder="품사 입력 (예: noun, v)"
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
                                                    label="발음기호"
                                                    placeholder="발음기호 입력"
                                                    value={phonetic}
                                                    onChangeText={setPhonetic}
                                                />
                                            </Animated.View>
                                        );
                                    }

                                    if (fieldId === 'example' && inputSettings.showExample) {
                                        return (
                                            <Animated.View key="example" entering={FadeIn} exiting={FadeOut} layout={Layout} style={{ gap: 16 }}>
                                                <Input
                                                    label="예문"
                                                    placeholder="예문 입력"
                                                    value={exampleEn}
                                                    onChangeText={setExampleEn}
                                                    multiline
                                                    style={{ fontStyle: 'italic' }}
                                                />
                                                <Input
                                                    label="예문 해석"
                                                    placeholder="한국어 예문 해석"
                                                    value={exampleKr}
                                                    onChangeText={setExampleKr}
                                                    multiline
                                                />
                                            </Animated.View>
                                        );
                                    }

                                    if (fieldId === 'definition' && inputSettings.showDefinition) {
                                        return (
                                            <Animated.View key="definition" entering={FadeIn} exiting={FadeOut} layout={Layout}>
                                                <Input
                                                    label="영문 정의"
                                                    placeholder="영문 정의 입력"
                                                    value={definition}
                                                    onChangeText={setDefinition}
                                                    multiline
                                                />
                                            </Animated.View>
                                        );
                                    }

                                    if (fieldId === 'tags' && inputSettings.showTags) {
                                        return (
                                            <Animated.View key="tags" entering={FadeIn} exiting={FadeOut} layout={Layout} style={styles.tagsContainer}>
                                                <Text style={[styles.tagsLabel, { color: colors.textSecondary }]}>태그</Text>
                                                <View style={styles.tagInputRow}>
                                                    <TextInput
                                                        style={[styles.tagInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                                                        placeholder="태그 입력 (쉼표/공백 구분)"
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
                                                        style={[styles.addTagBtn, { backgroundColor: tagInput.trim() ? colors.primary : colors.surfaceSecondary }]}
                                                    >
                                                        <Ionicons name="add" size={20} color={tagInput.trim() ? '#fff' : colors.textTertiary} />
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
                    (isEditing || inputMode === 'manual') && (
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
                                        backgroundColor: colors.primary,
                                        opacity: isPendingSave || pressed ? 0.8 : 1,
                                        shadowColor: colors.primary,
                                    }
                                ]}
                            >
                                {isPendingSave ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <>
                                        <Ionicons name="checkmark" size={20} color="#fff" />
                                        <Text style={styles.fabText}>저장</Text>
                                    </>
                                )}
                            </Pressable>
                        </Animated.View>
                    )
                }
            </Animated.View>

            {
                toastVisible && (
                    <View style={styles.toastContainer} pointerEvents="none">
                        <View style={[styles.toast, { backgroundColor: colors.text }]}>
                            <Ionicons name="checkmark-circle" size={20} color={colors.background} />
                            <Text style={[styles.toastText, { color: colors.background }]}>{toastMessage}</Text>
                        </View>
                    </View>
                )
            }

            <ModalPicker
                visible={enginePickerOpen}
                onClose={() => setEnginePickerOpen(false)}
                title="입력 방식 선택"
                options={[
                    { id: 'photo', title: '사진 스캔' },
                    { id: 'excel', title: '엑셀 업로드' },
                ]}
                selectedValue={undefined}
                onSelect={(id: string) => {
                    setEnginePickerOpen(false);
                    if (id === 'photo') setInputMode('photo');
                    if (id === 'excel') setInputMode('excel');
                }}
            />

            <Modal
                visible={fieldSettingsOpen}
                transparent
                animationType="slide"
                onRequestClose={() => setFieldSettingsOpen(false)}
            >
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <Pressable style={styles.modalOverlay} onPress={() => setFieldSettingsOpen(false)}>
                        <GestureDetector gesture={modalGesture}>
                            <Animated.View
                                entering={FadeIn.duration(200)}
                                style={[styles.modalContainer, { backgroundColor: colors.surface }, modalAnimatedStyle]}
                            >
                                <View style={{ alignItems: 'center', marginBottom: 8, marginTop: -12, paddingVertical: 6 }}>
                                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, opacity: 0.5 }} />
                                </View>

                                <View style={styles.modalHeader}>
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>입력 항목 설정</Text>
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
                                        <Text style={[styles.settingsSectionTitle, { marginBottom: 0, color: colors.primary, fontSize: 13 }]}>전체 화면 모드</Text>
                                    </View>
                                    <View
                                        style={{
                                            width: 40,
                                            height: 22,
                                            borderRadius: 11,
                                            backgroundColor: tempSettings.addWordMode === 'full' ? colors.primary : colors.border,
                                            padding: 2,
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <View style={{
                                            width: 18,
                                            height: 18,
                                            borderRadius: 9,
                                            backgroundColor: '#fff',
                                            transform: [{ translateX: tempSettings.addWordMode === 'full' ? 18 : 0 }]
                                        }} />
                                    </View>
                                </Pressable>

                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 4 }}>
                                    <Text style={{ fontSize: 12, fontFamily: 'Pretendard_600SemiBold', color: colors.textTertiary, letterSpacing: 0.5 }}>항목명</Text>
                                    <Text style={{ fontSize: 12, fontFamily: 'Pretendard_600SemiBold', color: colors.textTertiary, letterSpacing: 0.5 }}>표시</Text>
                                </View>

                                <View style={{ maxHeight: 380, paddingBottom: 12 }}>
                                    <DraggableFieldList
                                        settings={tempSettings}
                                        onUpdate={setTempSettings}
                                        colors={colors}
                                    />
                                </View>

                                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                                    <Pressable
                                        onPress={handleCancelSettings}
                                        style={[styles.modalActionBtn, { backgroundColor: colors.surfaceSecondary, flex: 1, height: 48 }]}
                                    >
                                        <Text style={[styles.modalActionBtnText, { color: colors.textSecondary }]}>취소</Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={handleApplySettings}
                                        disabled={isApplying}
                                        style={[
                                            styles.modalActionBtn,
                                            {
                                                backgroundColor: isApplying ? colors.success : colors.primary,
                                                flex: 1,
                                                height: 48,
                                                flexDirection: 'row',
                                                gap: 8
                                            }
                                        ]}
                                    >
                                        {isApplying ? (
                                            <>
                                                <Ionicons name="checkmark" size={20} color="#fff" />
                                                <Text style={[styles.modalActionBtnText, { color: '#ffffff' }]}>적용됨</Text>
                                            </>
                                        ) : (
                                            <>
                                                <Text style={[styles.modalActionBtnText, { color: '#ffffff' }]}>적용</Text>
                                                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                                                    <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Pretendard_700Bold' }}>{selectedFieldsCount}</Text>
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
                title="단어장 고르기"
                options={pickerOptions}
                selectedValue={selectedListId}
                onSelect={handleSelectList}
                footer={pickerFooter}
            />
        </View >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, backgroundColor: '#F2F4F6' },
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
    listSelector: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20, gap: 8 },
    listSelectorText: { flex: 1, fontSize: 15, fontFamily: 'Pretendard_500Medium' },
    wordSection: { marginBottom: 16 },
    wordInputWrapper: { position: 'relative', flexDirection: 'row', alignItems: 'center' },
    wordInput: { flex: 1, fontSize: 16, fontFamily: 'Pretendard_600SemiBold', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, paddingRight: 100 },
    searchActions: { position: 'absolute', right: 4, flexDirection: 'row', alignItems: 'center' },
    searchIconButton: { padding: 8, marginRight: -4 },
    moreIconButton: { padding: 8, paddingRight: 10 },
    fieldsContainer: { gap: 16, marginTop: 8 },
    errorText: { fontSize: 12, fontFamily: 'Pretendard_400Regular', marginTop: 2 },
    loadingContainer: { alignItems: 'center', paddingVertical: 20, gap: 8 },
    loadingText: { fontSize: 14, fontFamily: 'Pretendard_500Medium' },
    tagsContainer: { marginTop: 0, gap: 6 },
    tagsLabel: { fontSize: 12, fontFamily: 'Pretendard_600SemiBold', color: '#8E949A', letterSpacing: 0.8 },
    tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    tagInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: 'Pretendard_400Regular' },
    addTagBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    tagsFlexBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagChip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingLeft: 10, paddingRight: 6, borderRadius: 12, gap: 4 },
    tagChipText: { fontSize: 13, fontFamily: 'Pretendard_500Medium' },
    tagChipClose: { marginLeft: 2 },
    toastContainer: { position: 'absolute', bottom: 120, left: 0, right: 0, alignItems: 'center', zIndex: 999 },
    toast: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
    toastText: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContainer: {
        width: '94%',
        maxWidth: 400,
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 16,
        paddingTop: 10,
        paddingBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 24,
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
    segmentedControlIndicator: {
        position: 'absolute',
        top: 4,
        bottom: 4,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
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
    pickerNewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
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
        color: '#fff',
        fontSize: 16,
        fontFamily: 'Pretendard_700Bold',
    },
});
