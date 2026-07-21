import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Alert,
  Linking,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth';
import { resetLoginTiming, endLoginTiming } from '@/lib/login-timing';
import { hasPreservedCloudData, discardPreservedCloudData } from '@/features/auth/preserved-cloud-data';
import { useTheme } from '@/features/theme';
import { Button } from '@/components/ui/Button';
import { AvocadoCharacter } from '@/features/onboarding/components/AvocadoCharacter';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors, fontFamily } = useTheme();
  const { loginAsGuest, signInWithGoogle, signInWithApple } = useAuth();
  const [loading, setLoading] = useState<'google' | 'apple' | 'guest' | null>(null);
  // iOS만 Apple Sign-In 지원. App Store 4.8 정책은 iOS에 한정되며,
  // Android 사용자에겐 추가 가치 없음. 디바이스가 실제 지원하는지도 함께 확인.
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const handleGoogleLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetLoginTiming(); // TEMP: login-latency instrumentation
    setLoading('google');
    try {
      await signInWithGoogle();
      router.replace('/');
    } catch (error: any) {
      endLoginTiming(); // TEMP: login failed — end timing session without summary
      if (error.message !== 'GOOGLE_CLIENT_ID_MISSING') {
        console.error(error);
      }
      if (error.message === 'GOOGLE_CLIENT_ID_MISSING') {
        Alert.alert(t('login.googleNotReady'), t('login.googleNotReadyMessage'));
      } else {
        Alert.alert(t('login.loginFailed'), t('login.loginFailedMessage'));
      }
      setLoading(null);
    }
  };

  const handleAppleLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading('apple');
    try {
      await signInWithApple();
      router.replace('/');
    } catch (error: any) {
      // 사용자 취소는 흔한 경로 — alert 띄우지 않고 조용히 복귀.
      if (error?.message !== 'APPLE_SIGNIN_CANCELED') {
        console.error(error);
        Alert.alert(t('login.loginFailed'), t('login.loginFailedMessage'));
      }
      setLoading(null);
    }
  };

  const handleGuestLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // A prior offline logout may have preserved a cloud-auth account's un-synced
    // data on this device (so an un-pushed delete isn't lost). Starting as guest
    // would expose that account's words. Ask before proceeding: re-login to sync,
    // or explicitly discard. Without this the old data would silently appear.
    if (await hasPreservedCloudData()) {
      const proceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          t('login.preservedTitle'),
          t('login.preservedMessage'),
          [
            { text: t('login.preservedRelogin'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('login.preservedDiscard'), style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: false },
        );
      });
      // Re-login: stay on the login screen so they can sign back in and sync.
      if (!proceed) return;
      setLoading('guest');
      await discardPreservedCloudData();
    } else {
      setLoading('guest');
    }
    await loginAsGuest();
    router.replace('/');
  };

  return (
    <View style={[styles.container, { paddingTop: topInset, backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.heroSection}>
          <View style={styles.characterContainer}>
            <AvocadoCharacter slideIndex={0} isActive={false} isStatic size={110} />
          </View>
          <Text style={[styles.appName, { color: colors.text, fontFamily: fontFamily.bold }]}>{t('login.appName')}</Text>
          <Text style={[styles.appNameEn, { color: colors.brand.green }]}>{t('login.appNameEn')}</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>{t('login.tagline')}</Text>
        </View>

        <View style={styles.buttonsSection}>
          {appleAvailable && (
            <>
              <Button
                onPress={handleAppleLogin}
                loading={loading === 'apple'}
                disabled={loading !== null}
                variant="outline"
                icon="logo-apple"
                iconColor="#fff"
                title={t('login.appleLogin')}
                style={[styles.appleBtn, { shadowColor: colors.shadow }]}
                textStyle={styles.appleBtnText}
              />
              <Text style={[styles.googleSubtext, { color: colors.textTertiary }]}>{t('login.appleSubtext')}</Text>
            </>
          )}
          <Button
            onPress={handleGoogleLogin}
            loading={loading === 'google'}
            disabled={loading !== null}
            variant="outline"
            icon="logo-google"
            iconColor={colors.brand.googleBlue}
            title={t('login.googleLogin')}
            style={[styles.googleBtn, { backgroundColor: colors.brand.greenLight, borderColor: colors.brand.green, shadowColor: colors.shadow }]}
            textStyle={[styles.googleBtnText, { color: colors.brand.greenDark }]}
          />
          <Text style={[styles.googleSubtext, { color: colors.textTertiary }]}>{t('login.googleSubtext')}</Text>

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.borderLight }]} />
            <Text style={[styles.dividerText, { color: colors.textTertiary }]}>{t('common.or')}</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.borderLight }]} />
          </View>

          <Button
            onPress={handleGuestLogin}
            loading={loading === 'guest'}
            disabled={loading !== null}
            variant="outline"
            icon="phone-portrait-outline"
            iconColor={colors.text}
            title={t('login.guestStart')}
            style={[styles.guestBtn, { backgroundColor: colors.surface, borderColor: colors.borderLight, shadowColor: colors.shadow }]}
            textStyle={[styles.guestBtnText, { color: colors.text }]}
          />
          <Text style={[styles.guestSubtext, { color: colors.textTertiary }]}>{t('login.guestSubtext')}</Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Platform.OS === 'web' ? 34 + 16 : insets.bottom + 16 }]}>
        <Text style={[styles.footerText, { color: colors.textTertiary }]}>{t('login.terms')}</Text>
        <Pressable onPress={() => Linking.openURL('https://eunjbaek12.github.io/NewSokSok/privacy-policy')}>
          <Text style={[styles.privacyLink, { color: colors.brand.green }]}>{t('login.privacyPolicy')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  characterContainer: {
    marginBottom: 14,
  },
  appName: {
    fontSize: 36,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -1,
  },
  appNameEn: {
    fontSize: 13,
    fontFamily: 'Pretendard_500Medium',
    marginTop: 4,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 10,
  },
  buttonsSection: {
    gap: 0,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  googleBtnText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
  },
  // Apple HIG 준수: 검정 배경 + 흰 텍스트. Apple 로고 + "Sign in with Apple".
  // 다크모드에선 흰 배경 + 검정 텍스트로 바뀌는 게 정석이나, iOS Avocado 로그인
  // 화면은 라이트만 사용하고 있어 단일 변형으로 유지.
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: '#000',
    borderRadius: 18,
    paddingVertical: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  appleBtnText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    color: '#fff',
  },
  googleSubtext: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: 'Pretendard_400Regular',
  },
  guestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 18,
    paddingVertical: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  guestBtnText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
  },
  guestSubtext: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  footerText: {
    fontSize: 11,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
  },
  privacyLink: {
    fontSize: 11,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    marginTop: 6,
    textDecorationLine: 'underline',
  },
});
