// One-time, per-account consent for sending data to AI providers.
//
// App Review guideline 5.1.2(i): before personal data is shared with a
// third-party AI service, the app must say WHAT is sent, WHO receives it,
// and obtain explicit permission. A passive "by continuing you agree" line
// on the login sheet was ruled insufficient — this gate requires an
// affirmative "Agree" tap before the chat UI is reachable.

import Colors from '@/constants/Colors';
import { defaultStyles } from '@/constants/Styles';
import { storage } from '@/utils/Storage';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const consentKey = (userId: string) => `consent.ai_providers.v1.${userId}`;

export const hasAIConsent = (userId: string | null | undefined): boolean =>
  !!userId && storage.getBoolean(consentKey(userId)) === true;

type Disclosure = {
  icon: keyof typeof Ionicons.glyphMap;
  what: string;
  who: string;
};

const disclosures: Disclosure[] = [
  {
    icon: 'chatbubble-outline',
    what: 'Your chat messages',
    who: 'Sent to DeepSeek (Hangzhou DeepSeek AI, China) to generate responses.',
  },
  {
    icon: 'image-outline',
    what: 'Images you attach',
    who: 'Sent to Google (Gemini, United States) so the AI can see and answer questions about them.',
  },
  {
    icon: 'globe-outline',
    what: 'Web search queries',
    who: 'When you turn on web search, the search text is sent to Tavily (United States) to fetch results.',
  },
];

export const AIConsentGate = ({ children }: { children: React.ReactNode }) => {
  const { userId, signOut } = useAuth();
  const [accepted, setAccepted] = useState(() => hasAIConsent(userId));
  const { top, bottom } = useSafeAreaInsets();

  if (accepted) return <>{children}</>;

  const onAgree = () => {
    if (userId) storage.set(consentKey(userId), true);
    setAccepted(true);
  };

  return (
    <View style={[styles.container, { paddingTop: top + 32 }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>BEFORE YOU START</Text>
        <Text style={styles.title}>How Archius uses AI providers</Text>
        <Text style={styles.lede}>
          Archius generates answers using external AI services. Here is exactly what leaves your
          device and where it goes:
        </Text>

        <View style={styles.cards}>
          {disclosures.map((d) => (
            <View key={d.what} style={styles.card}>
              <View style={styles.iconSquare}>
                <Ionicons name={d.icon} size={20} color={Colors.blueprint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{d.what}</Text>
                <Text style={styles.cardBody}>{d.who}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          Providers process this data to answer you; Archius does not sell your data or use it to
          train models. Chats are stored on your device, not on our servers. Details in our{' '}
          <Text
            style={styles.link}
            onPress={() => WebBrowser.openBrowserAsync('https://archius.app/privacy')}>
            Privacy Policy
          </Text>
          .
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(bottom, 16) }]}>
        <TouchableOpacity
          style={[defaultStyles.btn, styles.agreeBtn]}
          onPress={onAgree}
          accessibilityLabel="Agree and continue"
          accessibilityRole="button">
          <Text style={styles.agreeText}>Agree and continue</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.declineBtn}
          onPress={() => signOut()}
          accessibilityLabel="Decline and sign out"
          accessibilityRole="button">
          <Text style={styles.declineText}>Don't agree? Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { paddingHorizontal: 24, paddingBottom: 24 },
  eyebrow: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 2,
    color: Colors.blueprint,
    marginBottom: 10,
  },
  title: {
    fontFamily: 'SourceSerif4_400Regular',
    fontSize: 28,
    color: Colors.ink,
    marginBottom: 12,
  },
  lede: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.slate,
    lineHeight: 22,
    marginBottom: 20,
  },
  cards: { gap: 10, marginBottom: 20 },
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.stone,
  },
  iconSquare: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.blueprintTint10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.blueprintTint20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.graphite,
    marginBottom: 3,
  },
  cardBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.slate,
    lineHeight: 19,
  },
  note: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.slate,
    lineHeight: 20,
  },
  link: { color: Colors.blueprint, textDecorationLine: 'underline' },
  footer: { paddingHorizontal: 24, paddingTop: 8 },
  agreeBtn: { backgroundColor: Colors.ink },
  agreeText: { fontFamily: 'Inter_600SemiBold', color: '#fff', fontSize: 16 },
  declineBtn: { alignItems: 'center', paddingVertical: 14 },
  declineText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.slate },
});
