import AnimatedIntro from '@/components/AnimatedIntro';
import BottomLoginSheet from '@/components/BottomLoginSheet';
import Colors from '@/constants/Colors';
import { useAuth } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';
import { View, StyleSheet } from 'react-native';

const Page = () => {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });

  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect href="/(auth)/(drawer)/(chat)/new" />;

  return (
    <View style={styles.container}>
      <AnimatedIntro />
      <BottomLoginSheet />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
});

export default Page;
