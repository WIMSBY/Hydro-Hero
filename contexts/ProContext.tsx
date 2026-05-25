/**
 * contexts/ProContext.tsx
 *
 * Manages RevenueCat Pro entitlement state for the entire app.
 * - Checks "pro" entitlement on startup via getCustomerInfo()
 * - Exposes isPro, isLoading, checkProStatus, openPaywall
 * - All RevenueCat errors are swallowed — app always works even if SDK fails
 * - Renders the Paywall modal at the provider level so any component can open it
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRevenueCatPurchases } from '../utils/revenueCat';

// Session-level set: tracks which trigger IDs have already shown the paywall this session
const sessionShownTriggers = new Set<string>();

export function markPaywallTriggered(triggerId: string): boolean {
  if (sessionShownTriggers.has(triggerId)) return false;
  sessionShownTriggers.add(triggerId);
  return true;
}

interface ProContextValue {
  isPro: boolean;
  isLoading: boolean;
  checkProStatus: () => Promise<void>;
  openPaywall: (triggerId?: string) => void;
}

const ProContext = createContext<ProContextValue>({
  isPro: false,
  isLoading: true,
  checkProStatus: async () => {},
  openPaywall: () => {},
});

export function useProContext() {
  return useContext(ProContext);
}

// Lazy import Paywall to keep initial bundle lean
let PaywallComponent: React.ComponentType<{
  visible: boolean;
  onClose: () => void;
  onPurchaseSuccess: () => void;
}> | null = null;

export function ProProvider({ children }: { children: React.ReactNode }) {
  const [isPro, setIsPro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [PaywallLoaded, setPaywallLoaded] = useState<React.ComponentType<any> | null>(null);

  // Load Paywall component lazily
  useEffect(() => {
    try {
      // Dynamic require so TypeScript doesn't complain about conditional imports
      const mod = require('../components/Paywall');
      setPaywallLoaded(() => mod.default ?? mod.Paywall);
    } catch {
      // Paywall component not available — ignore
    }
  }, []);

  const checkProStatus = useCallback(async () => {
    try {
      const promo = await AsyncStorage.getItem('promo_lifetime_unlocked');
      if (promo === 'true') { setIsPro(true); return; }
      const lifetime = await AsyncStorage.getItem('hasLifetimeAccess');
      if (lifetime === 'true') { setIsPro(true); return; }
    } catch {}
    try {
      const Purchases = getRevenueCatPurchases();
      if (!Purchases) return;
      const info = await Purchases.getCustomerInfo();
      const active = info?.entitlements?.active ?? {};
      setIsPro(active['pro'] !== undefined);
    } catch {
      // SDK unavailable or network error — stay with current isPro value
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const promo = await AsyncStorage.getItem('promo_lifetime_unlocked');
        if (promo === 'true') { setIsPro(true); setIsLoading(false); return; }
        const lifetime = await AsyncStorage.getItem('hasLifetimeAccess');
        if (lifetime === 'true') { setIsPro(true); setIsLoading(false); return; }
      } catch {}
      try {
        const Purchases = getRevenueCatPurchases();
        if (!Purchases) return;
        const info = await Purchases.getCustomerInfo();
        const active = info?.entitlements?.active ?? {};
        setIsPro(active['pro'] !== undefined);
      } catch {
        setIsPro(false);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  function openPaywall(triggerId?: string) {
    if (triggerId) {
      if (!markPaywallTriggered(triggerId)) return; // already shown this session
    }
    if (PaywallLoaded) {
      setPaywallVisible(true);
    } else {
      // Paywall not available yet — show a simple alert
      Alert.alert(
        'Hydro Hero Pro',
        'Upgrade to Pro to unlock all features — coming soon!',
        [{ text: 'OK' }],
      );
    }
  }

  function handlePurchaseSuccess() {
    checkProStatus();
    setPaywallVisible(false);
  }

  return (
    <ProContext.Provider value={{ isPro, isLoading, checkProStatus, openPaywall }}>
      {children}
      {PaywallLoaded && (
        <PaywallLoaded
          visible={paywallVisible}
          onClose={() => setPaywallVisible(false)}
          onPurchaseSuccess={handlePurchaseSuccess}
        />
      )}
    </ProContext.Provider>
  );
}
