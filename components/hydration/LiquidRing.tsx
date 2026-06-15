import React from 'react';
import Svg, { Circle, Rect, Defs, ClipPath } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

// viewBox geometry (kept square; scaled by `size`)
const VB = 96;
const C = 48; // center
const R_CLIP = 38; // inner liquid radius
const SPAN = R_CLIP * 2; // 76
const BOTTOM = C + R_CLIP; // 86  (y of the empty waterline)

type Props = {
  /** 0 = empty, 1 = full. Animate this in the parent. */
  level: SharedValue<number>;
  fillColor: string;
  surfaceColor: string;
  rimColor?: string;
  size?: number;
};

/**
 * The gold rim stays constant; only the interior fills. Both the body and the
 * thin surface band are clipped to the inner circle and move together as
 * `level` animates, so the waterline reads as the top of the liquid.
 */
export function LiquidRing({
  level,
  fillColor,
  surfaceColor,
  rimColor = '#F5C518',
  size = 84,
}: Props) {
  const bodyProps = useAnimatedProps(() => {
    'worklet';
    return { y: BOTTOM - level.value * SPAN };
  });
  const surfaceProps = useAnimatedProps(() => {
    'worklet';
    return { y: BOTTOM - level.value * SPAN };
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
      <Defs>
        <ClipPath id="liquidRingClip">
          <Circle cx={C} cy={C} r={R_CLIP} />
        </ClipPath>
      </Defs>

      <AnimatedRect
        x={0}
        width={VB}
        height={VB}
        animatedProps={bodyProps}
        fill={fillColor}
        clipPath="url(#liquidRingClip)"
      />
      <AnimatedRect
        x={0}
        width={VB}
        height={4}
        animatedProps={surfaceProps}
        fill={surfaceColor}
        clipPath="url(#liquidRingClip)"
      />

      <Circle cx={C} cy={C} r={42} fill="none" stroke={rimColor} strokeWidth={6} />
    </Svg>
  );
}
