import BrandMark from '@/components/BrandMark';
import type { AppColors } from '@/constants/Colors';
import { useChatDatabase } from '@/providers/ChatDatabase';
import { useRevenueCat } from '@/providers/RevenueCat';
import { useThemeColors } from '@/providers/Theme';
import { BUCKET_LABELS, bucketChat, type ChatBucket } from '@/utils/Database';
import { emitChatsChanged, onChatsChanged } from '@/utils/events';
import { useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

type ChatRow = { id: number; title: string; updated_at: string | null };

const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const Colors = useThemeColors();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  const db = useChatDatabase();
  const router = useRouter();
  const { user } = useUser();
  const { isPro } = useRevenueCat();
  const { id: activeId } = useLocalSearchParams<{ id?: string }>();
  const [history, setHistory] = useState<ChatRow[]>([]);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const displayName =
    user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || 'Account';

  const load = async (search = query.trim()) => {
    try {
      setHistory(search ? await db.searchChats(search) : await db.getChats());
    } catch (error) {
      console.warn('Failed to load synced chats', error);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => void load(query.trim()), query.trim() ? 180 : 0);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, db]);

  useEffect(
    () => onChatsChanged(() => void load()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, query]
  );

  const grouped = useMemo(() => {
    const buckets: { bucket: ChatBucket; chats: ChatRow[] }[] = [
      { bucket: 'today', chats: [] },
      { bucket: 'yesterday', chats: [] },
      { bucket: 'thisWeek', chats: [] },
      { bucket: 'earlier', chats: [] },
    ];
    for (const chat of history) {
      buckets.find((group) => group.bucket === bucketChat(chat.updated_at))!.chats.push(chat);
    }
    return buckets.filter((group) => group.chats.length > 0);
  }, [history]);

  const openChat = (chatId?: number) => {
    onNavigate?.();
    router.replace(
      chatId
        ? `/(auth)/(drawer)/(chat)/${chatId}`
        : '/(auth)/(drawer)/(chat)/new'
    );
  };

  const rename = async (chat: ChatRow) => {
    const next = window.prompt('Rename chat', chat.title)?.trim();
    if (!next || next === chat.title) return;
    setBusyId(chat.id);
    try {
      await db.renameChat(chat.id, next.slice(0, 100));
      emitChatsChanged();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (chat: ChatRow) => {
    if (!window.confirm(`Delete “${chat.title}” and all of its messages?`)) return;
    setBusyId(chat.id);
    try {
      await db.deleteChat(chat.id);
      emitChatsChanged();
      if (String(chat.id) === activeId) openChat();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <View style={styles.wordmark}>
          <BrandMark size={25} color={Colors.ink} />
          <Text style={styles.wordmarkText}>Archius</Text>
        </View>
        <Pressable
          onPress={() => openChat()}
          accessibilityRole="button"
          accessibilityLabel="Start a new chat"
          style={({ hovered, pressed }) => [
            styles.composeButton,
            (hovered || pressed) && styles.composeButtonActive,
          ]}>
          <Ionicons name="create-outline" size={19} color={Colors.ink} />
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={17} color={Colors.slateSoft} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search conversations"
          placeholderTextColor={Colors.slateSoft}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchInput}
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={16} color={Colors.slateSoft} />
          </Pressable>
        )}
      </View>

      <TouchableOpacity style={styles.newChatButton} onPress={() => openChat()}>
        <View style={styles.newChatMark}>
          <BrandMark size={14} color={Colors.onControl} />
        </View>
        <Text style={styles.newChatText}>New chat</Text>
        <Text style={styles.newChatShortcut}>⌘ N</Text>
      </TouchableOpacity>

      <ScrollView style={styles.history} contentContainerStyle={styles.historyContent}>
        {history.length === 0 && (
          <View style={styles.emptyHistory}>
            <Text style={styles.emptyHistoryTitle}>{query ? 'No matches' : 'A clean slate'}</Text>
            <Text style={styles.emptyHistoryText}>
              {query ? 'Try a different search.' : 'Your conversations will appear here.'}
            </Text>
          </View>
        )}
        {grouped.map((group) => (
          <View key={group.bucket} style={styles.historyGroup}>
            <Text style={styles.groupLabel}>{BUCKET_LABELS[group.bucket]}</Text>
            {group.chats.map((chat) => {
              const active = String(chat.id) === activeId;
              return (
                <Pressable
                  key={chat.id}
                  onPress={() => openChat(chat.id)}
                  style={({ hovered, pressed }) => [
                    styles.chatRow,
                    active && styles.chatRowActive,
                    (hovered || pressed) && !active && styles.chatRowHover,
                  ]}>
                  <Text style={[styles.chatTitle, active && styles.chatTitleActive]} numberOfLines={1}>
                    {chat.title}
                  </Text>
                  <View style={styles.chatActions}>
                    <Pressable
                      disabled={busyId === chat.id}
                      onPress={(event) => {
                        event.stopPropagation();
                        void rename(chat);
                      }}
                      accessibilityLabel={`Rename ${chat.title}`}
                      style={styles.chatAction}>
                      <Ionicons name="pencil-outline" size={14} color={Colors.slateSoft} />
                    </Pressable>
                    <Pressable
                      disabled={busyId === chat.id}
                      onPress={(event) => {
                        event.stopPropagation();
                        void remove(chat);
                      }}
                      accessibilityLabel={`Delete ${chat.title}`}
                      style={styles.chatAction}>
                      <Ionicons name="trash-outline" size={14} color={Colors.slateSoft} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <Link href="/(auth)/(modal)/settings" asChild>
        <Pressable
          onPress={onNavigate}
          style={({ hovered, pressed }) => [
            styles.accountCard,
            (hovered || pressed) && styles.accountCardHover,
          ]}>
          {user?.imageUrl ? (
            <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.accountText}>
            <Text style={styles.accountName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.accountPlan}>{isPro ? 'Archius Pro' : 'Free plan'} · Settings</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.slateSoft} />
        </Pressable>
      </Link>
    </View>
  );
};

export default function WebDrawerLayout() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const Colors = useThemeColors();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const compact = width < 900;

  useEffect(() => {
    if (!compact) setSidebarOpen(false);
  }, [compact]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        router.replace('/(auth)/(drawer)/(chat)/new');
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  return (
    <View style={styles.appShell}>
      {!compact && <Sidebar />}
      <View style={styles.mainPane}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: Colors.cream },
            headerShadowVisible: false,
            headerTintColor: Colors.ink,
            headerTitleStyle: {
              fontFamily: 'SourceSerif4_400Regular',
              color: Colors.ink,
              fontSize: 20,
            },
            headerTitleAlign: 'center',
            headerLeft: compact
              ? () => (
                  <TouchableOpacity
                    onPress={() => setSidebarOpen(true)}
                    accessibilityLabel="Open conversations"
                    style={styles.mobileHeaderButton}>
                    <Ionicons name="menu" size={21} color={Colors.ink} />
                  </TouchableOpacity>
                )
              : undefined,
            headerRight: () => (
              <Link href="/(auth)/(drawer)/(chat)/new" replace asChild>
                <TouchableOpacity accessibilityLabel="Start a new chat" style={styles.mobileHeaderButton}>
                  <Ionicons name="create-outline" size={21} color={Colors.ink} />
                </TouchableOpacity>
              </Link>
            ),
          }}>
          <Stack.Screen name="(chat)/new" options={{ title: 'New Chat' }} />
          <Stack.Screen name="(chat)/[id]" options={{ title: 'Archius' }} />
        </Stack>
      </View>

      <Modal visible={compact && sidebarOpen} transparent animationType="fade">
        <View style={styles.mobileOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSidebarOpen(false)} />
          <View style={styles.mobileSidebar}>
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  appShell: { flex: 1, flexDirection: 'row', backgroundColor: Colors.cream },
  sidebar: {
    width: 308,
    minWidth: 308,
    height: '100%',
    backgroundColor: Colors.surface,
    borderRightWidth: 1,
    borderRightColor: Colors.stone,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sidebarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 4 },
  wordmarkText: { fontFamily: 'SourceSerif4_400Regular', fontSize: 24, color: Colors.ink },
  composeButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.stone,
    backgroundColor: Colors.cream,
  },
  composeButtonActive: { backgroundColor: Colors.creamSoft },
  searchBox: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.stone,
    backgroundColor: Colors.cream,
  },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.graphite, outlineStyle: 'none' } as any,
  newChatButton: {
    height: 48,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 11,
    borderRadius: 13,
    backgroundColor: Colors.control,
  },
  newChatMark: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.blueprintLifted },
  newChatText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.onControl },
  newChatShortcut: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.onControl, opacity: 0.56 },
  history: { flex: 1, marginTop: 18 },
  historyContent: { paddingBottom: 18 },
  historyGroup: { marginBottom: 16 },
  groupLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.slateSoft, textTransform: 'uppercase', letterSpacing: 1.2, paddingHorizontal: 9, marginBottom: 5 },
  chatRow: { minHeight: 40, borderRadius: 10, paddingLeft: 10, paddingRight: 5, flexDirection: 'row', alignItems: 'center' },
  chatRowActive: { backgroundColor: Colors.blueprintTint12 },
  chatRowHover: { backgroundColor: Colors.creamSoft },
  chatTitle: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.graphite },
  chatTitleActive: { fontFamily: 'Inter_600SemiBold', color: Colors.ink },
  chatActions: { flexDirection: 'row', alignItems: 'center' },
  chatAction: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  emptyHistory: { paddingHorizontal: 10, paddingVertical: 24 },
  emptyHistoryTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.graphite, marginBottom: 4 },
  emptyHistoryText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.slate, lineHeight: 18 },
  accountCard: {
    marginBottom: 12,
    minHeight: 62,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.stone,
    backgroundColor: Colors.cream,
  },
  accountCardHover: { backgroundColor: Colors.creamSoft },
  avatar: { width: 36, height: 36, borderRadius: 11 },
  avatarFallback: { backgroundColor: Colors.control, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: 'Inter_600SemiBold', color: Colors.onControl, fontSize: 15 },
  accountText: { flex: 1, minWidth: 0 },
  accountName: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.graphite },
  accountPlan: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.slate, marginTop: 3 },
  mainPane: { flex: 1, minWidth: 0, backgroundColor: Colors.cream },
  mobileHeaderButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  mobileOverlay: { flex: 1, backgroundColor: Colors.inkScrim40, alignItems: 'flex-start' },
  mobileSidebar: { width: 'min(86vw, 320px)' as any, height: '100%', shadowColor: Colors.shadow, shadowOffset: { width: 8, height: 0 }, shadowOpacity: 0.2, shadowRadius: 28 },
});
