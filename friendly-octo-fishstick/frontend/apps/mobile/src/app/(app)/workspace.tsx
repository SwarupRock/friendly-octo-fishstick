/**
 * The shopkeeper's workspace: a microphone and a thread. Voice only.
 *
 * 1. Hold the mic and say the offer.
 * 2. The facts come back with their validation. Hold the mic again and say
 *    "yes", or say what to change ("make it 25 percent").
 * 3. On "yes" the whole package is made without another touch: captions, a
 *    designed poster, a voice-over and an AI video.
 *
 * Every offer is a Firestore document, so it is there on the next launch and
 * a package interrupted by a closed app can be resumed by voice.
 */

import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { initials, useAuth } from '@/lib/auth';
import {
  createCampaign, getCampaign, updateCampaign, type Campaign, type CampaignDraft,
} from '@/lib/campaigns';
import {
  emptyFacts, offerRows, summarize, type Finding, type Validation,
} from '@/lib/facts';
import { errorMessage } from '@/lib/http';
import { makePackage, PackageStopped, pollVideo, type StageKey, type Stages, type StageState } from '@/lib/package';
import { extractFacts, interpretTurn, validateFacts } from '@/lib/pipeline';
import { transcribe } from '@/lib/providers/sarvam';
import { fonts, useTheme } from '@/lib/theme';
import { Bubble, BubbleText, Dots, GhostButton, Springy, Tag, Wordmark } from '@/ui/kit';
import { PackageView } from '@/ui/PackageView';
import { VoiceDock, type Clip } from '@/ui/VoiceDock';

const VIDEO_POLL_MS = 6000;

/** The findings worth showing in the thread: rule errors, then warnings. */
function topFindings(validation: Validation | null): Finding[] {
  if (!validation) return [];
  const rank = { error: 0, warning: 1, info: 2 };
  return [...validation.deterministic.findings, ...validation.semantic.findings]
    .filter((item) => item.severity !== 'info' && item.code !== 'missing_required')
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .slice(0, 3);
}

/** One line for the validator's verdict on the drafted facts. */
function verdictOf(validation: Validation | null): { good: boolean; text: string } | null {
  if (!validation) return null;
  if (validation.status === 'failed') return { good: false, text: 'Something here does not add up — see below.' };
  if (validation.semantic.status === 'unavailable') {
    return { good: false, text: 'Rules checked. The double-check against your words could not run, so listen carefully.' };
  }
  return { good: true, text: 'Checked against what you said.' };
}

export default function Workspace() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ campaign?: string }>();
  const uid = user!.uid;
  const speaker = profile?.speaker;
  const businessName = profile?.businessName;
  const businessLocation = profile?.businessLocation;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [stages, setStages] = useState<Stages>({});
  const [making, setMaking] = useState<{ startedAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [recording, setRecording] = useState(false);

  const thread = useRef<ScrollView>(null);
  // The newest campaign, for callbacks that outlive the render they were made in.
  const campaignRef = useRef<Campaign | null>(null);
  useEffect(() => {
    campaignRef.current = campaign;
  }, [campaign]);

  const patchCampaign = useCallback((patch: Partial<CampaignDraft>) => {
    setCampaign((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const resetThread = useCallback(() => {
    setStages({});
    setMaking(null);
    setError('');
    setBusy('');
  }, []);

  const startNew = useCallback(() => {
    resetThread();
    setCampaign(null);
    router.setParams({ campaign: undefined });
  }, [resetThread, router]);

  // Opening a past offer from History.
  useEffect(() => {
    const id = params.campaign;
    if (!id || campaignRef.current?.id === id) return;
    let cancelled = false;
    resetThread();
    setBusy('Opening your offer…');
    getCampaign(uid, id)
      .then((found) => {
        if (cancelled) return;
        if (found) setCampaign(found);
        else setError('That offer could not be found.');
      })
      .catch((problem) => !cancelled && setError(errorMessage(problem)))
      .finally(() => !cancelled && setBusy(''));
    return () => {
      cancelled = true;
    };
  }, [params.campaign, uid, resetThread]);

  // ── derived state ─────────────────────────────────────────────────────
  const facts = campaign?.facts;
  const rows = useMemo(() => summarize(facts), [facts]);
  const understood = useMemo(() => offerRows(facts).length > 0, [facts]);
  const findings = useMemo(() => topFindings(campaign?.validation ?? null), [campaign?.validation]);
  const verdict = useMemo(() => verdictOf(campaign?.validation ?? null), [campaign?.validation]);
  const locked = Boolean(campaign?.locked);
  const poster = campaign?.poster ?? null;
  const video = campaign?.video ?? null;
  const videoActive = video?.status === 'queued' || video?.status === 'rendering';
  const needsReview = Boolean(campaign?.checks?.some((item) => !item.ok)) && !campaign?.reviewed;
  const reviewing = Boolean(campaign) && understood && !locked;
  const awaitingAccept = Boolean(poster) && needsReview;
  // A locked offer whose package was interrupted can be resumed by voice.
  const resumable = locked && understood && (!poster || !campaign?.checks);
  const ready = Boolean(poster) && !needsReview && !resumable && !busy && !making;
  const showPackage = Boolean(making) || Boolean(poster) || Boolean(campaign?.plan);
  const elapsed = making ? Math.max(0, Math.round((now - making.startedAt) / 1000)) : 0;

  // Read through a ref so the recorder callback always sees the current stage.
  const stageRef = useRef({ reviewing, awaitingAccept, resumable });
  useEffect(() => {
    stageRef.current = { reviewing, awaitingAccept, resumable };
  }, [reviewing, awaitingAccept, resumable]);

  // Keep the newest bubble in view.
  useEffect(() => {
    const timer = setTimeout(() => thread.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(timer);
  }, [busy, stages, campaign, error, recording]);

  // A clock for the waiting view (elapsed time, rotating notes).
  useEffect(() => {
    if (!making) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [making]);

  // ── AI video: polling is what advances a render to "done" ─────────────
  const campaignId = campaign?.id;
  useEffect(() => {
    if (!campaignId || !videoActive) return undefined;
    let polling = false;
    const timer = setInterval(async () => {
      const current = campaignRef.current;
      if (polling || !current || current.id !== campaignId) return;
      polling = true;
      try {
        const next = await pollVideo(uid, current);
        if (next && campaignRef.current?.id === campaignId) patchCampaign({ video: next });
      } catch {
        // A failed poll is retried on the next tick.
      } finally {
        polling = false;
      }
    }, VIDEO_POLL_MS);
    return () => clearInterval(timer);
  }, [campaignId, videoActive, uid, patchCampaign]);

  // ── the package: runs by itself once the facts are confirmed ──────────
  const runPackage = useCallback(
    async (target: Campaign) => {
      setError('');
      setStages({});
      setMaking({ startedAt: Date.now() });
      setNow(Date.now());
      try {
        await makePackage(target, {
          uid,
          speaker,
          onChange: patchCampaign,
          onStage: (key: StageKey, state: StageState) => setStages((previous) => ({ ...previous, [key]: state })),
        });
      } catch (problem) {
        setError(problem instanceof PackageStopped ? problem.message : errorMessage(problem));
      } finally {
        setMaking(null);
      }
    },
    [uid, speaker, patchCampaign],
  );

  // ── a new offer ───────────────────────────────────────────────────────
  const captureOffer = useCallback(
    async (clip: Clip) => {
      resetThread();
      setCampaign(null);
      setBusy('Transcribing what you said…');
      const heard = await transcribe(clip.uri, clip.mime);
      if (!heard.text) {
        setError('I did not catch anything. Hold the mic and say your offer.');
        return;
      }
      setBusy('Reading your offer…');
      let draftFacts = emptyFacts();
      let extractionError: string | null = null;
      try {
        draftFacts = await extractFacts(heard.text, businessName);
      } catch (problem) {
        extractionError = errorMessage(problem);
        draftFacts.business.name = businessName || null;
      }
      if (!draftFacts.business.location && businessLocation) {
        draftFacts.business.location = businessLocation;
      }
      const validation = offerRows(draftFacts).length ? await validateFacts(draftFacts, heard.text) : null;
      const created = await createCampaign(uid, {
        createdAt: Date.now(), updatedAt: Date.now(), transcript: heard.text, languageCode: heard.languageCode,
        extractionError, facts: draftFacts, validation, turns: [], locked: false, factHash: null, lockedAt: null,
        plan: null, poster: null, voice: null, video: null, checks: null, reviewed: false,
      });
      setCampaign(created);
    },
    [resetThread, uid, businessName, businessLocation],
  );

  // ── a spoken reply to what is on screen ───────────────────────────────
  const answer = useCallback(
    async (clip: Clip, current: Campaign) => {
      setBusy('Listening to your answer…');
      let heard = '';
      try {
        heard = (await transcribe(clip.uri, clip.mime)).text;
      } catch (problem) {
        setError(`I could not hear that: ${errorMessage(problem)}`);
        return;
      }
      const turn = await interpretTurn(heard, current.facts);
      const turns = [...current.turns, { heard: turn.heard, reply: turn.reply, intent: turn.intent, changed: turn.changed }];
      patchCampaign({ turns });

      if (turn.intent === 'restart') {
        await updateCampaign(uid, current.id, { turns });
        startNew();
        return;
      }
      if (turn.intent === 'correct' && turn.facts) {
        setBusy('Checking the change…');
        // The correction is part of what the owner said, so the double-check
        // compares the facts against the offer *and* the correction.
        const spoken = `${current.transcript}\nSpoken correction by the owner: ${heard}`;
        const validation = await validateFacts(turn.facts, spoken);
        // Changing a locked offer makes everything built from it stale.
        const patch: Partial<CampaignDraft> = {
          turns, facts: turn.facts, validation, locked: false, factHash: null, lockedAt: null,
          plan: null, poster: null, voice: null, video: null, checks: null, reviewed: false,
        };
        patchCampaign(patch);
        setStages({});
        await updateCampaign(uid, current.id, patch);
        return;
      }
      await updateCampaign(uid, current.id, { turns });
      if (turn.intent !== 'confirm') return;

      if (stageRef.current.awaitingAccept) {
        patchCampaign({ reviewed: true });
        await updateCampaign(uid, current.id, { reviewed: true });
        return;
      }
      setBusy('');
      await runPackage({ ...current, turns });
    },
    [patchCampaign, runPackage, startNew, uid],
  );

  const onClip = useCallback(
    async (clip: Clip) => {
      setError('');
      const current = campaignRef.current;
      const stage = stageRef.current;
      try {
        if (current && (stage.reviewing || stage.awaitingAccept || stage.resumable)) await answer(clip, current);
        else await captureOffer(clip);
      } catch (problem) {
        setError(errorMessage(problem));
      } finally {
        setBusy('');
      }
    },
    [answer, captureOffer],
  );

  const hint = (() => {
    if (busy || making) return '';
    if (awaitingAccept) return 'Look at the posts. Hold the mic and say “yes” if they are right.';
    if (resumable) return 'Hold the mic and say “yes” to make your posts.';
    if (reviewing) return 'Hold the mic: say “yes” if this is right, or say what to change.';
    if (ready) return 'Hold the mic to start a new offer.';
    return campaign ? 'Hold the mic and say your offer again.' : 'Hold the mic and say your offer.';
  })();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top', 'bottom']}>
      <View style={[styles.head, { borderBottomColor: colors.line }]}>
        <Wordmark size={19} />
        <View style={{ flex: 1 }} />
        <GhostButton icon="plus" label="New" onPress={startNew} disabled={Boolean(making)} />
        <GhostButton icon="clock" onPress={() => router.push('/history')} />
        <Springy
          accessibilityLabel="Account and settings"
          onPress={() => router.push('/settings')}
          style={[styles.avatar, { backgroundColor: colors.chip }]}
        >
          <Text style={{ color: colors.chipInk, fontFamily: fonts.bold, fontSize: 12 }}>
            {initials(profile?.displayName ?? user?.displayName, user?.email)}
          </Text>
        </Springy>
      </View>

      <ScrollView
        ref={thread}
        style={{ flex: 1 }}
        contentContainerStyle={styles.thread}
        showsVerticalScrollIndicator={false}
      >
        {!campaign && !busy && !recording && !error ? (
          <Animated.View entering={FadeIn.duration(500)} style={styles.hello}>
            <Animated.View
              entering={FadeInDown.springify().damping(12)}
              style={[styles.helloMark, { backgroundColor: colors.lime }]}
            >
              <Feather name="activity" size={26} color={colors.limeInk} />
            </Animated.View>
            <Text style={[styles.helloTitle, { color: colors.ink }]}>What are you offering today?</Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 22, textAlign: 'center' }}>
              Hold the microphone and say it in your own words — in English, Hindi, Kannada, Tamil or Telugu.
            </Text>
          </Animated.View>
        ) : null}

        {campaign?.transcript ? (
          <Bubble kind="user">
            <Tag color="rgba(241,242,236,0.6)">You said</Tag>
            <BubbleText kind="user">{campaign.transcript}</BubbleText>
          </Bubble>
        ) : null}

        {campaign && !understood && !busy ? (
          <Bubble>
            <Tag icon="zap">I need a little more</Tag>
            <BubbleText>
              {campaign.extractionError || 'I could not pick out a product, price or discount from that.'} Nothing was
              guessed. Hold the mic and say the offer again.
            </BubbleText>
          </Bubble>
        ) : null}

        {campaign && understood ? (
          <Bubble>
            <Tag icon="zap">Here is what I understood</Tag>
            <View style={{ gap: 8 }}>
              {rows.map((row) => (
                <Animated.View key={row.label + row.value} layout={LinearTransition} style={styles.fact}>
                  <Text style={[styles.factLabel, { color: colors.muted }]}>{row.label}</Text>
                  <Text style={[styles.factValue, { color: colors.ink }]}>{row.value}</Text>
                </Animated.View>
              ))}
            </View>
            {verdict ? (
              <View style={styles.note}>
                {verdict.good && !findings.length ? <Feather name="check" size={13} color={colors.good} /> : null}
                <Text style={[styles.noteText, { color: verdict.good && !findings.length ? colors.good : colors.muted }]}>
                  {verdict.text}
                </Text>
              </View>
            ) : null}
            {findings.map((item) => (
              <Text
                key={`${item.field}-${item.code}-${item.message}`}
                style={[styles.finding, { color: item.severity === 'error' ? colors.warnInk : colors.muted, borderLeftColor: item.severity === 'error' ? colors.warnInk : colors.lineStrong }]}
              >
                {item.message}
              </Text>
            ))}
            {locked ? (
              <View style={styles.note}>
                <Feather name="lock" size={12} color={colors.good} />
                <Text style={[styles.noteText, { color: colors.good }]}>Confirmed and locked.</Text>
              </View>
            ) : null}
          </Bubble>
        ) : null}

        {(campaign?.turns ?? []).map((turn, index) => (
          <React.Fragment key={index}>
            {turn.heard ? (
              <Bubble kind="user">
                <Tag color="rgba(241,242,236,0.6)">You said</Tag>
                <BubbleText kind="user">{turn.heard}</BubbleText>
              </Bubble>
            ) : null}
            {turn.intent !== 'confirm' && turn.reply ? (
              <Bubble kind={turn.intent === 'unclear' ? 'warn' : 'app'}>
                <BubbleText kind={turn.intent === 'unclear' ? 'warn' : 'app'}>
                  {turn.reply}{turn.intent === 'correct' ? ' Check the details above.' : ''}
                </BubbleText>
              </Bubble>
            ) : null}
          </React.Fragment>
        ))}

        {campaign && showPackage ? (
          <PackageView
            campaign={campaign}
            stages={stages}
            making={Boolean(making)}
            elapsed={elapsed}
            needsReview={needsReview}
          />
        ) : null}

        {recording ? (
          <Bubble kind="user">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.liveDot, { backgroundColor: colors.lime }]} />
              <BubbleText kind="user">Listening…</BubbleText>
            </View>
          </Bubble>
        ) : null}

        {busy ? (
          <Bubble>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Dots />
              <BubbleText>{busy}</BubbleText>
            </View>
          </Bubble>
        ) : null}

        {error ? (
          <Bubble kind="warn">
            <BubbleText kind="warn">{error}</BubbleText>
          </Bubble>
        ) : null}
      </ScrollView>

      <View style={[styles.dock, { borderTopColor: colors.line, backgroundColor: colors.paper }]}>
        <VoiceDock
          hint={hint}
          disabled={Boolean(busy) || Boolean(making)}
          onClip={onClip}
          onRecordingChange={setRecording}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  thread: { flexGrow: 1, padding: 16, paddingBottom: 28, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  hello: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 40 },
  helloMark: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  helloTitle: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 31, letterSpacing: -1, textAlign: 'center' },
  fact: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  factLabel: { width: 86, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', paddingTop: 4 },
  factValue: { flex: 1, fontFamily: fonts.semibold, fontSize: 14.5, lineHeight: 21 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  noteText: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18 },
  finding: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, borderLeftWidth: 2, paddingLeft: 9, marginTop: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  dock: { borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 6 },
});
