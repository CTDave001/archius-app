import Colors from '@/constants/Colors';
import { StyleSheet, View } from 'react-native';

// iOS-native style drag handle for the top of modal sheets.
// Place at the top of any screen presented with presentation="modal".
export const DragHandle = () => (
  <View style={styles.wrap} pointerEvents="none">
    <View style={styles.bar} />
  </View>
);

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
    backgroundColor: Colors.stoneDark,
    opacity: 0.6,
  },
});

export default DragHandle;
