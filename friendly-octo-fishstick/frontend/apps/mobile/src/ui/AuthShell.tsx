/** The glass card on a lime glow that the website's login and signup share. */

import { useRouter } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { firebaseConfigured } from '@/lib/config';
import { fonts, useTheme } from '@/lib/theme';

import { Aurora } from './Aurora';
import { GhostButton, Wordmark } from './kit';

export function AuthShell({
  title, subtitle, children, footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const { colors, name, toggle } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Aurora />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.bar}>
          <GhostButton icon="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <GhostButton icon={name === 'dark' ? 'sun' : 'moon'} onPress={toggle} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              entering={FadeInDown.springify().damping(18).stiffness(160)}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.lineStrong }]}
            >
              <View style={{ alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Wordmark size={20} />
                <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
              </View>
              {firebaseConfigured ? null : (
                <View style={[styles.notice, { backgroundColor: colors.warnBg, borderColor: colors.line }]}>
                  <Text style={{ color: colors.warnInk, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18 }}>
                    Firebase is not connected yet. Add the EXPO_PUBLIC_FIREBASE_* values to apps/mobile/.env and
                    restart the app.
                  </Text>
                </View>
              )}
              {children}
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(180).duration(500)} style={{ alignItems: 'center' }}>
              {footer}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 18, maxWidth: 480, alignSelf: 'center', width: '100%' },
  card: { borderWidth: 1, borderRadius: 24, padding: 22, gap: 16 },
  title: { fontFamily: fonts.bold, fontSize: 24, letterSpacing: -0.8, textAlign: 'center' },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  notice: { borderWidth: 1, borderRadius: 14, padding: 12 },
});
