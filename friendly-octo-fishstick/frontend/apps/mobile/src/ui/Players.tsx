/** Voice-over and AI-video playback. */

import { Feather } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, useTheme } from '@/lib/theme';

import { Springy } from './kit';

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/**
 * Play/pause with a progress bar. `onPlayingChange` lets the reel move in
 * time with the voice.
 */
export function VoicePlayer({
  uri, label, onPlayingChange,
}: {
  uri: string;
  label: string;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const { colors } = useTheme();
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  React.useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  const toggle = () => {
    if (playing) {
      player.pause();
      return;
    }
    // A finished clip starts again from the top.
    if (duration > 0 && status.currentTime >= duration - 0.15) player.seekTo(0);
    player.play();
  };

  return (
    <View style={[styles.voice, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
      <Springy
        onPress={toggle}
        accessibilityLabel={playing ? 'Pause voice-over' : 'Play voice-over'}
        style={[styles.play, { backgroundColor: colors.lime }]}
      >
        <Feather name={playing ? 'pause' : 'play'} size={17} color={colors.limeInk} style={playing ? null : { marginLeft: 2 }} />
      </Springy>
      <View style={{ flex: 1, gap: 7 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.semibold, fontSize: 13 }} numberOfLines={1}>{label}</Text>
        <View style={[styles.track, { backgroundColor: colors.lineStrong }]}>
          <View style={[styles.fill, { backgroundColor: colors.lime, width: `${progress * 100}%` }]} />
        </View>
      </View>
      <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11 }}>
        {clock(status.currentTime)} / {clock(duration)}
      </Text>
    </View>
  );
}

export function VideoCard({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });
  return (
    <View style={styles.video}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls />
    </View>
  );
}

const styles = StyleSheet.create({
  voice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
  play: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  video: { width: '100%', aspectRatio: 9 / 16, borderRadius: 18, overflow: 'hidden', backgroundColor: '#0c0d0b' },
});
