/**
 * The campaign bubble: progress while the package is being made, then the
 * poster, the reel, the brag video, the AI video, the voice-over and the captions.
 */

import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Share, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withSpring,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';

import type { Campaign } from '@/lib/campaigns';
import { STAGES, WAIT_NOTES, type Stages } from '@/lib/package';
import { fonts, useTheme } from '@/lib/theme';

import { BragPlayer } from './BragPlayer';
import { Bubble, GhostButton, PrimaryButton, Shimmer, Springy, Tag } from './kit';
import { VideoCard, VoicePlayer } from './Players';
import { PosterCard, PosterReel } from './PosterCard';

const CHANNEL_LABELS: Record<string, string> = {
  instagram: 'Instagram', whatsapp: 'WhatsApp', facebook: 'Facebook', x: 'X',
};

function ProgressBar({ fraction }: { fraction: number }) {
  const { colors } = useTheme();
  const width = useSharedValue(0.06);
  useEffect(() => {
    width.set(withSpring(Math.max(0.06, fraction), { damping: 20, stiffness: 120 }));
  }, [fraction, width]);
  const animated = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return (
    <View style={[styles.bar, { backgroundColor: colors.surface2 }]}>
      <Animated.View style={[styles.barFill, { backgroundColor: colors.lime }, animated]} />
    </View>
  );
}

function StageList({ stages }: { stages: Stages }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 9 }}>
      {STAGES.map((item) => {
        const state = stages[item.key];
        const status = state?.status ?? 'todo';
        const note =
          status === 'doing' ? item.doing
          : status === 'failed' ? state?.detail ?? ''
          : status === 'done' ? `${((state?.ms ?? 0) / 1000).toFixed(1)}s` : '';
        return (
          <Animated.View key={item.key} layout={LinearTransition} style={styles.stage}>
            <View
              style={[
                styles.stageMark,
                { borderColor: colors.lineStrong },
                status === 'done' ? { backgroundColor: colors.lime, borderColor: colors.lime } : null,
                status === 'failed' ? { backgroundColor: colors.warnBg, borderColor: colors.warnInk } : null,
              ]}
            >
              {status === 'done' ? <Feather name="check" size={11} color={colors.limeInk} /> : null}
              {status === 'failed' ? <Feather name="x" size={11} color={colors.warnInk} /> : null}
              {status === 'doing' ? <ActivityIndicator size="small" color={colors.lime} style={{ transform: [{ scale: 0.6 }] }} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: status === 'todo' ? colors.muted : colors.ink }}>
                {item.label}
              </Text>
              {note ? (
                <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 16, color: status === 'failed' ? colors.warnInk : colors.muted }}>
                  {note}
                </Text>
              ) : null}
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

function CaptionCard({ channel, text }: { channel: string; text: string }) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      style={[styles.caption, { backgroundColor: colors.surface2, borderColor: colors.line }]}
    >
      <View style={styles.captionHead}>
        <Tag>{channel}</Tag>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <GhostButton icon={copied ? 'check' : 'copy'} label={copied ? 'Copied' : undefined} onPress={copy} active={copied} />
          <GhostButton icon="share-2" onPress={() => Share.share({ message: text }).catch(() => {})} />
        </View>
      </View>
      <Text selectable style={{ color: colors.ink, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 }}>{text}</Text>
    </Animated.View>
  );
}

function Segmented({ value, options, onChange }: {
  value: string;
  options: { key: string; label: string }[];
  onChange: (key: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
      {options.map((option) => {
        const on = option.key === value;
        return (
          <Springy
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityLabel={option.label}
            style={[styles.segment, on ? { backgroundColor: colors.lime } : null]}
          >
            <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: on ? colors.limeInk : colors.muted }}>
              {option.label}
            </Text>
          </Springy>
        );
      })}
    </View>
  );
}

export function PackageView({
  campaign, stages, making, elapsed, needsReview,
}: {
  campaign: Campaign;
  stages: Stages;
  making: boolean;
  elapsed: number;
  needsReview: boolean;
}) {
  const { colors } = useTheme();
  const posterRef = useRef<View>(null);
  const [view, setView] = useState<'poster' | 'reel' | 'brag'>('poster');
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState('');

  const { plan, poster, voice, video, facts, brag } = campaign;
  const done = STAGES.filter((item) => ['done', 'failed'].includes(stages[item.key]?.status ?? '')).length;
  const anyFailed = STAGES.some((item) => stages[item.key]?.status === 'failed');
  const waitNote = WAIT_NOTES[Math.floor(elapsed / 4) % WAIT_NOTES.length];
  const videoActive = video?.status === 'queued' || video?.status === 'rendering';

  const captions: { key: string; channel: string; text: string }[] = [];
  for (const channel of ['instagram', 'whatsapp', 'facebook', 'x'] as const) {
    const text = plan?.copy[channel];
    if (text) captions.push({ key: channel, channel: CHANNEL_LABELS[channel], text });
  }
  for (const [language, channels] of Object.entries(plan?.localized ?? {})) {
    for (const channel of ['instagram', 'whatsapp'] as const) {
      const text = channels[channel];
      if (text) captions.push({ key: `${language}-${channel}`, channel: `${CHANNEL_LABELS[channel]} · ${language}`, text });
    }
  }

  const sharePoster = async () => {
    setShareNote('');
    setSharing(true);
    try {
      if (view !== 'poster') {
        setView('poster');
        await new Promise((resolve) => setTimeout(resolve, 400)); // let the poster mount
      }
      const uri = await captureRef(posterRef, { format: 'png', quality: 1 });
      if (Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your poster' });
      } else {
        await Share.share({ message: plan?.copy.instagram ?? poster?.headline ?? '' });
      }
    } catch (error) {
      setShareNote((error as Error)?.message || 'The poster could not be shared.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <Bubble style={{ maxWidth: '100%', alignSelf: 'stretch' }}>
      <View style={styles.head}>
        <Tag icon="zap">{making ? 'Making your campaign' : 'Your campaign'}</Tag>
        {making ? <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11 }}>{elapsed}s</Text> : null}
      </View>

      {making || anyFailed ? (
        <View style={{ gap: 12, marginBottom: 14 }}>
          {making ? <ProgressBar fraction={done / STAGES.length} /> : null}
          <StageList stages={stages} />
          {making ? (
            <Animated.Text
              key={waitNote}
              entering={FadeInDown.duration(380)}
              style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18 }}
            >
              {waitNote}
            </Animated.Text>
          ) : null}
        </View>
      ) : null}

      {plan?.angle && !making ? (
        <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18, marginBottom: 12 }}>
          {plan.angle}
        </Text>
      ) : null}

      {poster ? (
        <Animated.View entering={FadeInDown.springify().damping(18)} style={{ gap: 10 }}>
          <Segmented
            value={view}
            onChange={(key) => setView(key as 'poster' | 'reel' | 'brag')}
            options={[
              { key: 'poster', label: 'Poster' },
              { key: 'reel', label: 'Reel' },
              ...(brag ? [{ key: 'brag', label: 'Brag video' }] : []),
            ]}
          />
          {view === 'brag' && brag
            ? <BragPlayer board={brag} facts={facts} poster={poster} voice={voice} />
            : view === 'poster'
              ? <PosterCard ref={posterRef} poster={poster} facts={facts} />
              : <PosterReel poster={poster} facts={facts} playing={view === 'reel' || voicePlaying} />}
          {poster.usedFallback ? (
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 }}>
              The AI artwork was unavailable{poster.artError ? ` (${poster.artError})` : ''}, so this poster uses a plain background.
            </Text>
          ) : null}
        </Animated.View>
      ) : making ? (
        <Shimmer style={{ aspectRatio: 3 / 4 }} label={stages.poster?.status === 'failed' ? 'Not made' : 'Painting the artwork…'} />
      ) : null}

      {voice ? (
        <View style={{ marginTop: 12 }}>
          <VoicePlayer uri={voice.url} label={`Voice-over · ${voice.language}`} onPlayingChange={setVoicePlaying} />
        </View>
      ) : making && stages.voice?.status === 'doing' ? (
        <Shimmer style={{ height: 66, marginTop: 12 }} label="Recording the voice-over…" />
      ) : null}

      {video?.status === 'complete' && video.url ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          <Tag icon="film">AI video</Tag>
          <VideoCard uri={video.url} />
        </View>
      ) : videoActive ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          <Tag icon="film">AI video</Tag>
          <Shimmer style={{ height: 120 }} label={video?.status === 'rendering' ? 'Rendering your video…' : 'Waiting in the render queue…'} />
        </View>
      ) : video?.status === 'failed' ? (
        <Text style={{ color: colors.warnInk, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, marginTop: 12 }}>
          The AI video could not be made: {video.error}
        </Text>
      ) : null}

      {captions.length ? (
        <View style={{ gap: 10, marginTop: 14 }}>
          {captions.map((item) => <CaptionCard key={item.key} channel={item.channel} text={item.text} />)}
        </View>
      ) : making ? (
        <View style={{ gap: 10, marginTop: 14 }}>
          <Shimmer style={{ height: 78 }} />
          <Shimmer style={{ height: 78 }} />
        </View>
      ) : null}

      {poster && !making ? (
        <View style={{ marginTop: 16, gap: 8 }}>
          <PrimaryButton label="Share poster" icon="share" onPress={sharePoster} loading={sharing} tone="primary" />
          {shareNote ? <Text style={{ color: colors.warnInk, fontFamily: fonts.regular, fontSize: 12 }}>{shareNote}</Text> : null}
        </View>
      ) : null}

      {making || !poster ? null : needsReview ? (
        <View style={{ marginTop: 12, gap: 4 }}>
          <Text style={{ color: colors.warnInk, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18 }}>
            A post contains a number that is not in your offer:
          </Text>
          {(campaign.checks ?? []).filter((item) => !item.ok).map((item) => (
            <Text key={item.channel} style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 }}>
              {item.channel.replace(/_/g, ' ')}: {item.stray.join(', ')}
            </Text>
          ))}
        </View>
      ) : campaign.checks ? (
        <View style={styles.good}>
          <Feather name="check" size={13} color={colors.good} />
          <Text style={{ color: colors.good, fontFamily: fonts.medium, fontSize: 12.5 }}>
            {campaign.reviewed ? 'Reviewed and accepted by you.' : 'Every number matches your offer.'}
          </Text>
        </View>
      ) : null}
    </Bubble>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bar: { height: 5, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  stage: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stageMark: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  caption: { borderWidth: 1, borderRadius: 14, padding: 12 },
  captionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  segmented: { flexDirection: 'row', alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, padding: 3, gap: 2 },
  segment: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, minHeight: 32, justifyContent: 'center' },
  good: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
});
