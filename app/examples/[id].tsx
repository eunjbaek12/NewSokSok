import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, Modal, Switch, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { speak } from '@/lib/tts';
import { Word, StudyResult } from '@/lib/types';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function HighlightedSentence({ sentence, term, primaryColor, textColor }: { sentence: string; term: string; primaryColor: string; textColor: string }) {
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = sentence.split(regex);

  return (
    <Text style={[styles.exampleText, { color: textColor }]}>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <Text key={i} style={[styles.highlightedWord, { color: primaryColor }]}>_____</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

export default function ExamplesScreen() {
  const { id, filter, isStarred: initialIsStarred } = useLocalSearchParams<{ id: string; filter?: string; isStarred?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { getWordsForList, setStudyResults, toggleStarred, setWordsMemorized } = useVocab();

  // Settings State
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settings, setSettings] = useState({
    filter: (filter || 'all') as 'all' | 'learning' | 'memorized',
    isStarred: initialIsStarred === 'true',
    showTerm: true,
    showMeaning: true,
    showExampleKr: true,
    autoPlaySound: true,
    shuffle: false,
  });

  const [studyWords, setStudyWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const startTime = useRef(Date.now());
  const results = useRef<StudyResult[]>([]);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  // Sync initial search params with settings
  useEffect(() => {
    if (filter && filter !== settings.filter) {
      setSettings(s => ({ ...s, filter: filter as any }));
    }
    if (initialIsStarred !== undefined) {
      const isStarredBool = initialIsStarred === 'true';
      if (isStarredBool !== settings.isStarred) {
        setSettings(s => ({ ...s, isStarred: isStarredBool }));
      }
    }
  }, [filter, initialIsStarred]);

  // Initialize and filter words
  useEffect(() => {
    let all = getWordsForList(id!);

    if (settings.isStarred) {
      all = all.filter(w => w.isStarred);
    }

    if (settings.filter === 'learning') {
      all = all.filter(w => !w.isMemorized);
    } else if (settings.filter === 'memorized') {
      all = all.filter(w => w.isMemorized);
    }

    if (settings.shuffle) {
      all = [...all].sort(() => Math.random() - 0.5);
    }

    setStudyWords(all);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setIsCorrect(null);
    results.current = [];
  }, [id, getWordsForList, settings.filter, settings.isStarred, settings.shuffle]);

  const currentWord = studyWords[currentIndex];

  const handleToggleStar = useCallback(async (wordId: string) => {
    setStudyWords(prev => prev.map(w => w.id === wordId ? { ...w, isStarred: !w.isStarred } : w));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await toggleStarred(id!, wordId);
  }, [id, toggleStarred]);

  const choices = useMemo(() => {
    if (!currentWord) return [];
    const distractors = shuffleArray(getWordsForList(id!).filter(w => w.id !== currentWord.id)).slice(0, 3);
    return shuffleArray([currentWord, ...distractors]);
  }, [currentIndex, currentWord, id, getWordsForList]);

  const handleAnswer = useCallback(async (word: Word) => {
    if (selectedAnswer !== null) return;
    const correct = word.id === currentWord.id;
    setSelectedAnswer(word.id);
    setIsCorrect(correct);

    if (correct) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    results.current.push({ word: currentWord, gotIt: correct });
  }, [selectedAnswer, currentWord]);

  useEffect(() => {
    if (selectedAnswer === null) return;
    const timer = setTimeout(async () => {
      if (currentIndex >= studyWords.length - 1) {
        const finalResults = results.current;
        const memorizedWords = finalResults
          .filter(r => r.gotIt && !r.word.isMemorized)
          .map(r => r.word.id);

        const failedWords = finalResults
          .filter(r => !r.gotIt && r.word.isMemorized)
          .map(r => r.word.id);

        if (memorizedWords.length > 0) {
          await setWordsMemorized(id!, memorizedWords, true);
        }
        if (failedWords.length > 0) {
          await setWordsMemorized(id!, failedWords, false);
        }
        setStudyResults(finalResults);
        router.replace({
          pathname: '/study-results',
          params: {
            id,
            mode: 'examples',
            duration: Date.now() - startTime.current,
            isStarred: settings.isStarred ? 'true' : 'false',
            sessionFilter: settings.filter
          }
        });
        return;
      }
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setIsCorrect(null);
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedAnswer, currentIndex, studyWords.length, setStudyResults, setWordsMemorized, id]);

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handleSpeak = useCallback(() => {
    if (currentWord?.exampleEn) {
      speak(currentWord.exampleEn);
    }
  }, [currentWord]);

  if (studyWords.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} style={{ marginBottom: 16 }} />
        <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'Pretendard_600SemiBold', textAlign: 'center', marginBottom: 8 }}>학습할 예문이 없습니다</Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 24, paddingHorizontal: 40 }}>선택한 조건에 맞는 단어가 없습니다. 설정을 확인해 주세요.</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            onPress={() => setSettingsVisible(true)}
            style={{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 }}
          >
            <Text style={{ color: '#FFF', fontFamily: 'Pretendard_600SemiBold' }}>설정 변경</Text>
          </Pressable>
          <Pressable
            onPress={handleClose}
            style={{ backgroundColor: colors.surfaceSecondary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 }}
          >
            <Text style={{ color: colors.text, fontFamily: 'Pretendard_600SemiBold' }}>뒤로 가기</Text>
          </Pressable>
        </View>
        {renderSettingsModal()}
      </View>
    );
  }

  function renderSettingsModal() {
    return (
      <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={() => setSettingsVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSettingsVisible(false)}>
          <Pressable style={[styles.settingsSheet, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
            <View style={styles.settingsHeader}>
              <Text style={[styles.settingsTitle, { color: colors.text }]}>예문 학습 설정</Text>
              <Pressable onPress={() => setSettingsVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.settingSection}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>출제 대상</Text>
                <View style={styles.filterGroup}>
                  {(['all', 'learning', 'memorized'] as const).map(f => (
                    <Pressable
                      key={f}
                      onPress={() => setSettings(s => ({ ...s, filter: f }))}
                      style={[
                        styles.filterTab,
                        {
                          backgroundColor: settings.filter === f ? colors.primary : colors.surfaceSecondary,
                          borderColor: settings.filter === f ? colors.primary : colors.borderLight
                        }
                      ]}
                    >
                      <Text style={[styles.filterTabText, { color: settings.filter === f ? '#FFF' : colors.textSecondary }]}>
                        {f === 'all' ? '전체' : f === 'learning' ? '미암기' : '암기'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>즐겨찾기(⭐)만 보기</Text>
                  <Switch
                    value={settings.isStarred}
                    onValueChange={v => setSettings(s => ({ ...s, isStarred: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

              <View style={styles.settingSection}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>학습 옵션</Text>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>문장 섞기 (Shuffle)</Text>
                  <Switch
                    value={settings.shuffle}
                    onValueChange={v => setSettings(s => ({ ...s, shuffle: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>자동 음성 재생</Text>
                  <Switch
                    value={settings.autoPlaySound}
                    onValueChange={v => setSettings(s => ({ ...s, autoPlaySound: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

              <View style={styles.settingSection}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>표시 설정</Text>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>영단어 표시</Text>
                  <Switch
                    value={settings.showTerm}
                    onValueChange={v => setSettings(s => ({ ...s, showTerm: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>한글 뜻 표시</Text>
                  <Switch
                    value={settings.showMeaning}
                    onValueChange={v => setSettings(s => ({ ...s, showMeaning: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>예문 해석 표시</Text>
                  <Switch
                    value={settings.showExampleKr}
                    onValueChange={v => setSettings(s => ({ ...s, showExampleKr: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: topInset + 12 }]}>
        <View style={styles.progressArea}>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {currentIndex + 1} / {studyWords.length}
          </Text>
          <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceSecondary }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: colors.primary,
                  width: `${((currentIndex + 1) / studyWords.length) * 100}%`,
                },
              ]}
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Pressable onPress={() => setSettingsVisible(true)} hitSlop={12}>
            <Ionicons name="settings-outline" size={26} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.contentArea}>
        <View style={[styles.exampleCard, { backgroundColor: colors.surface, shadowColor: colors.cardShadow }]}>
          <Pressable onPress={() => handleToggleStar(currentWord.id)} hitSlop={12} style={styles.starBtn}>
            <Ionicons name={currentWord.isStarred ? 'star' : 'star-outline'} size={20} color={currentWord.isStarred ? '#FFD700' : colors.textTertiary} />
          </Pressable>
          {currentWord.exampleEn ? (
            <View style={{ gap: 12, alignItems: 'center' }}>
              <HighlightedSentence
                sentence={currentWord.exampleEn}
                term={currentWord.term}
                primaryColor={colors.primary}
                textColor={colors.text}
              />
              {settings.showExampleKr && currentWord.exampleKr && isCorrect !== null && (
                <Text style={[styles.exampleKrText, { color: colors.textTertiary }]}>{currentWord.exampleKr}</Text>
              )}
            </View>
          ) : (
            <Text style={[styles.noExample, { color: colors.textTertiary }]}>No example sentence available</Text>
          )}
          <Pressable onPress={handleSpeak} hitSlop={12} style={styles.speakerBtn}>
            {({ pressed }) => (
              <Ionicons name="volume-medium-outline" size={28} color={pressed ? colors.primary : colors.textTertiary} />
            )}
          </Pressable>
        </View>

        <View style={styles.choicesArea}>
          {choices.map((choice: Word) => {
            const isSelected = selectedAnswer === choice.id;
            const isCorrectAnswer = choice.id === currentWord.id;
            const showCorrect = selectedAnswer !== null && isCorrectAnswer;
            const showWrong = isSelected && !isCorrect;

            let bgColor = colors.surface;
            let borderColor = colors.border;
            let textColor = colors.text;
            let iconName: keyof typeof Ionicons.glyphMap | null = null;

            if (showCorrect) {
              bgColor = colors.successLight;
              borderColor = colors.success;
              textColor = colors.success;
              iconName = 'checkmark-circle';
            } else if (showWrong) {
              bgColor = colors.errorLight;
              borderColor = colors.error;
              textColor = colors.error;
              iconName = 'close-circle';
            }

            return (
              <Pressable
                key={choice.id}
                onPress={() => handleAnswer(choice)}
                disabled={selectedAnswer !== null}
                style={[
                  styles.choiceBtn,
                  {
                    backgroundColor: bgColor,
                    borderColor: borderColor,
                  },
                ]}
              >
                <Text style={[styles.choiceText, { color: textColor }]}>{choice.term}</Text>
                {iconName && (
                  <Ionicons name={iconName} size={24} color={textColor} />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>


      {renderSettingsModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  progressArea: {
    flex: 1,
    gap: 6,
  },
  progressText: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  contentArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 32,
  },
  exampleCard: {
    width: '100%',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
    gap: 20,
  },
  exampleText: {
    fontSize: 22,
    fontFamily: 'Pretendard_500Medium',
    textAlign: 'center',
    lineHeight: 34,
  },
  exampleKrText: {
    fontSize: 16,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    lineHeight: 24,
  },
  highlightedWord: {
    fontFamily: 'Pretendard_700Bold',
  },
  noExample: {
    fontSize: 16,
    fontFamily: 'Pretendard_400Regular',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  speakerBtn: {
    padding: 8,
  },
  starBtn: {
    padding: 8,
    position: 'absolute',
    right: 16,
    top: 16,
    zIndex: 10,
  },
  wordInfo: {
    alignItems: 'center',
    gap: 6,
    minHeight: 60,
  },
  wordText: {
    fontSize: 24,
    fontFamily: 'Pretendard_700Bold',
  },
  choicesArea: {
    width: '100%',
    gap: 12,
  },
  choiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  choiceText: {
    fontSize: 18,
    fontFamily: 'Pretendard_600SemiBold',
    flex: 1,
  },
  meaningText: {
    fontSize: 18,
    fontFamily: 'Pretendard_500Medium',
  },
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  reviewBtn: {
    borderWidth: 2,
  },
  gotItBtn: {},
  actionBtnText: {
    fontSize: 17,
    fontFamily: 'Pretendard_600SemiBold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  settingsSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '80%',
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  settingsTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard_700Bold',
  },
  settingSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  filterGroup: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  filterTabText: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontFamily: 'Pretendard_500Medium',
  },
  divider: {
    height: 1,
    marginVertical: 4,
    marginBottom: 20,
  },
});
