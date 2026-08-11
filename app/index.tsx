import AnimatedIntro from '@/components/AnimatedIntro';
import BottomLoginSheet from '@/components/BottomLoginSheet';
import { useThemeColors } from '@/providers/Theme';
import { useAuth } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';
import { View, StyleSheet } from 'react-native';

const Page = () => {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const Colors = useThemeColors();

  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect href="/(auth)/(drawer)/(chat)/new" />;

  return (
    <View style={[styles.container, { backgroundColor: Colors.cream }]}>
      <AnimatedIntro />
      <BottomLoginSheet />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default Page;
