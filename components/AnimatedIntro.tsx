import BrandMark from '@/components/BrandMark';
import Colors from '@/constants/Colors';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedIntro = () => {
  const { top } = useSafeAreaInsets();
  // Entrance opacities + translations
  const markOpacity = useSharedValue(0);
  const markScale = useSharedValue(0.92);
  const wordmarkOpacity = useSharedValue(0);
  const wordmarkY = useSharedValue(12);
  const taglineOpacity = useSharedValue(0);
  // Idle breathing (very subtle, infinite)
  const breath = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.out(Easing.cubic);

    markOpacity.value = withTiming(1, { duration: 480, easing: ease });
    markScale.value = withTiming(1, { duration: 480, easing: ease });

    wordmarkOpacity.value = withDelay(180, withTiming(1, { duration: 420, easing: ease }));
    wordmarkY.value = withDelay(180, withTiming(0, { duration: 420, easing: ease }));

    taglineOpacity.value = withDelay(360, withTiming(1, { duration: 480, easing: ease }));

    // Soft breathing — starts after the entrance has settled.
    breath.value = withDelay(
      1000,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );
  }, [markOpacity, markScale, wordmarkOpacity, wordmarkY, taglineOpacity, breath]);

  const markStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [
      { scale: markScale.value },
      { translateY: breath.value * -2 },
    ],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkY.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
  }));

  return (
    <View style={[styles.container, { paddingTop: top + 64 }]}>
      <View style={styles.row}>
        <Animated.View style={markStyle}>
          <BrandMark size={48} color={Colors.ink} />
        </Animated.View>
        <Animated.Text style={[styles.wordmark, wordmarkStyle]}>Archius</Animated.Text>
      </View>

      <Animated.Text style={[styles.tagline, taglineStyle]}>
        AI that <Text style={styles.taglineItalic}>actually</Text> works.
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: Colors.cream,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  wordmark: {
    fontFamily: 'SourceSerif4_300Light',
    fontSize: 52,
    color: Colors.ink,
    letterSpacing: -1.2,
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 18,
    color: Colors.slate,
    textAlign: 'center',
  },
  taglineItalic: {
    fontFamily: 'SourceSerif4_300Light_Italic',
    color: Colors.blueprint,
    fontSize: 18,
  },
});

export default AnimatedIntro;
