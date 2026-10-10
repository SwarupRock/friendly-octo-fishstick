/** Account: the shop details printed on posters, the voice, the theme, sign out. */

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { initials, useAuth } from '@/lib/auth';
import { config } from '@/lib/config';
import { errorMessage } from '@/lib/http';
import { TTS_SPEAKERS } from '@/lib/providers/sarvam';
import { fonts, useTheme } from '@/lib/theme';
import { Field, GhostButton, PrimaryButton, Springy, Tag } from '@/ui/kit';

function Section({ title, children, delay }: { title: string; children: React.ReactNode; delay: number }) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify().damping(18)}
      style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.line }]}
    >
      <Tag>{title}</Tag>
      {children}
    </Animated.View>
  );
}

export default function Settings() {
  const { colors, name, toggle } = useTheme();
  const { user, profile, updateProfile, signOut } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [businessName, setBusinessName] = useState(profile?.businessName ?? '');
  const [businessLocation, setBusinessLocation] = useState(profile?.businessLocation ?? '');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const speaker = profile?.speaker ?? TTS_SPEAKERS[0];
  const providers = [
    { label: 'Sarvam — speech', on: Boolean(config.sarvam.key) },
    { label: 'Agnes — facts, copy, artwork', on: Boolean(config.agnes.key) },
    { label: 'Magic Hour — AI video', on: config.magicHour.keys.length > 0 },
    { label: 'Firebase Storage — saved media', on: Boolean(config.firebase.storageBucket) },
  ];

  const save = async () => {
    setError('');
    setNote('');
    setSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        businessName: businessName.trim(),
        businessLocation: businessLocation.trim(),
      });
      setNote('Saved. New offers will use these details.');
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.ink }]}>Account</Text>
        <GhostButton icon="x" onPress={() => router.back()} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.who}>
            <View style={[styles.avatar, { backgroundColor: colors.lime }]}>
              <Text style={{ color: colors.limeInk, fontFamily: fonts.heavy, fontSize: 20 }}>
                {initials(profile?.displayName ?? user?.displayName, user?.email)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: 17 }} numberOfLines={1}>
                {profile?.displayName || 'Your account'}
              </Text>
              <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }} numberOfLines={1}>{user?.email ?? user?.phoneNumber}</Text>
            </View>
          </Animated.View>

          <Section title="Your shop" delay={60}>
            <View style={{ gap: 14 }}>
              <Field label="Your name" icon="user" value={displayName} onChangeText={setDisplayName} placeholder="Asha Sharma" />
              <Field label="Shop or business name" icon="shopping-bag" value={businessName} onChangeText={setBusinessName} placeholder="Shown on every poster" />
              <Field label="Area or city" icon="map-pin" value={businessLocation} onChangeText={setBusinessLocation} placeholder="Used when an offer names no place" />
              {error ? <Text style={{ color: colors.warnInk, fontFamily: fonts.medium, fontSize: 13 }}>{error}</Text> : null}
              {note ? <Text style={{ color: colors.good, fontFamily: fonts.medium, fontSize: 13 }}>{note}</Text> : null}
              <PrimaryButton label="Save" onPress={save} loading={saving} />
            </View>
          </Section>

          <Section title="Voice-over voice" delay={120}>
            <View style={styles.chips}>
              {TTS_SPEAKERS.map((item) => {
                const on = item === speaker;
                return (
                  <Springy
                    key={item}
                    accessibilityLabel={`Use the voice ${item}`}
                    onPress={() => updateProfile({ speaker: item }).catch(() => {})}
                    style={[styles.chip, { backgroundColor: on ? colors.lime : colors.surface2, borderColor: on ? colors.lime : colors.line }]}
                  >
                    <Text style={{ color: on ? colors.limeInk : colors.muted, fontFamily: fonts.semibold, fontSize: 13, textTransform: 'capitalize' }}>
                      {item}
                    </Text>
                  </Springy>
                );
              })}
            </View>
          </Section>

          <Section title="Appearance" delay={180}>
            <View style={styles.rowBetween}>
              <Text style={{ color: colors.ink, fontFamily: fonts.semibold, fontSize: 14.5 }}>
                {name === 'dark' ? 'Dark' : 'Light'} theme
              </Text>
              <GhostButton icon={name === 'dark' ? 'sun' : 'moon'} label={name === 'dark' ? 'Switch to light' : 'Switch to dark'} onPress={toggle} />
            </View>
          </Section>

          <Section title="Connected services" delay={240}>
            <View style={{ gap: 9 }}>
              {providers.map((item) => (
                <View key={item.label} style={styles.rowBetween}>
                  <Text style={{ color: colors.ink, fontFamily: fonts.medium, fontSize: 13.5, flex: 1 }}>{item.label}</Text>
                  <Text style={{ color: item.on ? colors.good : colors.warnInk, fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 0.8 }}>
                    {item.on ? 'READY' : 'NOT SET'}
                  </Text>
                </View>
              ))}
            </View>
          </Section>

          <Animated.View entering={FadeInDown.delay(300).springify().damping(18)}>
            <PrimaryButton label="Sign out" icon="log-out" tone="outline" onPress={() => signOut().catch(() => {})} />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontFamily: fonts.bold, fontSize: 24, letterSpacing: -0.8 },
  body: { padding: 16, gap: 14, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4, paddingBottom: 4 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  section: { borderWidth: 1, borderRadius: 20, padding: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, minHeight: 38, justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
