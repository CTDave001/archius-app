import type { AppColors } from '@/constants/Colors';
import { useAppTheme } from '@/providers/Theme';
import { lightImpact, mediumImpact, tap } from '@/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export type Props = {
  onShouldSend: (message: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  autoFocus?: boolean;
  webSearchEnabled?: boolean;
  deepThinkEnabled?: boolean;
  canUsePro?: boolean;
  // Single + button opens an anchored menu (toggles + attach image). Parent
  // measures the trigger to position the popover.
  onOpenMenu?: (anchor: { x: number; y: number; width: number; height: number }) => void;
  // True when any toggle is active — colors the + button to reflect it.
  menuActive?: boolean;
  attachedImageUri?: string | null;
  onRemoveImage?: () => void;
};

export type MessageInputHandle = {
  setValue: (value: string) => void;
  getValue: () => string;
  focus: () => void;
  clear: () => void;
};

const MessageInput = forwardRef<MessageInputHandle, Props>(function MessageInput(
  {
    onShouldSend,
    onStop,
    isStreaming = false,
    autoFocus = false,
    webSearchEnabled = false,
    deepThinkEnabled = false,
    canUsePro = false,
    onOpenMenu,
    menuActive = false,
    attachedImageUri,
    onRemoveImage,
  },
  ref
) {
  const { colors: Colors, resolvedTheme } = useAppTheme();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  const plusRef = useRef<View>(null);

  const openMenu = () => {
    if (!onOpenMenu) return;
    tap();
    plusRef.current?.measureInWindow((x, y, width, height) => {
      onOpenMenu({ x, y, width, height });
    });
  };
  const [message, setMessage] = useState('');
  const messageRef = useRef('');
  const { bottom } = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  // Transient confirmation ribbon — shows when a mode turns on, then
  // auto-hides (the lit toggle stays as the persistent indicator). Also
  // hidden as soon as a message is sent.
  const [ribbonVisible, setRibbonVisible] = useState(false);

  const searchActive = webSearchEnabled && canUsePro;
  const thinkActive = deepThinkEnabled && canUsePro;

  // Keep ref in sync so the imperative getValue() returns the current value
  // synchronously (state isn't readable from the closure-bound handle).
  messageRef.current = message;

  useEffect(() => {
    if (searchActive || thinkActive) {
      setRibbonVisible(true);
      const t = setTimeout(() => setRibbonVisible(false), 4000);
      return () => clearTimeout(t);
    }
    setRibbonVisible(false);
  }, [searchActive, thinkActive]);

  useImperativeHandle(
    ref,
    () => ({
      setValue: (v: string) => setMessage(v),
      getValue: () => messageRef.current,
      focus: () => inputRef.current?.focus(),
      clear: () => setMessage(''),
    }),
    []
  );

  const canSend = message.trim().length > 0 || !!attachedImageUri;

  // 0 = idle, 1 = ready to send, 2 = streaming (stop mode)
  const targetValue = isStreaming ? 2 : canSend ? 1 : 0;
  const progress = useDerivedValue(() =>
    withTiming(targetValue, { duration: 180, easing: Easing.out(Easing.quad) })
  );

  const actionBtnStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1, 2],
      [Colors.stoneDark, Colors.blueprint, Colors.controlPressed]
    ),
    transform: [{ scale: 0.92 + Math.min(progress.value, 1) * 0.08 }],
  }));

  const onSend = () => {
    const trimmed = message.trim();
    if (!trimmed && !attachedImageUri) return;
    lightImpact();
    onShouldSend(trimmed);
    setMessage('');
    setRibbonVisible(false);
  };

  const onActionPress = () => {
    if (isStreaming) {
      mediumImpact();
      onStop?.();
      return;
    }
    onSend();
  };

  const actionDisabled = !isStreaming && !canSend;

  // Hardware Enter shouldn't fire-and-forget a send while a stream is in
  // flight; the user is allowed to TYPE their next message (queue it
  // mentally) but the actual send is gated to the action button which is
  // already in stop mode.
  const onSubmit = () => {
    if (isStreaming) return;
    onSend();
  };

  return (
    <BlurView
      intensity={75}
      tint={resolvedTheme === 'dark' ? 'dark' : 'light'}
      style={[
        styles.blurContainer,
        { paddingBottom: Math.max(bottom, 8), paddingTop: 10 },
      ]}>
      {ribbonVisible && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(220)}
          style={styles.searchBanner}>
          <Ionicons
            name={thinkActive ? 'sparkles' : 'globe'}
            size={12}
            color={Colors.blueprint}
          />
          <Text style={styles.searchBannerText}>
            {thinkActive
              ? 'Deep think on — using the advanced reasoning model.'
              : 'Web search on — Archius will look things up when it helps.'}
          </Text>
        </Animated.View>
      )}
      {attachedImageUri && (
        <Animated.View entering={FadeIn.duration(150)} style={styles.attachmentRow}>
          <View style={styles.thumbWrap}>
            <Image source={{ uri: attachedImageUri }} style={styles.thumb} />
            <Pressable
              onPress={onRemoveImage}
              hitSlop={8}
              accessibilityLabel="Remove attached image"
              accessibilityRole="button"
              style={styles.thumbRemove}>
              <Ionicons name="close" size={13} color={Colors.onControl} />
            </Pressable>
          </View>
        </Animated.View>
      )}
      <View style={styles.row}>
        {onOpenMenu && (
          <View ref={plusRef} collapsable={false}>
            <Pressable
              onPress={openMenu}
              accessibilityLabel="More options (web search, deep think, attach image)"
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.toggleBtn,
                menuActive && styles.toggleBtnActive,
                pressed && styles.toggleBtnPressed,
              ]}>
              <Ionicons name="add" size={22} color={menuActive ? Colors.onControl : Colors.slateSoft} />
            </Pressable>
          </View>
        )}
        <TextInput
          autoFocus={autoFocus}
          ref={inputRef}
          placeholder="Message Archius"
          placeholderTextColor={Colors.slateSoft}
          style={styles.messageInput}
          onChangeText={setMessage}
          onSubmitEditing={onSubmit}
          blurOnSubmit={false}
          value={message}
          multiline
          returnKeyType="send"
        />
        <AnimatedTouchable
          onPress={onActionPress}
          disabled={actionDisabled}
          style={[styles.actionBtn, actionBtnStyle]}
          accessibilityLabel={isStreaming ? 'Stop generating' : 'Send message'}>
          <Ionicons
            name={isStreaming ? 'stop' : 'arrow-up'}
            size={isStreaming ? 16 : 20}
            color={Colors.onControl}
          />
        </AnimatedTouchable>
      </View>
    </BlurView>
  );
});

const createStyles = (Colors: AppColors) => StyleSheet.create({
  // BlurView on Android collapses to a near-opaque background — we layer a
  // translucent cream below it so the brand color shows through, both on
  // platforms with real blur (iOS) and platforms without (Android).
  blurContainer: {
    backgroundColor: Platform.OS === 'android' ? Colors.cream : Colors.composerGlass,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.stone,
  },
  searchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  attachmentRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  thumbWrap: {
    width: 64,
    height: 64,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.stone,
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.control,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.cream,
  },
  searchBannerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.blueprint,
    flexShrink: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    gap: 4,
  },
  toggleBtn: {
    width: 40,
    height: 44,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  toggleBtnActive: {
    backgroundColor: Colors.blueprint,
  },
  toggleBtnPressed: {
    opacity: 0.7,
  },
  messageInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    borderColor: Colors.stone,
    backgroundColor: Colors.surfaceElevated,
    color: Colors.graphite,
    maxHeight: 160,
    minHeight: 44,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
});

export default MessageInput;
