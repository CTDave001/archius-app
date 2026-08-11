import LightColors, { type AppColors } from '@/constants/Colors';

// A warm charcoal theme rather than pure black. The slightly blue-green
// surfaces retain Archius's blueprint identity and keep long reading sessions
// comfortable, while raised surfaces remain visibly distinct.
export const DarkColors: AppColors = {
  ink: '#E6F0F3',
  inkDeep: '#A9C5D1',
  blueprint: '#78B7D4',
  blueprintLifted: '#9AD3EC',

  cream: '#0E161A',
  creamSoft: '#172228',
  stone: '#2A3A42',
  stoneDark: '#43555E',

  graphite: '#F2F0EA',
  slate: '#B3C0C7',
  slateSoft: '#84969F',

  sage: '#91C79B',
  clay: '#E8A06F',
  rust: '#F28B8B',

  blueprintTint10: 'rgba(120, 183, 212, 0.10)',
  blueprintTint12: 'rgba(120, 183, 212, 0.12)',
  blueprintTint20: 'rgba(120, 183, 212, 0.20)',
  blueprintTint25: 'rgba(120, 183, 212, 0.25)',
  inkScrim25: 'rgba(0, 0, 0, 0.25)',
  inkScrim40: 'rgba(0, 0, 0, 0.48)',
  inkScrim50: 'rgba(0, 0, 0, 0.62)',
  rustTint12: 'rgba(242, 139, 139, 0.12)',
  rustTint45: 'rgba(242, 139, 139, 0.45)',

  surface: '#151F24',
  surfaceElevated: '#1C2930',
  control: '#397D9B',
  controlPressed: '#2E6780',
  onControl: '#FFFFFF',
  userBubble: '#24546A',
  onUserBubble: '#F7FBFC',
  composerGlass: 'rgba(14, 22, 26, 0.90)',
  codeSurface: '#090E11',
  shadow: '#000000',
  brandPanel: '#121E24',
  onBrandPanel: '#F7FBFC',
  onBrandPanelMuted: '#C6D3D8',
  brandPanelButton: '#EAF0F2',
  onBrandPanelButton: '#16394A',

  primary: '#397D9B',
  primaryDark: '#2E6780',
  light: '#0E161A',
  selected: '#172228',
  input: '#1C2930',
  greyLight: '#84969F',
  grey: '#F2F0EA',
  dark: '#F2F0EA',
};

export const LightThemeColors: AppColors = LightColors;

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
