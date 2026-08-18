import {
  normalizeSubscriptionSource,
  subscriptionSourceDescription,
  subscriptionStateFromCustomerInfo,
} from '@/utils/subscription';
import { describe, expect, it } from '@jest/globals';

describe('cross-platform subscription helpers', () => {
  it('normalizes native and web RevenueCat store names', () => {
    expect(normalizeSubscriptionSource('APP_STORE')).toBe('apple');
    expect(normalizeSubscriptionSource('app_store')).toBe('apple');
    expect(normalizeSubscriptionSource('RC_BILLING')).toBe('web');
    expect(normalizeSubscriptionSource('stripe')).toBe('web');
    expect(normalizeSubscriptionSource('paddle')).toBe('paddle');
  });

  it('keeps the management URL only while Pro is active', () => {
    expect(
      subscriptionStateFromCustomerInfo({
        managementURL: 'https://apps.apple.com/account/subscriptions',
        entitlements: { active: { pro: { store: 'APP_STORE' } } },
      })
    ).toEqual({
      isPro: true,
      managementURL: 'https://apps.apple.com/account/subscriptions',
      subscriptionSource: 'apple',
    });

    expect(
      subscriptionStateFromCustomerInfo({
        managementURL: 'https://example.com/stale',
        entitlements: { active: {} },
      })
    ).toEqual({ isPro: false, managementURL: null, subscriptionSource: null });
  });

  it('describes Pro as one membership rather than separate platform plans', () => {
    expect(subscriptionSourceDescription('apple')).toContain('iPhone and web');
    expect(subscriptionSourceDescription('web')).toContain('desktop and mobile');
  });
});
