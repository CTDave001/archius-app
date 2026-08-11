import BrandMark from '@/components/BrandMark';
import PopoverMenu, { type PopoverAnchor, type PopoverItem } from '@/components/PopoverMenu';
import type { AppColors } from '@/constants/Colors';
import { useRevenueCat } from '@/providers/RevenueCat';
import { useThemeColors } from '@/providers/Theme';
import { useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { tap } from '@/utils/haptics';
import {
  DrawerContentScrollView,
  useDrawerStatus,
} from '@react-navigation/drawer';
import { DrawerActions } from '@react-navigation/native';
import {
  BUCKET_LABELS,
  bucketChat,
  type ChatBucket,
} from '@/utils/Database';
import { useChatDatabase } from '@/providers/ChatDatabase';
import { emitChatsChanged, onChatsChanged } from '@/utils/events';
import { Chat } from '@/utils/Interfaces';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { useEffect, useMemo, useRef, useState } from 'react';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Custom chat row with pressable feedback and a visible overflow `…` button
// that opens an anchored popover menu (not a full-screen action sheet).
const ChatRow = ({
  chat,
  isActive,
  onPress,
  onDelete,
  onOpenMenu,
}: {
  chat: Chat;
  isActive: boolean;
  onPress: () => void;
  onDelete: () => void;
  onOpenMenu: (anchor: PopoverAnchor) => void;
}) => {
  const Colors = useThemeColors();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  const moreRef = useRef<View>(null);

  const openMenu = () => {
    tap();
    moreRef.current?.measureInWindow((x, y, width, height) => {
      onOpenMenu({ x, y, width, height });
    });
  };

  return (
    <Swipeable
      renderRightActions={() => (
        <Pressable
          onPress={onDelete}
          accessibilityLabel={`Delete ${chat.title}`}
          style={({ pressed }) => [
            styles.swipeDeleteAction,
            pressed && { opacity: 0.85 },
          ]}>
          <Ionicons name="trash" size={20} color={Colors.onControl} />
          <Text style={styles.swipeDeleteText}>Delete</Text>
        </Pressable>
      )}
      overshootRight={false}
      friction={2}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.chatRowOuter,
          isActive && styles.chatRowActive,
          pressed && !isActive && styles.chatRowPressed,
        ]}>
        <Text
          style={[
            styles.chatRowTitle,
            isActive && { fontFamily: 'Inter_600SemiBold', color: Colors.ink },
          ]}
          numberOfLines={1}>
          {chat.title}
        </Text>
        <View ref={moreRef} collapsable={false}>
          <Pressable
            onPress={openMenu}
            hitSlop={10}
            accessibilityLabel={`More actions for ${chat.title}`}
            style={({ pressed }) => [
              styles.chatRowMore,
              pressed && { backgroundColor: Colors.stone },
            ]}>
            <Ionicons name="ellipsis-horizontal" size={18} color={Colors.slateSoft} />
          </Pressable>
        </View>
      </Pressable>
    </Swipeable>
  );
};

export const CustomDrawerContent = (props: any) => {
  const Colors = useThemeColors();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  const { bottom, top } = useSafeAreaInsets();
  const db = useChatDatabase();
  const isDrawerOpen = useDrawerStatus() === 'open';
  type ChatRowData = Chat & { updated_at: string | null };
  const [history, setHistory] = useState<ChatRowData[]>([]);
  const [query, setQuery] = useState('');
  const [renameTarget, setRenameTarget] = useState<{ id: number; title: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [menuState, setMenuState] = useState<{ anchor: PopoverAnchor; chat: ChatRowData } | null>(
    null
  );
  const router = useRouter();
  const { user } = useUser();
  const { isPro } = useRevenueCat();
  const { id: activeId } = useLocalSearchParams<{ id?: string }>();
  const displayName =
    user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || 'Account';

  // Reload only when drawer opens (not on close — pointless work) AND on
  // any in-app chats-changed event (new chat created, message persisted,
  // title generated, rename, delete). Search-effect handles query changes
  // separately so we don't fight it with full-list reloads.
  useEffect(() => {
    if (isDrawerOpen) {
      Keyboard.dismiss();
      if (!query.trim()) loadChats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawerOpen]);

  useEffect(() => {
    return onChatsChanged(() => {
      if (!query.trim()) loadChats();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const loadChats = async () => {
    try {
      const result = await db.getChats();
      setHistory(result as ChatRowData[]);
    } catch (e) {
      console.warn('Failed to load chats', e);
    }
  };

  // When query is non-empty, search both titles and message content with a
  // small debounce so we don't run a JOIN on every keystroke. When query is
  // cleared, snap back to the unfiltered list.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      loadChats();
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      db.searchChats(q)
        .then((rows) => {
          if (!cancelled) setHistory(rows as ChatRowData[]);
        })
        .catch(() => undefined);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Group chats by date bucket. Order preserved within each bucket since
  // getChats() / searchChats() already sort by updated_at desc.
  const grouped = useMemo(() => {
    const buckets: { bucket: ChatBucket; chats: ChatRowData[] }[] = [
      { bucket: 'today', chats: [] },
      { bucket: 'yesterday', chats: [] },
      { bucket: 'thisWeek', chats: [] },
      { bucket: 'earlier', chats: [] },
    ];
    for (const chat of history) {
      const b = bucketChat(chat.updated_at);
      buckets.find((g) => g.bucket === b)!.chats.push(chat);
    }
    return buckets.filter((g) => g.chats.length > 0);
  }, [history]);

  const onDeleteChat = (chatId: number, chatTitle: string) => {
    Alert.alert(
      'Delete chat?',
      `"${chatTitle}" and all its messages will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.deleteChat(chatId);
              emitChatsChanged();
              // If we just deleted the chat the user is currently viewing,
              // bounce them to /new so they're not stuck on a dead route.
              if (String(chatId) === activeId) {
                router.replace('/(auth)/(drawer)/(chat)/new');
              }
            } catch (e: any) {
              Alert.alert('Could not delete', e?.message ?? 'Try again later.');
            }
          },
        },
      ]
    );
  };

  const onRenameChat = (chatId: number, currentTitle: string) => {
    // Cross-platform rename modal. Alert.prompt is iOS-only and doesn't
    // pre-fill — using our own Modal gives us a TextInput with the current
    // title pre-populated on both platforms.
    setRenameTarget({ id: chatId, title: currentTitle });
    setRenameDraft(currentTitle);
  };

  const onRenameConfirm = async () => {
    if (!renameTarget) return;
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === renameTarget.title) {
      setRenameTarget(null);
      return;
    }
    try {
      await db.renameChat(renameTarget.id, trimmed.slice(0, 100));
      emitChatsChanged();
    } catch (e: any) {
      Alert.alert('Could not rename', e?.message ?? 'Try again later.');
    } finally {
      setRenameTarget(null);
    }
  };

  // DrawerContentScrollView wraps DrawerContentScrollView/SafeAreaView
  // semantics — it already inserts the top safe-area padding. Adding our
  // own `marginTop: top` here resulted in double padding (~30pt cream gap
  // above the search box). Use a plain View and let the inner ScrollView
  // handle insets.
  return (
    <View style={{ flex: 1, backgroundColor: Colors.cream }}>
      <View style={{ backgroundColor: Colors.cream, paddingTop: top, paddingBottom: 10 }}>
        <View style={styles.searchSection}>
          <Ionicons style={styles.searchIcon} name="search" size={18} color={Colors.slateSoft} />
          <TextInput
            style={styles.input}
            placeholder="Search chats"
            placeholderTextColor={Colors.slateSoft}
            underlineColorAndroid="transparent"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <DrawerContentScrollView
        {...props}
        contentContainerStyle={{ backgroundColor: Colors.cream, paddingTop: 0 }}>
        {/* New chat — custom row with proper icon/label spacing (the default
            DrawerItemList rendering overlapped the mark and the label). */}
        <Pressable
          accessibilityLabel="Start a new chat"
          accessibilityRole="button"
          onPress={() => {
            tap();
            props?.navigation?.closeDrawer?.();
            router.replace('/(auth)/(drawer)/(chat)/new');
          }}
          style={({ pressed }) => [
            styles.newChatRow,
            pressed && styles.newChatRowPressed,
          ]}>
          <View style={styles.newChatIcon}>
            <BrandMark size={16} color={Colors.onControl} />
          </View>
          <Text style={styles.newChatLabel}>New chat</Text>
          <Ionicons name="create-outline" size={18} color={Colors.slateSoft} />
        </Pressable>

        {history.length === 0 && query.length > 0 && (
          <Text style={styles.emptyHint}>No chats match "{query}"</Text>
        )}
        {history.length === 0 && query.length === 0 && (
          <Text style={styles.emptyHint}>
            No chats yet. Tap “New chat” above to start.
          </Text>
        )}
        {grouped.map((group) => (
          <View key={group.bucket}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderTitle}>
                {BUCKET_LABELS[group.bucket]}
              </Text>
              <View style={styles.sectionCountBadge}>
                <Text style={styles.sectionCountBadgeText}>
                  {group.chats.length}
                </Text>
              </View>
            </View>
            {group.chats.map((chat) => {
              const isActive = String(chat.id) === activeId;
              return (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  isActive={isActive}
                  onPress={() => {
                    tap();
                    // Close the drawer on selection — leaving it open after
                    // navigation feels broken. Use replace (not push) so the
                    // back stack doesn't accumulate every chat the user has
                    // ever opened in this session.
                    props?.navigation?.closeDrawer?.();
                    router.replace(`/(auth)/(drawer)/(chat)/${chat.id}`);
                  }}
                  onDelete={() => onDeleteChat(chat.id, chat.title)}
                  onOpenMenu={(anchor) => setMenuState({ anchor, chat })}
                />
              );
            })}
          </View>
        ))}
      </DrawerContentScrollView>

      <View style={[styles.footerWrap, { paddingBottom: Math.max(bottom, 10) }]}>
        <Link href="/(auth)/(modal)/settings" asChild>
          <TouchableOpacity style={styles.footer}>
            {user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarLetter}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.userBlock}>
              <Text style={styles.userName} numberOfLines={1}>
                {displayName}
              </Text>
              <View style={styles.planRow}>
                <View
                  style={[
                    styles.planBadge,
                    isPro ? styles.planBadgePro : styles.planBadgeFree,
                  ]}>
                  <Text
                    style={[
                      styles.planBadgeText,
                      isPro && { color: Colors.onControl },
                    ]}>
                    {isPro ? 'PRO' : 'FREE'}
                  </Text>
                </View>
                <Text style={styles.planHint}>· Settings</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.slateSoft} />
          </TouchableOpacity>
        </Link>
      </View>

      <PopoverMenu
        visible={!!menuState}
        anchor={menuState?.anchor ?? null}
        onClose={() => setMenuState(null)}
        items={
          menuState
            ? [
                {
                  key: 'rename',
                  label: 'Rename',
                  icon: 'pencil-outline',
                  onPress: () => onRenameChat(menuState.chat.id, menuState.chat.title),
                },
                {
                  key: 'delete',
                  label: 'Delete',
                  icon: 'trash-outline',
                  destructive: true,
                  onPress: () => onDeleteChat(menuState.chat.id, menuState.chat.title),
                },
              ]
            : []
        }
      />

      <Modal
        visible={!!renameTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.renameBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setRenameTarget(null)}
            accessibilityLabel="Dismiss rename dialog"
          />
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>Rename chat</Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              autoFocus
              selectTextOnFocus
              maxLength={100}
              placeholder="Chat title"
              placeholderTextColor={Colors.slateSoft}
              style={styles.renameInput}
              returnKeyType="done"
              onSubmitEditing={onRenameConfirm}
            />
            <View style={styles.renameRow}>
              <TouchableOpacity
                onPress={() => setRenameTarget(null)}
                style={styles.renameBtnGhost}
                accessibilityLabel="Cancel rename">
                <Text style={styles.renameBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onRenameConfirm}
                style={styles.renameBtnPrimary}
                accessibilityLabel="Save new chat name">
                <Text style={styles.renameBtnPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const Layout = () => {
  const dimensions = useWindowDimensions();
  const Colors = useThemeColors();
  const styles = useMemo(() => createStyles(Colors), [Colors]);

  return (
    <Drawer
      drawerContent={CustomDrawerContent}
      screenOptions={({ navigation }) => ({
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => {
              tap();
              navigation.dispatch(DrawerActions.toggleDrawer());
            }}
            accessibilityLabel="Open chats"
            hitSlop={12}
            style={styles.hamburgerBtn}>
            <Ionicons name="menu" size={20} color={Colors.ink} />
          </TouchableOpacity>
        ),
        headerStyle: { backgroundColor: Colors.cream },
        headerShadowVisible: false,
        headerTitleStyle: {
          fontFamily: 'SourceSerif4_400Regular',
          color: Colors.ink,
          fontSize: 20,
        },
        drawerActiveBackgroundColor: Colors.creamSoft,
        drawerActiveTintColor: Colors.ink,
        drawerInactiveTintColor: Colors.graphite,
        overlayColor: Colors.inkScrim40,
        // The drawer body is fully custom (CustomDrawerContent renders its own
        // New Chat row + chat list), so hide the default DrawerItemList items.
        drawerItemStyle: { display: 'none', height: 0 },
        drawerStyle: { width: dimensions.width * 0.82, backgroundColor: Colors.cream },
      })}>
      <Drawer.Screen
        name="(chat)/new"
        options={{
          title: 'Archius',
          headerRight: () => (
            <Link href={'/(auth)/(drawer)/(chat)/new'} replace asChild>
              <TouchableOpacity
                accessibilityLabel="Start a new chat"
                accessibilityRole="button"
                hitSlop={8}>
                <Ionicons
                  name="create-outline"
                  size={22}
                  color={Colors.ink}
                  style={{ marginRight: 16 }}
                />
              </TouchableOpacity>
            </Link>
          ),
        }}
      />
      <Drawer.Screen
        name="(chat)/[id]"
        options={{
          drawerItemStyle: { display: 'none' },
          headerRight: () => (
            <Link href={'/(auth)/(drawer)/(chat)/new'} replace asChild>
              <TouchableOpacity
                accessibilityLabel="Start a new chat"
                accessibilityRole="button"
                hitSlop={8}>
                <Ionicons
                  name="create-outline"
                  size={22}
                  color={Colors.ink}
                  style={{ marginRight: 16 }}
                />
              </TouchableOpacity>
            </Link>
          ),
        }}
      />
    </Drawer>
  );
};

const createStyles = (Colors: AppColors) => StyleSheet.create({
  searchSection: {
    marginHorizontal: 16,
    borderRadius: 10,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.creamSoft,
    borderWidth: 1,
    borderColor: Colors.stone,
  },
  searchIcon: { padding: 8 },
  input: {
    flex: 1,
    paddingVertical: 8,
    paddingRight: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.graphite,
  },
  newChatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 4,
    paddingLeft: 12,
    paddingRight: 14,
    minHeight: 48,
    borderRadius: 12,
  },
  newChatRowPressed: {
    backgroundColor: Colors.creamSoft,
  },
  newChatIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatLabel: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.ink,
  },
  hamburgerBtn: {
    marginLeft: 12,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.creamSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.stone,
  },
  chatRowOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 6,
    minHeight: 44,
    marginHorizontal: 8,
    marginVertical: 1,
    borderRadius: 12,
    gap: 8,
  },
  chatRowPressed: {
    backgroundColor: Colors.creamSoft,
  },
  chatRowActive: {
    backgroundColor: Colors.blueprintTint10,
  },
  chatRowTitle: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.slate,
  },
  chatRowMore: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeDeleteAction: {
    backgroundColor: Colors.rust,
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    marginVertical: 1,
    marginRight: 8,
    borderRadius: 12,
  },
  swipeDeleteText: {
    fontFamily: 'Inter_600SemiBold',
    color: Colors.onControl,
    fontSize: 12,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
    gap: 4,
  },
  sectionHeaderTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: Colors.slate,
    letterSpacing: 0.1,
    marginLeft: 2,
  },
  sectionCountBadge: {
    backgroundColor: Colors.blueprintTint12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginLeft: 6,
  },
  sectionCountBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.blueprint,
  },
  emptyHint: {
    fontFamily: 'Inter_400Regular',
    color: Colors.slateSoft,
    fontSize: 13,
    marginHorizontal: 20,
    marginVertical: 12,
  },
  footerWrap: {
    padding: 16,
    backgroundColor: Colors.cream,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.stone,
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 12 },
  avatarFallback: {
    backgroundColor: Colors.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontFamily: 'Inter_600SemiBold', color: Colors.onControl, fontSize: 17 },
  userBlock: { flex: 1, marginRight: 4 },
  userName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.graphite,
  },
  planRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 4 },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  planBadgeFree: { backgroundColor: Colors.stone },
  planBadgePro: { backgroundColor: Colors.blueprint },
  planBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.5,
    color: Colors.slate,
  },
  planHint: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.slateSoft },
  renameBackdrop: {
    flex: 1,
    backgroundColor: Colors.inkScrim40,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  renameCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.stone,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 10,
  },
  renameTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.ink,
    marginBottom: 12,
  },
  renameInput: {
    height: 44,
    borderWidth: 1,
    borderColor: Colors.stone,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.graphite,
    backgroundColor: Colors.surface,
    marginBottom: 16,
  },
  renameRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  renameBtnGhost: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  renameBtnGhostText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.slate,
  },
  renameBtnPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.control,
  },
  renameBtnPrimaryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.onControl,
  },
});

export default Layout;
