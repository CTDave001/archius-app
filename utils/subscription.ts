export type SubscriptionSource =
  | 'apple'
  | 'google'
  | 'web'
  | 'paddle'
  | 'promotional'
  | 'unknown'
  | null;

type RevenueCatCustomerInfoLike = {
  entitlements?: {
    active?: Record<string, { store?: string | null } | undefined>;
  };
  managementURL?: string | null;
};

export const normalizeSubscriptionSource = (
  store: string | null | undefined
): SubscriptionSource => {
  switch (store?.toLowerCase()) {
    case 'app_store':
    case 'mac_app_store':
      return 'apple';
    case 'play_store':
    case 'amazon':
    case 'galaxy':
      return 'google';
    case 'stripe':
    case 'rc_billing':
      return 'web';
    case 'paddle':
      return 'paddle';
    case 'promotional':
      return 'promotional';
    case undefined:
      return null;
    default:
      return 'unknown';
  }
};

export const subscriptionStateFromCustomerInfo = (
  info: RevenueCatCustomerInfoLike,
  entitlementId = 'pro'
) => {
  const entitlement = info.entitlements?.active?.[entitlementId];
  return {
    isPro: entitlement !== undefined,
    managementURL: entitlement ? (info.managementURL ?? null) : null,
    subscriptionSource: entitlement
      ? normalizeSubscriptionSource(entitlement.store)
      : null,
  };
};

export const subscriptionSourceDescription = (source: SubscriptionSource): string => {
  switch (source) {
    case 'apple':
      return 'Billed through Apple — active on iPhone and web';
    case 'google':
      return 'Billed through Google Play — active on every platform';
    case 'web':
      return 'Billed on the web — active on desktop and mobile';
    case 'paddle':
      return 'Billed on the web through Paddle — active everywhere';
    case 'promotional':
      return 'Promotional Pro access — active everywhere';
    default:
      return 'One Archius Pro membership across every platform';
  }
};
