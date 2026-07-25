import BrandMark from '@/components/BrandMark';
import ChatMessage from '@/components/ChatMessage';
import MessageIdeas from '@/components/MessageIdeas';
import MessageInput, { type MessageInputHandle } from '@/components/MessageInput';
import PopoverMenu, { type PopoverAnchor } from '@/components/PopoverMenu';
import Colors from '@/constants/Colors';
import { defaultStyles } from '@/constants/Styles';
import {
  addChat,
  addMessage,
  deleteLastNMessages,
  getChat,
  getMessages,
  renameChat,
} from '@/utils/Database';
import { emitChatsChanged } from '@/utils/events';
import { type EmailDraft, type EventDraft, Message, type MessageSource, Role } from '@/utils/Interfaces';
import { useRevenueCat } from '@/providers/RevenueCat';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useHeaderHeight } from '@react-navigation/elements';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import Constants from 'expo-constants';
import { lightImpact, success, tap } from '@/utils/haptics';
import { maybeRequestReview } from '@/utils/reviewPrompt';
import { fetch as expoFetch } from 'expo/fetch';
// expo-image-picker is imported LAZILY inside onPickImage — its native module
// throws at import time if the dev client hasn't been rebuilt, which would
// crash the app at startup. Lazy import contains that to the action.
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing as ReanimatedEasing,
  FadeIn,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const resolveApiBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost;
  if (!hostUri) return 'http://localhost:8081';
  if (hostUri.includes('exp.direct') || hostUri.includes('exp.host')) {
    const hostOnly = hostUri.split(':')[0];
    return `https://${hostOnly}`;
  }
  return `http://${hostUri}`;
};

type RenderedMessage = Message & {
  id: string;
  searching?: boolean;
  searchQuery?: string;
  sources?: MessageSource[];
  email?: EmailDraft;
  event?: EventDraft;
  imageUrl?: string; // attached image on a user message (live session)
};

const extractEventFromParts = (parts: any[]): EventDraft | undefined => {
  let event: EventDraft | undefined;
  for (const p of parts) {
    if (p?.type === 'tool-draft_event' && p.state === 'output-available') {
      const out = p.output;
      if (out && typeof out.title === 'string' && typeof out.startISO === 'string') {
        event = {
          title: out.title,
          startISO: out.startISO,
          endISO: out.endISO || undefined,
          location: out.location || undefined,
          notes: out.notes || undefined,
        };
      }
    }
  }
  return event;
};

// First image attachment on a message, if any (data URL or remote URL).
const extractImageUrl = (parts: any[]): string | undefined => {
  for (const p of parts) {
    if (p?.type === 'file' && typeof p.mediaType === 'string' && p.mediaType.startsWith('image/') && p.url) {
      return p.url as string;
    }
  }
  return undefined;
};

// Pull deduped sources out of a message's web_search tool parts (live path).
const extractSourcesFromParts = (parts: any[]): MessageSource[] => {
  const map = new Map<string, MessageSource>();
  for (const p of parts) {
    if (p?.type === 'tool-web_search' && p.state === 'output-available') {
      const out = p.output;
      if (Array.isArray(out?.sources)) {
        for (const s of out.sources) {
          if (s?.url && !map.has(s.url)) {
            map.set(s.url, { title: s.title || s.url, url: s.url });
          }
        }
      }
    }
  }
  return Array.from(map.values());
};

// Pull the most recent drafted email out of a message's draft_email parts.
const extractEmailFromParts = (parts: any[]): EmailDraft | undefined => {
  let email: EmailDraft | undefined;
  for (const p of parts) {
    if (p?.type === 'tool-draft_email' && p.state === 'output-available') {
      const out = p.output;
      if (out && typeof out.subject === 'string' && typeof out.body === 'string') {
        email = {
          to: typeof out.to === 'string' && out.to.length > 0 ? out.to : undefined,
          subject: out.subject,
          body: out.body,
        };
      }
    }
  }
  return email;
};

// `sourcesById` / `emailById` carry persisted artifacts for historical
// (reloaded) messages, which have no live tool parts. Keyed by UIMessage id.
const uiMessagesToText = (
  uiMessages: UIMessage[],
  sourcesById?: Map<string, MessageSource[]>,
  emailById?: Map<string, EmailDraft>,
  eventById?: Map<string, EventDraft>
): RenderedMessage[] =>
  uiMessages.map((m, idx) => {
    const parts = (m.parts ?? []) as any[];
    const text = parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('');

    // Surface web_search tool activity: "searching" while the tool runs,
    // and a deduped source list once results come back.
    let searching = false;
    let searchQuery: string | undefined;
    for (const p of parts) {
      if (p?.type !== 'tool-web_search') continue;
      if (p.state === 'input-streaming' || p.state === 'input-available') {
        searching = true;
        if (p.input?.query) searchQuery = p.input.query;
      } else if (p.state === 'output-available' && p.output?.query) {
        searchQuery = p.output.query;
      }
    }

    const id = m.id ?? `idx-${idx}`;
    const fromParts = extractSourcesFromParts(parts);
    const sources = fromParts.length > 0 ? fromParts : sourcesById?.get(id);
    const email = extractEmailFromParts(parts) ?? emailById?.get(id);
    const event = extractEventFromParts(parts) ?? eventById?.get(id);
    const imageUrl = extractImageUrl(parts);

    return {
      id,
      role: m.role === 'assistant' ? Role.Bot : Role.User,
      content: text,
      searching,
      searchQuery,
      sources: sources && sources.length > 0 ? sources : undefined,
      email,
      event,
      imageUrl,
    };
  });

const historyToUIMessages = (history: Message[]): UIMessage[] =>
  history.map((m, idx) => {
    const parts: any[] = [];
    // Reconstruct a file part for persisted user images so the existing
    // render path (extractImageUrl) shows the thumbnail on reload.
    if (m.role === Role.User && m.imageUri) {
      parts.push({ type: 'file', mediaType: 'image/jpeg', url: m.imageUri });
    }
    parts.push({ type: 'text', text: m.content });
    return {
      id: `history-${idx}`,
      role: m.role === Role.Bot ? 'assistant' : 'user',
      parts,
    };
  }) as UIMessage[];

// Copy the picker's (cache) image URI into the app's documents directory so
// it survives across launches. Returns the persistent file:// URI, or
// undefined on failure.
const persistImageToDocuments = async (
  sourceUri: string,
  chatId: string
): Promise<string | undefined> => {
  try {
    const FileSystem: any = await import('expo-file-system/legacy');
    const dir = FileSystem.documentDirectory + 'msg-images/';
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    } catch {
      // already exists — fine
    }
    const ext = (sourceUri.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
    const dest = `${dir}${chatId}-${Date.now()}.${ext}`;
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
    return dest;
  } catch (e) {
    console.warn('Failed to persist image', e);
    return undefined;
  }
};

type FriendlyError = {
  message: string;
  action: 'retry' | 'signin' | 'upgrade' | 'dismiss';
};

// Translate raw fetch/AI SDK errors into something a user can read, plus the
// most useful next step.
const friendlyError = (err: unknown): FriendlyError => {
  const raw = err instanceof Error ? err.message : String(err);
  if (/rate_limited|rate limit|too many requests|429/i.test(raw)) {
    return {
      message: "You've hit your daily message limit. Upgrade to Pro for more.",
      action: 'upgrade',
    };
  }
  if (/pro_only|402/i.test(raw)) {
    return {
      message: 'The advanced model is only available on Pro.',
      action: 'upgrade',
    };
  }
  if (/Unauthorized|401|session expired/i.test(raw)) {
    return {
      message: 'Your session expired. Sign in again to continue.',
      action: 'signin',
    };
  }
  // ngrok / tunnel gateway errors during dev (rebundle race, cold start, etc.)
  if (/ngrok|ERR_NGROK_|Service Unavailable|<!DOCTYPE/i.test(raw)) {
    return {
      message: 'Dev tunnel hiccup. Tap retry — it should work the second time.',
      action: 'retry',
    };
  }
  if (/Network request failed|Failed to fetch|NetworkError/i.test(raw)) {
    return {
      message: "Can't reach the server. Check your connection and try again.",
      action: 'retry',
    };
  }
  if (/response body is empty/i.test(raw)) {
    return {
      message: 'The server returned nothing. Try again in a moment.',
      action: 'retry',
    };
  }
  return {
    message: raw.length > 140 ? raw.slice(0, 140) + '…' : raw,
    action: 'retry',
  };
};

const ChatPage = () => {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { getToken, signOut } = useAuth();
  const { user } = useUser();
  // Unified Pro signal (RevenueCat entitlement OR Clerk publicMetadata.isPro)
  // — see RevenueCatProvider. Same source of truth the server enforces.
  const { isPro } = useRevenueCat();
  const headerHeight = useHeaderHeight();
  // Web search + deep-think (both Pro-only) — opt-in per conversation via
  // composer toggles. Mutually exclusive: search = flash + tools, deep-think
  // = reasoner (tool-free).
  const [webSearch, setWebSearch] = useState(false);
  const [deepThink, setDeepThink] = useState(false);
  const webSearchRef = useRef(false);
  const deepThinkRef = useRef(false);
  webSearchRef.current = webSearch;
  deepThinkRef.current = deepThink;
  // A pending image attachment (Pro), included on the next send.
  const [pendingImage, setPendingImage] = useState<
    { uri: string; dataUrl: string; mediaType: string } | null
  >(null);
  const pendingImageRef = useRef<typeof pendingImage>(null);
  pendingImageRef.current = pendingImage;
  // Composer + menu — anchored popover over the + button (toggles + attach).
  const [composerMenu, setComposerMenu] = useState<PopoverAnchor | null>(null);
  // Persisted email edits per message id, keyed so they survive FlashList
  // cell recycling when the user scrolls. Mutable map — no re-renders on
  // keystroke. Cleared on chat switch.
  const emailEditsRef = useRef<Map<string, EmailDraft>>(new Map());
  const firstName =
    user?.firstName ||
    user?.username ||
    (user?.primaryEmailAddress?.emailAddress?.split('@')[0] ?? '');

  // Active chat id — the chat we're persisting messages into. Mirrors the
  // route `id` for existing chats, and is set in onSend after addChat for
  // brand-new chats (the route stays at /new until navigation, but messages
  // need to land in the new chat row).
  const chatIdRef = useRef<string | undefined>(id);
  const lastPersistedAssistantRef = useRef<string>('');
  // Tracks the previous scroll position so we can dismiss the keyboard only
  // when the user scrolls UP (toward older history), not when scrolling down
  // toward the input.
  const lastScrollYRef = useRef<number>(0);
  // Persisted artifacts for reloaded (historical) messages, keyed by
  // UIMessage id. Live messages carry these in their tool parts instead.
  const sourcesByIdRef = useRef<Map<string, MessageSource[]>>(new Map());
  const emailByIdRef = useRef<Map<string, EmailDraft>>(new Map());
  const eventByIdRef = useRef<Map<string, EventDraft>>(new Map());
  const listRef = useRef<FlashListRef<RenderedMessage>>(null);
  const inputHandleRef = useRef<MessageInputHandle>(null);
  // Refs that mirror state for use inside effect cleanup (where the rendered
  // closure is stale by the time cleanup runs).
  const messagesRef = useRef<UIMessage[]>([]);
  const statusRef = useRef<string>('');
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  // Index of the user message currently being edited inline (null = none).
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [chatTitle, setChatTitle] = useState<string>('');
  // Count of messages already present when the chat first loaded — used to
  // skip the slide-in animation for historical messages.
  const baselineCountRef = useRef<number>(0);
  // Number of messages we want to actually animate (everything past baseline).
  const [animatedCutoff, setAnimatedCutoff] = useState(0);
  const isCreatingChatRef = useRef(false);
  // Chats whose title still needs to be auto-generated after their first
  // assistant reply completes. Also remember the seed message used for the
  // title call.
  const pendingTitleRef = useRef<Map<string, string>>(new Map());

  // Persist any partial assistant reply from a stopped/errored stream to the
  // chat it belonged to. Idempotent via lastPersistedAssistantRef.
  const persistInflightAssistantTo = useCallback(
    (targetChatId: string | undefined) => {
      if (!targetChatId) return;
      const lastMsg = messagesRef.current[messagesRef.current.length - 1];
      if (!lastMsg || lastMsg.role !== 'assistant') return;
      const text = ((lastMsg as any).parts ?? [])
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('');
      if (!text || text === lastPersistedAssistantRef.current) return;
      lastPersistedAssistantRef.current = text;
      const parts = ((lastMsg as any).parts ?? []) as any[];
      const sources = extractSourcesFromParts(parts);
      const email = extractEmailFromParts(parts);
      const event = extractEventFromParts(parts);
      addMessage(db, parseInt(targetChatId, 10), {
        role: Role.Bot,
        content: text,
        sources: sources.length > 0 ? sources : undefined,
        email,
        event,
      })
        .then(() => emitChatsChanged())
        .catch((e) => console.warn('Failed to persist partial assistant', e));
    },
    [db]
  );

  const apiUrl = useMemo(() => `${resolveApiBaseUrl()}/api/chat`, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiUrl,
        // React Native's built-in fetch can't read streaming response bodies.
        // expo/fetch is a polyfill that supports SSE streaming, which the
        // Vercel AI SDK needs to consume the assistant response token-by-token.
        fetch: expoFetch as unknown as typeof globalThis.fetch,
        headers: async (): Promise<Record<string, string>> => {
          try {
            const token = await getToken();
            if (token) return { Authorization: `Bearer ${token}` };
            return {};
          } catch {
            return {};
          }
        },
        // Inject the web-search flag + tier per request. Reads from a ref so
        // the memoized transport always sees the current toggle state.
        prepareSendMessagesRequest: ({ messages: m, body, id: reqId, trigger, messageId }) => ({
          body: {
            ...body,
            id: reqId,
            messages: m,
            trigger,
            messageId,
            modelTier: deepThinkRef.current ? 'pro' : 'flash',
            webSearch: webSearchRef.current,
          },
        }),
      }),
    [apiUrl, getToken]
  );

  const { messages, sendMessage, setMessages, status, error, stop, regenerate } =
    useChat({
      transport,
      onError: (err) => {
        console.warn('[useChat] error:', err);
        // Persist whatever the assistant streamed before the failure —
        // otherwise reopening the chat would show no reply at all.
        persistInflightAssistantTo(chatIdRef.current);
      },
      onFinish: async ({ message }) => {
        success();
        const text = (message.parts ?? [])
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join('');
        if (!text || !chatIdRef.current) return;
        if (text === lastPersistedAssistantRef.current) return;
        lastPersistedAssistantRef.current = text;
        const parts = (message.parts ?? []) as any[];
        const sources = extractSourcesFromParts(parts);
        const email = extractEmailFromParts(parts);
        const event = extractEventFromParts(parts);
        try {
          await addMessage(db, parseInt(chatIdRef.current, 10), {
            role: Role.Bot,
            content: text,
            sources: sources.length > 0 ? sources : undefined,
            email,
            event,
          });
          emitChatsChanged();
          // A completed, persisted reply is a positive moment — a good time to
          // (occasionally) ask for an App Store rating. Self-throttles.
          void maybeRequestReview();
        } catch (e) {
          console.warn('Failed to persist assistant message', e);
        }

        // If this is the first exchange of a brand-new chat, generate a real
        // title now (background — non-blocking; failure is harmless).
        const cidStr = chatIdRef.current;
        const seed = pendingTitleRef.current.get(cidStr);
        if (seed) {
          pendingTitleRef.current.delete(cidStr);
          void (async () => {
            try {
              const token = await getToken();
              const res = await expoFetch(`${resolveApiBaseUrl()}/api/title`, {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ message: seed }),
              } as any);
              if (!(res as any).ok) return;
              const data = await (res as any).json();
              if (data?.title && typeof data.title === 'string') {
                await renameChat(db, parseInt(cidStr, 10), data.title);
                emitChatsChanged();
                // Reflect the new title in the header for the current session.
                if (cidStr === chatIdRef.current) setChatTitle(data.title);
              }
            } catch {
              // ignore — title gen is best-effort
            }
          })();
        }
      },
    });

  // Keep refs in sync so the [id]-change cleanup below can read current state.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Lifecycle: when route id changes, gracefully close out the previous
  // chat (persist any in-flight partial reply, stop the stream) before
  // loading the new chat's history. Cleanup runs first (sees OLD chatIdRef),
  // then the new effect body resets refs + loads history.
  useEffect(() => {
    let cancelled = false;

    chatIdRef.current = id;
    lastPersistedAssistantRef.current = '';
    sourcesByIdRef.current = new Map();
    emailByIdRef.current = new Map();
    eventByIdRef.current = new Map();
    emailEditsRef.current = new Map();
    setEditingIndex(null);
    setPendingImage(null);
    setComposerMenu(null);

    if (!id) {
      baselineCountRef.current = 0;
      setAnimatedCutoff(0);
      setChatTitle('');
      setMessages([]);
      return () => {
        cancelled = true;
      };
    }

    const numericId = parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const history = await getMessages(db, numericId);
        if (cancelled) return;
        const ui = historyToUIMessages(history);
        // Rebuild the persisted-artifact maps keyed by the same ids
        // historyToUIMessages assigns (`history-${idx}`).
        const srcMap = new Map<string, MessageSource[]>();
        const emailMap = new Map<string, EmailDraft>();
        const eventMap = new Map<string, EventDraft>();
        history.forEach((m, idx) => {
          if (m.sources && m.sources.length > 0) srcMap.set(`history-${idx}`, m.sources);
          if (m.email) emailMap.set(`history-${idx}`, m.email);
          if (m.event) eventMap.set(`history-${idx}`, m.event);
        });
        sourcesByIdRef.current = srcMap;
        emailByIdRef.current = emailMap;
        eventByIdRef.current = eventMap;
        setMessages(ui);
        baselineCountRef.current = ui.length;
        setAnimatedCutoff(ui.length);
      } catch (e) {
        if (!cancelled) console.warn('Failed to load messages', e);
      }
      try {
        const row = await getChat(db, numericId);
        if (cancelled) return;
        setChatTitle(row?.title ?? '');
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      // Persist any in-flight assistant reply to the chat we're leaving,
      // then stop the stream so it doesn't bleed into the new chat.
      if (statusRef.current === 'streaming' || statusRef.current === 'submitted') {
        persistInflightAssistantTo(chatIdRef.current);
        try {
          stop();
        } catch {
          // ignore — useChat may already be torn down
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, db, setMessages, stop]);

  const onSend = async (text: string) => {
    const trimmed = text.trim();
    const image = pendingImageRef.current;
    // Allow image-only sends (no text).
    if (!trimmed && !image) return;

    // Create a chat row on first message — guard against double-create when
    // user mashes send rapidly during the async insert.
    if (!chatIdRef.current && !isCreatingChatRef.current) {
      isCreatingChatRef.current = true;
      try {
        const title = (trimmed || 'Image').slice(0, 60);
        const res = await addChat(db, title);
        const newId = String(res.lastInsertRowId);
        chatIdRef.current = newId;
        // Queue a real AI-generated title once the first response arrives.
        pendingTitleRef.current.set(newId, trimmed || 'Describe this image');
        emitChatsChanged();
      } catch (e) {
        console.warn('Failed to create chat', e);
      } finally {
        isCreatingChatRef.current = false;
      }
    }

    // If chat creation failed, don't send — surface the failure visibly
    // rather than silently dropping the message.
    if (!chatIdRef.current) {
      Alert.alert(
        'Could not start chat',
        "We couldn't save this chat. Please try again."
      );
      return;
    }

    if (chatIdRef.current) {
      try {
        // Copy the attached image into documents/ so it survives across
        // launches; store the persistent URI alongside the text.
        let persistedImageUri: string | undefined;
        if (image) {
          persistedImageUri = await persistImageToDocuments(
            image.uri,
            chatIdRef.current
          );
        }
        await addMessage(db, parseInt(chatIdRef.current, 10), {
          role: Role.User,
          content: trimmed,
          imageUri: persistedImageUri,
        });
        emitChatsChanged();
      } catch (e) {
        console.warn('Failed to persist user message', e);
      }
    }

    if (image) {
      sendMessage({
        text: trimmed,
        files: [{ type: 'file', mediaType: image.mediaType, url: image.dataUrl }],
      });
      setPendingImage(null);
    } else {
      sendMessage({ text: trimmed });
    }
  };

  const renderedMessages = useMemo(
    () =>
      uiMessagesToText(
        messages,
        sourcesByIdRef.current,
        emailByIdRef.current,
        eventByIdRef.current
      ),
    [messages]
  );

  // Auto-scroll on count change, status flip, AND with a debounced extra
  // scroll during streaming so long replies stay anchored to the bottom.
  useEffect(() => {
    if (renderedMessages.length === 0) return;
    const id = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(id);
  }, [renderedMessages.length, status]);

  useEffect(() => {
    if (status !== 'streaming') return;
    // Periodic scroll during streaming so the tail of long replies stays
    // visible without re-running on every token (which would jank). But
    // only if the user hasn't scrolled away from the bottom (which we
    // detect via the scroll-to-bottom button visibility).
    const interval = setInterval(() => {
      if (!showScrollToBottom) {
        listRef.current?.scrollToEnd({ animated: true });
      }
    }, 600);
    return () => clearInterval(interval);
  }, [status, showScrollToBottom]);

  // When the keyboard opens AND the user is already at the bottom, keep the
  // latest message visible above it. If they've scrolled up to read history,
  // leave them be (don't yank). showScrollToBottom is true only when scrolled
  // meaningfully away from the bottom.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (!showScrollToBottom) {
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      }
    });
    return () => sub.remove();
  }, [showScrollToBottom]);

  const isStreaming = status === 'streaming' || status === 'submitted';
  const errorInfo = error ? friendlyError(error) : null;

  const onRetry = () => {
    lightImpact();
    regenerate();
  };

  const onSignInAgain = async () => {
    lightImpact();
    try {
      await signOut();
    } catch (e) {
      console.warn('signOut failed', e);
    }
  };

  const onStop = () => {
    lightImpact();
    // Persist whatever the assistant has streamed so far before aborting —
    // useChat's stop() doesn't fire onFinish, so without this the partial
    // reply is lost on reload.
    persistInflightAssistantTo(chatIdRef.current);
    stop();
  };

  const onToggleWebSearch = () => {
    if (!isPro) {
      // Web search is a Pro feature — send free users to the paywall.
      lightImpact();
      router.push('/(auth)/(modal)/purchase');
      return;
    }
    tap();
    setWebSearch((v) => {
      const next = !v;
      if (next) setDeepThink(false); // mutually exclusive
      return next;
    });
  };

  const onToggleDeepThink = () => {
    if (!isPro) {
      lightImpact();
      router.push('/(auth)/(modal)/purchase');
      return;
    }
    tap();
    setDeepThink((v) => {
      const next = !v;
      if (next) setWebSearch(false); // mutually exclusive
      return next;
    });
  };

  const onPickImage = async () => {
    if (!isPro) {
      lightImpact();
      router.push('/(auth)/(modal)/purchase');
      return;
    }
    tap();
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photo access needed',
          'Allow photo access in Settings to attach an image.'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.5,
        base64: true, // get base64 inline — avoids the deprecated FileSystem read
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Could not read image', 'Please try a different photo.');
        return;
      }
      const mediaType = asset.mimeType ?? 'image/jpeg';
      setPendingImage({
        uri: asset.uri,
        dataUrl: `data:${mediaType};base64,${asset.base64}`,
        mediaType,
      });
    } catch (e) {
      console.warn('Image pick failed', e);
      Alert.alert('Could not attach image', 'Please try again.');
    }
  };

  const onRemoveImage = () => {
    tap();
    setPendingImage(null);
  };

  // Start inline edit: just flag the message index. Nothing is destroyed —
  // the bubble swaps to an inline editor (in ChatMessage). Scroll it into
  // view so the keyboard doesn't cover it.
  const onStartEdit = (msgIndex: number) => {
    if (msgIndex < 0 || msgIndex >= messages.length) return;
    tap();
    setEditingIndex(msgIndex);
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: msgIndex, animated: true, viewPosition: 0.2 });
      } catch {
        // index may be out of range during recycle — safe to ignore
      }
    });
  };

  const onCancelInlineEdit = () => {
    setEditingIndex(null);
  };

  // Commit an inline edit: truncate this message + everything after it, then
  // resend the edited text as a fresh turn. Truncation only happens here, on
  // Save — Cancel leaves everything intact.
  const onSaveEdit = async (msgIndex: number, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    if (msgIndex < 0 || msgIndex >= messages.length) return;

    const removedCount = messages.length - msgIndex;
    const targetChatId = chatIdRef.current;
    setEditingIndex(null);

    // Truncate the in-memory list so the resend appends cleanly.
    setMessages(messages.slice(0, msgIndex));

    if (targetChatId) {
      try {
        await deleteLastNMessages(db, parseInt(targetChatId, 10), removedCount);
        await addMessage(db, parseInt(targetChatId, 10), {
          role: Role.User,
          content: trimmed,
        });
        emitChatsChanged();
      } catch (e) {
        console.warn('Failed to apply edit', e);
      }
    }

    lastPersistedAssistantRef.current = '';
    sendMessage({ text: trimmed });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
      style={defaultStyles.pageContainer}>
      <Stack.Screen
        options={{
          headerTitle:
            renderedMessages.length === 0
              ? 'New Chat'
              : chatTitle && chatTitle.length > 0
                ? chatTitle
                : 'Archius',
        }}
      />
      <View style={styles.page}>
        {renderedMessages.length === 0 && (
          <View style={styles.emptyState} pointerEvents="box-none">
            <Animated.View
              entering={FadeIn.duration(260).easing(ReanimatedEasing.out(ReanimatedEasing.cubic))}
              style={styles.emptyInner}>
              <View style={styles.markCircle}>
                <BrandMark size={36} color="#fff" />
              </View>
              <Text style={styles.emptyTitle}>
                {firstName ? `Hello, ${firstName}` : 'How can I help?'}
              </Text>
              <Text style={styles.emptySubtitle}>
                Ask anything. I won't make things up.
              </Text>
            </Animated.View>
          </View>
        )}
        <FlashList
          ref={listRef}
          data={renderedMessages}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const y = contentOffset.y;
            const delta = y - lastScrollYRef.current;
            lastScrollYRef.current = y;
            // Directional keyboard dismiss: scrolling UP (toward older
            // messages, contentOffset.y decreasing) gracefully drops the
            // keyboard; scrolling DOWN toward the input keeps it. Threshold
            // avoids dismissing on tiny jitters / momentum settle.
            if (delta < -6) {
              Keyboard.dismiss();
            }
            const distanceFromBottom =
              contentSize.height - (y + layoutMeasurement.height);
            // Hysteresis: show pill at 120px (so any meaningful user scroll
            // away from bottom pauses auto-scroll), hide at 32px (essentially
            // at bottom). Prevents the "auto-scroll fights user drag" bug.
            setShowScrollToBottom((prev) =>
              prev ? distanceFromBottom > 32 : distanceFromBottom > 120
            );
          }}
          scrollEventThrottle={32}
          onScrollBeginDrag={() => {
            // Touching = user intent. Force-pause auto-scroll regardless of
            // computed distance, so the interval doesn't snap them back mid-drag.
            setShowScrollToBottom(true);
          }}
          renderItem={({ item, index }) => {
            const isLast = index === renderedMessages.length - 1;
            const isLastBot = isLast && item.role === Role.Bot;
            // Only animate messages that appeared AFTER the chat was opened.
            const animate = index >= animatedCutoff;
            return (
              <ChatMessage
                {...item}
                index={index}
                loading={isLastBot && item.content === '' && isStreaming}
                streaming={isLastBot && item.content !== '' && isStreaming}
                animate={animate}
                isLastAssistant={isLastBot}
                onRegenerate={isLastBot && !isStreaming ? onRetry : undefined}
                onEdit={item.role === Role.User && !isStreaming ? () => onStartEdit(index) : undefined}
                isEditing={editingIndex === index}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelInlineEdit}
                messageId={item.id}
                emailEditsMap={emailEditsRef.current}
              />
            );
          }}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 30, paddingBottom: 16 }}
          // Manual directional dismiss in onScroll (up = dismiss, down =
          // keep). The system "on-drag" mode is symmetric in both directions,
          // so we run our own logic instead.
          keyboardDismissMode="none"
          keyboardShouldPersistTaps="handled"
        />

        {/* Floating overlays anchored to the bottom of the FlashList area
            (above the input bar). They sit inside the flex container so the
            keyboard-avoidance and variable input bar height work correctly. */}
        {errorInfo && !isStreaming && (
          <View style={styles.floatingOverlay} pointerEvents="box-none">
            <View style={styles.errorRow}>
              <View style={styles.errorBanner}>
                <Text style={styles.errorText} numberOfLines={3}>
                  {errorInfo.message}
                </Text>
              </View>
              {errorInfo.action === 'signin' ? (
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={onSignInAgain}
                  accessibilityLabel="Sign in again"
                  accessibilityRole="button">
                  <Ionicons name="log-in-outline" size={14} color="#fff" />
                  <Text style={styles.retryBtnText}>Sign in</Text>
                </TouchableOpacity>
              ) : errorInfo.action === 'upgrade' ? (
                <Link href="/(auth)/(modal)/purchase" asChild>
                  <TouchableOpacity
                    style={styles.retryBtn}
                    accessibilityLabel="Upgrade to Archius Pro"
                    accessibilityRole="button">
                    <Ionicons name="rocket-outline" size={14} color="#fff" />
                    <Text style={styles.retryBtnText}>Upgrade</Text>
                  </TouchableOpacity>
                </Link>
              ) : (
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={onRetry}
                  accessibilityLabel="Retry"
                  accessibilityRole="button">
                  <Ionicons name="refresh" size={14} color="#fff" />
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {showScrollToBottom && !errorInfo && (
          <View style={styles.scrollToBottomWrap} pointerEvents="box-none">
            <Pressable
              style={({ pressed }) => [
                styles.scrollToBottomBtn,
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
              onPress={() => {
                listRef.current?.scrollToEnd({ animated: true });
                setShowScrollToBottom(false);
              }}
              accessibilityLabel="Scroll to bottom">
              <Ionicons name="chevron-down" size={20} color={Colors.ink} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Input group — natural-height flex children of the KAV so the
          keyboard pushes them up cleanly. Hidden while inline-editing so
          there aren't two competing text fields on screen. */}
      {editingIndex === null && (
        <>
          {renderedMessages.length === 0 && (
            <MessageIdeas
              onUseIdea={(text) => {
                inputHandleRef.current?.setValue(text);
                inputHandleRef.current?.focus();
              }}
            />
          )}
          <MessageInput
            ref={inputHandleRef}
            onShouldSend={onSend}
            onStop={onStop}
            isStreaming={isStreaming}
            autoFocus={renderedMessages.length === 0 && !id}
            webSearchEnabled={webSearch}
            deepThinkEnabled={deepThink}
            canUsePro={isPro}
            onOpenMenu={(anchor) => setComposerMenu(anchor)}
            menuActive={(webSearch || deepThink) && isPro}
            attachedImageUri={pendingImage?.uri ?? null}
            onRemoveImage={onRemoveImage}
          />
        </>
      )}

      <PopoverMenu
        visible={!!composerMenu}
        anchor={composerMenu}
        onClose={() => setComposerMenu(null)}
        items={[
          {
            key: 'attach_image',
            label: 'Attach image',
            icon: 'image-outline',
            onPress: onPickImage,
          },
          {
            key: 'web_search',
            label: 'Web search',
            icon: 'globe-outline',
            selected: webSearch && isPro,
            onPress: onToggleWebSearch,
          },
          {
            key: 'deep_think',
            label: 'Deep think',
            icon: 'sparkles-outline',
            selected: deepThink && isPro,
            onPress: onToggleDeepThink,
          },
        ]}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  emptyState: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyInner: {
    alignItems: 'center',
    gap: 14,
  },
  markCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 5,
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: 'SourceSerif4_300Light',
    fontSize: 30,
    color: Colors.ink,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.slate,
    textAlign: 'center',
    marginTop: -4,
  },
  // Floating row pinned to the bottom of the FlashList container (above
  // the input bar). Sits inside the flex View so it tracks variable input
  // bar height (multiline, edit banner, message ideas) and keyboard pushes.
  floatingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  errorBanner: {
    flex: 1,
    backgroundColor: Colors.rustTint12,
    borderColor: Colors.rustTint45,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    color: Colors.rust,
    fontSize: 12,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  retryBtnText: {
    fontFamily: 'Inter_500Medium',
    color: '#fff',
    fontSize: 12,
  },
  scrollToBottomWrap: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scrollToBottomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.stone,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
});

export default ChatPage;
