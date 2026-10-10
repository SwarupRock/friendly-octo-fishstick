/**
 * The poster: text-free AI artwork with the offer set on top by the app.
 *
 * Every word and number here is drawn from the locked facts — the image model
 * is never asked to render text, so nothing on the poster can be misspelt or
 * mis-priced. `PosterReel` animates the same layers into a short campaign reel.
 */

import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';

import type { Poster } from '@/lib/campaigns';
import { compileTokens, type Facts } from '@/lib/facts';
import { fonts } from '@/lib/theme';

const LIME = '#d8f878';
const INK = '#141513';

function Backdrop({ poster, zoom }: { poster: Poster; zoom?: boolean }) {
  const drift = useSharedValue(0);
  useEffect(() => {
    if (zoom) drift.set(withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [zoom, drift]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + drift.value * 0.14 }, { translateY: -10 * drift.value }],
  }));
  return (
    <>
      {poster.artUrl ? (
        <Animated.View style={[StyleSheet.absoluteFill, animated]}>
          <Image source={{ uri: poster.artUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
        </Animated.View>
      ) : (
        <LinearGradient colors={['#2c3320', '#1a1b19', '#141513']} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={['rgba(10,11,9,0.55)', 'rgba(10,11,9,0.05)', 'rgba(10,11,9,0.72)', 'rgba(10,11,9,0.94)']}
        locations={[0, 0.3, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
}

function Chip({ icon, text }: { icon: React.ComponentProps<typeof Feather>['name']; text: string }) {
  return (
    <View style={styles.chip}>
      <Feather name={icon} size={11} color={LIME} />
      <Text style={styles.chipText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

/** The finished, shareable poster (3:4). The ref is what gets captured as an image. */
export const PosterCard = forwardRef<View, { poster: Poster; facts: Facts }>(function PosterCard(
  { poster, facts },
  ref,
) {
  const tokens = compileTokens(facts);
  return (
    <View ref={ref} collapsable={false} style={styles.frame}>
      <Backdrop poster={poster} />
      <View style={styles.top}>
        {facts.business.name ? <Text style={styles.business} numberOfLines={1}>{facts.business.name}</Text> : <View />}
        {tokens.DISCOUNT ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{tokens.DISCOUNT.replace(/ off$/i, '')}</Text>
            <Text style={styles.badgeSmall}>OFF</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.bottom}>
        <Text style={styles.headline}>{poster.headline}</Text>
        {poster.subline ? <Text style={styles.subline}>{poster.subline}</Text> : null}
        <View style={styles.chips}>
          {tokens.PRICE && !tokens.DISCOUNT ? <Chip icon="tag" text={tokens.PRICE} /> : null}
          {tokens.DAYS ? <Chip icon="calendar" text={tokens.DAYS} /> : null}
          {tokens.WINDOW ? <Chip icon="clock" text={tokens.WINDOW} /> : null}
          {tokens.LOCATION ? <Chip icon="map-pin" text={tokens.LOCATION} /> : null}
        </View>
        {tokens.CONDITIONS ? <Text style={styles.fine}>{tokens.CONDITIONS}</Text> : null}
      </View>
    </View>
  );
});

/**
 * A looping, animated cut of the poster: the artwork drifts while the offer
 * arrives one beat at a time. It plays inside the app (it is not a video file).
 */
export function PosterReel({ poster, facts, playing }: { poster: Poster; facts: Facts; playing: boolean }) {
  const tokens = compileTokens(facts);
  const beats = [
    { key: 'hook', big: poster.headline, small: facts.business.name ?? '' },
    tokens.DISCOUNT || tokens.PRICE
      ? { key: 'deal', big: tokens.DISCOUNT ? tokens.DISCOUNT.toUpperCase() : tokens.PRICE, small: tokens.PRODUCT ?? '' }
      : null,
    tokens.DAYS || tokens.WINDOW
      ? { key: 'when', big: tokens.DAYS ?? tokens.WINDOW, small: tokens.DAYS && tokens.WINDOW ? tokens.WINDOW : 'Mark the time' }
      : null,
    { key: 'where', big: tokens.LOCATION ?? facts.business.name ?? 'Visit us', small: poster.subline || 'See you there' },
  ].filter(Boolean) as { key: string; big: string; small: string }[];

  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => setIndex((current) => (current + 1) % beats.length), 2600);
    return () => clearInterval(timer);
  }, [playing, beats.length]);

  const beat = beats[index % beats.length];
  return (
    <View style={styles.frame}>
      <Backdrop poster={poster} zoom={playing} />
      <View style={styles.reelCenter}>
        <Animated.View
          key={beat.key}
          entering={FadeInDown.duration(520).easing(Easing.out(Easing.cubic))}
          exiting={FadeOut.duration(220)}
          style={{ alignItems: 'center', gap: 10 }}
        >
          <Text style={styles.reelBig}>{beat.big}</Text>
          {beat.small ? <Text style={styles.reelSmall}>{beat.small}</Text> : null}
        </Animated.View>
      </View>
      <View style={styles.progress}>
        {beats.map((item, position) => (
          <Animated.View
            key={item.key}
            entering={FadeIn}
            style={[styles.progressDot, position === index % beats.length ? styles.progressOn : null]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 3 / 4, borderRadius: 18, overflow: 'hidden', backgroundColor: INK },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16 },
  business: {
    color: '#fff', fontFamily: fonts.heavy, fontSize: 14, letterSpacing: 0.4, textTransform: 'uppercase',
    flexShrink: 1, marginRight: 12, marginTop: 6,
  },
  badge: {
    backgroundColor: LIME, borderRadius: 999, minWidth: 68, height: 68, paddingHorizontal: 10,
    alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '8deg' }],
  },
  badgeText: { color: INK, fontFamily: fonts.heavy, fontSize: 20, letterSpacing: -0.6, lineHeight: 22 },
  badgeSmall: { color: INK, fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1.4 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 8 },
  headline: { color: '#fff', fontFamily: fonts.heavy, fontSize: 27, lineHeight: 30, letterSpacing: -0.9 },
  subline: { color: 'rgba(255,255,255,0.86)', fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(20,21,19,0.72)',
    borderColor: 'rgba(216,248,120,0.35)', borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 9, paddingVertical: 5, maxWidth: '100%',
  },
  chipText: { color: '#fff', fontFamily: fonts.semibold, fontSize: 11.5, flexShrink: 1 },
  fine: { color: 'rgba(255,255,255,0.7)', fontFamily: fonts.mono, fontSize: 9.5, marginTop: 2 },
  reelCenter: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 22 },
  reelBig: {
    color: '#fff', fontFamily: fonts.heavy, fontSize: 34, lineHeight: 37, letterSpacing: -1.2, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 14, textShadowOffset: { width: 0, height: 2 },
  },
  reelSmall: {
    color: LIME, fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase',
    textAlign: 'center',
  },
  progress: { position: 'absolute', bottom: 14, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  progressDot: { width: 16, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  progressOn: { backgroundColor: LIME, width: 26 },
});
