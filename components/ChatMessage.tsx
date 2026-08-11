import BrandMark from '@/components/BrandMark';
import type { AppColors } from '@/constants/Colors';
import { useThemeColors } from '@/providers/Theme';
import { lightImpact, success, tap } from '@/utils/haptics';
import { type EmailDraft, type EventDraft, Message, type MessageSource, Role } from '@/utils/Interfaces';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
// NOTE: expo-calendar is imported LAZILY inside its handler (not at top
// level). Its native module runs a lookup at import time which throws — and
// would crash the whole app at startup — if the dev client hasn't been
// rebuilt with it. Lazy import keeps the crash contained to the action.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const useMessageTheme = () => {
  const Colors = useThemeColors();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  return { Colors, styles };
};

// 3-dot typing indicator (staggered scale+fade), Conduit-style.
const TypingDot = ({ delay }: { delay: number }) => {
  const { styles } = useMessageTheme();
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }));
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.0, { duration: 600, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.5, { duration: 600, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      )
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [delay, scale, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[styles.typingDot, style]} />;
};

const TypingIndicator = () => {
  const { styles } = useMessageTheme();
  return (
    <View style={styles.typingRow}>
      <TypingDot delay={0} />
      <TypingDot delay={150} />
      <TypingDot delay={300} />
    </View>
  );
};

const CodeBlock = ({ content, language }: { content: string; language?: string }) => {
  const { styles } = useMessageTheme();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the timer on unmount so a recycled FlashList cell doesn't fire
  // setState on a stale instance.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(content);
      tap();
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  };

  return (
    <View style={styles.codeBlockWrap}>
      <View style={styles.codeBlockHeader}>
        <Text style={styles.codeBlockLang}>{language || 'code'}</Text>
        <TouchableOpacity
          onPress={onCopy}
          style={styles.codeCopyBtn}
          accessibilityLabel="Copy code"
          accessibilityRole="button"
          hitSlop={8}>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={14}
            color={copied ? '#98C379' : '#9DA5B4'}
          />
          <Text style={[styles.codeCopyText, copied && { color: '#98C379' }]}>
            {copied ? 'Copied!' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={styles.codeBlockText} selectable>
          {content.replace(/\n$/, '')}
        </Text>
      </ScrollView>
    </View>
  );
};

const createMarkdownRules = (Colors: AppColors) => ({
  fence: (node: any) => (
    <CodeBlock key={node.key} content={node.content} language={node.sourceInfo} />
  ),
  code_block: (node: any) => (
    <CodeBlock key={node.key} content={node.content} language={node.sourceInfo} />
  ),
  image: (node: any) => (
    <Text
      key={node.key}
      style={{
        fontFamily: 'JetBrainsMono_400Regular',
        fontSize: 14,
        color: Colors.blueprint,
      }}>
      [{node.attributes?.alt || 'image'}]
    </Text>
  ),
  // Make rendered text selectable so users can highlight + copy a portion
  // (the action-row Copy button still copies the whole message).
  text: (node: any, _children: any, _parent: any, styles: any, inheritedStyles: any = {}) => (
    <Text key={node.key} selectable style={[inheritedStyles, styles.text]}>
      {node.content}
    </Text>
  ),
});

const ActionButton = ({
  icon,
  label,
  onPress,
  highlighted,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  highlighted?: boolean;
}) => {
  const { Colors, styles } = useMessageTheme();
  return (
  <Pressable
    onPress={() => {
      tap();
      onPress();
    }}
    accessibilityLabel={label}
    accessibilityRole="button"
    hitSlop={10}
    style={({ pressed }) => [
      styles.actionBtn,
      pressed && styles.actionBtnPressed,
    ]}>
    <Ionicons
      name={icon}
      size={18}
      color={highlighted ? Colors.sage : Colors.slate}
    />
  </Pressable>
  );
};

const BotMark = () => {
  const { Colors, styles } = useMessageTheme();
  return (
    <View style={styles.botMarkSquare}>
      <BrandMark size={14} color={Colors.onControl} />
    </View>
  );
};

// Animated "Searching the web…" chip shown while the web_search tool runs.
const SearchingChip = ({ query }: { query?: string }) => {
  const { Colors, styles } = useMessageTheme();
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.5, { duration: 700, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={styles.searchChip}>
      <Animated.View style={style}>
        <Ionicons name="globe-outline" size={14} color={Colors.blueprint} />
      </Animated.View>
      <Text style={styles.searchChipText} numberOfLines={1}>
        {query ? `Searching the web · "${query}"` : 'Searching the web…'}
      </Text>
    </View>
  );
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

// A drafted email rendered as an editable compose card. Fields are tap-to-edit.
// Edits are mirrored into a parent-owned `editsMap` keyed by messageId so they
// survive FlashList cell recycling — on remount we re-seed local state from
// the map (falling back to the original AI draft).
// Send opens the system share sheet so the user picks which app to send from.
const EmailCard = ({
  email,
  messageId,
  editsMap,
}: {
  email: EmailDraft;
  messageId?: string;
  editsMap?: Map<string, EmailDraft>;
}) => {
  const { Colors, styles } = useMessageTheme();
  const persisted = messageId ? editsMap?.get(messageId) : undefined;
  const [to, setTo] = useState(persisted?.to ?? email.to ?? '');
  const [subject, setSubject] = useState(persisted?.subject ?? email.subject);
  const [body, setBody] = useState(persisted?.body ?? email.body);

  // Mirror every change into the parent map (no parent re-render — mutable).
  const persistEdit = (next: { to: string; subject: string; body: string }) => {
    if (messageId && editsMap) {
      editsMap.set(messageId, {
        to: next.to || undefined,
        subject: next.subject,
        body: next.body,
      });
    }
  };

  const composed = `${to ? `To: ${to}\n` : ''}Subject: ${subject}\n\n${body}`;

  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(composed);
      success();
    } catch {
      // ignore
    }
  };

  // System share sheet — lets the user send via any installed app (Gmail,
  // Outlook, Spark, Messages, etc.) rather than only the default Mail app.
  const onSend = async () => {
    lightImpact();
    try {
      await Share.share({ title: subject, message: composed });
    } catch {
      // user cancelled or share unavailable — silent
    }
  };

  return (
    <View style={styles.emailCard}>
      <View style={styles.emailHeaderRow}>
        <Ionicons name="mail-outline" size={14} color={Colors.blueprint} />
        <Text style={styles.emailHeaderLabel}>Draft email</Text>
      </View>
      <View style={styles.emailField}>
        <Text style={styles.emailFieldLabel}>To</Text>
        <TextInput
          style={styles.emailFieldInput}
          value={to}
          onChangeText={(v) => {
            setTo(v);
            persistEdit({ to: v, subject, body });
          }}
          placeholder="Recipient (optional)"
          placeholderTextColor={Colors.slateSoft}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <View style={styles.emailField}>
        <Text style={styles.emailFieldLabel}>Subject</Text>
        <TextInput
          style={styles.emailFieldInput}
          value={subject}
          onChangeText={(v) => {
            setSubject(v);
            persistEdit({ to, subject: v, body });
          }}
          placeholder="Subject"
          placeholderTextColor={Colors.slateSoft}
        />
      </View>
      <View style={styles.emailBodyWrap}>
        <TextInput
          style={styles.emailBodyInput}
          value={body}
          onChangeText={(v) => {
            setBody(v);
            persistEdit({ to, subject, body: v });
          }}
          multiline
          textAlignVertical="top"
          placeholder="Email body"
          placeholderTextColor={Colors.slateSoft}
        />
      </View>
      <View style={styles.emailActions}>
        <Pressable
          onPress={onCopy}
          accessibilityLabel="Copy email draft"
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.emailGhostBtn, pressed && styles.emailGhostBtnPressed]}>
          <Ionicons name="copy-outline" size={15} color={Colors.slate} />
          <Text style={styles.emailGhostText}>Copy</Text>
        </Pressable>
        <Pressable
          onPress={onSend}
          accessibilityLabel="Send email through your chosen app"
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.emailSendBtn, pressed && styles.emailSendBtnPressed]}>
          <Ionicons name="send" size={14} color={Colors.onControl} />
          <Text style={styles.emailSendText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
};

// A drafted calendar event rendered as a card with an Add-to-Calendar button.
const EventCard = ({ event }: { event: EventDraft }) => {
  const { Colors, styles } = useMessageTheme();
  const start = new Date(event.startISO);
  const validStart = !Number.isNaN(start.getTime());
  const end = event.endISO ? new Date(event.endISO) : null;

  const whenLabel = validStart
    ? start.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : event.startISO;

  const onAdd = async () => {
    lightImpact();
    try {
      const Calendar = await import('expo-calendar');
      const startDate = validStart ? start : new Date();
      // Default to a 1-hour event if no end was given.
      const endDate =
        end && !Number.isNaN(end.getTime())
          ? end
          : new Date(startDate.getTime() + 60 * 60 * 1000);
      await Calendar.createEventInCalendarAsync({
        title: event.title,
        startDate,
        endDate,
        location: event.location || undefined,
        notes: event.notes || undefined,
      });
    } catch (e: any) {
      // Native module missing until the dev client is rebuilt with expo-calendar.
      Alert.alert(
        'Calendar unavailable',
        'Update to the latest build of Archius to add events to your calendar.'
      );
    }
  };

  return (
    <View style={styles.eventCard}>
      <View style={styles.eventHeaderRow}>
        <Ionicons name="calendar-outline" size={14} color={Colors.blueprint} />
        <Text style={styles.emailHeaderLabel}>Event</Text>
      </View>
      <View style={styles.eventBody}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <View style={styles.eventMetaRow}>
          <Ionicons name="time-outline" size={14} color={Colors.slate} />
          <Text style={styles.eventMetaText}>{whenLabel}</Text>
        </View>
        {event.location ? (
          <View style={styles.eventMetaRow}>
            <Ionicons name="location-outline" size={14} color={Colors.slate} />
            <Text style={styles.eventMetaText} numberOfLines={2}>
              {event.location}
            </Text>
          </View>
        ) : null}
        {event.notes ? <Text style={styles.eventNotes}>{event.notes}</Text> : null}
      </View>
      <View style={styles.emailActions}>
        <Pressable
          onPress={onAdd}
          accessibilityLabel="Add event to calendar"
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.emailSendBtn, pressed && styles.emailSendBtnPressed]}>
          <Ionicons name="calendar" size={14} color={Colors.onControl} />
          <Text style={styles.emailSendText}>Add to Calendar</Text>
        </Pressable>
      </View>
    </View>
  );
};

const SourcesList = ({ sources }: { sources: MessageSource[] }) => {
  const { Colors, styles } = useMessageTheme();
  return (
  <View style={styles.sourcesWrap}>
    <View style={styles.sourcesHeaderRow}>
      <Ionicons name="link-outline" size={13} color={Colors.slate} />
      <Text style={styles.sourcesHeader}>
        {sources.length} {sources.length === 1 ? 'source' : 'sources'}
      </Text>
    </View>
    <View style={styles.sourceChips}>
      {sources.map((s, i) => (
        <Pressable
          key={s.url}
          onPress={() => {
            tap();
            WebBrowser.openBrowserAsync(s.url).catch(() => undefined);
          }}
          accessibilityLabel={`Open source: ${s.title}`}
          accessibilityRole="link"
          style={({ pressed }) => [styles.sourceChip, pressed && styles.sourceChipPressed]}>
          <Text style={styles.sourceChipNum}>{i + 1}</Text>
          <Text style={styles.sourceChipText} numberOfLines={1}>
            {hostOf(s.url)}
          </Text>
        </Pressable>
      ))}
    </View>
  </View>
  );
};

// Inline editor that replaces a user bubble when editing. Local draft state
// so each open starts fresh; nothing is destroyed until Save is pressed.
const InlineEditor = ({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) => {
  const { Colors, styles } = useMessageTheme();
  const [draft, setDraft] = useState(initialValue);
  const trimmed = draft.trim();
  const canSave = trimmed.length > 0;

  return (
    <View style={styles.editorWrap}>
      <TextInput
        style={styles.editorInput}
        value={draft}
        onChangeText={setDraft}
        multiline
        autoFocus
        selectionColor={Colors.blueprint}
        accessibilityLabel="Edit your message"
      />
      <View style={styles.editorActions}>
        <Pressable
          onPress={() => {
            tap();
            onCancel();
          }}
          hitSlop={8}
          accessibilityLabel="Cancel edit"
          accessibilityRole="button"
          style={({ pressed }) => [styles.editorBtn, pressed && styles.editorBtnPressed]}>
          <Text style={styles.editorCancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!canSave) return;
            tap();
            onSave(trimmed);
          }}
          disabled={!canSave}
          hitSlop={8}
          accessibilityLabel="Save edit and resend"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.editorSaveBtn,
            !canSave && styles.editorSaveBtnDisabled,
            pressed && canSave && styles.editorSaveBtnPressed,
          ]}>
          <Text style={styles.editorSaveText}>Save & send</Text>
        </Pressable>
      </View>
    </View>
  );
};

const ChatMessage = ({
  content,
  role,
  loading,
  streaming,
  animate = true,
  isLastAssistant,
  index,
  onRegenerate,
  onEdit,
  isEditing,
  onSaveEdit,
  onCancelEdit,
  searching,
  searchQuery,
  sources,
  email,
  event,
  imageUrl,
  messageId,
  emailEditsMap,
}: Message & {
  loading?: boolean;
  streaming?: boolean;
  animate?: boolean;
  isLastAssistant?: boolean;
  index?: number;
  onRegenerate?: () => void;
  onEdit?: (index: number, content: string) => void;
  isEditing?: boolean;
  onSaveEdit?: (index: number, text: string) => void;
  onCancelEdit?: () => void;
  searching?: boolean;
  searchQuery?: string;
  sources?: MessageSource[];
  email?: EmailDraft;
  event?: EventDraft;
  imageUrl?: string;
  messageId?: string;
  emailEditsMap?: Map<string, EmailDraft>;
}) => {
  const { Colors, styles } = useMessageTheme();
  const markdownStyles = useMemo(() => createMarkdownStyles(Colors), [Colors]);
  const markdownRules = useMemo(() => createMarkdownRules(Colors), [Colors]);
  const isBot = role === Role.Bot;
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const onCopy = async () => {
    if (!content) return;
    try {
      await Clipboard.setStringAsync(content);
      success();
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  };

  const onShare = async () => {
    if (!content) return;
    try {
      await Share.share({ message: content });
    } catch {
      // ignore
    }
  };

  const onRegeneratePress = () => onRegenerate?.();

  const onEditPress = () => {
    if (typeof index !== 'number' || !content || !onEdit) return;
    onEdit(index, content);
  };

  const showActions = !loading && !streaming && !!content;

  if (isBot) {
    return (
      <Animated.View
        entering={
          animate
            ? FadeInDown.duration(300).easing(Easing.out(Easing.cubic))
            : undefined
        }
        style={styles.botRow}>
        {/* Model label row */}
        <View style={styles.modelLabel}>
          <BotMark />
          <Text style={styles.modelLabelText}>Archius</Text>
        </View>

        {/* Web search status (while the tool runs) */}
        {searching && <SearchingChip query={searchQuery} />}

        {/* Content (full-width, no bubble). Text is selectable for partial copy. */}
        <View>
          {loading && !searching ? (
            <TypingIndicator />
          ) : (
            <View>
              {content ? (
                <Markdown style={markdownStyles} rules={markdownRules}>
                  {content}
                </Markdown>
              ) : null}
              {streaming && content === '' && !searching ? <TypingIndicator /> : null}
            </View>
          )}
        </View>

        {/* Drafted email card */}
        {email && (
          <EmailCard
            email={email}
            messageId={messageId}
            editsMap={emailEditsMap}
          />
        )}

        {/* Drafted calendar event card */}
        {event && <EventCard event={event} />}

        {/* Cited sources from web search */}
        {sources && sources.length > 0 && <SourcesList sources={sources} />}

        {/* Action row */}
        {showActions && (
          <View style={styles.actionsRowBot}>
            <ActionButton
              icon={copied ? 'checkmark' : 'copy-outline'}
              label={copied ? 'Copied' : 'Copy'}
              onPress={onCopy}
              highlighted={copied}
            />
            <ActionButton icon="share-outline" label="Share message" onPress={onShare} />
            {isLastAssistant && onRegenerate && (
              <ActionButton
                icon="refresh"
                label="Regenerate response"
                onPress={onRegeneratePress}
              />
            )}
          </View>
        )}
      </Animated.View>
    );
  }

  // User message — inline edit mode replaces the bubble in place.
  if (isEditing && typeof index === 'number') {
    return (
      <View style={styles.userRow}>
        <InlineEditor
          initialValue={content}
          onSave={(text) => onSaveEdit?.(index, text)}
          onCancel={() => onCancelEdit?.()}
        />
      </View>
    );
  }

  return (
    <Animated.View
      entering={
        animate
          ? FadeInDown.duration(300).easing(Easing.out(Easing.cubic))
          : undefined
      }
      style={styles.userRow}>
      {imageUrl && (
        <Image source={{ uri: imageUrl }} style={styles.userImage} resizeMode="cover" />
      )}
      {content ? (
        <View style={styles.userBubble}>
          <Text style={styles.userText} selectable>
            {content}
          </Text>
        </View>
      ) : null}

      {showActions && (
        <View style={styles.actionsRowUser}>
          <ActionButton
            icon={copied ? 'checkmark' : 'copy-outline'}
            label={copied ? 'Copied' : 'Copy'}
            onPress={onCopy}
            highlighted={copied}
          />
          <ActionButton icon="create-outline" label="Edit message" onPress={onEditPress} />
        </View>
      )}
    </Animated.View>
  );
};

const createStyles = (Colors: AppColors) => StyleSheet.create({
  // Bot — full width, document-style flow.
  botRow: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  modelLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  botMarkSquare: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: Colors.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelLabelText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.slate,
    letterSpacing: 0.1,
  },

  // Inline editor (replaces the user bubble during edit)
  editorWrap: {
    width: '100%',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.blueprint,
    padding: 12,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  editorInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: Colors.graphite,
    lineHeight: 22,
    minHeight: 24,
    maxHeight: 200,
    padding: 0,
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  editorBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  editorBtnPressed: {
    backgroundColor: Colors.creamSoft,
  },
  editorCancelText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.slate,
  },
  editorSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.control,
  },
  editorSaveBtnPressed: {
    backgroundColor: Colors.controlPressed,
  },
  editorSaveBtnDisabled: {
    backgroundColor: Colors.stoneDark,
  },
  editorSaveText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.onControl,
  },

  // User — right-aligned with asymmetric "tail" bubble
  userRow: {
    paddingHorizontal: 16,
    marginBottom: 24,
    alignItems: 'flex-end',
  },
  userImage: {
    width: 200,
    height: 200,
    maxWidth: '78%',
    borderRadius: 16,
    marginBottom: 6,
    backgroundColor: Colors.userBubble,
  },
  userBubble: {
    maxWidth: '78%',
    backgroundColor: Colors.creamSoft,
    borderColor: Colors.stone,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 17,
    color: Colors.onUserBubble,
    lineHeight: 23,
    letterSpacing: -0.41,
  },

  // Action rows
  actionsRowBot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 12,
    marginLeft: -6,
  },
  actionsRowUser: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    marginTop: 6,
    marginRight: -6,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPressed: {
    backgroundColor: Colors.stone,
  },

  // Web search "Searching…" chip
  searchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: Colors.blueprintTint10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.blueprintTint20,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
    maxWidth: '100%',
  },
  searchChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.blueprint,
    flexShrink: 1,
  },

  // Email draft card
  emailCard: {
    marginTop: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.stone,
    overflow: 'hidden',
  },
  emailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.blueprintTint10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.blueprintTint20,
  },
  emailHeaderLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.blueprint,
    letterSpacing: 0.2,
  },
  emailField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.stone,
  },
  emailFieldLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.slateSoft,
    width: 52,
  },
  emailFieldInput: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.graphite,
    paddingVertical: 10,
    padding: 0,
  },
  emailBodyWrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },
  emailBodyInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: Colors.graphite,
    minHeight: 80,
    padding: 0,
  },
  emailActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  emailGhostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  emailGhostBtnPressed: { backgroundColor: Colors.creamSoft },
  emailGhostText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.slate },
  emailSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.control,
  },
  emailSendBtnPressed: { backgroundColor: Colors.controlPressed },
  emailSendText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.onControl },

  // Event card
  eventCard: {
    marginTop: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.stone,
    overflow: 'hidden',
  },
  eventHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.blueprintTint10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.blueprintTint20,
  },
  eventBody: {
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 8,
  },
  eventTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.graphite,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventMetaText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.slate,
  },
  eventNotes: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.slate,
    lineHeight: 19,
  },

  // Sources list (after a web-search answer)
  sourcesWrap: {
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.stone,
    paddingTop: 10,
  },
  sourcesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  sourcesHeader: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.slate,
    letterSpacing: 0.2,
  },
  sourceChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    backgroundColor: Colors.creamSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.stone,
    borderRadius: 8,
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 5,
  },
  sourceChipPressed: {
    backgroundColor: Colors.stone,
  },
  sourceChipNum: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: Colors.onControl,
    backgroundColor: Colors.blueprint,
    width: 16,
    height: 16,
    borderRadius: 8,
    textAlign: 'center',
    overflow: 'hidden',
    lineHeight: 16,
  },
  sourceChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.slate,
    flexShrink: 1,
  },

  // Typing dots
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.slate,
    opacity: 0.75,
  },

  // Code blocks
  codeBlockWrap: {
    width: '100%',
    backgroundColor: Colors.codeSurface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    marginVertical: 6,
    overflow: 'hidden',
  },
  codeBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  codeBlockLang: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 12,
    color: '#9DA5B4',
    textTransform: 'lowercase',
    fontWeight: '600' as const,
  },
  codeCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  codeCopyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#9DA5B4',
  },
  codeBlockText: {
    fontFamily: 'JetBrainsMono_400Regular',
    color: '#E8E4DB',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});

const createMarkdownStyles = (Colors: AppColors) => StyleSheet.create({
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 17,
    color: Colors.graphite,
    lineHeight: 25,
    letterSpacing: -0.41,
  },
  paragraph: { marginTop: 0, marginBottom: 16 },
  strong: { fontFamily: 'Inter_600SemiBold' },
  em: { fontFamily: 'SourceSerif4_300Light_Italic' },
  heading1: {
    fontFamily: 'SourceSerif4_400Regular',
    fontSize: 24,
    marginTop: 16,
    marginBottom: 8,
    color: Colors.ink,
  },
  heading2: {
    fontFamily: 'SourceSerif4_400Regular',
    fontSize: 22,
    marginTop: 16,
    marginBottom: 8,
    color: Colors.ink,
  },
  heading3: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 19,
    marginTop: 14,
    marginBottom: 6,
    color: Colors.ink,
  },
  code_inline: {
    // Soft blueprint tint instead of red — inline code shouldn't read as
    // "errored". Matches the brand and the rest of the tinted surfaces.
    backgroundColor: Colors.blueprintTint10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 14,
    color: Colors.blueprint,
  },
  link: { color: Colors.blueprint, textDecorationLine: 'underline' },
  bullet_list: { marginVertical: 8 },
  ordered_list: { marginVertical: 8 },
  list_item: { marginVertical: 4 },
  blockquote: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.stone,
    paddingLeft: 12,
    marginVertical: 16,
    opacity: 0.85,
  },
  hr: { backgroundColor: Colors.stone, height: StyleSheet.hairlineWidth, marginVertical: 16 },
});

export default ChatMessage;
