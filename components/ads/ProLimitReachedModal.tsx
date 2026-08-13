// Pro 한도 초과 안내 모달 — Pro 사용자가 월 3,000단어를 모두 사용하면 표시.
//
// Pro 약속 무결성: 광고를 보여주지 않고 다음 월간 초기화 시점을 안내한다.
//
// 흐름:
//   1. enrich 호출이 quota_exceeded 응답 + tier='pro' → notifyQuotaExceeded
//   2. quota store가 tier 분기 → proLimitReachedAt 설정
//   3. 본 모달이 _layout 글로벌 마운트 위치에서 표시
//   4. 사용자가 확인 → dismissProLimitReached → 모달 닫힘
//   5. 스토어가 확인한 결제일 기준 다음 월간 주기에 사용량 초기화

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/features/theme';
import { useQuotaStore } from '@/features/quota';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ProLimitReachedModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const status = useQuotaStore((s) => s.status);

  const limit = status?.month_limit ?? 3000;
  const used = status?.month_used ?? limit;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.iconRow}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="time-outline" size={28} color={colors.primary} />
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            {t('ads.proLimitTitle')}
          </Text>

          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {t('ads.proLimitBody', { used, limit })}
          </Text>

          <View style={styles.actionRow}>
            <Pressable
              onPress={onClose}
              style={[styles.btn, { backgroundColor: colors.primaryButton }]}
            >
              <Text style={[styles.btnText, { color: colors.onPrimary }]}>
                {t('common.close')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  iconRow: { alignItems: 'center', marginBottom: 4 },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Pretendard_700Bold',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
  },
});
