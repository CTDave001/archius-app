import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Resolve the Expo Router API origin.
 *
 * Standalone builds do not have a Metro host to fall back to, so production
 * must embed EXPO_PUBLIC_API_URL. Failing loudly here is preferable to
 * shipping a build that quietly sends every request to localhost.
 */
export const resolveApiBaseUrl = (): string => {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;

  // Browser builds are served beside the Expo Router API functions. Keeping
  // requests same-origin makes previews, custom domains, and production all
  // work without baking a deployment URL into the client bundle.
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin.replace(/\/+$/, '');
    }
    return '';
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost;

  if (__DEV__) {
    if (!hostUri) return 'http://localhost:8081';
    if (hostUri.startsWith('http://') || hostUri.startsWith('https://')) {
      return hostUri.replace(/\/+$/, '');
    }
    if (hostUri.includes('exp.direct') || hostUri.includes('exp.host')) {
      return `https://${hostUri.split(':')[0]}`;
    }
    return `http://${hostUri}`;
  }

  throw new Error('EXPO_PUBLIC_API_URL is required in standalone builds');
};
