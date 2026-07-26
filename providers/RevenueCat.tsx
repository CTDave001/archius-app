import { useAuth, useUser } from '@clerk/clerk-expo';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PurchasesPackage,
  CustomerInfo,
} from 'react-native-purchases';

const APIKeys = {
  apple: process.env.EXPO_PUBLIC_RC_APPLE_KEY as string,
  google: process.env.EXPO_PUBLIC_RC_GOOGLE_KEY as string,
};

export const PRO_ENTITLEMENT_ID = 'pro';

// How long we wait for RevenueCat init before letting the rest of the app
// render. Past this we assume something is wrong (no network, RC outage)
// and fall through with isPro=false rather than hanging the app forever.
const INIT_TIMEOUT_MS = 4_000;

interface RevenueCatContextValue {
  isPro: boolean;
  packages: PurchasesPackage[];
  purchasePackage: (pack: PurchasesPackage) => Promise<void>;
  restorePermissions: () => Promise<CustomerInfo>;
}

const RevenueCatContext = createContext<RevenueCatContextValue | null>(null);

export const useRevenueCat = (): RevenueCatContextValue => {
  const ctx = useContext(RevenueCatContext);
  if (!ctx) {
    throw new Error('useRevenueCat must be used within RevenueCatProvider');
  }
  return ctx;
};

const hasProEntitlement = (info: CustomerInfo) =>
  info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);

export const RevenueCatProvider = ({ children }: { children: React.ReactNode }) => {
  const [isPro, setIsPro] = useState(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const { userId: clerkUserId } = useAuth({ treatPendingAsSignedOut: false });
  const { user } = useUser();
  const listenerRef = useRef<((info: CustomerInfo) => void) | null>(null);

  // Initial init — happens once, regardless of auth state.
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const apiKey = Platform.OS === 'android' ? APIKeys.google : APIKeys.apple;
        if (!apiKey || apiKey === 'goog_' || apiKey === 'appl_') {
          // RC not configured — render children with isPro=false. The
          // server-side Clerk publicMetadata still gates the actual model.
          if (!cancelled) setIsReady(true);
          return;
        }

        // Purchases.configure is synchronous (returns void), so no timeout
        // applies. The network calls below are what we want to time-bound.
        Purchases.configure({ apiKey });
        if (cancelled) return;
        setIsConfigured(true);
        if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);

        const listener = (info: CustomerInfo) => {
          if (!cancelled) setIsPro(hasProEntitlement(info));
        };
        listenerRef.current = listener;
        Purchases.addCustomerInfoUpdateListener(listener);

        // Fetch offerings + customer info in parallel; tolerate individual
        // failures (no offerings shouldn't block isPro detection, and vice
        // versa).
        const [offeringsResult, customerInfoResult] = await Promise.allSettled([
          withTimeout(Purchases.getOfferings(), INIT_TIMEOUT_MS),
          withTimeout(Purchases.getCustomerInfo(), INIT_TIMEOUT_MS),
        ]);
        if (cancelled) return;
        if (offeringsResult.status === 'fulfilled' && offeringsResult.value.current) {
          setPackages(offeringsResult.value.current.availablePackages);
        }
        if (customerInfoResult.status === 'fulfilled') {
          setIsPro(hasProEntitlement(customerInfoResult.value));
        }
      } catch (e) {
        console.warn('RevenueCat init failed', e);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    };
    init();

    return () => {
      cancelled = true;
      if (listenerRef.current) {
        try {
          Purchases.removeCustomerInfoUpdateListener(listenerRef.current);
        } catch {
          // ignore — RC may have torn down already
        }
        listenerRef.current = null;
      }
    };
  }, []);

  // Alias RC to the Clerk userId so server-side webhook events reach the
  // right user. Skipped when RC isn't configured. Re-runs on auth change
  // (sign-in / sign-out) so the alias always tracks the current Clerk user.
  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    const syncAlias = async () => {
      try {
        if (clerkUserId) {
          const result = await Purchases.logIn(clerkUserId);
          if (!cancelled) setIsPro(hasProEntitlement(result.customerInfo));
          // Tag user-level attributes for support / segmentation.
          const email = user?.primaryEmailAddress?.emailAddress;
          if (email) {
            await Purchases.setAttributes({ $email: email, clerk_user_id: clerkUserId });
          }
        } else {
          await Purchases.logOut();
          if (!cancelled) setIsPro(false);
        }
      } catch (e) {
        console.warn('RevenueCat alias sync failed', e);
      }
    };
    syncAlias();
    return () => {
      cancelled = true;
    };
  }, [isConfigured, clerkUserId, user?.primaryEmailAddress?.emailAddress]);

  const purchasePackage = async (pack: PurchasesPackage) => {
    try {
      const result = await Purchases.purchasePackage(pack);
      setIsPro(hasProEntitlement(result.customerInfo));
      // Nudge Clerk to refresh JWT so the new publicMetadata.isPro
      // (written by the RC webhook) reflects on the next chat request.
      // The webhook may not have fired yet — that's OK; the in-process
      // cache TTL is 60s so we'll catch up.
      try {
        await user?.reload();
      } catch {
        // ignore
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('Purchase failed', e?.message ?? 'Try again later.');
      }
      // Re-throw cancellations as errors that the caller can ignore, so
      // the paywall doesn't auto-dismiss after a cancel.
      throw e;
    }
  };

  const restorePermissions = async () => {
    try {
      const customer = await Purchases.restorePurchases();
      setIsPro(hasProEntitlement(customer));
      try {
        await user?.reload();
      } catch {
        // ignore
      }
      Alert.alert(
        hasProEntitlement(customer) ? 'Restored' : 'No active subscription',
        hasProEntitlement(customer)
          ? 'Your Archius Pro subscription has been restored.'
          : "We didn't find an active subscription on this account."
      );
      return customer;
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message ?? 'Try again later.');
      throw e;
    }
  };

  if (!isReady) return null;

  // Unified client display signal = RevenueCat entitlement OR webhook-cached
  // Clerk metadata. The API still reconciles against RevenueCat and is the
  // final authority for access; this fallback keeps the UI usable through a
  // transient RevenueCat client initialization failure.
  const clerkIsPro = (user?.publicMetadata as any)?.isPro === true;
  const effectiveIsPro = isPro || clerkIsPro;

  return (
    <RevenueCatContext.Provider
      value={{ isPro: effectiveIsPro, packages, purchasePackage, restorePermissions }}>
      {children}
    </RevenueCatContext.Provider>
  );
};
