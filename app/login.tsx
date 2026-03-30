import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { loginAsGuest, loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState<'google' | 'guest' | null>(null);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const handleGoogleLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (Platform.OS !== 'web') {
      Alert.alert(
        t('login.googleNotReady'),
        t('login.googleNotReadyMessage'),
      );
      return;
    }

    if (!GOOGLE_CLIENT_ID) {
      Alert.alert(
        t('login.googleNotReady'),
        t('login.googleNotReadyMessage'),
      );
      return;
    }

    setLoading('google');
    try {
      const AuthSession = await import('expo-auth-session');
      const WebBrowser = await import('expo-web-browser');
      WebBrowser.maybeCompleteAuthSession();

      const redirectUri = AuthSession.makeRedirectUri();
      const discovery = {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
      };

      const authRequest = new AuthSession.AuthRequest({
        clientId: GOOGLE_CLIENT_ID,
        scopes: ['openid', 'profile', 'email'],
        redirectUri,
        responseType: AuthSession.ResponseType.Token,
      });

      const result = await authRequest.promptAsync(discovery);

      if (result.type === 'success' && result.authentication?.accessToken) {
        await loginWithGoogle(result.authentication.accessToken);
        router.replace('/');
        return;
      } else {
        setLoading(null);
      }
    } catch {
      Alert.alert(t('login.loginFailed'), t('login.loginFailedMessage'));
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
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Ionicons name="book" size={40} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.appName}>{t('login.appName')}</Text>
          <Text style={styles.appNameEn}>{t('login.appNameEn')}</Text>
          <Text style={styles.tagline}>{t('login.tagline')}</Text>
        </View>

        <View style={styles.featuresSection}>
          <View style={styles.featureRow}>
            <View style={styles.featureDot}>
              <Ionicons name="sparkles" size={16} color="#6C5CE7" />
            </View>
            <Text style={styles.featureText}>{t('login.featureAI')}</Text>
          </View>
          <View style={styles.featureRow}>
            <View style={styles.featureDot}>
              <Ionicons name="card-outline" size={16} color="#6C5CE7" />
            </View>
            <Text style={styles.featureText}>{t('login.featureFlashcard')}</Text>
          </View>
          <View style={styles.featureRow}>
            <View style={styles.featureDot}>
              <Ionicons name="volume-high-outline" size={16} color="#6C5CE7" />
            </View>
            <Text style={styles.featureText}>{t('login.featureShadowing')}</Text>
          </View>
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
            variant="primary"
            icon="phone-portrait-outline"
            title={t('login.guestStart')}
            style={styles.guestBtn}
            textStyle={styles.guestBtnText}
          />
          <Text style={styles.guestSubtext}>
            {t('login.guestSubtext')}
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Platform.OS === 'web' ? 34 + 16 : insets.bottom + 16 }]}>
        <Text style={styles.footerText}>
          {t('login.terms')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F6',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoContainer: {
    marginBottom: 16,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#3182F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3182F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  appName: {
    fontSize: 32,
    fontFamily: 'Pretendard_700Bold',
    color: '#1A1A2E',
    letterSpacing: -1,
  },
  appNameEn: {
    fontSize: 14,
    fontFamily: 'Pretendard_500Medium',
    color: '#3182F6',
    marginTop: 4,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
    color: '#8E8EA0',
    marginTop: 12,
  },
  featuresSection: {
    gap: 14,
    marginBottom: 40,
    paddingHorizontal: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureDot: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F0EEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 15,
    fontFamily: 'Pretendard_500Medium',
    color: '#3A3A50',
  },
  buttonsSection: {
    gap: 0,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E1E5',
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  googleBtnText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    color: '#3A3A50',
  },
  googleSubtext: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    color: '#8E8EA0',
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
    backgroundColor: '#D1D1D6',
  },
  dividerText: {
    fontSize: 13,
    fontFamily: 'Pretendard_400Regular',
    color: '#8E8EA0',
  },
  guestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#3182F6',
    borderRadius: 12,
    paddingVertical: 16,
  },
  guestBtnText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    color: '#FFFFFF',
  },
  guestSubtext: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    color: '#8E8EA0',
    textAlign: 'center',
    marginTop: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  footer: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  footerText: {
    fontSize: 11,
    fontFamily: 'Pretendard_400Regular',
    color: '#B0B0C0',
    textAlign: 'center',
  },
});
