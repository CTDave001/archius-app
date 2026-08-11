import LightColors, { type AppColors } from '@/constants/Colors';

// Archius Midnight: a deep ink foundation, warmer reading text, and a clearer
// blueprint accent. The surface steps are intentionally more distinct than the
// original charcoal palette so the UI retains depth on dim physical displays.
export const DarkColors: AppColors = {
  ink: '#E8F2F5',
  inkDeep: '#B8D0D9',
  blueprint: '#69B9DB',
  blueprintLifted: '#98D9F1',

  cream: '#091317',
  creamSoft: '#132128',
  stone: '#2E4550',
  stoneDark: '#3A5562',

  graphite: '#F3EFE7',
  slate: '#B6C3C9',
  slateSoft: '#91A5AF',

  sage: '#91C79B',
  clay: '#E8A06F',
  rust: '#F28B8B',

  blueprintTint10: 'rgba(105, 185, 219, 0.10)',
  blueprintTint12: 'rgba(105, 185, 219, 0.12)',
  blueprintTint20: 'rgba(105, 185, 219, 0.20)',
  blueprintTint25: 'rgba(105, 185, 219, 0.25)',
  inkScrim25: 'rgba(0, 0, 0, 0.25)',
  inkScrim40: 'rgba(0, 0, 0, 0.48)',
  inkScrim50: 'rgba(0, 0, 0, 0.62)',
  rustTint12: 'rgba(242, 139, 139, 0.12)',
  rustTint45: 'rgba(242, 139, 139, 0.45)',

  surface: '#111D23',
  surfaceElevated: '#1B2C35',
  control: '#347895',
  controlPressed: '#2B647D',
  onControl: '#FFFFFF',
  controlDisabled: '#1F3038',
  onControlDisabled: '#91A5AF',
  userBubble: '#235D77',
  onUserBubble: '#F8FBFC',
  composerGlass: 'rgba(9, 19, 23, 0.94)',
  codeSurface: '#060B0E',
  shadow: '#000000',
  brandPanel: '#10242C',
  onBrandPanel: '#F8FBFC',
  onBrandPanelMuted: '#C9D8DE',
  brandPanelButton: '#EDF3F5',
  onBrandPanelButton: '#123849',

  primary: '#347895',
  primaryDark: '#2B647D',
  light: '#091317',
  selected: '#132128',
  input: '#1B2C35',
  greyLight: '#91A5AF',
  grey: '#F3EFE7',
  dark: '#F3EFE7',
};

export const LightThemeColors: AppColors = LightColors;

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
