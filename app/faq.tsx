import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Animated,
  Easing,
  LayoutAnimation,
  UIManager,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface FaqItem {
  q: string;
  a: string;
}

interface FaqCategory {
  title: string;
  items: FaqItem[];
}

const CATEGORY_ICONS: IoniconName[] = [
  'rocket-outline',           // 0 시작하기
  'add-circle-outline',       // 1 단어 추가하기
  'school-outline',           // 2 학습하기
  'calendar-outline',         // 3 학습 계획
  'sync-outline',             // 4 데이터 및 동기화
  'sparkles-outline',         // 5 AI 기능
  'pricetag-outline',         // 6 요금제 · 광고
  'albums-outline',           // 7 단어 모음
  'settings-outline',         // 8 설정 · 계정
  'construct-outline',        // 9 문제 해결
];

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const URL_PATTERN =
  /(https?:\/\/[^\s)]+|(?:[\w-]+\.)+(?:com|dev|io|ai|net|org|app|google)(?:\/[^\s)]*)?)/gi;

function normalizeUrl(raw: string) {
  return raw.startsWith('http') ? raw : `https://${raw}`;
}

function configureNextLayout() {
  if (Platform.OS !== 'web') {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }
}

interface AnswerSegment {
  text: string;
  isUrl: boolean;
}

function splitAnswer(text: string): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  const regex = new RegExp(URL_PATTERN.source, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isUrl: false });
    }
    segments.push({ text: match[0], isUrl: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isUrl: false });
  }
  return segments;
}

export default function FaqScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set([0]));
  const [expandedQs, setExpandedQs] = useState<Set<string>>(new Set());
  const rotationsRef = useRef<Map<string, Animated.Value>>(new Map());

  const categories = t('faq.categories', { returnObjects: true }) as FaqCategory[];

  const getRotation = useCallback((key: string, initialOpen: boolean) => {
    let v = rotationsRef.current.get(key);
    if (!v) {
      v = new Animated.Value(initialOpen ? 1 : 0);
      rotationsRef.current.set(key, v);
    }
    return v;
  }, []);

  const animateRotation = useCallback((key: string, toOpen: boolean) => {
    let v = rotationsRef.current.get(key);
    if (!v) {
      v = new Animated.Value(toOpen ? 0 : 1);
      rotationsRef.current.set(key, v);
    }
    Animated.timing(v, {
      toValue: toOpen ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  const toggleCategory = useCallback(
    (ci: number) => {
      Haptics.selectionAsync();
      configureNextLayout();
      setExpandedCats((prev) => {
        const next = new Set(prev);
        const willOpen = !next.has(ci);
        if (willOpen) next.add(ci);
        else next.delete(ci);
        animateRotation(`cat-${ci}`, willOpen);
        return next;
      });
    },
    [animateRotation],
  );

  const toggleQ = useCallback(
    (key: string) => {
      Haptics.selectionAsync();
      configureNextLayout();
      setExpandedQs((prev) => {
        const next = new Set(prev);
        const willOpen = !next.has(key);
        if (willOpen) next.add(key);
        else next.delete(key);
        animateRotation(key, willOpen);
        return next;
      });
    },
    [animateRotation],
  );

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const renderAnswer = (text: string) => (
    <Text style={[styles.aText, { color: colors.textSecondary }]}>
      {splitAnswer(text).map((seg, i) =>
        seg.isUrl ? (
          <Text
            key={i}
            style={{ color: colors.primary, textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(normalizeUrl(seg.text))}
          >
            {seg.text}
          </Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        ),
      )}
    </Text>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('faq.title')}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('faq.headerSubtitle')}
        </Text>

        {categories.map((cat, ci) => {
          const isCatOpen = expandedCats.has(ci);
          const catRotation = getRotation(`cat-${ci}`, isCatOpen).interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '180deg'],
          });
          const iconName = CATEGORY_ICONS[ci] ?? 'help-circle-outline';
          return (
            <View
              key={ci}
              style={[
                styles.catCard,
                { backgroundColor: colors.surface, borderColor: colors.borderLight },
              ]}
            >
              <Pressable
                onPress={() => toggleCategory(ci)}
                accessibilityRole="button"
                accessibilityLabel={cat.title}
                accessibilityState={{ expanded: isCatOpen }}
                style={({ pressed }) => [
                  styles.catHeader,
                  isCatOpen
                    ? { borderBottomWidth: 1, borderBottomColor: colors.borderLight }
                    : null,
                  pressed && { opacity: 0.65 },
                ]}
              >
                <View style={styles.catHeaderLeft}>
                  <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name={iconName} size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.catTitle, { color: colors.text }]}>{cat.title}</Text>
                </View>
                <Animated.View style={{ transform: [{ rotate: catRotation }] }}>
                  <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
                </Animated.View>
              </Pressable>

              {isCatOpen && (
                <View>
                  {cat.items.map((item, ii) => {
                    const key = `${ci}-${ii}`;
                    const isQOpen = expandedQs.has(key);
                    const isLast = ii === cat.items.length - 1;
                    const qRotation = getRotation(key, isQOpen).interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '180deg'],
                    });
                    return (
                      <View key={key}>
                        <Pressable
                          onPress={() => toggleQ(key)}
                          accessibilityRole="button"
                          accessibilityLabel={item.q}
                          accessibilityState={{ expanded: isQOpen }}
                          style={({ pressed }) => [
                            styles.qRow,
                            !isLast || isQOpen
                              ? { borderBottomWidth: 1, borderBottomColor: colors.borderLight }
                              : null,
                            pressed && { opacity: 0.65 },
                          ]}
                        >
                          <Text
                            style={[
                              styles.qText,
                              { color: isQOpen ? colors.primary : colors.text },
                            ]}
                          >
                            {item.q}
                          </Text>
                          <Animated.View style={{ transform: [{ rotate: qRotation }] }}>
                            <Ionicons
                              name="chevron-down"
                              size={18}
                              color={isQOpen ? colors.primary : colors.textTertiary}
                            />
                          </Animated.View>
                        </Pressable>
                        {isQOpen && (
                          <View
                            style={[
                              styles.aWrap,
                              { backgroundColor: colors.primaryLight },
                              !isLast
                                ? { borderBottomWidth: 1, borderBottomColor: colors.borderLight }
                                : null,
                            ]}
                          >
                            {renderAnswer(item.a)}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 0,
    marginBottom: 16,
  },
  catCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  catHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catTitle: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  qRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  qText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Pretendard_500Medium',
    lineHeight: 22,
  },
  aWrap: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  aText: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    lineHeight: 22,
  },
});
