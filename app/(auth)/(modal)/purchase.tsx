import Colors from '@/constants/Colors';
import { defaultStyles, eyebrow } from '@/constants/Styles';
import { useRevenueCat } from '@/providers/RevenueCat';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PRO_OFFERING_PACKAGE = '$rc_monthly';
const PRIVACY_URL = 'https://archius.app/privacy';
const TERMS_URL = 'https://archius.app/terms';

type Benefit = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
};

const benefits: Benefit[] = [
  {
    icon: 'globe-outline',
    title: 'Web search',
    subtitle: 'Archius looks things up live and cites real sources — no more stale answers.',
  },
  {
    icon: 'flash-outline',
    title: '500 fast messages a day',
    subtitle: 'Most things you ask — quick, fluent responses.',
  },
  {
    icon: 'bulb-outline',
    title: '50 advanced messages a day',
    subtitle: 'Deeper reasoning when you need a real answer.',
  },
  {
    icon: 'image-outline',
    title: '25 image-aware messages',
    subtitle: 'Send screenshots, photos, or diagrams to ask about.',
  },
];

type CompareRow = {
  label: string;
  free: string;
  pro: string;
};

const compareRows: CompareRow[] = [
  { label: 'Messages per day', free: '50', pro: '500' },
  { label: 'Web search', free: '—', pro: '✓' },
  { label: 'Fast model (V4 Flash)', free: '✓', pro: '✓' },
  { label: 'Advanced model (V4 Pro)', free: '—', pro: '50/day' },
  { label: 'Image input', free: '—', pro: '25/day' },
  { label: 'No filler, no flattery', free: '✓', pro: '✓' },
];

type FaqEntry = {
  q: string;
  a: string;
};

const faqs: FaqEntry[] = [
  {
    q: 'Can I cancel anytime?',
    a: "Yes. Open your Apple ID or Google Play subscription settings and tap cancel. You'll keep Pro until the end of your current billing period.",
  },
  {
    q: 'How is my data handled?',
    a: 'Messages go to the AI providers (DeepSeek for text, Google for images) to generate responses. Your chat history is stored on your device, not on our servers. We never sell your data. See our Privacy Policy for details.',
  },
  {
    q: 'What models does Pro use?',
    a: "Free tier uses DeepSeek V4 Flash. Pro adds access to DeepSeek V4 Pro (the more capable reasoning model) and routes image messages to Google's Gemini.",
  },
  {
    q: 'Will my chats sync across devices?',
    a: 'Today your chats live on the device you sent them from. Cross-device sync is on the roadmap for v1.1.',
  },
];

const AUTO_RENEW_DISCLOSURE =
  'Subscription automatically renews unless canceled at least 24 hours before the end of the current period.';

const Paywall = () => {
  const { bottom } = useSafeAreaInsets();
  const router = useRouter();
  const { packages, purchasePackage, restorePermissions } = useRevenueCat();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const pack =
    packages.find((p) => p.identifier === PRO_OFFERING_PACKAGE) ||
    packages.find((p) => p.product.subscriptionPeriod === 'P1M') ||
    packages[0];

  const price = pack?.product.priceString ?? '$12';

  const onPurchase = async () => {
    if (!pack) return;
    setPurchasing(true);
    try {
      await purchasePackage(pack);
      router.dismiss();
    } catch {
      // purchasePackage already alerts for real failures; cancellations are
      // silent. Either way, keep the paywall open so the user can retry.
    } finally {
      setPurchasing(false);
    }
  };

  const onRestore = async () => {
    setRestoring(true);
    try {
      await restorePermissions();
    } catch {
      // restorePermissions already presents a useful error.
    } finally {
      setRestoring(false);
    }
  };

  return (
    <View style={[defaultStyles.pageContainer, { paddingBottom: bottom }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[eyebrow, { marginBottom: 8 }]}>Pro</Text>
        <Text style={styles.heading}>
          AI that <Text style={styles.headingItalic}>actually</Text> works
        </Text>
        <Text style={styles.subheading}>Real answers. Higher daily limits.</Text>

        {/* Benefit cards */}
        <View style={styles.benefits}>
          {benefits.map((b) => (
            <View key={b.title} style={styles.benefitCard}>
              <View style={styles.benefitIconSquare}>
                <Ionicons name={b.icon} size={20} color={Colors.blueprint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitSubtitle}>{b.subtitle}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Comparison table */}
        <Text style={styles.compareTitle}>Free vs. Pro</Text>
        <View style={styles.compareTable}>
          <View style={styles.compareHeader}>
            <Text style={[styles.compareCell, { flex: 1.4, textAlign: 'left' }]}> </Text>
            <Text style={styles.compareHeaderCell}>Free</Text>
            <Text style={[styles.compareHeaderCell, { color: Colors.blueprint }]}>Pro</Text>
          </View>
          {compareRows.map((row, idx) => (
            <View
              key={row.label}
              style={[
                styles.compareRow,
                idx === compareRows.length - 1 && { borderBottomWidth: 0 },
              ]}>
              <Text style={[styles.compareCell, { flex: 1.4, textAlign: 'left' }]}>
                {row.label}
              </Text>
              <Text style={styles.compareCell}>{row.free}</Text>
              <Text style={[styles.compareCell, { color: Colors.ink, fontFamily: 'Inter_600SemiBold' }]}>
                {row.pro}
              </Text>
            </View>
          ))}
        </View>

        {/* Price card */}
        <View style={styles.priceCard}>
          <View>
            <Text style={styles.priceLabel}>Monthly</Text>
            <Text style={styles.priceValue}>{price}</Text>
          </View>
          <Text style={styles.priceNote}>Cancel anytime</Text>
        </View>

        {/* FAQ */}
        <Text style={styles.compareTitle}>Frequently asked</Text>
        <View style={styles.faqWrap}>
          {faqs.map((f, idx) => {
            const open = openFaq === idx;
            return (
              <View key={f.q} style={styles.faqItem}>
                <Pressable
                  onPress={() => setOpenFaq(open ? null : idx)}
                  style={({ pressed }) => [
                    styles.faqQuestion,
                    pressed && { backgroundColor: Colors.creamSoft },
                  ]}>
                  <Text style={styles.faqQuestionText}>{f.q}</Text>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={Colors.slate}
                  />
                </Pressable>
                {open && <Text style={styles.faqAnswer}>{f.a}</Text>}
              </View>
            );
          })}
        </View>

        <Text style={styles.disclosure}>
          {AUTO_RENEW_DISCLOSURE} Manage or cancel through your Apple ID (iOS) or Google Play
          account (Android). Refunds are handled by Apple or Google.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(bottom, 16) }]}>
        {!pack ? (
          <View style={styles.unavailableNote}>
            <Text style={styles.unavailableText}>
              In-app purchases aren't configured yet. Try again after launch.
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[defaultStyles.btn, styles.cta]}
            disabled={purchasing}
            onPress={onPurchase}
            accessibilityLabel={`Subscribe to Archius Pro for ${price} per month`}
            accessibilityRole="button">
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Continue — {price}/month</Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.maybeLater}
          onPress={() => router.dismiss()}
          accessibilityLabel="Maybe later, close paywall"
          accessibilityRole="button">
          <Text style={styles.maybeLaterText}>Maybe later</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.restore}
          disabled={restoring}
          onPress={onRestore}
          accessibilityLabel="Restore purchases"
          accessibilityRole="button">
          <Text style={styles.restoreText}>
            {restoring ? 'Restoring…' : 'Restore Purchases'}
          </Text>
        </TouchableOpacity>

        <View style={styles.legalRow}>
          <TouchableOpacity
            onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}
            accessibilityLabel="Open Terms of Use">
            <Text style={styles.legalLink}>Terms</Text>
          </TouchableOpacity>
          <Text style={styles.legalSep}>·</Text>
          <TouchableOpacity
            onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
            accessibilityLabel="Open Privacy Policy">
            <Text style={styles.legalLink}>Privacy</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  content: { padding: 24, paddingBottom: 40 },
  heading: {
    fontFamily: 'SourceSerif4_300Light',
    fontSize: 34,
    color: Colors.ink,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  headingItalic: {
    fontFamily: 'SourceSerif4_300Light_Italic',
    color: Colors.blueprint,
  },
  subheading: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: Colors.slate,
    marginBottom: 24,
  },
  benefits: { gap: 10, marginBottom: 28 },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.stone,
  },
  benefitIconSquare: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.blueprintTint10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.blueprintTint20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.graphite,
  },
  benefitSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.slate,
    marginTop: 2,
    opacity: 0.85,
  },
  compareTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.slate,
    marginBottom: 8,
    marginTop: 8,
  },
  compareTable: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.stone,
    marginBottom: 24,
    overflow: 'hidden',
  },
  compareHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.creamSoft,
  },
  compareHeaderCell: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.slate,
    textAlign: 'center',
  },
  compareRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.stone,
  },
  compareCell: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.graphite,
    textAlign: 'center',
  },
  priceCard: {
    backgroundColor: Colors.ink,
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  priceLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.blueprintLifted,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  priceValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: '#fff',
    marginTop: 4,
  },
  priceNote: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.creamSoft, opacity: 0.7 },
  faqWrap: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.stone,
    overflow: 'hidden',
    marginBottom: 20,
  },
  faqItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.stone,
  },
  faqQuestion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  faqQuestionText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.graphite,
  },
  faqAnswer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.slate,
    paddingHorizontal: 14,
    paddingBottom: 14,
    lineHeight: 19,
  },
  disclosure: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.slate,
    lineHeight: 18,
  },
  footer: { paddingHorizontal: 24, paddingTop: 8 },
  cta: { backgroundColor: Colors.ink },
  ctaText: { fontFamily: 'Inter_600SemiBold', color: '#fff', fontSize: 16 },
  maybeLater: { alignItems: 'center', paddingVertical: 12 },
  maybeLaterText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.slate,
  },
  restore: { alignItems: 'center', paddingVertical: 8 },
  restoreText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.blueprint,
  },
  unavailableNote: {
    padding: 14,
    backgroundColor: Colors.creamSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.stone,
  },
  unavailableText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.slate,
    textAlign: 'center',
  },
  legalRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 4 },
  legalLink: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.blueprint },
  legalSep: { color: Colors.slateSoft },
});

export default Paywall;
