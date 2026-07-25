// Design system tokens for Archius.
// Brand colors remain in Colors.ts (locked to the handoff). This file holds
// the iOS-native-feeling structural tokens — spacing, radii, motion, shadows,
// and the type ramp — adapted from a clean-room reading of Conduit's
// token system (cogwheel0/conduit). No code was copied; only numeric values
// and behavioral conventions.

import Colors from '@/constants/Colors';

// --- Spacing (8-pt grid with iOS-native aliases) ---
export const Space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  // semantic
  screen: 16,
  card: 20,
  input: 16,
  modal: 24,
  navigation: 12,
  sectionGap: 32,
  listGap: 12,
  contentGap: 24,
} as const;

// --- Border radii ---
export const Radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
  // semantic
  button: 12,
  card: 16,
  input: 22, // pill-shaped chat input
  modal: 20,
  bubble: 18,
  bubbleChat: 20,
  avatar: 50,
  chip: 16,
  fab: 28,
} as const;

// --- Type ramp (Apple-aligned: iOS-native sizes with our font families) ---
// Pair each entry with a font family in component styles.
export const Type = {
  displayLarge: { size: 34, weight: '700', letterSpacing: 0.38, lineHeight: 1.21 * 34 },
  displayMedium: { size: 28, weight: '600', letterSpacing: 0, lineHeight: 1.21 * 28 },
  displaySmall: { size: 24, weight: '600', letterSpacing: 0, lineHeight: 1.25 * 24 },
  headlineLarge: { size: 22, weight: '600', letterSpacing: 0, lineHeight: 1.27 * 22 },
  headlineMedium: { size: 20, weight: '600', letterSpacing: 0, lineHeight: 1.25 * 20 },
  headlineSmall: { size: 17, weight: '600', letterSpacing: -0.41, lineHeight: 1.29 * 17 },
  titleLarge: { size: 17, weight: '600', letterSpacing: -0.41, lineHeight: 1.29 * 17 },
  titleMedium: { size: 15, weight: '400', letterSpacing: -0.23, lineHeight: 1.33 * 15 },
  titleSmall: { size: 13, weight: '400', letterSpacing: -0.08, lineHeight: 1.38 * 13 },
  bodyLarge: { size: 17, weight: '400', letterSpacing: -0.41, lineHeight: 1.29 * 17 },
  bodyMedium: { size: 16, weight: '400', letterSpacing: -0.32, lineHeight: 1.31 * 16 },
  bodySmall: { size: 13, weight: '400', letterSpacing: -0.08, lineHeight: 1.38 * 13 },
  labelLarge: { size: 16, weight: '600', letterSpacing: -0.32, lineHeight: 1.31 * 16 },
  labelMedium: { size: 13, weight: '600', letterSpacing: -0.08, lineHeight: 1.38 * 13 },
  labelSmall: { size: 12, weight: '500', letterSpacing: 0, lineHeight: 1.33 * 12 },
  code: { size: 13, weight: '400', letterSpacing: 0, lineHeight: 1.38 * 13 },
  micro: { size: 11, weight: '500', letterSpacing: 0.06, lineHeight: 1.18 * 11 },
} as const;

// --- Shadow recipes ---
// React Native shadow*: only iOS honors all; Android uses elevation.
export const Shadow = {
  card: {
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  button: {
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  modal: {
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 10,
  },
  fab: {
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  // lifts upward (e.g. for floating top bars)
  navigation: {
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  input: {
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
} as const;

// --- Motion ---
export const Motion = {
  instant: 100,
  fast: 200,
  medium: 300,
  slow: 500,
  slower: 800,
  buttonPress: 100,
  microInteraction: 150,
  cardHover: 200,
  messageAppear: 350,
  pageTransition: 400,
  modalPresent: 500,
  typingIndicator: 800,
  themeSwitch: 250,
  // scale targets
  pressedScale: 0.95,
  hoverScale: 1.02,
} as const;

// --- Touch targets (Apple HIG minimums) ---
export const Tap = {
  min: 44,
  comfortable: 48,
  large: 56,
} as const;

// --- Alpha tokens ---
export const Alpha = {
  disabled: 0.38,
  overlay: 0.5,
  backdrop: 0.6,
  pressed: 0.2,
  hover: 0.08,
  focus: 0.12,
  selected: 0.16,
  active: 0.24,
} as const;

// --- Border widths ---
export const Border = {
  hairline: 0.5,
  regular: 1,
  medium: 1.5,
  thick: 2,
} as const;
