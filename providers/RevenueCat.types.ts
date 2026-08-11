export type ArchiusPackage = {
  identifier: string;
  product: {
    priceString: string;
    title: string;
    subscriptionPeriod?: string | null;
  };
  nativePackage?: unknown;
  webPackage?: unknown;
};

export interface RevenueCatContextValue {
  isPro: boolean;
  packages: ArchiusPackage[];
  purchasePackage: (pack: ArchiusPackage) => Promise<void>;
  restorePermissions: () => Promise<unknown>;
}
