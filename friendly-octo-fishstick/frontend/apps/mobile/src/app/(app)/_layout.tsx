import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { Dots } from '@/ui/kit';

/** Everything in this group needs a signed-in owner. */
export default function AppLayout() {
  const { user, checking } = useAuth();
  const { colors } = useTheme();

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <Dots />
      </View>
    );
  }
  // A signed-out visitor is sent to sign in rather than shown a blank screen.
  if (!user) return <Redirect href="/login" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="workspace" />
      <Stack.Screen name="history" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="settings" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
