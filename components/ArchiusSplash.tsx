// ArchiusSplash.tsx
//
// JS-side splash overlay that takes over from the native splash, plays a
// short entrance animation, holds briefly, then fades to reveal the app.
//
// Visual continuity with `AnimatedIntro`: same BrandMark, same Source Serif
// wordmark family — so when the splash fades, the landing screen behind it
// reads as a continuation, not a hard cut to a different brand impression.

import BrandMark from '@/components/BrandMark';
import type { AppColors } from '@/constants/Colors';
import { useThemeColors } from '@/providers/Theme';
import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

const MARK_SIZE = 56;
const HAIRLINE_TARGET_W = 56;

export interface ArchiusSplashProps {
  /** Called once the splash has fully faded out. Use it to unmount the overlay. */
  onFinish: () => void;
  /** Override the hold duration (ms) before the fade-out begins. Default: 700. */
  holdMs?: number;
}

export function ArchiusSplash({ onFinish, holdMs = 700 }: ArchiusSplashProps) {
  const Colors = useThemeColors();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  const markOpacity = useSharedValue(0);
  const markScale = useSharedValue(0.86);
  const wordmarkOpacity = useSharedValue(0);
  const wordmarkY = useSharedValue(10);
  const hairlineW = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    const easeOutQuint = Easing.bezier(0.16, 1, 0.3, 1);

    markOpacity.value = withTiming(1, { duration: 420, easing: easeOutQuint });
    markScale.value = withSpring(1, { damping: 14, stiffness: 110, mass: 0.9 });

    wordmarkOpacity.value = withDelay(280, withTiming(1, { duration: 360, easing: easeOutQuint }));
    wordmarkY.value = withDelay(280, withTiming(0, { duration: 360, easing: easeOutQuint }));

    hairlineW.value = withDelay(560, withTiming(HAIRLINE_TARGET_W, { duration: 320, easing: easeOutQuint }));

    const fadeOutStart = 560 + 320 + holdMs;
    overlayOpacity.value = withDelay(
      fadeOutStart,
      withTiming(
        0,
        { duration: 340, easing: Easing.bezier(0.4, 0, 0.2, 1) },
        () => {
          // Fire onFinish even when the animation was interrupted (e.g.,
          // app backgrounded) so the overlay doesn't get stuck.
          runOnJS(onFinish)();
        }
      )
    );
  }, [holdMs, onFinish, markOpacity, markScale, wordmarkOpacity, wordmarkY, hairlineW, overlayOpacity]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: markScale.value }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkY.value }],
  }));

  const hairlineStyle = useAnimatedStyle(() => ({
    width: hairlineW.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, styles.overlay, overlayStyle]}>
      <Animated.View style={markStyle}>
        <BrandMark size={MARK_SIZE} color={Colors.ink} />
      </Animated.View>

      <Animated.Text style={[styles.wordmark, wordmarkStyle]}>Archius</Animated.Text>

      <Animated.View style={[styles.hairline, hairlineStyle]} />
    </Animated.View>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  overlay: {
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  wordmark: {
    // Match AnimatedIntro family + color so the splash → intro transition
    // is a true cross-fade rather than a hard family/size jump.
    fontFamily: 'SourceSerif4_300Light',
    marginTop: 18,
    fontSize: 30,
    color: Colors.ink,
    letterSpacing: -0.4,
  },
  hairline: {
    marginTop: 14,
    height: StyleSheet.hairlineWidth * 3,
    backgroundColor: Colors.blueprint,
    opacity: 0.7,
    borderRadius: 1,
  },
});

export default ArchiusSplash;
