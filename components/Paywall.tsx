/**
 * components/Paywall.tsx
 *
 * Full-screen paywall modal in Hydro Hero Art Deco casino theme.
 * - Animated slot reel cycles through Pro feature names
 * - Two purchase cards: Monthly + Lifetime, prices read live from RevenueCat
 * - Falls back to baseline labels if RC offerings aren't reachable
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getRevenueCatPurchases } from '../utils/revenueCat';

const GOLD = '#FFD700';
const GOLD_DIM = '#c8a000';
const BG = '#0a0520';
const CARD_BG = 'rgba(255,255,255,0.06)';
const CARD_BORDER_GOLD = 'rgba(255,215,0,0.45)';

const REEL_FEATURES = [
  '20 Drink Categories',
  'Smart Notifications',
  'Full Analytics',
  'All 20 Badges',
  'Apple Health Sync',
  'Squad Mode',
  'Home Screen Widget',
  'Sound Effects',
  'Dark & Light Mode',
  'Custom Quick Add',
  'Hydration Facts',
  'Goal Calculator',
];

const PRO_BENEFITS = [
  'All 20 beverage categories',
  'Full Stats & monthly calendar',
  'All badges & streak milestones',
  'Apple Health sync',
  'Unlimited Squad members',
  'Smart notification system',
  'Sound effects & haptic feedback',
  'Dark / light mode + custom widgets',
];

interface PaywallProps {
  visible: boolean;
  onClose: () => void;
  onPurchaseSuccess: () => void;
}

const MONTHLY_PRICE_FALLBACK = '$1.99';
const LIFETIME_PRICE_FALLBACK = '$9.99';

export default function Paywall({ visible, onClose, onPurchaseSuccess }: PaywallProps) {
  const [reelIdx, setReelIdx] = useState(0);
  const reelFade = useRef(new Animated.Value(1)).current;
  const reelSlide = useRef(new Animated.Value(0)).current;
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const reelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [monthlyPkg, setMonthlyPkg] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [lifetimePkg, setLifetimePkg] = useState<any>(null);

  const monthlyPrice = monthlyPkg?.product?.priceString ?? MONTHLY_PRICE_FALLBACK;
  const lifetimePrice = lifetimePkg?.product?.priceString ?? LIFETIME_PRICE_FALLBACK;

  // Load offerings whenever the paywall becomes visible
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const Purchases = getRevenueCatPurchases();
        if (!Purchases) return;
        const offerings = await Purchases.getOfferings();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pkgs: any[] = offerings?.current?.availablePackages ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const monthly = pkgs.find((p: any) =>
          p.packageType === 'MONTHLY' || p.identifier?.toLowerCase().includes('monthly')
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lifetime = pkgs.find((p: any) =>
          p.packageType === 'LIFETIME' || p.identifier?.toLowerCase().includes('lifetime')
        );
        if (!cancelled) {
          setMonthlyPkg(monthly ?? null);
          setLifetimePkg(lifetime ?? null);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [visible]);

  // Spin reel animation
  useEffect(() => {
    if (!visible) return;
    reelTimer.current = setInterval(() => {
      Animated.parallel([
        Animated.timing(reelFade, { toValue: 0, duration: 250, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(reelSlide, { toValue: -20, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        setReelIdx((i) => (i + 1) % REEL_FEATURES.length);
        reelSlide.setValue(20);
        Animated.parallel([
          Animated.timing(reelFade, { toValue: 1, duration: 250, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
          Animated.timing(reelSlide, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start();
      });
    }, 1800);
    return () => { if (reelTimer.current) clearInterval(reelTimer.current); };
  }, [visible, reelFade, reelSlide]);

  async function tryPurchase(packageType: 'monthly' | 'lifetime') {
    setPurchasing(true);
    try {
      const Purchases = getRevenueCatPurchases();
      if (!Purchases) {
        Alert.alert(
          'Real Device Required',
          "In-app purchases only work in a TestFlight or App Store build on a real device — they can't run in the iOS simulator or local dev builds.",
          [{ text: 'OK' }],
        );
        return;
      }
      const offerings = await Purchases.getOfferings();
      const pkgs = offerings?.current?.availablePackages ?? [];

      let pkg = pkgs.find((p: any) =>
        packageType === 'monthly'
          ? p.packageType === 'MONTHLY' || p.identifier?.toLowerCase().includes('monthly')
          : p.packageType === 'LIFETIME' || p.identifier?.toLowerCase().includes('lifetime')
      );

      // Fallback: try product identifier match
      if (!pkg) {
        const targetId = packageType === 'monthly'
          ? 'com.wimsby.liquidluck.pro.monthly'
          : 'com.wimsby.liquidluck.pro.lifetime';
        pkg = pkgs.find((p: any) => p.product?.productIdentifier === targetId);
      }

      if (!pkg) {
        Alert.alert(
          'Coming Soon!',
          'Purchases are not available in this build yet — stay tuned! 🎰',
          [{ text: 'OK' }],
        );
        return;
      }

      const result = await Purchases.purchasePackage(pkg);
      const active = result?.customerInfo?.entitlements?.active ?? {};
      // Single-tier app: any active entitlement = PRO. Previously this checked
      // active['pro'] specifically, which silently failed if the RC entitlement
      // identifier ever drifted (case mismatch, rename, etc.) — purchase went
      // through at Apple but the app never unlocked.
      if (Object.keys(active).length > 0) {
        Alert.alert(
          "🎰 Welcome to Hydro Hero PRO!",
          "All PRO features are now unlocked. Time to spin!",
          [{ text: "Let's Go!", onPress: onPurchaseSuccess }],
        );
      }
    } catch (e: any) {
      if (e?.userCancelled) return; // user cancelled — no error needed
      const code = e?.code ?? e?.userInfo?.readableErrorCode ?? 'unknown';
      const msg = e?.message ?? e?.userInfo?.NSLocalizedDescription ?? 'Unknown error';
      const underlying = e?.underlyingErrorMessage;
      const detail = underlying ? `${msg}\n\n${underlying}\n\n(${code})` : `${msg}\n\n(${code})`;
      Alert.alert('Purchase Failed', detail, [{ text: 'OK' }]);
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const Purchases = getRevenueCatPurchases();
      if (!Purchases) {
        Alert.alert(
          'Real Device Required',
          "Restoring purchases only works in a TestFlight or App Store build on a real device — not in the iOS simulator or local dev builds.",
          [{ text: 'OK' }],
        );
        return;
      }
      const info = await Purchases.restorePurchases();
      const active = info?.entitlements?.active ?? {};
      if (Object.keys(active).length > 0) {
        Alert.alert('Welcome back!', "Pro access restored — let's keep spinning! 🎰", [
          { text: 'Let\'s Go!', onPress: onPurchaseSuccess },
        ]);
      } else {
        Alert.alert('No Purchase Found', "We couldn't find a previous Pro purchase on this account.", [{ text: 'OK' }]);
      }
    } catch {
      Alert.alert('Restore Failed', 'Please check your connection and try again.', [{ text: 'OK' }]);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <View style={s.root}>
        {/* Dismiss button */}
        <TouchableOpacity style={s.dismissBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.dismissTxt}>Maybe Later</Text>
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Header */}
          <Text style={s.crown}>👑</Text>
          <Text style={s.title}>HYDRO HERO PRO</Text>
          <Text style={s.subtitle}>Unlock the full casino experience</Text>

          {/* Animated reel */}
          <View style={s.reelFrame}>
            <View style={s.reelInner}>
              <Text style={s.reelLabel}>NOW SPINNING</Text>
              <Animated.Text
                style={[s.reelText, { opacity: reelFade, transform: [{ translateY: reelSlide }] }]}
                numberOfLines={1}
              >
                🎰 {REEL_FEATURES[reelIdx]}
              </Animated.Text>
            </View>
          </View>

          {/* Benefits list */}
          <View style={s.benefitsCard}>
            {PRO_BENEFITS.map((b) => (
              <View key={b} style={s.benefitRow}>
                <Text style={s.benefitCheck}>✓</Text>
                <Text style={s.benefitText}>{b}</Text>
              </View>
            ))}
          </View>

          {/* Purchase cards — MONTHLY (left) and LIFETIME (right, highlighted) */}
          <View style={s.cardsRow}>
            {/* Monthly card */}
            <TouchableOpacity
              style={s.cardMonthly}
              onPress={() => tryPurchase('monthly')}
              disabled={purchasing}
              activeOpacity={0.85}
            >
              <Text style={s.cardLabel}>MONTHLY</Text>
              <Text style={s.cardPrice}>{monthlyPrice}</Text>
              <Text style={s.cardSub}>{monthlyPrice} / month{'\n'}Cancel anytime</Text>
            </TouchableOpacity>

            {/* Lifetime card — highlighted as best value */}
            <TouchableOpacity
              style={s.cardLifetime}
              onPress={() => tryPurchase('lifetime')}
              disabled={purchasing}
              activeOpacity={0.85}
            >
              <View style={s.bestValueBadge}>
                <Text style={s.bestValueTxt}>BEST VALUE</Text>
              </View>
              <Text style={[s.cardLabel, { color: BG }]}>LIFETIME</Text>
              <Text style={[s.cardPrice, { color: BG }]}>{lifetimePrice}</Text>
              <Text style={[s.cardSub, { color: 'rgba(10,5,32,0.7)' }]}>{lifetimePrice} once{'\n'}Pay once, own forever</Text>
            </TouchableOpacity>
          </View>

          {/* Primary CTA — monthly */}
          <TouchableOpacity
            style={[s.primaryBtn, purchasing && { opacity: 0.6 }]}
            onPress={() => tryPurchase('monthly')}
            disabled={purchasing}
            activeOpacity={0.85}
          >
            {purchasing ? (
              <ActivityIndicator color={BG} />
            ) : (
              <Text style={s.primaryBtnTxt}>Subscribe Monthly — {monthlyPrice}/mo</Text>
            )}
          </TouchableOpacity>

          {/* Secondary CTA — lifetime */}
          <TouchableOpacity
            style={[s.secondaryBtn, purchasing && { opacity: 0.6 }]}
            onPress={() => tryPurchase('lifetime')}
            disabled={purchasing}
            activeOpacity={0.85}
          >
            <Text style={s.secondaryBtnTxt}>Get Lifetime Access — {lifetimePrice}</Text>
          </TouchableOpacity>

          {/* Restore */}
          <TouchableOpacity
            style={s.restoreBtn}
            onPress={handleRestore}
            disabled={restoring}
            activeOpacity={0.7}
          >
            {restoring ? (
              <ActivityIndicator color={GOLD_DIM} size="small" />
            ) : (
              <Text style={s.restoreTxt}>Restore Purchases</Text>
            )}
          </TouchableOpacity>

          {/* Terms */}
          <Text style={s.terms}>
            By purchasing you agree to our Terms of Service and Privacy Policy.{'\n'}
            Monthly subscription auto-renews at {monthlyPrice}/mo unless cancelled 24 hours before renewal.
          </Text>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { paddingTop: 56, paddingHorizontal: 24, alignItems: 'center' },

  dismissBtn: {
    position: 'absolute', top: 52, right: 20, zIndex: 10,
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dismissTxt: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600' },

  crown: { fontSize: 48, marginBottom: 4 },
  title: {
    fontSize: 32, fontWeight: '900', color: GOLD, letterSpacing: 3,
    textShadowColor: GOLD_DIM, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
    marginBottom: 6,
  },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 15, marginBottom: 24, textAlign: 'center' },

  reelFrame: {
    width: '100%', borderRadius: 16, borderWidth: 2, borderColor: CARD_BORDER_GOLD,
    backgroundColor: 'rgba(255,215,0,0.06)', paddingVertical: 20, marginBottom: 20,
    overflow: 'hidden',
  },
  reelInner: { alignItems: 'center' },
  reelLabel: { color: 'rgba(255,215,0,0.5)', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  reelText: { color: GOLD, fontSize: 22, fontWeight: '800', letterSpacing: 1 },

  benefitsCard: {
    width: '100%', backgroundColor: CARD_BG, borderRadius: 16,
    borderWidth: 1, borderColor: CARD_BORDER_GOLD,
    paddingVertical: 16, paddingHorizontal: 20, marginBottom: 20,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 10 },
  benefitCheck: { color: GOLD, fontSize: 16, fontWeight: '800', width: 20 },
  benefitText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, flex: 1 },

  cardsRow: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 20 },

  cardMonthly: {
    flex: 1, borderRadius: 16, borderWidth: 2, borderColor: GOLD,
    backgroundColor: CARD_BG, padding: 16, alignItems: 'center',
  },
  cardLifetime: {
    flex: 1, borderRadius: 16, backgroundColor: GOLD,
    padding: 16, alignItems: 'center', overflow: 'hidden',
  },
  bestValueBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: BG, borderBottomLeftRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  bestValueTxt: { color: GOLD, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  cardLabel: { color: GOLD, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  cardPrice: { color: '#ffffff', fontSize: 26, fontWeight: '900', marginBottom: 4 },
  cardSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, textAlign: 'center', lineHeight: 16 },

  primaryBtn: {
    width: '100%', backgroundColor: GOLD, borderRadius: 16,
    paddingVertical: 18, alignItems: 'center', marginBottom: 12,
    shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
    elevation: 8,
  },
  primaryBtnTxt: { color: BG, fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },

  secondaryBtn: {
    width: '100%', borderRadius: 16, borderWidth: 1.5, borderColor: CARD_BORDER_GOLD,
    paddingVertical: 14, alignItems: 'center', marginBottom: 20,
    backgroundColor: 'rgba(255,215,0,0.06)',
  },
  secondaryBtnTxt: { color: GOLD_DIM, fontSize: 15, fontWeight: '700' },

  restoreBtn: { paddingVertical: 10, marginBottom: 16 },
  restoreTxt: { color: 'rgba(255,255,255,0.35)', fontSize: 13 },

  terms: {
    color: 'rgba(255,255,255,0.2)', fontSize: 10,
    textAlign: 'center', lineHeight: 15, paddingHorizontal: 8,
  },
});
