import DragHandle from '@/components/DragHandle';
import type { AppColors } from '@/constants/Colors';
import type { ThemeMode } from '@/constants/Themes';
import { defaultStyles } from '@/constants/Styles';
import { useRevenueCat } from '@/providers/RevenueCat';
import { useAppTheme } from '@/providers/Theme';
import { FREE_DAILY_MESSAGE_LIMIT, PRO_DAILY_FLASH_LIMIT } from '@/utils/ai';
import { resolveApiBaseUrl } from '@/utils/apiUrl';
import { useChatDatabase } from '@/providers/ChatDatabase';
import { emitChatsChanged } from '@/utils/events';
import { isHapticsEnabled, setHapticsEnabled } from '@/utils/haptics';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

const PRIVACY_URL = 'https://archius.app/privacy';
const TERMS_URL = 'https://archius.app/terms';
const COOKIES_URL = 'https://archius.app/cookies';
const SUPPORT_URL = 'mailto:hello@archius.app';

const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
const GOOGLE_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';
const WEB_CUSTOMER_PORTAL_URL = process.env.EXPO_PUBLIC_RC_CUSTOMER_PORTAL_URL?.trim();

const Settings = () => {
  const { colors: Colors, mode, setMode } = useAppTheme();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  const { signOut, getToken, userId } = useAuth({ treatPendingAsSignedOut: false });
  const { user } = useUser();
  const { isPro, restorePermissions } = useRevenueCat();
  const db = useChatDatabase();
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [hapticsOn, setHapticsOn] = useState<boolean>(isHapticsEnabled());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`${resolveApiBaseUrl()}/api/usage`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setUsage(data);
      } catch {
        // silently ignore
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const onSignOut = () => {
    // Chats are scoped per Clerk user in the local DB (v7), so signing out
    // no longer wipes them — they're invisible to other accounts and come
    // back when this account signs back in. Deleting data stays available
    // via Delete Account (and chat-level delete).
    Alert.alert(
      'Sign out?',
      Platform.OS === 'web'
        ? 'Your synced conversations will be here when you sign back in.'
        : 'Your chats stay on this device and will be here when you sign back in.',
      [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        onPress: async () => {
          await signOut();
        },
      },
      ]
    );
  };

  const onManageSubscription = async () => {
    const url =
      Platform.OS === 'web'
        ? WEB_CUSTOMER_PORTAL_URL
        : Platform.OS === 'ios'
          ? APPLE_SUBSCRIPTIONS_URL
          : GOOGLE_SUBSCRIPTIONS_URL;
    if (!url) {
      Alert.alert(
        'Manage subscription',
        'Email hello@archius.app and we’ll help with your web subscription.'
      );
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open', 'Manage your subscription through your device settings.');
    }
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      Platform.OS === 'web'
        ? 'This permanently deletes your Archius account and synced web chat history. Cancel any active subscription separately first.'
        : 'This permanently deletes your Archius account and clears chat history from this device. Your subscription must be cancelled separately through your Apple ID or Google Play account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user || !userId) {
              Alert.alert('Could not delete account', 'Your account is still loading. Try again.');
              return;
            }
            // Capture the id before deletion: Clerk clears auth state as soon
            // as the account goes away, but local cleanup still needs it.
            const deletedUserId = userId;
            // Delete the Clerk account FIRST. Only wipe local data if that
            // succeeded — otherwise a delete failure leaves the user with
            // no local chats AND an account still active.
            try {
              await user.delete();
            } catch (e: any) {
              Alert.alert('Could not delete account', e?.message ?? 'Try again later.');
              return;
            }
            try {
              await db.deleteUserChats(deletedUserId);
              emitChatsChanged();
            } catch (e: any) {
              // The account is already gone, so make the residual local-data
              // state explicit instead of silently claiming deletion worked.
              console.warn('Failed to delete local chats after account deletion', e);
              Alert.alert(
                'Account deleted',
                'Your account was deleted, but some chat data could not be removed from this device. Reinstalling Archius will clear it.'
              );
            }
          },
        },
      ]
    );
  };

  const usageLimit = isPro ? PRO_DAILY_FLASH_LIMIT : FREE_DAILY_MESSAGE_LIMIT;
  const effectiveLimit = usage?.limit || usageLimit;
  const usagePct = usage ? Math.min(1, usage.used / Math.max(1, effectiveLimit)) : 0;
  const overEighty = usage && usage.used / Math.max(1, effectiveLimit) > 0.8;

  return (
    <ScrollView
      style={[defaultStyles.pageContainer, { backgroundColor: Colors.cream }]}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: 40,
        paddingTop: Platform.OS === 'web' ? 24 : 0,
        width: '100%',
        maxWidth: 780,
        alignSelf: 'center',
      }}
      contentInsetAdjustmentBehavior="automatic">
      {Platform.OS !== 'web' && <DragHandle />}

      {/* Account */}
      <SectionHeader title="Account" />
      <Card>
        <InfoRow icon="mail-outline" label="Email" value={user?.primaryEmailAddress?.emailAddress ?? '—'} />
        <Divider />
        <InfoRow
          icon={isPro ? 'star' : 'star-outline'}
          iconTint={isPro ? Colors.blueprint : Colors.slate}
          label="Plan"
          value={isPro ? 'Pro' : 'Free'}
        />
      </Card>

      {/* Usage */}
      <SectionHeader title="Today's usage" />
      <Card>
        <View style={styles.usageWrap}>
          <View style={styles.usageHeader}>
            <Text style={styles.usageTitle}>
              {usage ? `${usage.used} / ${effectiveLimit} messages` : 'Loading…'}
            </Text>
            {!isPro && overEighty && (
              <Link href="/(auth)/(modal)/purchase" asChild>
                <Pressable hitSlop={8}>
                  <Text style={styles.upgradeInline}>Upgrade</Text>
                </Pressable>
              </Link>
            )}
          </View>
          <View style={styles.usageBar}>
            <View style={[styles.usageBarFill, { width: `${usagePct * 100}%` }]} />
          </View>
          <Text style={styles.usageHint}>
            {isPro
              ? 'Your daily allowance resets every 24 hours.'
              : 'Free tier resets every 24 hours. Pro gets 500/day.'}
          </Text>
        </View>
      </Card>

      {/* Subscription */}
      <SectionHeader title="Subscription" />
      <Card>
        {isPro ? (
          <>
            <CardRow
              icon="card-outline"
              title="Manage Subscription"
              subtitle={
                Platform.OS === 'web'
                  ? 'Open billing settings for your web plan'
                  : 'Cancel or change plan through your device account'
              }
              onPress={onManageSubscription}
            />
            <Divider />
            <CardRow
              icon="refresh-circle-outline"
              title="Restore Purchases"
              subtitle={Platform.OS === 'web' ? 'Refresh Pro access for this account' : 'Re-sync your Pro subscription on this device'}
              onPress={() => restorePermissions()}
            />
          </>
        ) : (
          <>
            <Link href="/(auth)/(modal)/purchase" asChild>
              <CardRow
                icon="rocket-outline"
                iconTint={Colors.blueprint}
                title="Upgrade to Archius Pro"
                subtitle="500 messages/day, advanced model, image input"
                titleTint={Colors.blueprint}
              />
            </Link>
            <Divider />
            <CardRow
              icon="refresh-circle-outline"
              title="Restore Purchases"
              subtitle={Platform.OS === 'web' ? 'Already paid? Refresh this account' : 'Already paid? Restore on this device'}
              onPress={() => restorePermissions()}
            />
          </>
        )}
      </Card>

      {/* About */}
      <SectionHeader title="About" />
      <Card>
        <CardRow
          icon="shield-checkmark-outline"
          title="Privacy Policy"
          subtitle="How your data is handled"
          onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
          external
        />
        <Divider />
        <CardRow
          icon="document-text-outline"
          title="Terms of Use"
          subtitle="Subscription terms and acceptable use"
          onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}
          external
        />
        <Divider />
        <CardRow
          icon="trail-sign-outline"
          title="Cookie Policy"
          subtitle="For the archius.app website"
          onPress={() => WebBrowser.openBrowserAsync(COOKIES_URL)}
          external
        />
        <Divider />
        <CardRow
          icon="chatbubble-ellipses-outline"
          title="Contact Support"
          subtitle="hello@archius.app"
          onPress={async () => {
            // Try opening the mailto: link directly. canOpenURL on iOS
            // requires LSApplicationQueriesSchemes entries to return true
            // for non-http schemes, so it gives false negatives for
            // mailto — better to just attempt and catch.
            try {
              await Linking.openURL(SUPPORT_URL);
            } catch {
              Alert.alert(
                'No mail app',
                'Email us at hello@archius.app from your browser instead.'
              );
            }
          }}
          external
        />
      </Card>

      {/* Preferences */}
      <SectionHeader title="Preferences" />
      <Card>
        <View style={styles.appearanceRow}>
          <View style={styles.preferenceHeader}>
            <View style={styles.iconSquare}>
              <Ionicons
                name={mode === 'dark' ? 'moon' : mode === 'light' ? 'sunny' : 'contrast'}
                size={20}
                color={Colors.blueprint}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Appearance</Text>
              <Text style={styles.rowSubtitle}>Choose how Archius looks on this device</Text>
            </View>
          </View>
          <View style={styles.themeSegment} accessibilityRole="radiogroup">
            {(
              [
                ['system', 'System'],
                ['light', 'Light'],
                ['dark', 'Dark'],
              ] as const satisfies readonly (readonly [ThemeMode, string])[]
            ).map(([value, label]) => {
              const selected = mode === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setMode(value)}
                  style={({ pressed }) => [
                    styles.themeOption,
                    selected && styles.themeOptionSelected,
                    pressed && !selected && styles.themeOptionPressed,
                  ]}>
                  <Text style={[styles.themeOptionText, selected && styles.themeOptionTextSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {Platform.OS !== 'web' && <Divider />}
        {Platform.OS !== 'web' && <View style={[styles.row, { paddingVertical: 12 }]}>
          <View style={styles.iconSquare}>
            <Ionicons name="pulse-outline" size={20} color={Colors.blueprint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Haptic feedback</Text>
            <Text style={styles.rowSubtitle}>
              Subtle vibrations on send, copy, and other taps
            </Text>
          </View>
          <Switch
            value={hapticsOn}
            onValueChange={(v) => {
              setHapticsOn(v);
              setHapticsEnabled(v);
            }}
            trackColor={{ false: Colors.stone, true: Colors.blueprint }}
            thumbColor="#fff"
            ios_backgroundColor={Colors.stone}
          />
        </View>}
      </Card>

      {/* Danger zone */}
      <SectionHeader title="Account actions" />
      <Card>
        <CardRow icon="log-out-outline" title="Sign Out" onPress={onSignOut} />
        <Divider />
        <CardRow
          icon="trash-outline"
          iconTint={Colors.rust}
          titleTint={Colors.rust}
          title="Delete Account"
          subtitle="Permanently deletes your account and chats"
          onPress={onDeleteAccount}
        />
      </Card>

      <Text style={styles.versionStamp}>Archius · v1.0.4</Text>
    </ScrollView>
  );
};

const SectionHeader = ({ title }: { title: string }) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <Text style={styles.sectionHeader}>{title}</Text>;
};

const Card = ({ children }: { children: React.ReactNode }) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.card}>{children}</View>;
};

const Divider = () => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.divider} />;
};

const InfoRow = ({
  icon,
  iconTint,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconTint?: string;
  label: string;
  value: string;
}) => {
  const { colors: Colors } = useAppTheme();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  return (
    <View style={styles.row}>
      <View style={[styles.iconSquare, iconTint ? { backgroundColor: iconTint + '22' } : null]}>
        <Ionicons name={icon} size={20} color={iconTint || Colors.blueprint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
};

const CardRow = ({
  icon,
  iconTint,
  title,
  titleTint,
  subtitle,
  onPress,
  external,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconTint?: string;
  title: string;
  titleTint?: string;
  subtitle?: string;
  onPress?: () => void;
  external?: boolean;
}) => {
  const { colors: Colors } = useAppTheme();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={[styles.iconSquare, iconTint ? { backgroundColor: iconTint + '22' } : null]}>
        <Ionicons name={icon} size={20} color={iconTint || Colors.blueprint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, titleTint ? { color: titleTint } : null]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {onPress && (
        <Ionicons
          name={external ? 'open-outline' : 'chevron-forward'}
          size={18}
          color={Colors.slateSoft}
        />
      )}
    </Pressable>
  );
};

const createStyles = (Colors: AppColors) => StyleSheet.create({
  sectionHeader: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.slate,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.stone,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  rowPressed: { backgroundColor: Colors.creamSoft },
  appearanceRow: { padding: 14 },
  preferenceHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  themeSegment: {
    flexDirection: 'row',
    padding: 3,
    marginTop: 14,
    borderRadius: 11,
    backgroundColor: Colors.creamSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.stone,
  },
  themeOption: {
    flex: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  themeOptionSelected: { backgroundColor: Colors.control },
  themeOptionPressed: { backgroundColor: Colors.blueprintTint12 },
  themeOptionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.slate,
  },
  themeOptionTextSelected: { color: Colors.onControl },
  iconSquare: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.blueprintTint10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.blueprintTint20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.graphite },
  rowSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.slate,
    marginTop: 3,
    opacity: 0.75,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.stone,
    marginLeft: 70,
  },
  usageWrap: { padding: 14 },
  usageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  usageTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.graphite },
  upgradeInline: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.blueprint },
  usageBar: {
    height: 6,
    backgroundColor: Colors.stone,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
  },
  usageBarFill: { height: '100%', backgroundColor: Colors.blueprint },
  usageHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.slate,
    marginTop: 8,
  },
  versionStamp: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.slateSoft,
    textAlign: 'center',
    marginTop: 28,
  },
});

export default Settings;
