import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  Image,
  TextInput,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { SkinSelector } from '@/components/SkinSelector';
import { useAuth, isCloudAuthMode } from '@/features/auth';
import { useLocale } from '@/features/locale';
import { UI_LOCALES } from '@/i18n';
import { ModalPicker } from '@/components/ui/ModalPicker';
import DialogModal from '@/components/ui/DialogModal';
import { useSettings } from '@/features/settings';
import { useQuota, getProMode, getTrialDaysLeft } from '@/features/quota';
import { PopupTokens } from '@/constants/popup';
import { useOnboarding } from '@/features/onboarding';
import { AppBannerAd, useTabContentBottomInset } from '@/components/ads/AppBannerAd';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const bottomPadding = useTabContentBottomInset(24);
  const { t } = useTranslation();
  const { colors, isDark, skinId, setSkin, fontFamily } = useTheme();
  const { authMode, user, logout, signInWithGoogle, deleteAccount } = useAuth();
  // Google·Apple 모두 클라우드 로그인 사용자(동기화·계정 UI 동일 취급). Apple을
  // 빼면 게스트로 오인돼 동기화 배지·tier 칩·계정삭제가 사라진다.
  const isCloud = isCloudAuthMode(authMode);
  const { locale, setLocale } = useLocale();
  const { profileSettings, updateProfileSettings, apiKey } = useSettings();
  const { status: quotaStatus, refresh: refreshQuota } = useQuota();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showStartupPicker, setShowStartupPicker] = useState(false);
  const [nicknameModalOpen, setNicknameModalOpen] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameFromGoogle, setNicknameFromGoogle] = useState(false);
  const { markOnboardingDone } = useOnboarding();

  // 로그인 사용자는 진입 시 한도 갱신 (계정 행 tier 칩 표시용)
  useEffect(() => {
    if (isCloud) refreshQuota();
  }, [authMode, refreshQuota]);

  const handleResetOnboarding = () => {
    Alert.alert('온보딩 초기화', '앱을 재시작하면 온보딩이 다시 표시됩니다.', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: '초기화',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.setItem('@soksok_onboarding_done', 'false');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const btn = PopupTokens.button.standard;

  const handleOpenNicknameModal = () => {
    const isFromGoogle = !profileSettings.nickname && authMode === 'google' && !!user?.displayName;
    const defaultNickname =
      profileSettings.nickname ||
      (isCloud && user?.displayName ? user.displayName : '');
    setNicknameInput(defaultNickname);
    setNicknameFromGoogle(isFromGoogle);
    setNicknameModalOpen(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveNickname = async () => {
    await updateProfileSettings({ nickname: nicknameInput.trim() });
    setNicknameModalOpen(false);
  };

  const currentLangLabel = UI_LOCALES.find((l) => l.code === locale)?.nativeLabel ?? locale;

  // 계정 행 tier 칩 — 분기 우선순위: BYOK > 로그인 tier(Pro/Free) > 게스트.
  // 게스트는 quota 없음(로그인 유도), 로그인 직후 status 로딩 중이면 칩 생략.
  const accountTierChip = (() => {
    if (apiKey) return { label: t('settings.accountTierByok'), onPress: undefined as undefined | (() => void) };
    if (!isCloud) return { label: t('settings.accountTierGuest'), onPress: () => handleGoogleUpgrade() };
    if (!quotaStatus) return null;
    if (quotaStatus.tier === 'pro') {
      // 트라이얼과 유료를 구분 — 둘 다 서버 tier='pro'지만 사용자에겐 매우 다른 상태.
      const proMode = getProMode(quotaStatus);
      if (proMode === 'trial') {
        const daysLeft = getTrialDaysLeft(quotaStatus) ?? 0;
        return {
          label: t('settings.accountTierTrial', { daysLeft, used: quotaStatus.used, limit: quotaStatus.limit }),
          onPress: undefined,
        };
      }
      return { label: t('settings.accountTierPro', { used: quotaStatus.used, limit: quotaStatus.limit }), onPress: undefined };
    }
    return {
      label: t('settings.accountTierFree', { used: quotaStatus.used, limit: quotaStatus.limit + quotaStatus.bonus }),
      onPress: undefined,
    };
  })();

  const handleGoogleUpgrade = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      if (error.message !== 'GOOGLE_CLIENT_ID_MISSING') {
        Alert.alert(t('login.loginFailed'), t('login.loginFailedMessage'));
      }
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('settings.deleteAccountTitle'),
      t('settings.deleteAccountMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteAccountConfirm'),
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteAccount();
              router.replace('/login');
            } catch {
              Alert.alert(t('common.error'), t('settings.deleteAccountError'));
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert(
      t('settings.logoutTitle'),
      isCloud
        ? t('settings.logoutMessageGoogle')
        : t('settings.logoutMessageGuest'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            logout();
            router.replace('/login');
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily: fontFamily.bold }]}>{t('settings.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{t('settings.account')}</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
            <View style={styles.rowLeft}>
              {isCloud && user?.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons
                    name={isCloud ? 'person' : 'phone-portrait-outline'}
                    size={18}
                    color={colors.primary}
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  {isCloud && user?.displayName
                    ? user.displayName
                    : t('settings.guestUser')}
                </Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]}>
                  {isCloud && user?.email
                    ? user.email
                    : t('settings.localStorageInUse')}
                </Text>
                {accountTierChip && (
                  <Pressable
                    onPress={accountTierChip.onPress}
                    disabled={!accountTierChip.onPress}
                    style={[styles.tierChip, { backgroundColor: colors.primaryLight }]}
                    hitSlop={6}
                  >
                    <Text style={[styles.tierChipText, { color: colors.primary }]} numberOfLines={1}>
                      {accountTierChip.label}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
            {isCloud && (
              <View style={[styles.cloudBadge, { backgroundColor: colors.successLight }]}>
                <Ionicons name="cloud-done-outline" size={14} color={colors.success} />
                <Text style={[styles.cloudBadgeText, { color: colors.success }]}>{t('settings.sync')}</Text>
              </View>
            )}
          </View>
          {authMode === 'guest' && (
            <Pressable
              style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}
              onPress={handleGoogleUpgrade}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="logo-google" size={18} color={colors.brand.googleBlue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.googleUpgrade')}</Text>
                  <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]}>{t('settings.googleUpgradeDesc')}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
          )}

          <Pressable
            style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}
            onPress={handleOpenNicknameModal}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="at-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.nickname')}</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>
                  {profileSettings.nickname.trim() || t('settings.nicknameNotSet')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>

          <Pressable style={styles.row} onPress={handleLogout}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.errorLight }]}>
                <Ionicons name="log-out-outline" size={18} color={colors.error} />
              </View>
              <Text style={[styles.rowTitle, { color: colors.error }]}>{t('settings.logout')}</Text>
            </View>
          </Pressable>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{t('settings.display')}</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={[styles.skinSelectorRow, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
            <Text style={[styles.skinSelectorLabel, { color: colors.textSecondary }]}>{t('skin')}</Text>
            <SkinSelector />
          </View>
          <Pressable
            style={styles.row}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowStartupPicker(true);
            }}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="home-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.startupScreen')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
                {t(`settings.startup_${profileSettings.startupTab ?? 'index'}`)}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </View>
          </Pressable>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{t('settings.language')}</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Pressable
            style={styles.row}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowLangPicker(true);
            }}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="globe-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.appLanguage')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{currentLangLabel}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </View>
          </Pressable>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{t('settings.plansAndMore')}</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Pressable
            style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/plans' as any);
            }}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.plans')}</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>
                  {t('settings.plansDesc')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
          <Pressable
            style={styles.row}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/advanced-settings' as any);
            }}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="construct-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.advanced')}</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>
                  {t('settings.advancedDesc')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{t('settings.info')}</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Pressable
            style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/faq' as any);
            }}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="help-circle-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.faq')}</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>
                  {t('settings.faqDesc')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
          <Pressable
            style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/terms' as any);
            }}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="document-text-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.terms')}</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>
                  {t('settings.termsDesc')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
          <Pressable
            style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL('https://eunjbaek12.github.io/NewSokSok/privacy-policy.html');
            }}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.privacy')}</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>
                  {t('settings.privacyDesc')}
                </Text>
              </View>
            </View>
            <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
          </Pressable>
          <Pressable
            style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/licenses' as any);
            }}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="library-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.licenses')}</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>
                  {t('settings.licensesDesc')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.appName')}</Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>아보카도</Text>
          </View>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.successLight }]}>
                <Ionicons name="code-slash-outline" size={18} color={colors.success} />
              </View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.version')}</Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>1.0.0</Text>
          </View>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>개발자</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Pressable style={styles.row} onPress={handleResetOnboarding}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.warningLight }]}>
                <Ionicons name="refresh-outline" size={18} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>온보딩 다시 보기</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]}>초기화 후 앱 재시작 시 온보딩 표시</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        {isCloud && (
          <Pressable
            style={styles.deleteAccountLink}
            onPress={handleDeleteAccount}
            disabled={isDeleting}
          >
            <Text style={[styles.deleteAccountText, { color: colors.error }]}>
              {isDeleting ? t('settings.deleting') : t('settings.deleteAccount')}
            </Text>
          </Pressable>
        )}

      </ScrollView>

      <ModalPicker
        visible={showLangPicker}
        onClose={() => setShowLangPicker(false)}
        title={t('settings.appLanguage')}
        options={UI_LOCALES.map((l) => ({
          id: l.code,
          title: l.nativeLabel,
          subtitle: l.flag,
        }))}
        selectedValue={locale}
        onSelect={(id) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setLocale(id as any);
          setShowLangPicker(false);
        }}
      />

      <ModalPicker
        visible={showStartupPicker}
        onClose={() => setShowStartupPicker(false)}
        title={t('settings.startupScreen')}
        options={[
          { id: 'index', title: t('settings.startup_index') },
          { id: 'vocab-lists', title: t('settings.startup_vocab-lists') },
          { id: 'curation', title: t('settings.startup_curation') },
        ]}
        selectedValue={profileSettings.startupTab ?? 'index'}
        onSelect={(id) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          updateProfileSettings({ startupTab: id as any });
          setShowStartupPicker(false);
        }}
      />

      <DialogModal
        visible={nicknameModalOpen}
        onClose={() => setNicknameModalOpen(false)}
        title={t('settings.nicknameTitle')}
        scrollable={true}
        footer={
          <View style={styles.modalActions}>
            <Pressable
              onPress={() => setNicknameModalOpen(false)}
              style={[styles.modalBtn, { backgroundColor: colors.surfaceSecondary, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
            >
              <Text style={[styles.modalBtnText, { color: colors.text, fontSize: btn.fontSize }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={handleSaveNickname}
              style={[styles.modalBtn, { backgroundColor: colors.primaryButton, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
            >
              <Text style={[styles.modalBtnText, { color: colors.onPrimary, fontSize: btn.fontSize }]}>{t('common.save')}</Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.modalBody}>
          <Text style={[styles.nicknameDesc, { color: colors.textSecondary }]}>{t('settings.nicknameDesc')}</Text>
          <TextInput
            style={[styles.nicknameInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            value={nicknameInput}
            onChangeText={setNicknameInput}
            placeholder={t('settings.nicknamePlaceholder')}
            placeholderTextColor={colors.textTertiary}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSaveNickname}
            maxLength={10}
          />
          <Text style={[styles.nicknameCount, { color: colors.textTertiary }]}>{nicknameInput.trim().length} / 10</Text>
          {nicknameFromGoogle && (
            <Text style={[styles.nicknameHint, { color: colors.textTertiary }]}>
              {t('settings.nicknameFromGoogle')}
            </Text>
          )}
        </View>
      </DialogModal>

      <AppBannerAd mode="tab-anchor" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  sectionHeader: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  section: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowLeft: {
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
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: 'Pretendard_500Medium',
    flexShrink: 1,
  },
  rowSubtitle: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 2,
  },
  rowValue: {
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
  },
  cloudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  cloudBadgeText: {
    fontSize: 11,
    fontFamily: 'Pretendard_600SemiBold',
  },
  tierChip: {
    alignSelf: 'flex-start',
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tierChipText: {
    fontSize: 11,
    fontFamily: 'Pretendard_600SemiBold',
  },
  deleteAccountLink: {
    alignItems: 'center',
    paddingVertical: 24,
    marginTop: 12,
  },
  deleteAccountText: {
    fontSize: 13,
    fontFamily: 'Pretendard_400Regular',
    textDecorationLine: 'underline',
    opacity: 0.7,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    alignItems: 'center',
  },
  modalBtnText: {
    fontFamily: 'Pretendard_600SemiBold',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
  },
  nicknameDesc: {
    fontSize: 13,
    fontFamily: 'Pretendard_400Regular',
    lineHeight: 18,
  },
  nicknameInput: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: 'Pretendard_400Regular',
  },
  nicknameCount: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'right',
  },
  nicknameHint: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 4,
  },
  apiKeyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
  },
  apiKeyInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
  },
  skinSelectorRow: {
    paddingVertical: 12,
  },
  skinSelectorLabel: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
});
