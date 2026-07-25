import Svg, { Path } from 'react-native-svg';

// The Archius mark — two angled strokes forming an "A" in negative space.
// Single source of truth for the SVG path. Components should import this
// instead of inlining the SVG (which had drifted across 6+ files).

export type BrandMarkProps = {
  size?: number;
  color?: string;
};

// Native aspect ratio of the mark: 171 wide × 138 tall.
const NATIVE_W = 171;
const NATIVE_H = 138;
const ASPECT = NATIVE_H / NATIVE_W;

export const BrandMark = ({ size = 32, color }: BrandMarkProps) => (
  <Svg width={size} height={size * ASPECT} viewBox={`0 0 ${NATIVE_W} ${NATIVE_H}`}>
    <Path d="M106.5 0H74L0 138H33L106.5 0Z" fill={color ?? '#fff'} />
    <Path d="M94.5 56L110.5 26L171 138H138L94.5 56Z" fill={color ?? '#fff'} />
  </Svg>
);

export default BrandMark;
