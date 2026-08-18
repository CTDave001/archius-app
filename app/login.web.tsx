import BrandMark from '@/components/BrandMark';
import type { AppColors } from '@/constants/Colors';
import { useAppTheme } from '@/providers/Theme';
import { useAuth } from '@clerk/clerk-expo';
import { SignIn } from '@clerk/clerk-expo/web';
import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

export default function WebLogin() {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { colors: Colors, resolvedTheme, setMode } = useAppTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  const compact = width < 900;

  if (!isLoaded) return <View style={styles.page} />;
  if (isSignedIn) return <Redirect href="/(auth)/(drawer)/(chat)/new" />;

  return (
    <View style={[styles.page, compact && styles.pageCompact]}>
      {!compact && (
        <View style={styles.brandPanel}>
          <Link href="/" asChild>
            <Pressable style={styles.panelBrand}>
              <BrandMark size={30} color={Colors.onBrandPanel} />
              <Text style={styles.panelBrandName}>Archius</Text>
            </Pressable>
          </Link>
          <View style={styles.panelCopy}>
            <Text style={styles.panelEyebrow}>YOUR FOCUSED AI WORKSPACE</Text>
            <Text style={styles.panelTitle}>Pick up where you left off.</Text>
            <Text style={styles.panelBody}>Your conversations, preferences, and Pro access stay connected to one Archius account.</Text>
          </View>
          <View style={styles.panelQuote}>
            <Text style={styles.quoteMark}>“</Text>
            <Text style={styles.quote}>Useful answers, a calmer interface, and no performance theater.</Text>
          </View>
        </View>
      )}

      <View style={styles.formPanel}>
        <View style={styles.formTopbar}>
          {compact ? (
            <Link href="/" asChild><Pressable style={styles.compactBrand}><BrandMark size={25} color={Colors.ink} /><Text style={styles.compactBrandName}>Archius</Text></Pressable></Link>
          ) : <View />}
          <Pressable
            onPress={() => setMode(resolvedTheme === 'dark' ? 'light' : 'dark')}
            accessibilityLabel={`Use ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
            style={styles.themeButton}>
            <Ionicons name={resolvedTheme === 'dark' ? 'sunny-outline' : 'moon-outline'} size={18} color={Colors.ink} />
          </Pressable>
        </View>
        <View style={styles.clerkWrap}>
          <Text style={styles.welcome}>Welcome to Archius</Text>
          <Text style={styles.welcomeSub}>Sign in or create an account to continue.</Text>
          <View style={styles.accountHint}>
            <Ionicons name="sync-outline" size={16} color={Colors.blueprint} />
            <Text style={styles.accountHintText}>
              Already use Archius on iPhone? Use the same Archius sign-in here to bring your Pro
              access with you.
            </Text>
          </View>
          <SignIn
            routing="hash"
            appearance={{
              variables: {
                colorPrimary: Colors.control,
                colorBackground: Colors.surface,
                colorText: Colors.graphite,
                colorTextSecondary: Colors.slate,
                colorInputBackground: Colors.cream,
                colorInputText: Colors.graphite,
                borderRadius: '0.8rem',
                fontFamily: 'Inter, system-ui, sans-serif',
              },
              elements: {
                rootBox: { width: '100%' },
                cardBox: { width: '100%', boxShadow: 'none' },
                card: { width: '100%', boxShadow: 'none', border: `1px solid ${Colors.stone}`, background: Colors.surface },
                headerTitle: { display: 'none' },
                headerSubtitle: { display: 'none' },
                socialButtonsBlockButton: { borderColor: Colors.stone, background: Colors.cream },
                formFieldInput: { borderColor: Colors.stone, background: Colors.cream },
                footerActionLink: { color: Colors.blueprint },
              },
            }}
          />
          <Text style={styles.securityNote}><Ionicons name="lock-closed-outline" size={12} color={Colors.slateSoft} /> Your account is secured by Clerk. Archius never sees your password.</Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  page: { flex: 1, flexDirection: 'row', minHeight: '100vh' as any, backgroundColor: Colors.cream },
  pageCompact: { flexDirection: 'column' },
  brandPanel: { width: '43%', minWidth: 420, backgroundColor: Colors.brandPanel, padding: 48, justifyContent: 'space-between' },
  panelBrand: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'flex-start' },
  panelBrandName: { fontFamily: 'SourceSerif4_400Regular', fontSize: 27, color: Colors.onBrandPanel },
  panelCopy: { maxWidth: 460 },
  panelEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.6, color: Colors.blueprintLifted, marginBottom: 22 },
  panelTitle: { fontFamily: 'SourceSerif4_300Light', fontSize: 54, lineHeight: 59, letterSpacing: -1.6, color: Colors.onBrandPanel },
  panelBody: { fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 27, color: Colors.onBrandPanelMuted, opacity: 0.78, marginTop: 22 },
  panelQuote: { maxWidth: 390, borderTopWidth: 1, borderTopColor: Colors.blueprintTint25, paddingTop: 22 },
  quoteMark: { fontFamily: 'SourceSerif4_300Light', fontSize: 32, lineHeight: 28, color: Colors.blueprintLifted },
  quote: { fontFamily: 'SourceSerif4_300Light_Italic', fontSize: 17, lineHeight: 25, color: Colors.onBrandPanelMuted },
  formPanel: { flex: 1, backgroundColor: Colors.cream },
  formTopbar: { height: 78, paddingHorizontal: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compactBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactBrandName: { fontFamily: 'SourceSerif4_400Regular', fontSize: 23, color: Colors.ink },
  themeButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: Colors.stone, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  clerkWrap: { width: '100%', maxWidth: 470, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 28, paddingBottom: 48 },
  welcome: { fontFamily: 'SourceSerif4_300Light', fontSize: 34, color: Colors.ink, textAlign: 'center', marginBottom: 7 },
  welcomeSub: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.slate, textAlign: 'center', marginBottom: 24 },
  accountHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.blueprintTint20, borderRadius: 12, backgroundColor: Colors.blueprintTint10 },
  accountHintText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, color: Colors.graphite },
  securityNote: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.slateSoft, textAlign: 'center', marginTop: 16 },
});
