import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useTheme } from '@/features/theme';
import { displayTag } from '@/lib/tag-display';
import { getLanguageFlag } from '@/constants/languages';
import type { CurationCard } from './types';

// 단어 모음 목록의 카드 한 장.
//
// 공유 창의 «올라갈 모습»도 이 컴포넌트로 그린다. 미리보기를 따로 그리면 둘이 갈라진다 —
// 예전 공유 창은 아이콘이 없으면 ✨를 그렸는데 공유 탭 카드에는 아무것도 없었다.

type ThemeColors = ReturnType<typeof useTheme>['colors'];

export function levelStyleOf(level: string | undefined, colors: ThemeColors, t: TFunction) {
  switch (level) {
    case 'beginner': return { label: t('curation.beginner'), bg: colors.difficulty.beginnerBg, color: colors.difficulty.beginnerText };
    case 'intermediate': return { label: t('curation.intermediate'), bg: colors.difficulty.intermediateBg, color: colors.difficulty.intermediateText };
    case 'advanced': return { label: t('curation.advanced'), bg: colors.difficulty.advancedBg, color: colors.difficulty.advancedText };
    default: return null;
  }
}

interface Props {
  theme: CurationCard;
  viewMode: 'detailed' | 'compact';
  /** 언어쌍 줄. 언어 미상 덱(구버전 앱이 공유한 것)은 이 값과 무관하게 숨긴다. */
  showLangPair: boolean;
  alreadySaved?: boolean;
  /** 없으면 누를 수 없는 카드로 그린다(공유 창 미리보기). */
  onPress?: () => void;
  /** 있으면 휴지통 버튼을 그린다(내가 올린 덱·관리자). */
  onDelete?: () => void;
  /** 작성자 이름이 비었을 때 그 자리에 흐리게 적을 말. 공유 창에서 닉네임을 받기 전용. */
  creatorPlaceholder?: string;
}

export default function CurationCardView({
  theme,
  viewMode,
  showLangPair,
  alreadySaved = false,
  onPress,
  onDelete,
  creatorPlaceholder,
}: Props) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const levelStyle = levelStyleOf(theme.level, colors, t);
  const tags = theme.topTags;
  const langPairVisible = showLangPair && !!theme.sourceLanguage;
  const srcFlag = getLanguageFlag(theme.sourceLanguage || 'en');
  const tgtFlag = getLanguageFlag(theme.targetLanguage || 'ko');
  const srcCode = (theme.sourceLanguage || 'en').toUpperCase();
  const tgtCode = (theme.targetLanguage || 'ko').toUpperCase();
  const creatorName = theme.creatorName?.trim();
  const creatorLabel = creatorName || creatorPlaceholder;

  const cardStyle = [
    styles.themeCard,
    { backgroundColor: colors.surface, borderColor: isDark ? colors.border : colors.primary + '1A', shadowColor: colors.cardShadow },
    viewMode === 'detailed' ? styles.cardDetailed : styles.cardCompact,
  ];

  const body = (
    <View style={{ flex: 1 }}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          {!!theme.icon && <Text style={{ fontSize: 16 }}>{theme.icon}</Text>}
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{theme.title}</Text>
        </View>
        <View style={styles.badgeRow}>
          {alreadySaved && (
            <View style={[styles.savedBadge, { backgroundColor: colors.successLight }]}>
              <Ionicons name="checkmark" size={10} color={colors.success} />
              <Text style={[styles.savedBadgeText, { color: colors.success }]}>{t('curation.saved')}</Text>
            </View>
          )}
          {levelStyle && (
            <View style={[styles.levelBadge, { backgroundColor: levelStyle.bg }]}>
              <Text style={[styles.levelBadgeText, { color: levelStyle.color }]}>{levelStyle.label}</Text>
            </View>
          )}
          {onDelete && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${theme.title} ${t('curation.deleteConfirmTitle')}`}
              onPress={(e) => { e.stopPropagation(); onDelete(); }}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 2 })}
            >
              <Ionicons name="trash-outline" size={16} color={colors.error} />
            </Pressable>
          )}
        </View>
      </View>
      {viewMode === 'detailed' && (
        <>
          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {tags.map(tag => (
                <View key={tag} style={[styles.tagChip, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>#{displayTag(tag, t)}</Text>
                </View>
              ))}
            </View>
          )}
          {!!theme.description && (
            <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={1}>{theme.description}</Text>
          )}
          {langPairVisible && (
            <Text style={[styles.langPair, { color: colors.textTertiary }]}>
              {srcFlag} {srcCode} → {tgtFlag} {tgtCode}
            </Text>
          )}
          <View style={styles.cardFooter}>
            <View style={[styles.wordCountPill, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.cardCount, { color: colors.primary }]}>{t('curation.wordsIncluded', { count: theme.wordCount })}</Text>
            </View>
            {/* 「by」를 적지 않는다 — 번역할 낱말 없이 사람 아이콘이 그 뜻을 맡는다. */}
            {!!creatorLabel && (
              <View style={styles.creatorRow}>
                <Ionicons name="person-outline" size={12} color={colors.textTertiary} />
                <Text
                  style={[styles.creatorText, { color: colors.textTertiary }, !creatorName && styles.creatorPlaceholder]}
                  numberOfLines={1}
                  accessibilityLabel={creatorName ? t('curation.sharedByA11y', { name: creatorName }) : undefined}
                >
                  {creatorLabel}
                </Text>
              </View>
            )}
          </View>
        </>
      )}
      {viewMode === 'compact' && (
        <View style={styles.compactRow}>
          <View style={[styles.wordCountPill, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.cardCount, { color: colors.primary }]}>{t('curation.nWordsCompact', { count: theme.wordCount })}</Text>
          </View>
          {levelStyle && (
            <View style={[styles.levelBadge, { backgroundColor: levelStyle.bg }]}>
              <Text style={[styles.levelBadgeText, { color: levelStyle.color }]}>{levelStyle.label}</Text>
            </View>
          )}
          {tags.length > 0 && (
            <View style={[styles.tagChip, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.tagText, { color: colors.textSecondary }]}>#{displayTag(tags[0], t)}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  if (!onPress) return <View style={cardStyle}>{body}</View>;
  return <Pressable onPress={onPress} style={cardStyle}>{body}</Pressable>;
}

const styles = StyleSheet.create({
  themeCard: { borderRadius: 16, borderWidth: 1, marginBottom: 12, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 10, elevation: 4 },
  cardDetailed: { padding: 16 },
  cardCompact: { padding: 12, marginBottom: 0 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  cardTitle: { fontSize: 17, fontFamily: 'Pretendard_700Bold', flex: 1 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  levelBadgeText: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold' },
  savedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  savedBadgeText: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tagChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  tagText: { fontSize: 11, fontFamily: 'Pretendard_500Medium' },
  cardDesc: { fontSize: 13, fontFamily: 'Pretendard_400Regular', marginTop: 6 },
  langPair: { fontSize: 13, fontFamily: 'Pretendard_500Medium', marginTop: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 },
  wordCountPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  cardCount: { fontSize: 12, fontFamily: 'Pretendard_700Bold', letterSpacing: 0.3 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  creatorText: { fontSize: 11, flexShrink: 1 },
  creatorPlaceholder: { fontStyle: 'italic' },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
});
