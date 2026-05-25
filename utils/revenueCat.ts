import { Platform } from "react-native";

const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;

function isValidIosRevenueCatKey(key: string | undefined): key is string {
  return Platform.OS === "ios" && typeof key === "string" && key.startsWith("appl_");
}

export function isRevenueCatConfigured(): boolean {
  return isValidIosRevenueCatKey(REVENUECAT_IOS_API_KEY);
}

export function configureRevenueCat(): void {
  if (!isRevenueCatConfigured()) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Purchases = require("react-native-purchases").default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LOG_LEVEL } = require("react-native-purchases");

    Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY });

    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }
  } catch {
    // RevenueCat must never block app startup.
  }
}

export function getRevenueCatPurchases():
  | { getCustomerInfo: () => Promise<any>; getOfferings: () => Promise<any>; purchasePackage: (pkg: any) => Promise<any>; restorePurchases: () => Promise<any> }
  | null {
  if (!isRevenueCatConfigured()) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-purchases").default;
  } catch {
    return null;
  }
}
