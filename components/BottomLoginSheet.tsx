import Colors from '@/constants/Colors';
import { defaultStyles } from '@/constants/Styles';
import { useSSO } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();

type Strategy = 'oauth_apple' | 'oauth_google';

const BottomLoginSheet = () => {
  const { bottom } = useSafeAreaInsets();
  const { startSSOFlow } = useSSO();
  const [pendingStrategy, setPendingStrategy] = useState<Strategy | null>(null);

  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  const onSSO = useCallback(
    async (strategy: Strategy) => {
      if (pendingStrategy) return;
      setPendingStrategy(strategy);
      try {
        const redirectUrl = Linking.createURL('oauth-native-callback');
        const result: any = await startSSOFlow({ strategy, redirectUrl });
        const { createdSessionId, signIn, signUp, setActive } = result;

        // Top-level session set on first sign-in of existing user.
        // Sign-up flow puts it on signUp.createdSessionId once requirements satisfied.
        const sessionId = createdSessionId || signUp?.createdSessionId || signIn?.createdSessionId;

        if (sessionId && setActive) {
          await setActive({ session: sessionId });
          return;
        }

        // New user via OAuth: try to auto-complete the sign-up. Clerk pulls
        // email + name from the OAuth payload but won't auto-finalize if
        // anything is "required" in the instance config.
        if (signUp && signUp.status === 'missing_requirements') {
          try {
            const updated = await signUp.update({});
            if (updated.createdSessionId && setActive) {
              await setActive({ session: updated.createdSessionId });
              return;
            }
            Alert.alert(
              'Sign-up incomplete',
              `Still missing: ${(updated.missingFields ?? []).join(', ') || 'unknown'}\nUnverified: ${(updated.unverifiedFields ?? []).join(', ') || 'none'}`
            );
            return;
          } catch (innerErr: any) {
            Alert.alert('Sign-up failed', innerErr?.message ?? 'Update step failed.');
            return;
          }
        }

        // OAuth roundtrip didn't produce a session (user likely closed the
        // browser mid-flow). Stay quiet — they can simply tap again.
      } catch (err: any) {
        if (err?.code !== 'cancelled') {
          Alert.alert(
            'Sign-in failed',
            `${err?.message ?? 'Unknown error'}\n\ncode: ${err?.code ?? 'none'}`
          );
        }
      } finally {
        setPendingStrategy(null);
      }
    },
    [pendingStrategy, startSSOFlow]
  );

  return (
    <View style={[styles.container, { paddingBottom: Math.max(bottom, 12) + 8 }]}>
      <Text style={styles.consent}>
        By continuing you agree your messages may be sent to AI providers (including
        DeepSeek in China and Google in the US) for processing. See our{' '}
        <Text
          style={styles.consentLink}
          onPress={() => WebBrowser.openBrowserAsync('https://archius.app/privacy')}>
          Privacy Policy
        </Text>
        .
      </Text>

      <TouchableOpacity
        style={[defaultStyles.btn, styles.btnLight]}
        disabled={!!pendingStrategy}
        onPress={() => onSSO('oauth_apple')}
        accessibilityLabel="Continue with Apple"
        accessibilityRole="button">
        {pendingStrategy === 'oauth_apple' ? (
          <ActivityIndicator color={Colors.ink} />
        ) : (
          <>
            <Ionicons name="logo-apple" size={16} style={styles.btnIcon} color={Colors.ink} />
            <Text style={styles.btnLightText}>Continue with Apple</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[defaultStyles.btn, styles.btnTransparent]}
        disabled={!!pendingStrategy}
        onPress={() => onSSO('oauth_google')}
        accessibilityLabel="Continue with Google"
        accessibilityRole="button">
        {pendingStrategy === 'oauth_google' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="logo-google" size={16} style={styles.btnIcon} color="#fff" />
            <Text style={styles.btnDarkText}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.divider} />

      <Link href={{ pathname: '/login', params: { type: 'register' } }} style={[defaultStyles.btn, styles.btnTransparent]} asChild>
        <TouchableOpacity
          disabled={!!pendingStrategy}
          accessibilityLabel="Sign up with email"
          accessibilityRole="button">
          <Ionicons name="mail" size={16} style={styles.btnIcon} color="#fff" />
          <Text style={styles.btnDarkText}>Sign up with email</Text>
        </TouchableOpacity>
      </Link>

      <Link href={{ pathname: '/login', params: { type: 'login' } }} asChild>
        <TouchableOpacity
          disabled={!!pendingStrategy}
          style={styles.loginRow}
          accessibilityLabel="Log in with existing account"
          accessibilityRole="link">
          <Text style={styles.loginText}>Already have an account? Log in</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: Colors.ink,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 10,
  },
  consent: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.creamSoft,
    opacity: 0.85,
    lineHeight: 18,
    marginBottom: 8,
  },
  consentLink: {
    color: Colors.blueprintLifted,
    textDecorationLine: 'underline',
  },
  btnLight: { backgroundColor: Colors.cream },
  btnLightText: { fontFamily: 'Inter_500Medium', color: Colors.ink, fontSize: 16 },
  btnTransparent: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  btnDarkText: { fontFamily: 'Inter_500Medium', color: '#fff', fontSize: 16 },
  btnIcon: { paddingRight: 8 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 4 },
  loginRow: { alignItems: 'center', paddingTop: 8 },
  loginText: { fontFamily: 'Inter_400Regular', color: Colors.blueprintLifted, fontSize: 14 },
});

export default BottomLoginSheet;
