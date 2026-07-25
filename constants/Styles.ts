import Colors from '@/constants/Colors';
import { StyleSheet } from 'react-native';

export const defaultStyles = StyleSheet.create({
  btn: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 14,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  pageContainer: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
});

export const typography = {
  body: { fontFamily: 'Inter_400Regular' as const },
  bodyMedium: { fontFamily: 'Inter_500Medium' as const },
  bodySemibold: { fontFamily: 'Inter_600SemiBold' as const },
  bodyBold: { fontFamily: 'Inter_700Bold' as const },
  display: { fontFamily: 'SourceSerif4_300Light' as const },
  displayItalic: { fontFamily: 'SourceSerif4_300Light_Italic' as const },
  mono: { fontFamily: 'JetBrainsMono_400Regular' as const },
} as const;

// "Eyebrow" label — uppercase, tracked, blueprint color — mirrors the website
export const eyebrow = {
  fontFamily: 'Inter_500Medium' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 2,
  fontSize: 11,
  color: Colors.blueprint,
};
