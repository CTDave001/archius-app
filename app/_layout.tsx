import { ArchiusSplash } from '@/components/ArchiusSplash';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import type { AppColors } from '@/constants/Colors';
import { ThemeProvider, useAppTheme } from '@/providers/Theme';
import { StatusBar } from 'expo-status-bar';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts as useInterFonts,
} from '@expo-google-fonts/inter';
import {
  JetBrainsMono_400Regular,
  useFonts as useMonoFonts,
} from '@expo-google-fonts/jetbrains-mono';
import {
  SourceSerif4_300Light,
  SourceSerif4_300Light_Italic,
  SourceSerif4_400Regular,
  useFonts as useSerifFonts,
} from '@expo-google-fonts/source-serif-4';
import { Slot, SplashScreen, Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const InitialLayout = ({ onReady }: { onReady: () => void }) => {
  const { colors } = useAppTheme();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded) onReady();
  }, [isLoaded, onReady]);

  useEffect(() => {
    if (!isLoaded) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (isSignedIn && !inAuthGroup) {
      router.replace('/(auth)/(drawer)/(chat)/new');
    } else if (!isSignedIn && inAuthGroup) {
      router.replace('/');
    }
  }, [isSignedIn, isLoaded, segments, router]);

  if (!isLoaded) {
    return <Slot />;
  }

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.cream },
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="login"
        options={{
          presentation: Platform.OS === 'web' ? 'card' : 'modal',
          headerShown: Platform.OS === 'web' ? false : undefined,
          title: '',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              accessibilityLabel="Close login"
              accessibilityRole="button"
              hitSlop={8}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
    </Stack>
  );
};

const MissingClerkKey = () => {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        justifyContent: 'center',
        backgroundColor: colors.cream,
      }}>
      <Text
        style={{
          fontFamily: 'Inter_600SemiBold',
          fontSize: 18,
          marginBottom: 8,
          color: colors.graphite,
        }}>
        Missing Clerk publishable key
      </Text>
      <Text
        style={{
          fontFamily: 'Inter_400Regular',
          fontSize: 14,
          color: colors.slate,
          lineHeight: 20,
        }}>
        Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env file and restart the dev server. You can
        get a key by creating a free app at clerk.com.
      </Text>
    </View>
  );
};

// Catches render-time errors anywhere in the tree. In release builds an
// uncaught render error is FATAL (RCTExceptionsManager aborts the process) —
// App Review rejected build 9 for exactly this crash signature. Showing a
// recovery screen keeps the app alive and makes the error readable.
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode; colors: AppColors },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[RootErrorBoundary]', error, info.componentStack);
    SplashScreen.hideAsync().catch(() => undefined);
  }

  render() {
    if (this.state.error) {
      const { colors } = this.props;
      const message = __DEV__
        ? this.state.error.message || String(this.state.error)
        : 'Please try again. If the problem continues, close and reopen Archius.';
      const stack = __DEV__
        ? (this.state.error.stack || '').split('\n').slice(0, 8).join('\n')
        : '';
      return (
        <View style={{ flex: 1, backgroundColor: colors.cream, paddingTop: 80 }}>
          <ScrollView style={{ paddingHorizontal: 24 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: '600',
                color: colors.ink,
                marginBottom: 12,
              }}>
              Something went wrong
            </Text>
            <Text selectable style={{ fontSize: 13, color: colors.graphite, lineHeight: 18 }}>
              {message}
              {stack ? `\n\n${stack}` : ''}
            </Text>
            <TouchableOpacity
              onPress={() => this.setState({ error: null })}
              accessibilityRole="button"
              style={{
                marginTop: 24,
                backgroundColor: colors.control,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
              }}>
              <Text style={{ color: colors.onControl, fontSize: 16, fontWeight: '600' }}>Try again</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const RootLayoutNav = () => {
  const { colors, resolvedTheme } = useAppTheme();
  const [interLoaded] = useInterFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [serifLoaded] = useSerifFonts({
    SourceSerif4_300Light,
    SourceSerif4_300Light_Italic,
    SourceSerif4_400Regular,
  });
  const [monoLoaded] = useMonoFonts({
    JetBrainsMono_400Regular,
  });

  const [clerkReady, setClerkReady] = useState(false);
  const [splashDone, setSplashDone] = useState(Platform.OS === 'web');

  const fontsLoaded = interLoaded && serifLoaded && monoLoaded;
  // Force render after a max wait even if fonts or Clerk hang (production
  // builds have had cases of either gate never resolving — env-var/asset/
  // network — and we'd rather show fallback fonts than stare at the icon).
  const [forceMount, setForceMount] = useState(false);
  // Both gates must be true before we let the native splash drop — otherwise
  // the user sees a flash of partially-mounted UI (mid-animating
  // AnimatedIntro, etc.) before the JS splash overlay can take over.
  const readyToHandoff = (fontsLoaded || forceMount) && (clerkReady || forceMount);

  useEffect(() => {
    if (readyToHandoff) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [readyToHandoff]);

  // SAFETY NET: if either gate never resolves in production (rare in dev),
  // force-mount so the user sees the landing/login instead of staring at
  // the icon. Fonts fall back to system; Clerk fallback shows MissingClerkKey
  // if the publishable key isn't bundled.
  useEffect(() => {
    const hideSplash = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => undefined);
      setForceMount(true);
    }, 4000);
    return () => clearTimeout(hideSplash);
  }, []);

  if (!fontsLoaded && !forceMount) {
    return null; // keep native splash visible (capped by the safety net above)
  }

  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.cream }}>
        <MissingClerkKey />
      </GestureHandlerRootView>
    );
  }

  return (
    // Clerk's supported SecureStore-backed cache persists the native client
    // token across force-closes. Without it, Clerk falls back to memory and a
    // cold launch looks like a signed-out device.
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.cream }}>
        <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
        <InitialLayout onReady={() => setClerkReady(true)} />
        {Platform.OS !== 'web' && readyToHandoff && !splashDone && (
          <ArchiusSplash onFinish={() => setSplashDone(true)} />
        )}
      </GestureHandlerRootView>
    </ClerkProvider>
  );
};

const RootWithBoundary = () => {
  const { colors } = useAppTheme();
  return (
    <RootErrorBoundary colors={colors}>
      <RootLayoutNav />
    </RootErrorBoundary>
  );
};

const Root = () => (
  <ThemeProvider>
    <RootWithBoundary />
  </ThemeProvider>
);

export default Root;
