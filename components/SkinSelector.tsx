import React from 'react';
import { ScrollView, Pressable, View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { SKIN_LIST } from '@/constants/skins';
import type { SkinId } from '@/features/theme/types';

export function SkinSelector() {
  const { skinId, setSkin, colors } = useTheme();
  const { t } = useTranslation();

  const handlePress = (id: SkinId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSkin(id);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      style={styles.scroll}
    >
      {SKIN_LIST.map((skin) => {
        const isSelected = skin.id === skinId;
        return (
          <Pressable
            key={skin.id}
            onPress={() => handlePress(skin.id)}
            style={[
              styles.card,
              {
                backgroundColor: skin.previewColors.surface ?? skin.previewColors.background,
                borderColor: isSelected ? colors.primary : colors.borderLight,
                borderWidth: isSelected ? 2 : 1,
              },
            ]}
          >
            <View style={styles.colorRow}>
              {([
                skin.previewColors.background,
                skin.previewColors.primary,
                skin.previewColors.surface,
                skin.previewColors.accent,
              ] as string[]).map((c, i) => (
                <View key={i} style={[styles.colorDot, { backgroundColor: c }]} />
              ))}
            </View>

            <Text
              style={[
                styles.skinName,
                {
                  fontFamily: skin.fontFamily.semiBold,
                  // 카드 배경이 각 스킨 고유색이므로 글자색도 스킨에 고정 —
                  // 현재 테마 글자색을 쓰면 반대 밝기 스킨 카드에서 안 보인다.
                  color: skin.previewColors.text,
                },
              ]}
              numberOfLines={1}
            >
              {t(skin.nameKey)}
            </Text>

            {isSelected && (
              <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    height: 120,
  },
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    width: 108,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 8,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 4,
  },
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  skinName: {
    fontSize: 13,
    textAlign: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
