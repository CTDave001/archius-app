import type { AppColors } from '@/constants/Colors';
import { useThemeColors } from '@/providers/Theme';
import { tap } from '@/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMemo } from 'react';

export type PopoverAnchor = { x: number; y: number; width: number; height: number };

export type PopoverItem = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  // When set, the item renders with a small "active/inactive" indicator on
  // the right — used for toggle items (e.g. web search, deep think).
  selected?: boolean;
};

// Add onPress separately so PopoverItem can stay easily serializable in lists.
export type PopoverItemWithHandler = PopoverItem & { onPress: () => void };

const CARD_WIDTH = 200;
const ITEM_HEIGHT = 48;
const EDGE_MARGIN = 12;

type Props = {
  visible: boolean;
  anchor: PopoverAnchor | null;
  items: PopoverItemWithHandler[];
  onClose: () => void;
};

// A small anchored popover menu — a native-feeling alternative to a
// full-screen ActionSheet. Positions a card near the trigger, flipping
// above the anchor if there's no room below, and clamps to screen edges.
export const PopoverMenu = ({ visible, anchor, items, onClose }: Props) => {
  const Colors = useThemeColors();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  if (!anchor) return null;

  const screen = Dimensions.get('window');
  const cardHeight = items.length * ITEM_HEIGHT + 8;

  // Horizontal: right-align the card to the anchor's right edge, clamp.
  let left = anchor.x + anchor.width - CARD_WIDTH;
  left = Math.max(EDGE_MARGIN, Math.min(left, screen.width - CARD_WIDTH - EDGE_MARGIN));

  // Vertical: prefer below the anchor; flip above if it would overflow.
  const below = anchor.y + anchor.height + 4;
  const wouldOverflow = below + cardHeight > screen.height - EDGE_MARGIN;
  const top = wouldOverflow
    ? Math.max(EDGE_MARGIN, anchor.y - cardHeight - 4)
    : below;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Dismiss menu">
        <View style={[styles.card, { left, top, width: CARD_WIDTH }]}>
          {items.map((item, idx) => {
            const isToggle = typeof item.selected === 'boolean';
            const isOn = item.selected === true;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  tap();
                  if (isToggle) {
                    // Keep the menu open and let the Switch animate in place
                    // as the parent flips state on the next render.
                    item.onPress();
                  } else {
                    // Action item — close the menu, then defer the action a
                    // tick so the modal dismiss doesn't race anything the
                    // action triggers (navigation, alert, picker).
                    onClose();
                    requestAnimationFrame(item.onPress);
                  }
                }}
                accessibilityLabel={item.label}
                accessibilityRole={isToggle ? 'switch' : 'button'}
                accessibilityState={isToggle ? { selected: isOn } : undefined}
                style={({ pressed }) => [
                  styles.item,
                  idx > 0 && styles.itemDivider,
                  pressed && styles.itemPressed,
                ]}>
                {item.icon && (
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={
                      item.destructive
                        ? Colors.rust
                        : isOn
                          ? Colors.blueprint
                          : Colors.slate
                    }
                  />
                )}
                <Text
                  style={[
                    styles.itemText,
                    item.destructive && { color: Colors.rust },
                    isOn && { color: Colors.blueprint },
                  ]}>
                  {item.label}
                </Text>
                {isToggle && (
                  // Decorative — the row Pressable handles the tap. Switch
                  // shows state with a native slide animation.
                  <View pointerEvents="none">
                    <Switch
                      value={isOn}
                      trackColor={{ false: Colors.stone, true: Colors.blueprint }}
                      thumbColor="#fff"
                      ios_backgroundColor={Colors.stone}
                      style={styles.toggleSwitch}
                    />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
};

const createStyles = (Colors: AppColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    // Transparent — the menu itself is the only visible element. Tapping
    // anywhere outside dismisses.
    backgroundColor: 'transparent',
  },
  card: {
    position: 'absolute',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.stone,
    paddingVertical: 4,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: ITEM_HEIGHT,
    paddingHorizontal: 16,
  },
  itemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.stone,
  },
  itemPressed: {
    backgroundColor: Colors.creamSoft,
  },
  itemText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.graphite,
  },
  toggleSwitch: {
    // Shrink slightly so it sits comfortably in the row without dominating.
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
});

export default PopoverMenu;
