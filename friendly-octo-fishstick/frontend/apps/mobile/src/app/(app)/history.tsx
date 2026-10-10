/** Past offers, live from Firestore. Tapping one reopens it in the workspace. */

import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { watchCampaigns, type Campaign } from '@/lib/campaigns';
import { compileTokens } from '@/lib/facts';
import { fonts, useTheme } from '@/lib/theme';
import { Dots, GhostButton, Springy, Tag } from '@/ui/kit';

function statusOf(campaign: Campaign): { label: string; done: boolean } {
  if (campaign.poster && campaign.checks) return { label: 'Campaign ready', done: true };
  if (campaign.locked) return { label: 'Locked — say “yes” to finish', done: false };
  return { label: 'Waiting for your “yes”', done: false };
}

function titleOf(campaign: Campaign): string {
  const tokens = compileTokens(campaign.facts);
  const offer = [tokens.DISCOUNT ?? tokens.PRICE, tokens.PRODUCT]
    .filter(Boolean)
    .join(' · ');
  return offer || campaign.transcript.slice(0, 60) || 'Voice note';
}

export default function History() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return undefined;
    return watchCampaigns(user.uid, setCampaigns, (problem) => {
      setCampaigns([]);
      setError(problem.message);
    });
  }, [user]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.ink }]}>Past offers</Text>
        <GhostButton icon="x" onPress={() => router.back()} />
      </View>

      {campaigns === null ? (
        <View style={styles.center}><Dots /></View>
      ) : (
        <FlatList
          data={campaigns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="inbox" size={26} color={colors.muted} />
              <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14, textAlign: 'center', lineHeight: 21 }}>
                {error || 'Nothing yet. Your first offer will appear here.'}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const status = statusOf(item);
            return (
              <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).springify().damping(18)}>
                <Springy
                  accessibilityLabel={`Open ${titleOf(item)}`}
                  onPress={() => router.navigate({ pathname: '/workspace', params: { campaign: item.id } })}
                  style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line }]}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Tag>{new Date(item.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</Tag>
                    <Text style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: 15.5, lineHeight: 21 }} numberOfLines={2}>
                      {titleOf(item)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <View style={[styles.dot, { backgroundColor: status.done ? colors.good : colors.muted }]} />
                      <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 12 }}>{status.label}</Text>
                    </View>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.muted} />
                </Springy>
              </Animated.View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontFamily: fonts.bold, fontSize: 24, letterSpacing: -0.8 },
  list: { flexGrow: 1, padding: 16, gap: 10, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 16 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
