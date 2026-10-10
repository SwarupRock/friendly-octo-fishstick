/** Small shared pieces: the wordmark, buttons, fields, bubbles, loaders. */

import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import Animated, {
  FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import { fonts, useTheme } from '@/lib/theme';

export type IconName = React.ComponentProps<typeof Feather>['name'];

export function tap() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

/** The brand lockup — Manrope 800, tight tracking, exactly as on the website. */
export function Wordmark({ size = 22, style }: { size?: number; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[{ fontFamily: fonts.heavy, fontSize: size, letterSpacing: -1, color: colors.ink }, style]}
    >
      SVARAH.AI
    </Text>
  );
}

/** Mono, uppercase micro-label used above every block. */
export function Tag({ children, icon, color }: { children: React.ReactNode; icon?: IconName; color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.tag}>
      {icon ? <Feather name={icon} size={11} color={color ?? colors.muted} /> : null}
      <Text style={[styles.tagText, { color: color ?? colors.muted }]}>{children}</Text>
    </View>
  );
}

/** A press target that springs down slightly, like the web buttons. */
export function Springy({
  children, onPress, disabled, style, accessibilityLabel, hitSlop,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  hitSlop?: number;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => {
        scale.set(withSpring(0.96, { damping: 18, stiffness: 320 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 14, stiffness: 260 }));
      }}
      onPress={() => {
        tap();
        onPress?.();
      }}
    >
      <Animated.View style={[style, animated, disabled ? { opacity: 0.5 } : null]}>{children}</Animated.View>
    </Pressable>
  );
}

export function PrimaryButton({
  label, onPress, loading, disabled, icon, tone = 'lime',
}: {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  /** `outline` is the quiet secondary action next to a lime primary. */
  tone?: 'lime' | 'primary' | 'outline';
}) {
  const { colors } = useTheme();
  const background = tone === 'lime' ? colors.lime : tone === 'primary' ? colors.primaryBg : colors.surface;
  const ink = tone === 'lime' ? colors.limeInk : tone === 'primary' ? colors.primaryInk : colors.ink;
  return (
    <Springy
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.primary, { backgroundColor: background, borderWidth: 1, borderColor: tone === 'outline' ? colors.lineStrong : background }]}
    >
      {loading ? <ActivityIndicator color={ink} /> : (
        <>
          <Text style={[styles.primaryText, { color: ink }]}>{label}</Text>
          {icon ? <Feather name={icon} size={17} color={ink} /> : null}
        </>
      )}
    </Springy>
  );
}

export function GhostButton({
  label, icon, onPress, disabled, active,
}: {
  label?: string;
  icon?: IconName;
  onPress?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  const { colors } = useTheme();
  const ink = active ? colors.chipInk : colors.muted;
  return (
    <Springy
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label ?? icon}
      hitSlop={6}
      style={[
        styles.ghost,
        { backgroundColor: active ? colors.chip : colors.surface, borderColor: colors.line },
        !label ? styles.ghostIconOnly : null,
      ]}
    >
      {icon ? <Feather name={icon} size={15} color={ink} /> : null}
      {label ? <Text style={[styles.ghostText, { color: ink }]}>{label}</Text> : null}
    </Springy>
  );
}

export function Field({
  label, icon, error, ...input
}: TextInputProps & { label: string; icon?: IconName; error?: string }) {
  const { colors } = useTheme();
  const focus = useSharedValue(0);
  const ring = useAnimatedStyle(() => ({
    borderColor: focus.value ? colors.lime : colors.lineStrong,
    shadowOpacity: focus.value * 0.35,
  }));
  return (
    <View style={{ gap: 7 }}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
      <Animated.View style={[styles.field, { backgroundColor: colors.surface2, shadowColor: colors.lime }, ring]}>
        {icon ? <Feather name={icon} size={16} color={colors.muted} /> : null}
        <TextInput
          placeholderTextColor={colors.muted}
          selectionColor={colors.lime}
          {...input}
          onFocus={(event) => {
            focus.set(withTiming(1, { duration: 160 }));
            input.onFocus?.(event);
          }}
          onBlur={(event) => {
            focus.set(withTiming(0, { duration: 160 }));
            input.onBlur?.(event);
          }}
          style={[styles.fieldInput, { color: colors.ink }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
        />
      </Animated.View>
      {error ? <Text style={{ color: colors.warnInk, fontFamily: fonts.medium, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

/** A thread bubble that slides up into place and resizes smoothly. */
export function Bubble({
  kind = 'app', children, style,
}: {
  kind?: 'app' | 'user' | 'warn';
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const look: ViewStyle =
    kind === 'user' ? { backgroundColor: colors.userBg, alignSelf: 'flex-end', borderBottomRightRadius: 6 }
    : kind === 'warn' ? { backgroundColor: colors.warnBg, borderWidth: 1, borderColor: colors.line, alignSelf: 'flex-start' }
    : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignSelf: 'flex-start', borderBottomLeftRadius: 6 };
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18).stiffness(180)}
      layout={LinearTransition.springify().damping(20).stiffness(200)}
      style={[styles.bubble, look, style]}
    >
      {children}
    </Animated.View>
  );
}

export function BubbleText({ children, kind = 'app' }: { children: React.ReactNode; kind?: 'app' | 'user' | 'warn' }) {
  const { colors } = useTheme();
  const color = kind === 'user' ? colors.userInk : kind === 'warn' ? colors.warnInk : colors.ink;
  return <Text style={[styles.bubbleText, { color }]}>{children}</Text>;
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.set(withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0, { duration: 320 })), -1),
    ));
  }, [delay, lift]);
  const animated = useAnimatedStyle(() => ({
    opacity: 0.35 + lift.value * 0.65,
    transform: [{ translateY: -3 * lift.value }],
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, animated]} />;
}

/** Three bouncing dots — "thinking". */
export function Dots({ color }: { color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {[0, 140, 280].map((delay) => <Dot key={delay} delay={delay} color={color ?? colors.muted} />)}
    </View>
  );
}

/** A soft shimmer for media that is still being made. */
export function Shimmer({ style, label }: { style?: StyleProp<ViewStyle>; label?: string }) {
  const { colors } = useTheme();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 1100 }), -1, true));
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.55 + pulse.value * 0.45 }));
  return (
    <Animated.View style={[styles.shimmer, { backgroundColor: colors.surface2, borderColor: colors.line }, style, animated]}>
      {label ? <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11, textAlign: 'center' }}>{label}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 9 },
  tagText: { fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase' },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 999, paddingVertical: 16, paddingHorizontal: 22, minHeight: 54,
  },
  primaryText: { fontFamily: fonts.bold, fontSize: 15 },
  ghost: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999,
    paddingVertical: 9, paddingHorizontal: 13, minHeight: 36,
  },
  ghostIconOnly: { width: 36, paddingHorizontal: 0, justifyContent: 'center' },
  ghostText: { fontFamily: fonts.semibold, fontSize: 12.5 },
  fieldLabel: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 14, minHeight: 52, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  fieldInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, paddingVertical: 12 },
  bubble: { maxWidth: '92%', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16 },
  bubbleText: { fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 22 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  shimmer: { borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
});
