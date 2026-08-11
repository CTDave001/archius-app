import { useAuth, useUser } from '@clerk/clerk-expo';
import { PackageType, Purchases, type CustomerInfo, type Package } from '@revenuecat/purchases-js';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ArchiusPackage, RevenueCatContextValue } from '@/providers/RevenueCat.types';

export const PRO_ENTITLEMENT_ID = 'pro';
const WEB_API_KEY = process.env.EXPO_PUBLIC_RC_WEB_KEY?.trim();
const RevenueCatContext = createContext<RevenueCatContextValue | null>(null);

export const useRevenueCat = (): RevenueCatContextValue => {
  const ctx = useContext(RevenueCatContext);
  if (!ctx) throw new Error('useRevenueCat must be used within RevenueCatProvider');
  return ctx;
};

const hasProEntitlement = (info: CustomerInfo) =>
  info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;

const normalizePackage = (pack: Package): ArchiusPackage => ({
  identifier: pack.identifier,
  product: {
    priceString: pack.webBillingProduct.currentPrice.formattedPrice,
    title: pack.webBillingProduct.title,
    subscriptionPeriod:
      pack.packageType === PackageType.Monthly
        ? 'P1M'
        : pack.webBillingProduct.normalPeriodDuration,
  },
  webPackage: pack,
});

const showMessage = (message: string) => {
  if (typeof window !== 'undefined') window.alert(message);
};

export const RevenueCatProvider = ({ children }: { children: React.ReactNode }) => {
  const { userId } = useAuth({ treatPendingAsSignedOut: false });
  const { user } = useUser();
  const purchasesRef = useRef<Purchases | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [packages, setPackages] = useState<ArchiusPackage[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!WEB_API_KEY || !userId) {
        setReady(true);
        return;
      }
      try {
        let purchases = purchasesRef.current;
        if (!purchases) {
          purchases = Purchases.isConfigured()
            ? Purchases.getSharedInstance()
            : Purchases.configure({ apiKey: WEB_API_KEY, appUserId: userId });
          purchasesRef.current = purchases;
        } else if (purchases.getAppUserId() !== userId) {
          await purchases.changeUser(userId);
        }

        const email = user?.primaryEmailAddress?.emailAddress;
        if (email) {
          await purchases.setAttributes({ email, clerk_user_id: userId }).catch(() => undefined);
        }
        const [offerings, customerInfo] = await Promise.all([
          purchases.getOfferings(),
          purchases.getCustomerInfo(),
        ]);
        if (cancelled) return;
        setPackages((offerings.current?.availablePackages ?? []).map(normalizePackage));
        setIsPro(hasProEntitlement(customerInfo));
      } catch (error) {
        console.warn('RevenueCat web init failed', error);
      } finally {
        if (!cancelled) setReady(true);
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [userId, user?.primaryEmailAddress?.emailAddress]);

  const purchasePackage = async (pack: ArchiusPackage) => {
    const purchases = purchasesRef.current;
    if (!purchases || !pack.webPackage) throw new Error('Web checkout is not configured yet.');
    try {
      const result = await purchases.purchase({
        rcPackage: pack.webPackage as Package,
        customerEmail: user?.primaryEmailAddress?.emailAddress,
      });
      setIsPro(hasProEntitlement(result.customerInfo));
      await user?.reload().catch(() => undefined);
    } catch (error: any) {
      if (error?.errorCode !== 'UserCancelledError') {
        showMessage(error?.message ?? 'Purchase failed. Please try again.');
      }
      throw error;
    }
  };

  const restorePermissions = async () => {
    const purchases = purchasesRef.current;
    if (!purchases) {
      showMessage('Web billing is not configured yet.');
      return null;
    }
    try {
      const customerInfo = await purchases.getCustomerInfo();
      const restored = hasProEntitlement(customerInfo);
      setIsPro(restored);
      await user?.reload().catch(() => undefined);
      showMessage(
        restored
          ? 'Your Archius Pro access is active.'
          : 'No active Archius Pro subscription was found for this account.'
      );
      return customerInfo;
    } catch (error: any) {
      showMessage(error?.message ?? 'Could not refresh your subscription.');
      throw error;
    }
  };

  if (!ready) return null;
  const clerkIsPro = (user?.publicMetadata as any)?.isPro === true;
  return (
    <RevenueCatContext.Provider
      value={{ isPro: isPro || clerkIsPro, packages, purchasePackage, restorePermissions }}>
      {children}
    </RevenueCatContext.Provider>
  );
};
