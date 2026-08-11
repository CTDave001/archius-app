import BrandMark from '@/components/BrandMark';
import type { AppColors } from '@/constants/Colors';
import { useAppTheme } from '@/providers/Theme';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

const featureCards = [
  { icon: 'shield-checkmark-outline' as const, title: 'Answers with standards', body: 'Clear reasoning, live sources when needed, and no confident guessing.' },
  { icon: 'sync-outline' as const, title: 'Your work, everywhere', body: 'Private conversations follow your account across browsers.' },
  { icon: 'sparkles-outline' as const, title: 'Fast or thoughtful', body: 'Move from a quick answer to deeper reasoning without changing tools.' },
];

export default function WebLanding() {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { colors: Colors, resolvedTheme, setMode } = useAppTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  const compact = width < 820;

  if (!isLoaded) return <View style={[styles.page, { backgroundColor: Colors.cream }]} />;
  if (isSignedIn) return <Redirect href="/(auth)/(drawer)/(chat)/new" />;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.nav}>
        <View style={styles.brand}>
          <BrandMark size={27} color={Colors.ink} />
          <Text style={styles.brandName}>Archius</Text>
        </View>
        <View style={styles.navActions}>
          <Pressable
            onPress={() => setMode(resolvedTheme === 'dark' ? 'light' : 'dark')}
            accessibilityLabel={`Use ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
            style={({ hovered, pressed }) => [styles.themeButton, (hovered || pressed) && styles.themeButtonHover]}>
            <Ionicons name={resolvedTheme === 'dark' ? 'sunny-outline' : 'moon-outline'} size={18} color={Colors.ink} />
          </Pressable>
          <Link href="/login" asChild>
            <Pressable style={({ hovered, pressed }) => [styles.navSignIn, (hovered || pressed) && styles.navSignInHover]}>
              <Text style={styles.navSignInText}>Sign in</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <View style={[styles.hero, compact && styles.heroCompact]}>
        <View style={styles.heroCopy}>
          <View style={styles.eyebrowPill}>
            <View style={styles.liveDot} />
            <Text style={styles.eyebrow}>ARCHIUS FOR WEB</Text>
          </View>
          <Text style={[styles.headline, compact && styles.headlineCompact]}>
            AI that <Text style={styles.headlineItalic}>actually</Text>{' '}works.
          </Text>
          <Text style={styles.heroBody}>
            A calm, focused place to think, research, draft, and get a straight answer — now built for the larger screen.
          </Text>
          <View style={styles.ctaRow}>
            <Link href="/login" asChild>
              <Pressable style={({ hovered, pressed }) => [styles.primaryCta, (hovered || pressed) && styles.primaryCtaHover]}>
                <Text style={styles.primaryCtaText}>Open Archius</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.onControl} />
              </Pressable>
            </Link>
            <Text style={styles.ctaNote}>Free to start · Same Archius account</Text>
          </View>
        </View>

        <View style={[styles.preview, compact && styles.previewCompact]}>
          <View style={styles.previewChrome}>
            <View style={styles.windowDots}><View style={styles.windowDot} /><View style={styles.windowDot} /><View style={styles.windowDot} /></View>
            <Text style={styles.previewTitle}>A focused workspace</Text>
            <View style={{ width: 42 }} />
          </View>
          <View style={styles.previewBody}>
            <View style={styles.previewSidebar}>
              <View style={styles.previewNew}><BrandMark size={13} color={Colors.onControl} /><View style={styles.previewLineStrong} /></View>
              {[0, 1, 2, 3].map((item) => <View key={item} style={[styles.previewLine, { width: `${78 - item * 8}%` as any }]} />)}
            </View>
            <View style={styles.previewChat}>
              <View style={styles.previewMark}><BrandMark size={24} color={Colors.onControl} /></View>
              <Text style={styles.previewHello}>Hello. What are we working on?</Text>
              <Text style={styles.previewSub}>Ask for an explanation, a draft, a plan, or a current answer.</Text>
              <View style={styles.previewComposer}><Text style={styles.previewPlaceholder}>Message Archius</Text><View style={styles.previewSend}><Ionicons name="arrow-up" size={15} color={Colors.onControl} /></View></View>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.featureGrid}>
        {featureCards.map((feature) => (
          <View key={feature.title} style={[styles.featureCard, compact && styles.featureCardCompact]}>
            <View style={styles.featureIcon}><Ionicons name={feature.icon} size={20} color={Colors.blueprint} /></View>
            <Text style={styles.featureTitle}>{feature.title}</Text>
            <Text style={styles.featureBody}>{feature.body}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}><Text style={styles.footerText}>© 2026 Archius</Text><Text style={styles.footerText}>Privacy-first AI, designed in California.</Text></View>
    </ScrollView>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.cream },
  pageContent: { minHeight: '100vh' as any, paddingHorizontal: 28, paddingBottom: 28 },
  nav: { width: '100%', maxWidth: 1240, alignSelf: 'center', height: 84, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandName: { fontFamily: 'SourceSerif4_400Regular', fontSize: 25, color: Colors.ink },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  themeButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: Colors.stone, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  themeButtonHover: { backgroundColor: Colors.creamSoft },
  navSignIn: { height: 40, paddingHorizontal: 18, borderRadius: 12, backgroundColor: Colors.control, alignItems: 'center', justifyContent: 'center' },
  navSignInHover: { backgroundColor: Colors.controlPressed },
  navSignInText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.onControl },
  hero: { width: '100%', maxWidth: 1240, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 68, paddingTop: 54, paddingBottom: 66 },
  heroCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 48, paddingTop: 32 },
  heroCopy: { flex: 0.9, maxWidth: 540 },
  eyebrowPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, height: 30, borderRadius: 15, backgroundColor: Colors.blueprintTint10, marginBottom: 24 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.sage },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, color: Colors.blueprint },
  headline: { fontFamily: 'SourceSerif4_300Light', fontSize: 68, lineHeight: 72, letterSpacing: -2.4, color: Colors.ink, maxWidth: 530 },
  headlineCompact: { fontSize: 48, lineHeight: 52, letterSpacing: -1.5 },
  headlineItalic: { fontFamily: 'SourceSerif4_300Light_Italic', color: Colors.blueprint },
  heroBody: { fontFamily: 'Inter_400Regular', fontSize: 18, lineHeight: 30, color: Colors.slate, maxWidth: 520, marginTop: 24 },
  ctaRow: { marginTop: 32, alignItems: 'flex-start', gap: 12 },
  primaryCta: { height: 52, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, borderRadius: 14, backgroundColor: Colors.control, shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 18 },
  primaryCtaHover: { backgroundColor: Colors.controlPressed, transform: [{ translateY: -1 }] },
  primaryCtaText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.onControl },
  ctaNote: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.slateSoft },
  preview: { flex: 1.1, minWidth: 500, height: 470, borderRadius: 24, overflow: 'hidden', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.stone, shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 22 }, shadowOpacity: 0.16, shadowRadius: 44 },
  previewCompact: { minWidth: 0, width: '100%', height: 410 },
  previewChrome: { height: 52, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: Colors.stone, backgroundColor: Colors.creamSoft },
  windowDots: { width: 42, flexDirection: 'row', gap: 5 },
  windowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.stoneDark },
  previewTitle: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.slate, letterSpacing: 0.4 },
  previewBody: { flex: 1, flexDirection: 'row' },
  previewSidebar: { width: '31%', padding: 16, gap: 16, backgroundColor: Colors.creamSoft, borderRightWidth: 1, borderRightColor: Colors.stone },
  previewNew: { height: 38, borderRadius: 10, backgroundColor: Colors.control, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  previewLineStrong: { height: 6, width: '58%', borderRadius: 4, backgroundColor: Colors.onControl, opacity: 0.78 },
  previewLine: { height: 7, borderRadius: 4, backgroundColor: Colors.stoneDark, opacity: 0.7 },
  previewChat: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  previewMark: { width: 58, height: 58, borderRadius: 17, backgroundColor: Colors.control, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  previewHello: { fontFamily: 'SourceSerif4_300Light', fontSize: 25, color: Colors.ink, textAlign: 'center' },
  previewSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.slate, textAlign: 'center', lineHeight: 18, maxWidth: 280, marginTop: 9 },
  previewComposer: { position: 'absolute', left: 24, right: 24, bottom: 22, height: 48, borderRadius: 16, borderWidth: 1, borderColor: Colors.stone, backgroundColor: Colors.creamSoft, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 6 },
  previewPlaceholder: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.slateSoft },
  previewSend: { width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.control, alignItems: 'center', justifyContent: 'center' },
  featureGrid: { width: '100%', maxWidth: 1240, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingBottom: 70 },
  featureCard: { flex: 1, minWidth: 260, padding: 24, borderRadius: 18, borderWidth: 1, borderColor: Colors.stone, backgroundColor: Colors.surface },
  featureCardCompact: { flexBasis: '100%' as any },
  featureIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.blueprintTint10, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  featureTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.graphite, marginBottom: 7 },
  featureBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 21, color: Colors.slate },
  footer: { width: '100%', maxWidth: 1240, alignSelf: 'center', paddingTop: 22, borderTopWidth: 1, borderTopColor: Colors.stone, flexDirection: 'row', justifyContent: 'space-between', gap: 20 },
  footerText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.slateSoft },
});
