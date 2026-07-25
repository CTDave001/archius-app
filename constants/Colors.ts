// Brand tokens — mirror the marketing site (archius.app).
// Source: ARCHIUS_MOBILE_HANDOFF.md

const tokens = {
  // Brand
  ink: '#1F4458', // primary brand — mark, headings
  inkDeep: '#122A39',
  blueprint: '#3D7A99', // accent — links, eyebrows, CTAs on light
  blueprintLifted: '#5FA8D3', // accent on dark surfaces

  // Surfaces
  cream: '#FAF8F3', // primary bg
  creamSoft: '#F4F1EA', // secondary surfaces, cards
  stone: '#E8E4DB', // borders, dividers
  stoneDark: '#C4BDB0',

  // Text
  graphite: '#1A1D21', // body text, near-black
  slate: '#475569', // secondary text
  slateSoft: '#64748B',

  // Semantic
  sage: '#7FA882', // success
  clay: '#C97A4A', // warning
  rust: '#C25B5B', // error

  // Tinted overlays — the canonical "blueprint at N%" surfaces used for
  // active states, badges, icon backgrounds. Centralized so the alpha
  // values don't drift across screens (they had drifted to 0.08/0.10/0.12/0.20/0.25).
  blueprintTint10: 'rgba(61, 122, 153, 0.10)',
  blueprintTint12: 'rgba(61, 122, 153, 0.12)',
  blueprintTint20: 'rgba(61, 122, 153, 0.20)',
  blueprintTint25: 'rgba(61, 122, 153, 0.25)',
  inkScrim25: 'rgba(31, 68, 88, 0.25)',
  inkScrim40: 'rgba(31, 68, 88, 0.40)',
  inkScrim50: 'rgba(31, 68, 88, 0.50)',
  rustTint12: 'rgba(194, 91, 91, 0.12)',
  rustTint45: 'rgba(194, 91, 91, 0.45)',
};

// Back-compat aliases for legacy component usage.
// New code should reference `tokens` directly via the named exports below.
const Colors = {
  ...tokens,
  primary: tokens.ink,
  primaryDark: tokens.inkDeep,
  light: tokens.cream,
  selected: tokens.creamSoft,
  input: tokens.creamSoft,
  greyLight: tokens.slateSoft,
  grey: tokens.graphite,
  dark: tokens.graphite,
};

export default Colors;
export { tokens };
