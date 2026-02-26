import React, { useCallback } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';

const STUDY_MODES = [
  {
    key: 'flashcards' as const,
    title: 'Flashcards',
    description: 'Flip cards to memorize',
    icon: 'albums-outline' as const,
    pathname: '/flashcards/[id]' as const,
  },
  {
    key: 'quiz' as const,
    title: 'Quiz',
    description: 'Test with multiple choice',
    icon: 'help-circle-outline' as const,
    pathname: '/quiz/[id]' as const,
  },
  {
    key: 'examples' as const,
    title: 'Examples',
    description: 'Learn from context',
    icon: 'document-text-outline' as const,
    pathname: '/examples/[id]' as const,
  },
  {
    key: 'shadowing' as const,
    title: 'Shadowing',
    description: 'Listen and repeat',
    icon: 'mic-outline' as const,
    pathname: '/shadowing/[id]' as const,
  },
];

export default function StudySelectScreen() {
  const { id, filter } = useLocalSearchParams<{ id: string; filter?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { lists, getWordsForList } = useVocab();

  const list = lists.find(l => l.id === id);
  const allWords = getWordsForList(id!);
  const listWords = React.useMemo(() => {
    if (filter === 'learning') return allWords.filter(w => !w.isMemorized);
    if (filter === 'memorized') return allWords.filter(w => w.isMemorized);
    return allWords;
  }, [allWords, filter]);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const disabled = listWords.length < 2;

  const filterLabel = filter === 'learning' ? 'Learning' : filter === 'memorized' ? 'Memorized' : 'All';

  const handleSelectMode = useCallback((pathname: string) => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: pathname as any, params: { id: id!, filter: filter || 'all' } });
  }, [disabled, id, filter]);

  if (!list) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 100 }}>List not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {list.title}
          </Text>
        </View>
        <Text style={[styles.wordCount, { color: colors.textSecondary }]}>
          {filterLabel} · {listWords.length}개 단어
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {disabled && (
          <View style={[styles.warningBanner, { backgroundColor: colors.warningLight }]}>
            <Ionicons name="alert-circle" size={18} color={colors.warning} />
            <Text style={[styles.warningText, { color: colors.warning }]}>
              Add at least 2 words to start studying
            </Text>
          </View>
        )}

        {STUDY_MODES.map((mode, index) => {
          const isAccent = index === 1;
          const cardBg = disabled
            ? colors.surfaceSecondary
            : isAccent
              ? colors.accent
              : colors.primary;
          const cardTextColor = disabled ? colors.textTertiary : '#FFFFFF';

          return (
            <Pressable
              key={mode.key}
              onPress={() => handleSelectMode(mode.pathname)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.modeCard,
                {
                  backgroundColor: cardBg,
                  opacity: pressed && !disabled ? 0.85 : 1,
                  shadowColor: disabled ? 'transparent' : cardBg,
                },
              ]}
            >
              <View style={styles.modeCardContent}>
                <View style={[styles.iconCircle, { backgroundColor: disabled ? colors.border : 'rgba(255,255,255,0.2)' }]}>
                  <Ionicons name={mode.icon} size={32} color={cardTextColor} />
                </View>
                <View style={styles.modeTextArea}>
                  <Text style={[styles.modeTitle, { color: cardTextColor }]}>{mode.title}</Text>
                  <Text style={[styles.modeDescription, { color: disabled ? colors.textTertiary : 'rgba(255,255,255,0.8)' }]}>
                    {mode.description}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={24}
                  color={disabled ? colors.textTertiary : 'rgba(255,255,255,0.6)'}
                />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    flex: 1,
  },
  wordCount: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
    marginLeft: 40,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  warningText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  modeCard: {
    borderRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  modeCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTextArea: {
    flex: 1,
    gap: 4,
  },
  modeTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  modeDescription: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
});
