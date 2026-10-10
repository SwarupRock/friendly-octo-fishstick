/**
 * The package: everything made after the owner says "yes".
 *
 *   lock → plan → { captions, AI video, brag video, poster, voice-over } → check
 *
 * The five middle pieces only need the plan, so they run side by side. Each
 * finished piece is saved to Firestore straight away, which is also what lets
 * an interrupted package be resumed.
 */

import { direct } from './brag/director';
import { persistMedia, updateCampaign, type Campaign, type CampaignDraft } from './campaigns';
import { config } from './config';
import { compileTokens, factHash, lockBlockers, pathLabel } from './facts';
import { AppError, errorMessage } from './http';
import { buildArtPrompt, buildVideoPrompt, checkCopy, createPlan, type Plan } from './pipeline';
import { generateArt } from './providers/agnes';
import { createVideo, retrieveVideo } from './providers/magichour';
import { DEFAULT_SPEAKER, synthesize, TTS_LANGUAGES } from './providers/sarvam';

export const STAGES = [
  { key: 'lock', label: 'Locking your offer', doing: 'Sealing the facts so nothing can change them' },
  { key: 'plan', label: 'Planning the campaign', doing: 'Agnes is choosing the angle and writing your posts' },
  { key: 'captions', label: 'Captions', doing: 'Filling your posts with the locked facts' },
  { key: 'aivideo', label: 'AI video', doing: 'Sent to render — it finishes in the background' },
  { key: 'brag', label: 'Brag video', doing: 'The Brag Director is storyboarding your launch video' },
  { key: 'poster', label: 'Poster', doing: 'Painting the artwork for your offer' },
  { key: 'voice', label: 'Voice-over', doing: 'Recording your offer in a natural voice' },
  { key: 'verify', label: 'Checking every number', doing: 'Comparing every post with your locked offer' },
] as const;

export type StageKey = (typeof STAGES)[number]['key'];
export type StageState = { status: 'doing' | 'done' | 'failed'; startedAt: number; ms?: number; detail?: string };
export type Stages = Partial<Record<StageKey, StageState>>;

export const WAIT_NOTES = [
  'Every number on your poster is copied from the offer you confirmed — the AI never types a fact.',
  'The poster artwork is painted without any text; your offer is set on top afterwards so it stays readable.',
  'Captions are ready first — you can read them while the visuals finish.',
  'The AI video keeps rendering after everything else is done and appears here by itself.',
  'The brag video is art-directed for your shop — its colours and lines are chosen for this one offer.',
  'Your voice-over is spoken by Sarvam in the language of your offer.',
];

type Hooks = {
  uid: string;
  speaker?: string;
  /** Called with every saved change so the screen can show each piece as it lands. */
  onChange: (patch: Partial<CampaignDraft>) => void;
  onStage: (key: StageKey, state: StageState) => void;
};

/** Thrown when the package stops at a stage the owner has to act on. */
export class PackageStopped extends Error {}

export async function makePackage(campaign: Campaign, hooks: Hooks): Promise<void> {
  const { uid, onChange, onStage } = hooks;
  const facts = campaign.facts;

  const save = async (patch: Partial<CampaignDraft>) => {
    onChange(patch);
    // Inline `data:` media (no Storage bucket) would overflow a Firestore
    // document, so it stays on this screen only and is remade on resume.
    const stored: Partial<CampaignDraft> = { ...patch };
    if (stored.voice?.url.startsWith('data:')) delete stored.voice;
    if (stored.poster?.artUrl?.startsWith('data:')) delete stored.poster;
    if (Object.keys(stored).length) await updateCampaign(uid, campaign.id, stored);
  };

  /** Run one stage and record how it went. Resolves true on success. */
  const stage = async (key: StageKey, run: () => Promise<void>): Promise<boolean> => {
    const startedAt = Date.now();
    onStage(key, { status: 'doing', startedAt });
    try {
      await run();
      onStage(key, { status: 'done', startedAt, ms: Date.now() - startedAt });
      return true;
    } catch (error) {
      onStage(key, { status: 'failed', startedAt, ms: Date.now() - startedAt, detail: errorMessage(error) });
      return false;
    }
  };

  // 1 — the two steps everything else depends on.
  const blockers = lockBlockers(facts);
  const locked = await stage('lock', async () => {
    if (blockers.length) throw new AppError('Some details are still missing.', 'facts_incomplete');
    if (!campaign.locked) await save({ locked: true, factHash: await factHash(facts), lockedAt: Date.now() });
  });
  if (!locked) {
    throw new PackageStopped(
      blockers.length
        ? `I still need: ${[...new Set(blockers.map(pathLabel))].join(' or ')}. Hold the mic and tell me.`
        : 'Your offer could not be locked. Hold the mic and say “yes” to try again.',
    );
  }

  let plan: Plan | null = campaign.plan;
  const planned = await stage('plan', async () => {
    if (!plan) {
      plan = await createPlan(facts);
      await save({ plan });
    }
  });
  if (!planned || !plan) {
    throw new PackageStopped('Planning the campaign did not finish. Hold the mic and say “yes” to try again.');
  }
  const ready: Plan = plan;

  // 2 — everything that only needs the plan, side by side.
  const language = facts.languages.find((name) => name in TTS_LANGUAGES) ?? 'English';
  const [, , , posterOk] = await Promise.all([
    // Captions are the plan's copy with the tokens already filled in.
    stage('captions', async () => {}),

    stage('aivideo', async () => {
      if (campaign.video && campaign.video.status !== 'failed') return;
      const task = await createVideo(buildVideoPrompt(ready, facts), { seconds: 5, aspectRatio: '9:16' });
      await save({
        video: { taskId: task.taskId, status: task.status, url: null, stored: false, error: null, startedAt: Date.now() },
      });
    }),

    // The storyboard only: the video itself is drawn on screen from the locked facts.
    stage('brag', async () => {
      if (campaign.brag) return;
      const brag = await direct(compileTokens(facts), {
        businessName: facts.business.name,
        planAngle: ready.angle || null,
        model: config.agnes.textModel,
      });
      await save({ brag });
    }),

    stage('poster', async () => {
      if (campaign.poster?.artUrl) return;
      const headline = ready.copy.poster_headline ?? compileTokens(facts).PRODUCT ?? '';
      const subline = ready.copy.poster_subline ?? '';
      let artUrl: string | null = null;
      let artError: string | null = null;
      try {
        artUrl = await generateArt(buildArtPrompt(ready, facts));
      } catch (error) {
        artError = errorMessage(error); // the offer is still set on a plain background
      }
      // Show it immediately, then swap in the permanent copy once uploaded.
      await save({ poster: { artUrl, stored: false, headline, subline, usedFallback: !artUrl, artError } });
      if (artUrl) {
        const stored = await persistMedia(uid, campaign.id, 'poster-art.png', artUrl, 'image/png');
        if (stored) await save({ poster: { artUrl: stored, stored: true, headline, subline, usedFallback: false, artError: null } });
      }
    }),

    stage('voice', async () => {
      if (campaign.voice?.url) return;
      const speaker = hooks.speaker || DEFAULT_SPEAKER;
      const script = (lang: string) =>
        (lang === 'English' ? ready.copy.voice_script : ready.localized[lang]?.voice_script) ?? ready.copy.voice_script ?? '';
      // The spoken language follows the script that actually exists.
      const spoken = language !== 'English' && ready.localized[language]?.voice_script ? language : 'English';
      const text = script(spoken);
      if (!text) throw new AppError('The plan has no voice script.', 'plan_incomplete');
      const speech = await synthesize(text, spoken, speaker);
      const stored = await persistMedia(uid, campaign.id, 'voice-over.wav', speech.uri, 'audio/wav');
      await save({ voice: { url: stored ?? speech.uri, stored: Boolean(stored), language: spoken, speaker, script: text } });
    }),
  ]);
  if (!posterOk) {
    throw new PackageStopped('The poster did not finish. Hold the mic and say “yes” to try again.');
  }

  // 3 — every number in every post must come from the locked offer.
  await stage('verify', async () => {
    const copy: Record<string, string | undefined> = { ...ready.copy };
    for (const [lang, channels] of Object.entries(ready.localized)) {
      for (const [channel, text] of Object.entries(channels)) copy[`${lang} ${channel}`] = text;
    }
    await save({ checks: checkCopy(copy, facts) });
  });
}

/**
 * Advance a rendering AI video by one poll. Returns the new state when
 * something changed (so the caller can stop polling), else null.
 */
export async function pollVideo(uid: string, campaign: Campaign): Promise<Campaign['video'] | null> {
  const video = campaign.video;
  if (!video || video.status === 'complete' || video.status === 'failed') return null;
  // A render that has made no progress for 15 minutes is reported, not awaited forever.
  if (Date.now() - video.startedAt > 15 * 60_000) {
    const next = { ...video, status: 'failed' as const, error: 'The video took too long to render.' };
    await updateCampaign(uid, campaign.id, { video: next });
    return next;
  }
  const task = await retrieveVideo(video.taskId);
  if (task.status === video.status) return null;
  let next = { ...video, status: task.status, url: task.url, error: task.error };
  if (task.status === 'complete' && !task.url) {
    next = { ...next, status: 'failed', error: 'Magic Hour finished the video but returned no file.' };
  }
  await updateCampaign(uid, campaign.id, { video: next });
  if (next.status === 'complete' && next.url) {
    // Magic Hour's download link expires; keep a permanent copy when Storage is available.
    const stored = await persistMedia(uid, campaign.id, 'ai-video.mp4', next.url, 'video/mp4');
    if (stored) {
      next = { ...next, url: stored, stored: true };
      await updateCampaign(uid, campaign.id, { video: next });
    }
  }
  return next;
}
