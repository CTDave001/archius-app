import type { AppColors } from '@/constants/Colors';
import { useAppTheme } from '@/providers/Theme';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AIConsentGate } from '@/components/AIConsentGate';
import { ChatDatabaseProvider } from '@/providers/ChatDatabase';
import { RevenueCatProvider } from '@/providers/RevenueCat';

const Layout = () => {
  const router = useRouter();
  const { colors: Colors, resolvedTheme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(Colors), [Colors]);

  return (
    <RevenueCatProvider>
      <ChatDatabaseProvider>
        <AIConsentGate>
        <Stack
          // Native modal headers can retain their presentation-time colors.
          // Remount the navigator on an appearance change so Settings updates
          // its header and rounded sheet chrome immediately, without reopen.
          key={resolvedTheme}
          screenOptions={{
            // Match the page background so the slide transition doesn't
            // flash a different surface color in/out.
            contentStyle: { backgroundColor: Colors.cream },
            headerStyle: { backgroundColor: Colors.cream },
            headerShadowVisible: false,
            headerTintColor: Colors.ink,
            headerTitleStyle: {
              fontFamily: 'SourceSerif4_400Regular',
              color: Colors.ink,
              fontSize: 18,
            },
          }}>
          <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
          <Stack.Screen
            name="(modal)/settings"
            options={{
              headerTitle: 'Settings',
              presentation: 'modal',
              headerRight: () => (
                <Pressable
                  onPress={() => router.back()}
                  accessibilityLabel="Close settings"
                  accessibilityRole="button"
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.closeBtn,
                    pressed && styles.closeBtnPressed,
                  ]}>
                  <Ionicons name="close" size={20} color={Colors.ink} />
                </Pressable>
              ),
            }}
          />
          <Stack.Screen
            name="(modal)/purchase"
            options={{
              headerTitle: '',
              presentation: 'fullScreenModal',
              headerLeft: () => (
                <Pressable
                  onPress={() => router.back()}
                  accessibilityLabel="Close paywall"
                  accessibilityRole="button"
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.closeBtn,
                    pressed && styles.closeBtnPressed,
                  ]}>
                  <Ionicons name="close" size={22} color={Colors.ink} />
                </Pressable>
              ),
            }}
          />
        </Stack>
        </AIConsentGate>
      </ChatDatabaseProvider>
    </RevenueCatProvider>
  );
};

const createStyles = (Colors: AppColors) => StyleSheet.create({
  // 44pt touch target meeting Apple HIG, with ink color (brand) and a soft
  // tinted background so it reads as an active control rather than a
  // floating glyph on cream.
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.creamSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.stone,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  closeBtnPressed: {
    backgroundColor: Colors.stone,
  },
});

export default Layout;
