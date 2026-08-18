import { useAuth, useUser } from '@clerk/clerk-expo';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';
import type { ArchiusPackage, RevenueCatContextValue } from '@/providers/RevenueCat.types';
import {
  subscriptionStateFromCustomerInfo,
  type SubscriptionSource,
} from '@/utils/subscription';

const APIKeys = {
  apple: process.env.EXPO_PUBLIC_RC_APPLE_KEY as string,
  google: process.env.EXPO_PUBLIC_RC_GOOGLE_KEY as string,
};

export const PRO_ENTITLEMENT_ID = 'pro';
const INIT_TIMEOUT_MS = 4_000;
const RevenueCatContext = createContext<RevenueCatContextValue | null>(null);

export const useRevenueCat = (): RevenueCatContextValue => {
  const ctx = useContext(RevenueCatContext);
  if (!ctx) throw new Error('useRevenueCat must be used within RevenueCatProvider');
  return ctx;
};

const normalizePackage = (pack: PurchasesPackage): ArchiusPackage => ({
  identifier: pack.identifier,
  product: {
    priceString: pack.product.priceString,
    title: pack.product.title,
    subscriptionPeriod: pack.product.subscriptionPeriod,
  },
  nativePackage: pack,
});

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);

export const RevenueCatProvider = ({ children }: { children: React.ReactNode }) => {
  const [isPro, setIsPro] = useState(false);
  const [managementURL, setManagementURL] = useState<string | null>(null);
  const [subscriptionSource, setSubscriptionSource] = useState<SubscriptionSource>(null);
  const [packages, setPackages] = useState<ArchiusPackage[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const { userId: clerkUserId } = useAuth({ treatPendingAsSignedOut: false });
  const { user } = useUser();
  const listenerRef = useRef<((info: CustomerInfo) => void) | null>(null);

  const applyCustomerInfo = (info: CustomerInfo) => {
    const state = subscriptionStateFromCustomerInfo(info, PRO_ENTITLEMENT_ID);
    setIsPro(state.isPro);
    setManagementURL(state.managementURL);
    setSubscriptionSource(state.subscriptionSource);
  };

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const apiKey = Platform.OS === 'android' ? APIKeys.google : APIKeys.apple;
        if (!apiKey || apiKey === 'goog_' || apiKey === 'appl_') return;

        Purchases.configure({ apiKey });
        if (cancelled) return;
        setIsConfigured(true);
        if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);

        const listener = (info: CustomerInfo) => {
          if (!cancelled) applyCustomerInfo(info);
        };
        listenerRef.current = listener;
        Purchases.addCustomerInfoUpdateListener(listener);

        const [offeringsResult, customerInfoResult] = await Promise.allSettled([
          withTimeout(Purchases.getOfferings(), INIT_TIMEOUT_MS),
          withTimeout(Purchases.getCustomerInfo(), INIT_TIMEOUT_MS),
        ]);
        if (cancelled) return;
        if (offeringsResult.status === 'fulfilled' && offeringsResult.value.current) {
          setPackages(offeringsResult.value.current.availablePackages.map(normalizePackage));
        }
        if (customerInfoResult.status === 'fulfilled') {
          applyCustomerInfo(customerInfoResult.value);
        }
      } catch (error) {
        console.warn('RevenueCat init failed', error);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    };
    void init();
    const timeout = setTimeout(() => {
      if (!cancelled) setIsReady(true);
    }, INIT_TIMEOUT_MS + 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (listenerRef.current) {
        try {
          Purchases.removeCustomerInfoUpdateListener(listenerRef.current);
        } catch {
          // RevenueCat may already be torn down.
        }
        listenerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    const syncAlias = async () => {
      try {
        if (clerkUserId) {
          const result = await Purchases.logIn(clerkUserId);
          if (!cancelled) applyCustomerInfo(result.customerInfo);
          const email = user?.primaryEmailAddress?.emailAddress;
          if (email) await Purchases.setAttributes({ $email: email, clerk_user_id: clerkUserId });
        } else {
          await Purchases.logOut();
          if (!cancelled) {
            setIsPro(false);
            setManagementURL(null);
            setSubscriptionSource(null);
          }
        }
      } catch (error) {
        console.warn('RevenueCat alias sync failed', error);
      }
    };
    void syncAlias();
    return () => {
      cancelled = true;
    };
  }, [isConfigured, clerkUserId, user?.primaryEmailAddress?.emailAddress]);

  const purchasePackage = async (pack: ArchiusPackage) => {
    if (!pack.nativePackage) throw new Error('This purchase is not available.');
    try {
      if (clerkUserId && (await Purchases.getAppUserID()) !== clerkUserId) {
        await Purchases.logIn(clerkUserId);
      }
      const result = await Purchases.purchasePackage(pack.nativePackage as PurchasesPackage);
      applyCustomerInfo(result.customerInfo);
      await user?.reload().catch(() => undefined);
    } catch (error: any) {
      if (!error?.userCancelled) Alert.alert('Purchase failed', error?.message ?? 'Try again later.');
      throw error;
    }
  };

  const restorePermissions = async () => {
    try {
      if (clerkUserId && (await Purchases.getAppUserID()) !== clerkUserId) {
        await Purchases.logIn(clerkUserId);
      }
      const customer = await Purchases.restorePurchases();
      const restored = subscriptionStateFromCustomerInfo(customer, PRO_ENTITLEMENT_ID).isPro;
      applyCustomerInfo(customer);
      await user?.reload().catch(() => undefined);
      Alert.alert(
        restored ? 'Restored' : 'No active subscription',
        restored
          ? 'Your Archius Pro subscription has been restored.'
          : "We didn't find an active subscription on this account."
      );
      return customer;
    } catch (error: any) {
      Alert.alert('Restore failed', error?.message ?? 'Try again later.');
      throw error;
    }
  };

  if (!isReady) return null;
  const clerkIsPro = (user?.publicMetadata as any)?.isPro === true;
  return (
    <RevenueCatContext.Provider
      value={{
        isPro: isPro || clerkIsPro,
        managementURL,
        subscriptionSource,
        packages,
        purchasePackage,
        restorePermissions,
      }}>
      {children}
    </RevenueCatContext.Provider>
  );
};
