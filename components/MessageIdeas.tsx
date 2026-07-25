import Colors from '@/constants/Colors';
import { tap } from '@/utils/haptics';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const PredefinedMessages = [
  { title: 'Explain', text: 'a concept in plain language' },
  { title: 'Draft', text: 'a clear email I need to send' },
  { title: 'Compare', text: 'two options before I decide' },
  { title: 'Debug', text: "this code I'm stuck on" },
];

type Props = {
  /**
   * Called when a card is tapped — receives the prefilled prompt text. The
   * caller is expected to drop the text into the input field (not auto-send
   * it). The ideas are starting points, not one-tap blasts.
   */
  onUseIdea: (message: string) => void;
};

const MessageIdeas = ({ onUseIdea }: Props) => {
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        {PredefinedMessages.map((item) => (
          <Pressable
            key={item.title}
            accessibilityLabel={`Use prompt: ${item.title} ${item.text}`}
            accessibilityRole="button"
            onPress={() => {
              tap();
              onUseIdea(`${item.title} ${item.text}`);
            }}
            style={({ pressed }) => [
              styles.card,
              pressed && styles.cardPressed,
            ]}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.text}>{item.text}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  card: {
    backgroundColor: Colors.creamSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 168,
    borderWidth: 1,
    borderColor: Colors.stone,
  },
  cardPressed: {
    backgroundColor: Colors.stone,
    borderColor: Colors.stoneDark,
  },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.ink },
  text: {
    fontFamily: 'Inter_400Regular',
    color: Colors.slate,
    fontSize: 13,
    marginTop: 2,
  },
});

export default MessageIdeas;
