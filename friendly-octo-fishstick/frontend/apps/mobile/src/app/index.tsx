/**
 * Landing — the website's hero, sized for a phone: the same eyebrow, the same
 * letter-by-letter headline reveal, and a small looping demo of the product.
 */

import { Feather } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeInUp, FadeOut, useAnimatedStyle, useSharedValue, withDelay,
  withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { fonts, useTheme } from '@/lib/theme';
import { Aurora } from '@/ui/Aurora';
import { GhostButton, PrimaryButton, Tag, Wordmark } from '@/ui/kit';

function RevealChar({ char, index }: { char: string; index: number }) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.2);
  useEffect(() => {
    opacity.set(withDelay(350 + index * 38, withTiming(1, { duration: 140 })));
  }, [index, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.Text style={[styles.headline, { color: colors.ink }, animated]}>{char}</Animated.Text>;
}

/** The headline lights up one letter at a time, as on the website. */
function Headline({ lines }: { lines: string[] }) {
  // Each word carries the index of its first letter, so the reveal runs
  // straight through both lines.
  const laidOut = lines.map((line, lineIndex) => {
    const before = lines.slice(0, lineIndex).join(' ').length + (lineIndex ? 1 : 0);
    const words = line.split(' ');
    return words.map((word, wordIndex) => ({
      word,
      start: before + words.slice(0, wordIndex).join(' ').length + (wordIndex ? 1 : 0),
    }));
  });
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={lines.join(' ')} style={{ alignItems: 'center' }}>
      {laidOut.map((words, lineIndex) => (
        <View key={lines[lineIndex]} style={styles.headlineLine}>
          {words.map(({ word, start }) => (
            <View key={start} style={{ flexDirection: 'row', marginRight: 9 }}>
              {word.split('').map((char, position) => (
                <RevealChar key={start + position} char={char} index={start + position} />
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function WaveBar({ index }: { index: number }) {
  const { colors } = useTheme();
  const height = useSharedValue(0.3);
  useEffect(() => {
    const peak = 0.45 + ((index * 37) % 55) / 100;
    height.set(withDelay(
      index * 70,
      withRepeat(
        withSequence(
          withTiming(peak, { duration: 420 + (index % 5) * 60, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.2, { duration: 420 + (index % 4) * 70, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    ));
  }, [height, index]);
  const animated = useAnimatedStyle(() => ({ height: 4 + height.value * 26 }));
  return <Animated.View style={[{ width: 3, borderRadius: 2, backgroundColor: colors.lime }, animated]} />;
}

const DEMO = [
  { said: '“Twenty percent off cold coffee this weekend, four to eight.”', made: ['Poster', 'Captions', 'Voice-over', 'AI video'] },
  { said: '“इस शनिवार सभी साड़ियों पर पचास रुपये की छूट।”', made: ['Poster', 'Hindi captions', 'Voice-over', 'AI video'] },
  { said: '“Haircut and beard trim for ninety-nine, students only.”', made: ['Poster', 'Captions', 'Voice-over', 'AI video'] },
];

/** A looping miniature of the workspace: you speak, the campaign appears. */
function Demo() {
  const { colors } = useTheme();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((current) => (current + 1) % DEMO.length), 4200);
    return () => clearInterval(timer);
  }, []);
  const item = DEMO[step];
  return (
    <Animated.View
      entering={FadeInUp.delay(900).springify().damping(16)}
      style={[styles.demo, { backgroundColor: colors.surface, borderColor: colors.line }]}
    >
      <View style={styles.demoHead}>
        <View style={[styles.demoMic, { backgroundColor: colors.lime }]}>
          <Feather name="mic" size={15} color={colors.limeInk} />
        </View>
        <View style={styles.demoWave}>
          {Array.from({ length: 22 }, (_, index) => <WaveBar key={index} index={index} />)}
        </View>
        <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1 }}>LIVE</Text>
      </View>
      <Animated.View key={step} entering={FadeIn.duration(420)} exiting={FadeOut.duration(180)} style={{ gap: 12 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 }}>{item.said}</Text>
        <View style={styles.demoChips}>
          {item.made.map((label, index) => (
            <Animated.View
              key={label}
              entering={FadeInDown.delay(500 + index * 130).springify().damping(15)}
              style={[styles.demoChip, { backgroundColor: colors.chip }]}
            >
              <Feather name="check" size={11} color={colors.chipInk} />
              <Text style={{ color: colors.chipInk, fontFamily: fonts.semibold, fontSize: 11.5 }}>{label}</Text>
            </Animated.View>
          ))}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

export default function Landing() {
  const { colors, name, toggle } = useTheme();
  const { user, checking } = useAuth();
  const router = useRouter();

  if (checking) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;
  if (user) return <Redirect href="/workspace" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Aurora />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.bar}>
          <Wordmark />
          <GhostButton icon={name === 'dark' ? 'sun' : 'moon'} onPress={toggle} />
        </View>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(600)} style={{ alignItems: 'center' }}>
            <Tag>Voice for business</Tag>
          </Animated.View>
          <Headline lines={['CREATE ONCE.', 'PUBLISH EVERYWHERE.']} />
          <Animated.Text entering={FadeInDown.delay(500).duration(600)} style={[styles.sub, { color: colors.muted }]}>
            Speak, and Svarah.AI turns it into polished content — ready to publish across every channel.
          </Animated.Text>

          <Demo />

          <Animated.View entering={FadeInDown.delay(1100).duration(600)} style={{ alignSelf: 'stretch', gap: 10 }}>
            <PrimaryButton label="Start creating free" icon="arrow-right" onPress={() => router.push('/signup')} />
            <PrimaryButton label="I already have an account" tone="outline" onPress={() => router.push('/login')} />
          </Animated.View>

          <Animated.View entering={FadeIn.delay(1400)} style={styles.checks}>
            {['Any Indian language', 'Facts locked', 'No typing'].map((label) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.tick, { backgroundColor: colors.lime }]} />
                <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 12 }}>{label}</Text>
              </View>
            ))}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  body: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 36, alignItems: 'center', gap: 22, maxWidth: 520, alignSelf: 'center', width: '100%' },
  headlineLine: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  headline: { fontFamily: fonts.heavy, fontSize: 38, lineHeight: 40, letterSpacing: -1.6 },
  sub: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 25, textAlign: 'center', maxWidth: 380 },
  demo: { alignSelf: 'stretch', borderWidth: 1, borderRadius: 22, padding: 16, gap: 14, minHeight: 170 },
  demoHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  demoMic: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  demoWave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, height: 34, overflow: 'hidden' },
  demoChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  demoChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  checks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16 },
  tick: { width: 6, height: 6, borderRadius: 3 },
});
