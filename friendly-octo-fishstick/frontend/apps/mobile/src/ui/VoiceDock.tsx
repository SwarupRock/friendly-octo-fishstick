/**
 * The microphone — the only control the workspace needs.
 *
 *   - press and hold  → records while held; release sends
 *   - quick tap       → starts recording; tap again to send
 *   - Cancel          → throws the clip away
 *
 * While recording, the rings breathe with the microphone level and a rolling
 * waveform and clock show that it is listening.
 */

import { Feather } from '@expo/vector-icons';
import {
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';

import { fonts, useTheme } from '@/lib/theme';

export type Clip = { uri: string; mime: string; durationMs: number };

const HOLD_AFTER_MS = 320; // a press longer than this is "hold to talk"
const MIN_CLIP_MS = 500;
const MAX_CLIP_MS = 60_000; // Sarvam's synchronous STT is meant for short clips
const BARS = 26;

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

function haptic(style: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS !== 'web') Haptics.impactAsync(style).catch(() => {});
}

export function VoiceDock({
  hint, disabled, onClip, onRecordingChange,
}: {
  hint?: string;
  disabled?: boolean;
  onClip: (clip: Clip) => void;
  onRecordingChange?: (recording: boolean) => void;
}) {
  const { colors } = useTheme();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 90);

  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [bars, setBars] = useState<number[]>(() => Array(BARS).fill(0.08));
  const [error, setError] = useState('');
  const [tapToSend, setTapToSend] = useState(false);

  const startedAt = useRef(0);
  const pressedAt = useRef(0);
  const tapMode = useRef(false);
  const busy = useRef(false);
  const live = useRef(false); // the recorder is actually running

  const level = useSharedValue(0);
  const breathe = useSharedValue(0);
  const press = useSharedValue(1);

  useEffect(() => {
    breathe.set(withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [breathe]);

  // Metering (dBFS, roughly −60…0) drives the rings and the waveform.
  const metering = useRef<number | undefined>(undefined);
  useEffect(() => {
    metering.current = state.metering;
  }, [state.metering]);

  useEffect(() => {
    if (!recording) return undefined;
    const timer = setInterval(() => {
      const db = metering.current;
      const t = Date.now() / 1000;
      const measured = typeof db === 'number' && Number.isFinite(db)
        ? Math.min(1, Math.max(0, (db + 55) / 50))
        // No meter on this platform: a gentle idle motion so it still looks alive.
        : 0.25 + 0.2 * Math.abs(Math.sin(t * 5.3)) * Math.abs(Math.sin(t * 1.7));
      level.set(withTiming(measured, { duration: 90 }));
      setBars((previous) => [...previous.slice(1), Math.max(0.08, measured)]);
      setElapsed(Date.now() - startedAt.current);
    }, 90);
    return () => clearInterval(timer);
  }, [recording, level]);

  const finish = useCallback(
    async (keep: boolean) => {
      if (busy.current || !live.current) return;
      busy.current = true;
      live.current = false;
      const durationMs = Date.now() - startedAt.current;
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      } catch {
        // A recorder that never started has nothing to stop.
      }
      setRecording(false);
      onRecordingChange?.(false);
      level.set(withTiming(0, { duration: 200 }));
      setBars(Array(BARS).fill(0.08));
      busy.current = false;
      const uri = recorder.uri;
      if (!keep) return;
      haptic(Haptics.ImpactFeedbackStyle.Light);
      if (!uri || durationMs < MIN_CLIP_MS) {
        setError('That was too short. Hold the mic and speak.');
        return;
      }
      onClip({ uri, mime: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4', durationMs });
    },
    [recorder, onClip, onRecordingChange, level],
  );

  const start = useCallback(async () => {
    if (busy.current || starting) return;
    setError('');
    setStarting(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Svarah needs the microphone. Allow it in Settings, then try again.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      live.current = true;
      setElapsed(0);
      setRecording(true);
      onRecordingChange?.(true);
      haptic(Haptics.ImpactFeedbackStyle.Medium);
    } catch (problem) {
      setError((problem as Error)?.message || 'The microphone could not be started.');
    } finally {
      setStarting(false);
    }
  }, [recorder, starting, onRecordingChange]);

  // A runaway recording is sent, not lost.
  useEffect(() => {
    if (recording && elapsed >= MAX_CLIP_MS) finish(true);
  }, [recording, elapsed, finish]);

  const onPressIn = () => {
    press.set(withSpring(0.93, { damping: 16, stiffness: 300 }));
    pressedAt.current = Date.now();
    if (live.current) {
      if (tapMode.current) finish(true);
      return;
    }
    tapMode.current = false;
    setTapToSend(false);
    start();
  };

  const onPressOut = () => {
    press.set(withSpring(1, { damping: 12, stiffness: 240 }));
    const held = Date.now() - pressedAt.current;
    if (live.current && held >= HOLD_AFTER_MS && !tapMode.current) {
      finish(true); // hold-to-talk: letting go sends
    } else {
      // A quick tap, or a release while the mic was still starting (e.g. the
      // permission prompt): keep listening until the next tap.
      tapMode.current = true;
      setTapToSend(true);
    }
  };

  const ringOuter = useAnimatedStyle(() => ({
    opacity: recording ? 0.14 + level.value * 0.2 : 0.07 + breathe.value * 0.06,
    transform: [{ scale: recording ? 1.25 + level.value * 0.55 : 1.18 + breathe.value * 0.1 }],
  }));
  const ringInner = useAnimatedStyle(() => ({
    opacity: recording ? 0.22 + level.value * 0.25 : 0.12 + breathe.value * 0.08,
    transform: [{ scale: recording ? 1.1 + level.value * 0.28 : 1.07 + breathe.value * 0.05 }],
  }));
  const button = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  const note = error || (recording ? (tapToSend ? 'Tap to send' : 'Release to send') : hint);

  return (
    <View style={styles.root}>
      {recording ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.meter}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel recording"
            hitSlop={10}
            onPress={() => finish(false)}
            style={[styles.cancel, { borderColor: colors.line, backgroundColor: colors.surface }]}
          >
            <Feather name="x" size={13} color={colors.muted} />
            <Text style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 }}>Cancel</Text>
          </Pressable>
          <View style={styles.wave}>
            {bars.map((value, index) => (
              <View
                key={index}
                style={{
                  width: 3, borderRadius: 2, backgroundColor: colors.lime,
                  height: 4 + value * 26, opacity: 0.3 + (index / BARS) * 0.7,
                }}
              />
            ))}
          </View>
          <Text style={{ color: colors.ink, fontFamily: fonts.mono, fontSize: 13, minWidth: 38, textAlign: 'right' }}>
            {clock(elapsed)}
          </Text>
        </Animated.View>
      ) : null}

      {note ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.note, { color: error ? colors.warnInk : colors.muted }]}
        >
          {note}
        </Text>
      ) : null}

      <View style={styles.micWrap}>
        <Animated.View style={[styles.ring, { backgroundColor: colors.lime }, ringOuter]} />
        <Animated.View style={[styles.ring, { backgroundColor: colors.lime }, ringInner]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Stop and send' : 'Hold to speak, or tap to start'}
          accessibilityState={{ disabled: Boolean(disabled) }}
          disabled={disabled && !recording}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        >
          <Animated.View
            style={[
              styles.mic,
              { backgroundColor: disabled && !recording ? colors.surface2 : colors.lime },
              button,
            ]}
          >
            <Feather
              name={recording ? 'square' : 'mic'}
              size={recording ? 22 : 28}
              color={disabled && !recording ? colors.muted : colors.limeInk}
            />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const MIC = 76;

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 10, paddingTop: 10 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch', paddingHorizontal: 20 },
  cancel: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 11, paddingVertical: 7, minHeight: 32,
  },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, height: 34, overflow: 'hidden' },
  note: { fontFamily: fonts.medium, fontSize: 12.5, textAlign: 'center', paddingHorizontal: 28, lineHeight: 18 },
  micWrap: { width: MIC * 1.9, height: MIC * 1.5, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: MIC, height: MIC, borderRadius: MIC / 2 },
  mic: { width: MIC, height: MIC, borderRadius: MIC / 2, alignItems: 'center', justifyContent: 'center' },
});
