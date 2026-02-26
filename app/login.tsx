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
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { loginAsGuest, loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState<'google' | 'guest' | null>(null);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const handleGoogleLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert(
        'Google 로그인 준비 중',
        'Google 로그인은 아직 설정 중입니다. 먼저 "바로 시작하기"를 이용해 주세요.',
      );
      return;
    }

    setLoading('google');
    try {
      const AuthSession = await import('expo-auth-session');
      const WebBrowser = await import('expo-web-browser');
      WebBrowser.maybeCompleteAuthSession();

      const redirectUri = AuthSession.makeRedirectUri({ scheme: 'soksok-voca' });
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
      Alert.alert('로그인 실패', 'Google 로그인에 실패했습니다. 다시 시도해 주세요.');
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
          <Text style={styles.appName}>쏙쏙 보카</Text>
          <Text style={styles.appNameEn}>SokSok Voca</Text>
          <Text style={styles.tagline}>AI로 만드는 나만의 영어 단어장</Text>
        </View>

        <View style={styles.featuresSection}>
          <View style={styles.featureRow}>
            <View style={styles.featureDot}>
              <Ionicons name="sparkles" size={16} color="#6C5CE7" />
            </View>
            <Text style={styles.featureText}>AI 테마 단어장 자동 생성</Text>
          </View>
          <View style={styles.featureRow}>
            <View style={styles.featureDot}>
              <Ionicons name="card-outline" size={16} color="#6C5CE7" />
            </View>
            <Text style={styles.featureText}>플래시카드 & 퀴즈 학습</Text>
          </View>
          <View style={styles.featureRow}>
            <View style={styles.featureDot}>
              <Ionicons name="volume-high-outline" size={16} color="#6C5CE7" />
            </View>
            <Text style={styles.featureText}>쉐도잉 & 발음 연습</Text>
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
            title="Google로 로그인"
            style={styles.googleBtn}
            textStyle={styles.googleBtnText}
          />
          <Text style={styles.googleSubtext}>다른 기기에서도 단어장을 동기화할 수 있어요</Text>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>또는</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            onPress={handleGuestLogin}
            loading={loading === 'guest'}
            disabled={loading !== null}
            variant="primary"
            icon="phone-portrait-outline"
            title="바로 시작하기"
            style={styles.guestBtn}
            textStyle={styles.guestBtnText}
          />
          <Text style={styles.guestSubtext}>
            회원가입 없이 이 기기에서 바로 사용할 수 있어요
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Platform.OS === 'web' ? 34 + 16 : insets.bottom + 16 }]}>
        <Text style={styles.footerText}>
          계속하면 서비스 이용약관에 동의하는 것으로 간주합니다
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFC',
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
    borderRadius: 24,
    backgroundColor: '#6C5CE7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  appName: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    color: '#1A1A2E',
    letterSpacing: -1,
  },
  appNameEn: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#6C5CE7',
    marginTop: 4,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
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
    fontFamily: 'Inter_500Medium',
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
    fontFamily: 'Inter_600SemiBold',
    color: '#3A3A50',
  },
  googleSubtext: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
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
    fontFamily: 'Inter_400Regular',
    color: '#8E8EA0',
  },
  guestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#6C5CE7',
    borderRadius: 14,
    paddingVertical: 16,
  },
  guestBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  guestSubtext: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
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
    fontFamily: 'Inter_400Regular',
    color: '#B0B0C0',
    textAlign: 'center',
  },
});
