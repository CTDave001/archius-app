import Colors from '@/constants/Colors';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import {
  claimLegacyChats,
  migrateDbIfNeeded,
  setActiveChatUser,
} from '@/utils/Database';
import { AIConsentGate } from '@/components/AIConsentGate';
import { RevenueCatProvider } from '@/providers/RevenueCat';

// Registers the signed-in Clerk user with the DB layer so chat queries are
// scoped per account. Children are held back until the legacy-row claim
// finishes — otherwise the drawer's first getChats runs against unclaimed
// (NULL user_id) rows and the chat list flashes empty after an update.
const ScopeDbToUser = ({ children }: { children: React.ReactNode }) => {
  const { userId } = useAuth();
  const db = useSQLiteContext();
  const [readyUserId, setReadyUserId] = React.useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReadyUserId(null);
    setActiveChatUser(userId ?? null);

    (async () => {
      if (userId) {
        await claimLegacyChats(db, userId).catch(() => undefined);
      }
      if (!cancelled && userId) setReadyUserId(userId);
    })();

    return () => {
      cancelled = true;
      setActiveChatUser(null);
    };
  }, [db, userId]);

  // Fail closed while Clerk changes accounts: never render chat consumers
  // under a stale activeChatUserId, even for a single transition frame.
  if (!userId || readyUserId !== userId) return null;
  return <>{children}</>;
};

const Layout = () => {
  const router = useRouter();

  return (
    <RevenueCatProvider>
      <SQLiteProvider databaseName="chat.db" onInit={migrateDbIfNeeded}>
        <ScopeDbToUser>
        <AIConsentGate>
        <Stack
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
        </ScopeDbToUser>
      </SQLiteProvider>
    </RevenueCatProvider>
  );
};

const styles = StyleSheet.create({
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
