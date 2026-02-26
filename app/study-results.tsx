import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, FlatList } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { StudyResult } from '@/lib/types';

export default function StudyResultsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { studyResults, clearStudyResults } = useVocab();
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const gotItResults = useMemo(() => studyResults.filter(r => r.gotIt), [studyResults]);
  const reviewResults = useMemo(() => studyResults.filter(r => !r.gotIt), [studyResults]);
  const allCorrect = reviewResults.length === 0 && gotItResults.length > 0;

  useEffect(() => {
    if (studyResults.length > 0) {
      Haptics.notificationAsync(
        allCorrect
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
    }
  }, []);

  const handleDone = () => {
    clearStudyResults();
    router.dismissAll();
  };

  const handleRetry = () => {
    clearStudyResults();
    router.back();
  };

  const renderWordItem = ({ item }: { item: StudyResult }) => (
    <View style={[styles.wordRow, { borderBottomColor: colors.borderLight }]}>
      <Text style={[styles.wordItemText, { color: colors.text }]}>{item.word.term}</Text>
      <Text style={[styles.meaningItemText, { color: colors.textSecondary }]}>{item.word.meaningKr}</Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerContent}>
      <View style={[styles.scoreCircle, { borderColor: allCorrect ? colors.success : colors.primary }]}>
        <Text style={[styles.scoreNum, { color: allCorrect ? colors.success : colors.text }]}>
          {gotItResults.length}
        </Text>
        <View style={[styles.scoreDivider, { backgroundColor: allCorrect ? colors.success : colors.border }]} />
        <Text style={[styles.scoreTotal, { color: colors.textSecondary }]}>{studyResults.length}</Text>
      </View>

      <Text style={[styles.title, { color: colors.text }]}>Study Complete</Text>

      {allCorrect && (
        <Text style={[styles.congratsText, { color: colors.success }]}>
          Perfect score! All words mastered.
        </Text>
      )}

      {gotItResults.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Got it ({gotItResults.length})
            </Text>
          </View>
          {gotItResults.map((item) => (
            <View key={item.word.id} style={[styles.wordRow, { borderBottomColor: colors.borderLight }]}>
              <Text style={[styles.wordItemText, { color: colors.text }]}>{item.word.term}</Text>
              <Text style={[styles.meaningItemText, { color: colors.textSecondary }]}>{item.word.meaningKr}</Text>
            </View>
          ))}
        </View>
      )}

      {reviewResults.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: colors.warning }]} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Review ({reviewResults.length})
            </Text>
          </View>
          {reviewResults.map((item) => (
            <View key={item.word.id} style={[styles.wordRow, { borderBottomColor: colors.borderLight }]}>
              <Text style={[styles.wordItemText, { color: colors.text }]}>{item.word.term}</Text>
              <Text style={[styles.meaningItemText, { color: colors.textSecondary }]}>{item.word.meaningKr}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  if (studyResults.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 100 }}>No results</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={[]}
        renderItem={renderWordItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={[styles.listContent, { paddingTop: topInset + 24 }]}
        scrollEnabled={!!studyResults.length}
      />

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20, backgroundColor: colors.background }]}>
        {reviewResults.length > 0 && (
          <Pressable
            onPress={handleRetry}
            style={[styles.actionBtn, styles.retryBtn, { borderColor: colors.primary }]}
          >
            <Ionicons name="refresh-outline" size={22} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>Retry</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleDone}
          style={[styles.actionBtn, styles.doneBtn, { backgroundColor: colors.primary }]}
        >
          <Ionicons name="checkmark" size={22} color="#FFFFFF" />
          <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  headerContent: {
    alignItems: 'center',
    gap: 16,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  scoreNum: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
  },
  scoreDivider: {
    width: 40,
    height: 2,
    borderRadius: 1,
  },
  scoreTotal: {
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  congratsText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  section: {
    width: '100%',
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  wordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  wordItemText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  meaningItemText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'right',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 16,
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
  retryBtn: {
    borderWidth: 2,
  },
  doneBtn: {},
  actionBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
});
