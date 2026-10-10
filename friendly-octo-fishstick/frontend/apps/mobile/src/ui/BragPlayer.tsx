/**
 * The brag video: the Brag Director's storyboard, drawn by the same template
 * the website uses and played live, with the voice-over on top.
 */

import { Feather } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { Storyboard } from '@/lib/brag/director';
import { buildBragHtml, VOICE_DELAY_MS } from '@/lib/brag/spec';
import type { Poster, VoiceOver } from '@/lib/campaigns';
import { compileTokens, type Facts } from '@/lib/facts';
import { fonts } from '@/lib/theme';

import { Springy } from './kit';

export function BragPlayer({
  board, facts, poster, voice,
}: {
  board: Storyboard;
  facts: Facts;
  poster: Poster | null;
  voice: VoiceOver | null;
}) {
  const web = useRef<WebView>(null);
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the page last reported, and for which page: a new page starts over at `loading`.
  const [report, setReport] = useState<{ html: string | null; state: 'ready' | 'playing' | 'failed' } | null>(null);

  // Without a voice-over the player simply has nothing to play.
  const player = useAudioPlayer(voice ? { uri: voice.url } : null);
  const status = useAudioPlayerStatus(player);
  const voiceSeconds = voice && status.duration > 0 ? Math.round(status.duration * 10) / 10 : null;

  const html = useMemo(() => {
    const tokens = compileTokens(facts);
    try {
      return buildBragHtml({
        board,
        tokens,
        businessName: facts.business.name || 'Our Shop',
        headline: poster?.headline || tokens.PRODUCT || '',
        art: poster?.artUrl ?? null,
        voiceSeconds,
      });
    } catch {
      return null; // the storyboard names a fact this offer no longer has
    }
  }, [board, facts, poster, voiceSeconds]);

  const state = report?.html === html ? report.state : 'loading';
  const setState = (next: 'ready' | 'playing' | 'failed') => setReport({ html, state: next });

  useEffect(() => () => {
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
  }, []);

  const stopVoice = () => {
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    voiceTimer.current = null;
    if (voice) player.pause();
  };

  const play = () => {
    web.current?.injectJavaScript('window.bragPlay(); true;');
    setState('playing');
    if (voice) {
      voiceTimer.current = setTimeout(() => {
        player.seekTo(0);
        player.play();
      }, VOICE_DELAY_MS);
    }
  };

  const stop = () => {
    web.current?.injectJavaScript('window.bragStop(); true;');
    stopVoice();
    setState('ready');
  };

  if (Platform.OS === 'web' || !html) {
    return (
      <View style={[styles.frame, styles.center]}>
        <Text style={styles.note}>
          {html ? 'The brag video plays in the Android and iOS app.' : 'The brag video could not be drawn for this offer.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.frame}>
      <WebView
        ref={web}
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        style={styles.web}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === 'ready') setState('ready');
            else if (message.type === 'ended') {
              stopVoice();
              setState('ready');
            } else if (message.type === 'error') setState('failed');
          } catch {
            // not one of ours
          }
        }}
        onError={() => setState('failed')}
      />
      {state === 'playing' ? (
        <Springy onPress={stop} accessibilityLabel="Stop the brag video" style={styles.stop}>
          <Feather name="square" size={13} color="#fff" />
        </Springy>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center, styles.veil]}>
          {state === 'loading' ? <ActivityIndicator color="#fff" /> : null}
          {state === 'ready' ? (
            <Springy onPress={play} accessibilityLabel="Play the brag video" style={styles.play}>
              <Feather name="play" size={26} color="#141513" style={{ marginLeft: 3 }} />
            </Springy>
          ) : null}
          {state === 'failed' ? <Text style={styles.note}>The brag video could not be drawn.</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 9 / 16, borderRadius: 18, overflow: 'hidden', backgroundColor: '#0c0d0b' },
  web: { flex: 1, backgroundColor: '#0c0d0b' },
  center: { alignItems: 'center', justifyContent: 'center' },
  veil: { backgroundColor: 'rgba(0,0,0,0.28)' },
  play: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#d8f878', alignItems: 'center', justifyContent: 'center' },
  stop: {
    position: 'absolute', right: 12, bottom: 12, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  note: { color: 'rgba(255,255,255,0.8)', fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, textAlign: 'center', padding: 24 },
});
