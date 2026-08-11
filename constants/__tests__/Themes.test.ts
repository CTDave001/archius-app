import LightColors from '@/constants/Colors';
import { DarkColors } from '@/constants/Themes';
import { describe, expect, it } from '@jest/globals';

const luminance = (hex: string) => {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrast = (foreground: string, background: string) => {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
};

describe('theme palettes', () => {
  it('keeps the light and dark token contracts in sync', () => {
    expect(Object.keys(DarkColors).sort()).toEqual(Object.keys(LightColors).sort());
  });

  it('maintains accessible contrast for primary dark-theme content', () => {
    expect(contrast(DarkColors.graphite, DarkColors.cream)).toBeGreaterThanOrEqual(7);
    expect(contrast(DarkColors.slate, DarkColors.cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(DarkColors.onControl, DarkColors.control)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(DarkColors.onUserBubble, DarkColors.userBubble)).toBeGreaterThanOrEqual(4.5);
  });
});
