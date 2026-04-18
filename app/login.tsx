import React, { useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { AvocadoCharacter } from '@/components/onboarding/AvocadoCharacter';


export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { loginAsGuest, signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState<'google' | 'guest' | null>(null);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const handleGoogleLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading('google');
    try {
      await signInWithGoogle();
      router.replace('/');
    } catch (error: any) {
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

  const handleGuestLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading('guest');
    await loginAsGuest();
    router.replace('/');
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.content}>
        <View style={styles.heroSection}>
          <View style={styles.characterContainer}>
            <AvocadoCharacter slideIndex={0} isActive={false} isStatic size={110} />
          </View>
          <Text style={styles.appName}>{t('login.appName')}</Text>
          <Text style={styles.appNameEn}>{t('login.appNameEn')}</Text>
          <Text style={styles.tagline}>{t('login.tagline')}</Text>
        </View>

        <View style={styles.buttonsSection}>
          <Button
            onPress={handleGoogleLogin}
            loading={loading === 'google'}
            disabled={loading !== null}
            variant="outline"
            icon="logo-google"
            iconColor="#4285F4"
            title={t('login.googleLogin')}
            style={styles.googleBtn}
            textStyle={styles.googleBtnText}
          />
          <Text style={styles.googleSubtext}>{t('login.googleSubtext')}</Text>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('common.or')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            onPress={handleGuestLogin}
            loading={loading === 'guest'}
            disabled={loading !== null}
            variant="outline"
            icon="phone-portrait-outline"
            iconColor="#4A3728"
            title={t('login.guestStart')}
            style={styles.guestBtn}
            textStyle={styles.guestBtnText}
          />
          <Text style={styles.guestSubtext}>{t('login.guestSubtext')}</Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Platform.OS === 'web' ? 34 + 16 : insets.bottom + 16 }]}>
        <Text style={styles.footerText}>{t('login.terms')}</Text>
        <Pressable onPress={() => Linking.openURL('https://eunjbaek12.github.io/NewSokSok/privacy-policy')}>
          <Text style={styles.privacyLink}>{t('login.privacyPolicy')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5EDD6',
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
    color: '#3B2A1A',
    letterSpacing: -1,
  },
  appNameEn: {
    fontSize: 13,
    fontFamily: 'Pretendard_500Medium',
    color: '#6AB045',
    marginTop: 4,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    color: '#7A6651',
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
    backgroundColor: '#E8F5DC',
    borderWidth: 1,
    borderColor: '#6AB045',
    borderRadius: 18,
    paddingVertical: 16,
    shadowColor: '#3B2A1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  googleBtnText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    color: '#3D7020',
  },
  googleSubtext: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    color: '#A89880',
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
    backgroundColor: '#C8BAA0',
  },
  dividerText: {
    fontSize: 13,
    fontFamily: 'Pretendard_400Regular',
    color: '#A89880',
  },
  guestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFDF5',
    borderWidth: 1.5,
    borderColor: '#C8BAA0',
    borderRadius: 18,
    paddingVertical: 16,
    shadowColor: '#3B2A1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  guestBtnText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    color: '#4A3728',
  },
  guestSubtext: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    color: '#A89880',
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
    color: '#A89880',
    textAlign: 'center',
  },
  privacyLink: {
    fontSize: 11,
    fontFamily: 'Pretendard_400Regular',
    color: '#6AB045',
    textAlign: 'center',
    marginTop: 6,
    textDecorationLine: 'underline',
  },
});
