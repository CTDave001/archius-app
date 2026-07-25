// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web build statically imports a .wasm file; Metro needs to
// treat it as an asset (copy it) rather than try to parse as JS, otherwise
// `expo export -p web` fails. Harmless on native (no .wasm imports there).
config.resolver.assetExts.push('wasm');

module.exports = config;
