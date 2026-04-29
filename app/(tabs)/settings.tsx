import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Switch,
  Pressable,
  Platform,
  Alert,
  Image,
  TextInput,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useAuth } from '@/features/auth';
import { useLocale } from '@/features/locale';
import { UI_LOCALES } from '@/i18n';
import { ModalPicker } from '@/components/ui/ModalPicker';
import DialogModal from '@/components/ui/DialogModal';
import { useSettings } from '@/features/settings';
import { PopupTokens } from '@/constants/popup';
import { useOnboarding } from '@/features/onboarding';
import AsyncStorage from '@react-native-async-storage/async-storage';
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { t } = useTranslation();
  const { colors, isDark, toggleTheme } = useTheme();
  const { authMode, user, logout, signInWithGoogle, deleteAccount } = useAuth();
  const { locale, setLocale } = useLocale();
  const { profileSettings, updateProfileSettings } = useSettings();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showStartupPicker, setShowStartupPicker] = useState(false);
  const [nicknameModalOpen, setNicknameModalOpen] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const { markOnboardingDone } = useOnboarding();

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
    // 닉네임 미설정 상태에서 구글 로그인이면 displayName 자동 채우기
    const defaultNickname =
      profileSettings.nickname ||
      (authMode === 'google' && user?.displayName ? user.displayName : '');
    setNicknameInput(defaultNickname);
    setNicknameModalOpen(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveNickname = async () => {
    await updateProfileSettings({ nickname: nicknameInput.trim() });
    setNicknameModalOpen(false);
  };

  const handleOpenApiKeyModal = () => {
    setApiKeyInput(profileSettings.geminiApiKey || '');
    setApiKeyVisible(false);
    setApiKeyModalOpen(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveApiKey = async () => {
    await updateProfileSettings({ geminiApiKey: apiKeyInput.trim() });
    setApiKeyModalOpen(false);
  };

  const maskedApiKey = profileSettings.geminiApiKey
    ? profileSettings.geminiApiKey.slice(0, 8) + '••••••••••••••••'
    : '';

  const currentLangLabel = UI_LOCALES.find((l) => l.code === locale)?.nativeLabel ?? locale;

  const handleToggleTheme = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleTheme();
  };

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
      authMode === 'google'
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('settings.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{t('settings.account')}</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
            <View style={styles.rowLeft}>
              {authMode === 'google' && user?.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons
                    name={authMode === 'google' ? 'person' : 'phone-portrait-outline'}
                    size={18}
                    color={colors.primary}
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  {authMode === 'google' && user?.displayName
                    ? user.displayName
                    : t('settings.guestUser')}
                </Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]}>
                  {authMode === 'google' && user?.email
                    ? user.email
                    : t('settings.localStorageInUse')}
                </Text>
              </View>
            </View>
            {authMode === 'google' && (
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
                  <Text style={[styles.rowTitle, { color: colors.text }]}>구글로 연결하기</Text>
                  <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]}>데이터를 유지한 채 클라우드 동기화 활성화</Text>
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
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="moon-outline" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.darkMode')}</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]}>
                  {t('settings.themeInUse', { theme: isDark ? t('settings.dark') : t('settings.light') })}
                </Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={handleToggleTheme}
              trackColor={{ false: colors.surfaceSecondary, true: colors.primary }}
              thumbColor={colors.onPrimary}
            />
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

        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{t('settings.ai')}</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Pressable style={styles.row} onPress={handleOpenApiKeyModal}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="key-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Gemini API 키</Text>
                <Text style={[styles.rowSubtitle, { color: profileSettings.geminiApiKey ? colors.success : colors.textTertiary }]} numberOfLines={1}>
                  {profileSettings.geminiApiKey ? maskedApiKey : '키를 입력하면 AI 기능을 사용할 수 있어요'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{t('settings.info')}</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
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

        {authMode === 'google' && (
          <Pressable
            style={styles.deleteAccountLink}
            onPress={handleDeleteAccount}
            disabled={isDeleting}
          >
            <Text style={[styles.deleteAccountText, { color: colors.error }]}>
              {isDeleting ? '처리 중...' : t('settings.deleteAccount')}
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
        scrollable={false}
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
        </View>
      </DialogModal>
      <DialogModal
        visible={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        title="Gemini API 키"
        scrollable={false}
        footer={
          <View style={styles.modalActions}>
            <Pressable
              onPress={() => setApiKeyModalOpen(false)}
              style={[styles.modalBtn, { backgroundColor: colors.surfaceSecondary, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
            >
              <Text style={[styles.modalBtnText, { color: colors.text, fontSize: btn.fontSize }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={handleSaveApiKey}
              style={[styles.modalBtn, { backgroundColor: colors.primaryButton, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
            >
              <Text style={[styles.modalBtnText, { color: colors.onPrimary, fontSize: btn.fontSize }]}>{t('common.save')}</Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.modalBody}>
          <Text style={[styles.nicknameDesc, { color: colors.textSecondary }]}>
            {'Google AI Studio에서 발급받은 API 키를 입력하세요.\n키는 이 기기에만 저장됩니다.'}
          </Text>
          <Pressable
            onPress={() => Linking.openURL('https://aistudio.google.com/apikey')}
          >
            <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Pretendard_500Medium', marginBottom: 4 }}>
              API 키 발급받기 →
            </Text>
          </Pressable>
          <View style={[styles.apiKeyInputRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <TextInput
              style={[styles.apiKeyInput, { color: colors.text }]}
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              placeholder="AIza..."
              placeholderTextColor={colors.textTertiary}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!apiKeyVisible}
              returnKeyType="done"
              onSubmitEditing={handleSaveApiKey}
            />
            <Pressable onPress={() => setApiKeyVisible(v => !v)} style={{ padding: 4 }}>
              <Ionicons name={apiKeyVisible ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textTertiary} />
            </Pressable>
          </View>
          {profileSettings.geminiApiKey ? (
            <Pressable onPress={() => { setApiKeyInput(''); updateProfileSettings({ geminiApiKey: '' }); setApiKeyModalOpen(false); }}>
              <Text style={{ color: colors.error, fontSize: 13, fontFamily: 'Pretendard_400Regular', marginTop: 4 }}>API 키 삭제</Text>
            </Pressable>
          ) : null}
        </View>
      </DialogModal>
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
});
