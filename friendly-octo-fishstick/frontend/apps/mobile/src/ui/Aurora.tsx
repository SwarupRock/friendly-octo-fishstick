/**
 * The lime ambient glow behind the landing and sign-in screens — the app's
 * version of the website's `.auth-ambient-glow`, drifting slowly.
 */

import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/lib/theme';

function Blob({ size, color, from, to, duration }: {
  size: number;
  color: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  duration: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [duration, progress]);
  const animated = useAnimatedStyle(() => ({
    transform: [
      { translateX: from.x + (to.x - from.x) * progress.value },
      { translateY: from.y + (to.y - from.y) * progress.value },
      { scale: 1 + 0.18 * progress.value },
    ],
  }));
  const id = `glow-${size}-${duration}`;
  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size }, animated]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

export function Aurora() {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const big = Math.max(width, 360) * 1.25;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: colors.paper }]}>
      <Blob size={big} color={colors.glow} duration={9000}
        from={{ x: -big * 0.35, y: -big * 0.3 }} to={{ x: width - big * 0.75, y: -big * 0.12 }} />
      <Blob size={big * 0.8} color={colors.glow} duration={12000}
        from={{ x: width - big * 0.5, y: height * 0.55 }} to={{ x: -big * 0.2, y: height * 0.4 }} />
    </View>
  );
}
