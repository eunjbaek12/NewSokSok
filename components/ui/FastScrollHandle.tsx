import React, { useRef, useEffect, useState } from 'react';
import { Animated, View, PanResponder, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/features/theme';

interface FastScrollHandleProps {
  scrollY: Animated.Value;
  contentHeight: number;
  visibleHeight: number;
  /** Total number of items in the list (for index calculation) */
  itemCount: number;
  /** Returns a display label for the item at the given index */
  getSectionLabel: (itemIndex: number) => string;
  /** Programmatically scroll the list to the given offset */
  onScrollTo: (offset: number) => void;
}

const HANDLE_WIDTH = 22;
const HANDLE_RIGHT = 6;
const BUBBLE_HEIGHT = 30;

export default function FastScrollHandle({
  scrollY,
  contentHeight,
  visibleHeight,
  itemCount,
  getSectionLabel,
  onScrollTo,
}: FastScrollHandleProps) {
  const { colors } = useTheme();

  // Animated values — stable refs, never recreated
  const thumbPos = useRef(new Animated.Value(0)).current;
  const globalOpacity = useRef(new Animated.Value(0)).current;
  const bubbleOpacity = useRef(new Animated.Value(0)).current;

  // Drag state
  const isDragging = useRef(false);
  const startThumbTopRef = useRef(0);
  const currentThumbPosRef = useRef(0); // mirrors thumbPos value without internal API
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSectionLabelRef = useRef('');

  const [sectionLabel, setSectionLabel] = useState('');

  // ── Layout-derived values (updated synchronously on each render) ──────────
  const thumbH =
    contentHeight > visibleHeight && visibleHeight > 0
      ? Math.max(36, (visibleHeight / contentHeight) * visibleHeight)
      : 36;

  const maxScrollRef = useRef(0);
  const maxThumbTopRef = useRef(0);
  maxScrollRef.current = Math.max(1, contentHeight - visibleHeight);
  maxThumbTopRef.current = Math.max(0, visibleHeight - thumbH);

  // ── Prop refs (keep panResponder callbacks current without re-creating) ───
  const itemCountRef = useRef(itemCount);
  const getSectionLabelRef = useRef(getSectionLabel);
  const onScrollToRef = useRef(onScrollTo);
  itemCountRef.current = itemCount;
  getSectionLabelRef.current = getSectionLabel;
  onScrollToRef.current = onScrollTo;

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Fade handle in and schedule a fade-out after 1.5 s of inactivity */
  const fadeHandleIn = () => {
    Animated.timing(globalOpacity, { toValue: 1, duration: 0, useNativeDriver: false }).start();
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      if (!isDragging.current) {
        Animated.timing(globalOpacity, { toValue: 0, duration: 300, useNativeDriver: false }).start();
      }
    }, 1500);
  };

  /** Resolve item index from scroll offset and fire label + haptic if changed */
  const updateSectionLabel = (scrollOffset: number) => {
    const ratio = scrollOffset / maxScrollRef.current;
    const idx = Math.round(ratio * Math.max(0, itemCountRef.current - 1));
    const label = getSectionLabelRef.current(Math.max(0, idx));
    if (label !== lastSectionLabelRef.current) {
      lastSectionLabelRef.current = label;
      setSectionLabel(label);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // ── Sync list scroll → handle position ───────────────────────────────────
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      if (isDragging.current) return;
      const t =
        maxThumbTopRef.current > 0
          ? Math.min(maxThumbTopRef.current, (value / maxScrollRef.current) * maxThumbTopRef.current)
          : 0;
      currentThumbPosRef.current = t;
      thumbPos.setValue(t);
      fadeHandleIn();
    });

    return () => {
      scrollY.removeListener(id);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
    // scrollY is a stable Animated.Value ref — only needs to register once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollY]);

  // ── PanResponder (created once; all dynamic values accessed via refs) ─────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        isDragging.current = true;
        startThumbTopRef.current = currentThumbPosRef.current;

        // Keep handle fully visible during drag
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        Animated.timing(globalOpacity, { toValue: 1, duration: 0, useNativeDriver: false }).start();

        // Show bubble with the current section label
        const initOffset =
          (startThumbTopRef.current / Math.max(1, maxThumbTopRef.current)) * maxScrollRef.current;
        const ratio = initOffset / maxScrollRef.current;
        const idx = Math.round(ratio * Math.max(0, itemCountRef.current - 1));
        const label = getSectionLabelRef.current(Math.max(0, idx));
        lastSectionLabelRef.current = label;
        setSectionLabel(label);
        Animated.timing(bubbleOpacity, { toValue: 1, duration: 80, useNativeDriver: false }).start();
      },

      onPanResponderMove: (_, gs) => {
        const newTop = Math.max(
          0,
          Math.min(maxThumbTopRef.current, startThumbTopRef.current + gs.dy),
        );
        currentThumbPosRef.current = newTop;
        thumbPos.setValue(newTop);

        const scrollOffset = (newTop / Math.max(1, maxThumbTopRef.current)) * maxScrollRef.current;
        onScrollToRef.current(scrollOffset);

        // Update label + haptic
        const ratio = scrollOffset / maxScrollRef.current;
        const idx = Math.round(ratio * Math.max(0, itemCountRef.current - 1));
        const label = getSectionLabelRef.current(Math.max(0, idx));
        if (label !== lastSectionLabelRef.current) {
          lastSectionLabelRef.current = label;
          setSectionLabel(label);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },

      onPanResponderRelease: () => {
        isDragging.current = false;
        Animated.timing(bubbleOpacity, { toValue: 0, duration: 200, useNativeDriver: false }).start();
        // Fade handle out after delay
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = setTimeout(() => {
          Animated.timing(globalOpacity, { toValue: 0, duration: 300, useNativeDriver: false }).start();
        }, 1500);
      },

      onPanResponderTerminate: () => {
        isDragging.current = false;
        Animated.timing(bubbleOpacity, { toValue: 0, duration: 200, useNativeDriver: false }).start();
      },
    }),
  ).current;

  // ── Skip render when no scrolling needed ─────────────────────────────────
  if (contentHeight <= visibleHeight || visibleHeight === 0) return null;

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.container, { opacity: globalOpacity }]}
    >
      {/* Bubble tooltip — shows current section label during drag */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.bubbleWrapper,
          {
            top: thumbPos,
            opacity: bubbleOpacity,
            marginTop: thumbH / 2 - BUBBLE_HEIGHT / 2,
          },
        ]}
      >
        <View style={[styles.bubble, { backgroundColor: colors.primaryButton, shadowColor: colors.shadow }]}>
          <Text style={[styles.bubbleText, { color: colors.onPrimary }]} numberOfLines={1}>
            {sectionLabel}
          </Text>
        </View>
        {/* Arrow pointing right toward handle */}
        <View style={[styles.bubbleArrow, { borderLeftColor: colors.primary }]} />
      </Animated.View>

      {/* Draggable handle pill */}
      <Animated.View
        style={[
          styles.handle,
          {
            top: thumbPos,
            height: thumbH,
            backgroundColor: colors.textTertiary,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.gripContainer}>
          <View style={styles.gripLine} />
          <View style={styles.gripLine} />
          <View style={styles.gripLine} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 110,
  },
  bubbleWrapper: {
    position: 'absolute',
    right: HANDLE_RIGHT + HANDLE_WIDTH + 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bubble: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  bubbleText: {
    fontSize: 12,
    fontFamily: 'Pretendard_600SemiBold',
  },
  bubbleArrow: {
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 7,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  handle: {
    position: 'absolute',
    right: HANDLE_RIGHT,
    width: HANDLE_WIDTH,
    borderRadius: HANDLE_WIDTH / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gripContainer: {
    alignItems: 'center',
    gap: 3,
  },
  gripLine: {
    width: 10,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
});
