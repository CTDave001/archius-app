import { useThemeColors } from '@/providers/Theme';
import { StyleSheet, View } from 'react-native';

// iOS-native style drag handle for the top of modal sheets.
// Place at the top of any screen presented with presentation="modal".
export const DragHandle = () => {
  const Colors = useThemeColors();
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={[styles.bar, { backgroundColor: Colors.stoneDark }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  bar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.6,
  },
});

export default DragHandle;
