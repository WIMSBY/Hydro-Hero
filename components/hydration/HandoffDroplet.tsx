import React, { forwardRef, useCallback, useImperativeHandle } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

type Pt = { x: number; y: number };

export type HandoffDropletHandle = {
  play: (start: Pt, end: Pt, onLand?: () => void) => void;
};

// Top-level overlay that animates a blue droplet from a measured start point
// (typically the hydrated-oz ring) to a measured end point (the vault water
// surface). The droplet stays blue regardless of beverage — it represents
// hydration. On landing, a brief ripple expands at the end point and the
// caller's onLand fires so the tank can begin filling.
export const HandoffDroplet = forwardRef<HandoffDropletHandle>((_, ref) => {
  const progress = useSharedValue(0);
  const visible = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const endX = useSharedValue(0);
  const endY = useSharedValue(0);
  const ripple = useSharedValue(0);

  const play = useCallback((start: Pt, end: Pt, onLand?: () => void) => {
    cancelAnimation(progress);
    cancelAnimation(ripple);
    cancelAnimation(visible);
    startX.value = start.x;
    startY.value = start.y;
    endX.value = end.x;
    endY.value = end.y;
    progress.value = 0;
    visible.value = 1;
    ripple.value = 0;

    progress.value = withTiming(
      1,
      { duration: 500, easing: Easing.out(Easing.cubic) },
      (done) => {
        'worklet';
        if (!done) return;
        if (onLand) runOnJS(onLand)();
        ripple.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
        visible.value = withDelay(20, withTiming(0, { duration: 1 }));
      },
    );
  }, []);

  useImperativeHandle(ref, () => ({ play }), [play]);

  const dropletStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const x = interpolate(p, [0, 1], [startX.value, endX.value]);
    const apex = Math.min(startY.value, endY.value) - 60;
    const y = interpolate(p, [0, 0.5, 1], [startY.value, apex, endY.value]);

    // launch stretch (first 15% of travel — droplet pulls vertically as it leaves)
    const launchSY = p < 0.15 ? 1.3 - (p / 0.15) * 0.3 : 1;
    // landing squash (last 15% — flattens against the water surface)
    const lt = p > 0.85 ? (p - 0.85) / 0.15 : 0;
    const scaleX = 1 + lt * 0.3;
    const scaleY = launchSY * (1 - lt * 0.3);

    const opacity = visible.value === 0
      ? 0
      : interpolate(p, [0, 0.7, 1], [1, 1, 0], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [
        { translateX: x - 8 },  // center the 16px-wide droplet on (x, y)
        { translateY: y - 9 },  // center the 18px-tall droplet on (x, y)
        { rotate: '45deg' },
        { scaleX },
        { scaleY },
      ],
    };
  });

  const rippleStyle = useAnimatedStyle(() => {
    const p = ripple.value;
    if (p === 0) return { opacity: 0 };
    const scale = interpolate(p, [0, 1], [0.4, 3]);
    const opacity = interpolate(p, [0, 0.3, 1], [0, 0.7, 0]);
    return {
      opacity,
      transform: [
        { translateX: endX.value - 14 },
        { translateY: endY.value - 14 },
        { scale },
      ],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.ripple, rippleStyle]} />
      <Animated.View style={[styles.droplet, dropletStyle]} />
    </View>
  );
});

HandoffDroplet.displayName = 'HandoffDroplet';

const styles = StyleSheet.create({
  droplet: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 16,
    height: 18,
    borderRadius: 8,
    backgroundColor: '#2F7FD6',
  },
  ripple: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#5AA6F0',
  },
});
