import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withSpring,
  withSequence,
  Easing,
  runOnJS,
  cancelAnimation,
  useReducedMotion,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { LiquidRing } from './LiquidRing';
import type { BevDef } from '../../constants/beverages';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export type LastDrinkRevealHandle = {
  play: () => void;
  /** Measures the LiquidRing wrapper's center in screen coords. */
  measureRing: () => Promise<{ x: number; y: number } | null>;
};

type Props = {
  beverage: BevDef;
  ozLogged: number;
  hydratedOz: number;
  preferredUnit?: 'oz' | 'ml';
  /**
   * Fires when the ring is filled and it's time for the parent to launch the
   * top-level handoff droplet overlay. The droplet animation and the eventual
   * "drop lands in tank" callback are owned by the parent, not this component.
   */
  onHandoffStart?: () => void;
};

// ---- timing knobs (ms) — tune these in one place -------------------------
const T = {
  iconFall: 360,
  ripple: 560,
  cellStagger: 110,
  ringDelay: 300,
  ringFill: 1000,
  numberAppearAt: 620,
  // fires onHandoffStart — parent measures + launches the overlay droplet
  handoffStart: 1300,
};

/** Tiny worklet-driven number that animates without re-rendering. */
function AnimatedNumber({
  value,
  prefix = '',
  decimals = 0,
  suffix = '',
  style,
}: {
  value: SharedValue<number>;
  prefix?: string;
  decimals?: number;
  suffix?: string;
  style: any;
}) {
  const props = useAnimatedProps(() => {
    'worklet';
    const text = `${prefix}${value.value.toFixed(decimals)}${suffix}`;
    return { text, defaultValue: text } as any;
  });
  return (
    <AnimatedTextInput
      editable={false}
      underlineColorAndroid="transparent"
      style={style}
      animatedProps={props}
    />
  );
}

export const LastDrinkReveal = forwardRef<LastDrinkRevealHandle, Props>(
  ({ beverage, ozLogged, hydratedOz, preferredUnit = 'oz', onHandoffStart }, ref) => {
    const unitFactor = preferredUnit === 'ml' ? 29.5735 : 1;
    const displayedLogged = ozLogged * unitFactor;
    const displayedHydrated = hydratedOz * unitFactor;
    const numDecimals = preferredUnit === 'ml' ? 0 : 1;
    const intDecimals = 0;
    const reduced = useReducedMotion();
    const { Icon } = beverage;
    const liquidRingViewRef = useRef<View>(null);

    // splash
    const iconY = useSharedValue(-30);
    const iconOpacity = useSharedValue(0);
    const rippleScale = useSharedValue(0.4);
    const rippleOpacity = useSharedValue(0);

    // cascade (one driver per cell, 0..1)
    const cell = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];

    // pulse on icon + oz cells, synced to the ring fill
    const pulseScale = useSharedValue(0);

    // ring + numbers
    const level = useSharedValue(0);
    const numOpacity = useSharedValue(0);
    const ozSV = useSharedValue(0);
    const hydratedSV = useSharedValue(0);

    // handoff trigger SV — fires onHandoffStart at T.handoffStart
    const handoffTrigger = useSharedValue(0);

    const fireHandoff = useCallback(() => onHandoffStart?.(), [onHandoffStart]);

    const reset = useCallback(() => {
      [iconY, iconOpacity, rippleScale, rippleOpacity, level, numOpacity, ozSV, hydratedSV, handoffTrigger, pulseScale, ...cell].forEach(
        cancelAnimation
      );
      iconY.value = -30;
      iconOpacity.value = 0;
      rippleScale.value = 0.4;
      rippleOpacity.value = 0;
      cell.forEach((c) => (c.value = 0));
      pulseScale.value = 0;
      level.value = 0;
      numOpacity.value = 0;
      ozSV.value = 0;
      hydratedSV.value = 0;
      handoffTrigger.value = 0;
    }, []);

    const play = useCallback(() => {
      reset();

      if (reduced) {
        // No motion: settle everything, count briefly, then ask parent to launch.
        cell.forEach((c) => (c.value = 1));
        iconOpacity.value = 1;
        iconY.value = 30;
        numOpacity.value = 1;
        ozSV.value = withTiming(displayedLogged, { duration: 200 });
        hydratedSV.value = withTiming(displayedHydrated, { duration: 200 });
        level.value = withTiming(1, { duration: 250 }, (done) => {
          'worklet';
          if (done) runOnJS(fireHandoff)();
        });
        return;
      }

      // 1) splash icon drops to center, then fades out behind the ripple
      iconOpacity.value = withTiming(1, { duration: 60 });
      iconY.value = withTiming(30, {
        duration: T.iconFall,
        easing: Easing.bezier(0.5, 0, 0.9, 0.4),
      });
      iconOpacity.value = withDelay(
        T.iconFall + 40,
        withTiming(0, { duration: T.ripple * 0.5 })
      );

      // 2) ripple expands + fades, just after impact
      rippleOpacity.value = withDelay(T.iconFall, withTiming(0.9, { duration: 40 }));
      rippleScale.value = withDelay(
        T.iconFall,
        withTiming(7, { duration: T.ripple, easing: Easing.out(Easing.cubic) })
      );
      rippleOpacity.value = withDelay(
        T.iconFall + 40,
        withTiming(0, { duration: T.ripple })
      );

      // 3) value cells spring in, staggered (spring overshoot = the "pop")
      cell.forEach((c, i) => {
        c.value = withDelay(
          T.iconFall + i * T.cellStagger,
          withSpring(1, { damping: 9, stiffness: 140, mass: 0.6 })
        );
      });
      ozSV.value = withDelay(
        T.iconFall,
        withTiming(displayedLogged, { duration: 600, easing: Easing.out(Easing.cubic) })
      );

      // 4) ring fills in beverage color; "+N.N" rises in near the end
      level.value = withDelay(
        T.ringDelay,
        withTiming(1, { duration: T.ringFill, easing: Easing.inOut(Easing.cubic) })
      );
      // pulse the icon + oz cells in sync with the ring fill
      pulseScale.value = withDelay(
        T.ringDelay,
        withSequence(
          withTiming(1, { duration: T.ringFill / 2, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: T.ringFill / 2, easing: Easing.in(Easing.quad) }),
        )
      );
      numOpacity.value = withDelay(T.numberAppearAt, withTiming(1, { duration: 300 }));
      hydratedSV.value = withDelay(
        T.numberAppearAt,
        withTiming(displayedHydrated, { duration: 500, easing: Easing.out(Easing.cubic) })
      );

      // 5) at handoff time, signal the parent to launch the overlay droplet.
      //    The overlay owns the actual ring→tank animation in screen coords.
      handoffTrigger.value = withDelay(
        T.handoffStart,
        withTiming(1, { duration: 1 }, (done) => {
          'worklet';
          if (done) runOnJS(fireHandoff)();
        })
      );
    }, [reduced, ozLogged, hydratedOz, fireHandoff, reset]);

    const measureRing = useCallback((): Promise<{ x: number; y: number } | null> => {
      return new Promise((resolve) => {
        const node = liquidRingViewRef.current;
        if (!node) { resolve(null); return; }
        node.measureInWindow((x, y, w, h) => {
          resolve({ x: x + w / 2, y: y + h / 2 });
        });
      });
    }, []);

    useImperativeHandle(ref, () => ({ play, measureRing }), [play, measureRing]);

    // ---- animated styles ---------------------------------------------------
    const iconStyle = useAnimatedStyle(() => ({
      opacity: iconOpacity.value,
      transform: [{ translateY: iconY.value }],
    }));
    const rippleStyle = useAnimatedStyle(() => ({
      opacity: rippleOpacity.value,
      transform: [{ scale: rippleScale.value }],
    }));
    const cellStyle = (i: number) =>
      useAnimatedStyle(() => {
        const base = 0.6 + 0.4 * cell[i].value;
        const pulse = i < 2 ? 1 + pulseScale.value * 0.1 : 1;
        return {
          opacity: interpolate(cell[i].value, [0, 0.4, 1], [0, 1, 1], Extrapolation.CLAMP),
          transform: [
            { scale: base * pulse },
            { translateY: (1 - cell[i].value) * 12 },
          ],
        };
      });
    const numStyle = useAnimatedStyle(() => ({
      opacity: numOpacity.value,
      transform: [{ translateY: (1 - numOpacity.value) * 6 }],
    }));

    return (
      <View style={styles.panel} pointerEvents="box-none">
        {/* falling splash icon + ripple, centered over the panel */}
        <Animated.View style={[styles.splashIcon, iconStyle]} pointerEvents="none">
          <Icon size={30} color={beverage.color} strokeWidth={2} />
        </Animated.View>
        <Animated.View
          style={[styles.ripple, { borderColor: beverage.color }, rippleStyle]}
          pointerEvents="none"
        />

        {/* row: icon+label | oz logged | hydrated ring */}
        <View style={styles.row}>
          <Animated.View style={[styles.cell, cellStyle(0)]}>
            <Icon size={30} color={beverage.color} strokeWidth={2} />
            <Text style={styles.label}>{beverage.label}</Text>
          </Animated.View>

          <Animated.View style={[styles.cell, cellStyle(1)]}>
            <AnimatedNumber value={ozSV} decimals={intDecimals} style={styles.bigNum} />
            <Text style={styles.label}>{preferredUnit === 'ml' ? 'ML LOGGED' : 'OZ LOGGED'}</Text>
          </Animated.View>

          <Animated.View style={[styles.cell, cellStyle(2)]}>
            <View ref={liquidRingViewRef} style={styles.ringWrap} collapsable={false}>
              <LiquidRing
                level={level}
                fillColor={beverage.color}
                surfaceColor={beverage.surface}
              />
              <Animated.View style={[styles.ringNum, numStyle]} pointerEvents="none">
                <AnimatedNumber
                  value={hydratedSV}
                  prefix="+"
                  decimals={numDecimals}
                  style={styles.ringNumText}
                />
              </Animated.View>
            </View>
            <Text style={styles.label}>{preferredUnit === 'ml' ? 'HYDRATED ML' : 'HYDRATED OZ'}</Text>
          </Animated.View>
        </View>

      </View>
    );
  }
);

const styles = StyleSheet.create({
  panel: {
    minHeight: 110,
    justifyContent: 'center',
    overflow: 'visible',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  cell: { flex: 1, alignItems: 'center', gap: 6 },
  label: {
    fontSize: 11,
    letterSpacing: 1,
    color: '#9B93C2',
    fontWeight: '700',
  },
  bigNum: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    padding: 0,
    textAlign: 'center',
    minWidth: 40,
  },
  ringWrap: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  ringNum: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringNumText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF', // white reads on every beverage fill
    padding: 0,
    textAlign: 'center',
    minWidth: 56,
  },
  splashIcon: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    zIndex: 5,
  },
  ripple: {
    position: 'absolute',
    top: 30,
    alignSelf: 'center',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    zIndex: 4,
  },
});
