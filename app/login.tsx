import BrandMark from '@/components/BrandMark';
import DragHandle from '@/components/DragHandle';
import Colors from '@/constants/Colors';
import { defaultStyles } from '@/constants/Styles';
import { resolveApiBaseUrl } from '@/utils/apiUrl';
import { useAuth, useSignIn, useSignUp } from '@clerk/clerk-expo';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Mode = 'form' | 'verify';

// The App Review demo account can't receive Client Trust email codes (the
// reviewer has no inbox access), so its device-verification challenge is
// resolved through a server-minted sign-in ticket instead. Applies to this
// single, publicly-known demo identity only — see app/api/review-signin.
const REVIEW_DEMO_EMAIL = 'appreview@archius.app';

const Login = () => {
  const { type } = useLocalSearchParams<{ type: string }>();
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth({
    treatPendingAsSignedOut: false,
  });
  const { signIn, setActive, isLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded, setActive: signupSetActive } = useSignUp();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<Mode>('form');
  // The verify screen serves two flows: sign-up email verification, and
  // sign-in device verification (Clerk "Client Trust" sends an email code
  // when signing in from an unrecognized device — e.g. App Review's iPad).
  const [verifyContext, setVerifyContext] = useState<'signup' | 'signin'>('signup');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isSignUp = type !== 'login';

  const validate = (forSignUp: boolean): string | null => {
    if (!emailAddress.includes('@') || emailAddress.length < 5) {
      return 'Enter a valid email address.';
    }
    if (forSignUp) {
      if (password.length < 8) return 'Password must be at least 8 characters.';
      if (!/[a-z]/i.test(password) || !/[0-9]/.test(password)) {
        return 'Password must contain letters and at least one number.';
      }
    } else if (!password) {
      return 'Enter your password.';
    }
    return null;
  };

  const clearError = () => {
    if (errorMsg) setErrorMsg(null);
  };

  const friendlyClerkError = (err: any, fallback: string): string => {
    const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? err?.message;
    return typeof msg === 'string' && msg.length > 0 ? msg : fallback;
  };

  const onSignInPress = async () => {
    if (!isLoaded) {
      setErrorMsg('Still connecting — give it a second and try again.');
      return;
    }
    const v = validate(false);
    if (v) {
      setErrorMsg(v);
      return;
    }
    setErrorMsg(null);
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: emailAddress, password });
      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
      } else if (result.status === 'needs_second_factor') {
        // Client Trust: password was correct, but this device is new to the
        // account, so Clerk requires an email code on top.
        if (emailAddress.toLowerCase().trim() === REVIEW_DEMO_EMAIL) {
          // Demo account: trade the (already password-checked) credentials
          // for a sign-in ticket so the reviewer never needs inbox access.
          const res = await fetch(`${resolveApiBaseUrl()}/api/review-signin`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: emailAddress.trim(), password }),
          });
          if (res.ok) {
            const { ticket } = await res.json();
            const ticketResult = await signIn.create({ strategy: 'ticket', ticket } as any);
            if (ticketResult.status === 'complete' && ticketResult.createdSessionId) {
              await setActive({ session: ticketResult.createdSessionId });
              return;
            }
          }
          // Bridge unavailable — fall through to the normal code flow.
        }
        await signIn.prepareSecondFactor({ strategy: 'email_code' } as any);
        setVerifyContext('signin');
        setMode('verify');
      } else {
        setErrorMsg(
          'Your account needs an extra verification step. Reach out to hello@archius.app and we can help.'
        );
      }
    } catch (err: any) {
      setErrorMsg(friendlyClerkError(err, 'Sign-in failed. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const onSignUpPress = async () => {
    if (!signUpLoaded) {
      setErrorMsg('Still connecting — give it a second and try again.');
      return;
    }
    const v = validate(true);
    if (v) {
      setErrorMsg(v);
      return;
    }
    setErrorMsg(null);
    setLoading(true);
    try {
      const result = await signUp.create({ emailAddress, password });
      if (result.status === 'complete' && result.createdSessionId) {
        await signupSetActive({ session: result.createdSessionId });
        return;
      }
      // Email verification required — Clerk's default for password signups.
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setVerifyContext('signup');
      setMode('verify');
    } catch (err: any) {
      setErrorMsg(friendlyClerkError(err, 'Sign-up failed. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const onVerifyPress = async () => {
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      setErrorMsg('Enter the 6-digit code we sent you.');
      return;
    }
    setErrorMsg(null);
    setLoading(true);
    try {
      if (verifyContext === 'signin') {
        if (!isLoaded || !signIn) return;
        const result = await signIn.attemptSecondFactor({
          strategy: 'email_code',
          code: trimmed,
        } as any);
        if (result.status === 'complete' && result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
        } else {
          setErrorMsg("That code didn't verify. Check the email or tap Resend.");
        }
        return;
      }
      if (!signUpLoaded) return;
      const result = await signUp.attemptEmailAddressVerification({ code: trimmed });
      if (result.status === 'complete' && result.createdSessionId) {
        await signupSetActive({ session: result.createdSessionId });
      } else {
        setErrorMsg('That code didn\'t verify. Check the email or tap Resend.');
      }
    } catch (err: any) {
      setErrorMsg(friendlyClerkError(err, 'Verification failed.'));
    } finally {
      setLoading(false);
    }
  };

  const onResendCode = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      if (verifyContext === 'signin') {
        if (!isLoaded || !signIn) return;
        await signIn.prepareSecondFactor({ strategy: 'email_code' } as any);
      } else {
        if (!signUpLoaded) return;
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      }
      setErrorMsg('New code sent.');
    } catch (err: any) {
      setErrorMsg(friendlyClerkError(err, 'Could not resend code.'));
    } finally {
      setLoading(false);
    }
  };

  const onChangeEmail = () => {
    setMode('form');
    setCode('');
    setErrorMsg(null);
  };

  if (!isAuthLoaded) return null;
  if (isSignedIn) return <Redirect href="/(auth)/(drawer)/(chat)/new" />;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      style={[defaultStyles.pageContainer, styles.container]}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      <DragHandle />
      <View style={styles.markRow}>
        <BrandMark size={42} color={Colors.ink} />
      </View>

      {mode === 'form' ? (
        <>
          <Text style={styles.title}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </Text>
          <Text style={styles.subtitle}>
            {isSignUp
              ? 'Pick an email and password to get started.'
              : 'Sign in to continue.'}
          </Text>

          <View style={styles.form}>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
              placeholderTextColor={Colors.slateSoft}
              value={emailAddress}
              onChangeText={(t) => {
                setEmailAddress(t);
                clearError();
              }}
              style={styles.inputField}
            />
            <View style={styles.passwordRow}>
              <TextInput
                placeholder="Password"
                placeholderTextColor={Colors.slateSoft}
                autoComplete={isSignUp ? 'password-new' : 'password'}
                textContentType={isSignUp ? 'newPassword' : 'password'}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  clearError();
                }}
                secureTextEntry={!showPassword}
                style={[styles.inputField, { flex: 1 }]}
              />
              <Pressable
                onPress={() => setShowPassword((s) => !s)}
                hitSlop={10}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                style={styles.eyeBtn}>
                <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>
            {isSignUp && (
              <Text style={styles.helperText}>
                At least 8 characters, with letters and a number.
              </Text>
            )}
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
          </View>

          <TouchableOpacity
            style={[defaultStyles.btn, styles.btnPrimary]}
            onPress={isSignUp ? onSignUpPress : onSignInPress}
            accessibilityLabel={isSignUp ? 'Create account' : 'Log in'}
            accessibilityRole="button">
            <Text style={styles.btnPrimaryText}>
              {isSignUp ? 'Create account' : 'Log in'}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to {emailAddress}. Enter it below to finish{' '}
            {verifyContext === 'signin' ? 'signing in' : 'creating your account'}.
          </Text>

          <View style={styles.form}>
            <TextInput
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              autoFocus
              maxLength={8}
              placeholder="123456"
              placeholderTextColor={Colors.slateSoft}
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/[^0-9]/g, ''));
                clearError();
              }}
              style={[styles.inputField, styles.codeField]}
            />
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
          </View>

          <TouchableOpacity
            style={[defaultStyles.btn, styles.btnPrimary]}
            onPress={onVerifyPress}
            accessibilityLabel="Verify email and finish signup"
            accessibilityRole="button">
            <Text style={styles.btnPrimaryText}>Verify and finish</Text>
          </TouchableOpacity>

          <View style={styles.linkRow}>
            <Pressable onPress={onResendCode} hitSlop={8}>
              <Text style={styles.linkText}>Resend code</Text>
            </Pressable>
            <Text style={styles.linkSep}>·</Text>
            <Pressable onPress={onChangeEmail} hitSlop={8}>
              <Text style={styles.linkText}>Use a different email</Text>
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(31, 68, 88, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  markRow: { alignItems: 'center', marginTop: 32, marginBottom: 24 },
  title: {
    fontFamily: 'SourceSerif4_400Regular',
    fontSize: 28,
    color: Colors.ink,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.slate,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 21,
    paddingHorizontal: 4,
  },
  form: { marginBottom: 24, gap: 12 },
  inputField: {
    height: 50,
    borderWidth: 1,
    borderColor: Colors.stone,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: Colors.graphite,
    backgroundColor: '#fff',
  },
  codeField: {
    textAlign: 'center',
    letterSpacing: 8,
    fontSize: 22,
    fontFamily: 'JetBrainsMono_400Regular',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  eyeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.blueprint,
  },
  btnPrimary: { backgroundColor: Colors.ink },
  btnPrimaryText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
    fontSize: 16,
  },
  helperText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.slateSoft,
    marginTop: 2,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.rust,
    marginTop: 4,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  linkText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.blueprint,
  },
  linkSep: { color: Colors.slateSoft },
});

export default Login;
