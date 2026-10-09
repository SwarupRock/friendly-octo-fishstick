import React, { useEffect, useMemo, useState } from 'react';
import { FileImage, Film, Image as ImageIcon, Mic2, Play, RefreshCw, Trash2, Volume2 } from 'lucide-react';
import {
  createVoiceProfile,
  deleteVoiceProfile,
  generateCaptions,
  generatePosters,
  generateVoice,
  listVideoJobs,
  listVoiceProfiles,
  queueVideoJob,
  runVideoJob,
} from '../lib/api';
import { useAsyncAction, useResource } from './hooks';
import { AssetImage, AssetStatusBadge, Banner, EmptyState, ErrorBanner, MockBadge, Spinner } from './ui';

/**
 * Step E — asset generation.
 *
 * Posters, captions, localized voice and the reel each have an explicit
 * trigger, their own pending state, and their own failure message. Nothing is
 * generated implicitly, because every one of these costs real provider calls
 * in live mode.
 */

const VOICE_LANGUAGES = ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu'];

export default function AssetsStep({ campaignId, hasPlan, assets, onAssetsChanged, showToast }) {
  const posters = useAsyncAction();
  const captions = useAsyncAction();

  const byKind = useMemo(() => {
    const groups = { poster: [], caption: [], voice: [], video: [] };
    (assets ?? []).forEach((asset) => {
      (groups[asset.kind] ??= []).push(asset);
    });
    return groups;
  }, [assets]);

  if (!hasPlan) {
    return (
      <div className="ws-card">
        <Banner tone="warn" title="Generate the plan first">
          Assets are rendered from the campaign plan and the locked fact tokens. Complete step 3 first.
        </Banner>
      </div>
    );
  }

  const runPosters = async () => {
    const result = await posters.run(() => generatePosters(campaignId, 1));
    if (result.ok) {
      showToast(`Composed ${result.data.length} poster${result.data.length === 1 ? '' : 's'}.`);
      onAssetsChanged();
    }
  };

  const runCaptions = async () => {
    const result = await captions.run(() => generateCaptions(campaignId));
    if (result.ok) {
      showToast(`Materialized ${result.data.length} captions.`);
      onAssetsChanged();
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="ws-card">
        <div className="ws-card-head">
          <div>
            <span className="ws-kicker">Step 4 · Create</span>
            <h2>Generate the campaign assets</h2>
          </div>
        </div>
        <p style={{ marginTop: 0, fontSize: 13.5, color: 'var(--muted)' }}>
          Each asset records which fact version it was built from. If you change the facts later, assets
          bound to the old version are treated as stale and cannot be published.
        </p>
        <div className="ws-asset-foot">
          <button type="button" className="ws-btn is-primary" onClick={runPosters} disabled={posters.pending}>
            {posters.pending ? <Spinner label="Composing…" /> : <><ImageIcon size={14} /> Compose a poster</>}
          </button>
          <button type="button" className="ws-btn" onClick={runCaptions} disabled={captions.pending}>
            {captions.pending ? <Spinner label="Writing…" /> : <><FileImage size={14} /> Materialize captions</>}
          </button>
        </div>
        <ErrorBanner error={posters.error} title="Poster composition failed" />
        <ErrorBanner error={captions.error} title="Caption materialization failed" />
      </div>

      <VoicePanel campaignId={campaignId} onChanged={onAssetsChanged} showToast={showToast} />
      <ReelPanel
        campaignId={campaignId}
        hasPoster={byKind.poster.length > 0}
        onChanged={onAssetsChanged}
        showToast={showToast}
      />

      <AssetGallery title="Posters" icon={ImageIcon} assets={byKind.poster} kind="poster" />
      <AssetGallery title="Captions" icon={FileImage} assets={byKind.caption} kind="caption" />
      <AssetGallery title="Voice" icon={Volume2} assets={byKind.voice} kind="voice" />
      <AssetGallery title="Reels" icon={Film} assets={byKind.video} kind="video" />
    </div>
  );
}

/** Voice profile management + localized narration. */
function VoicePanel({ campaignId, onChanged, showToast }) {
  const profiles = useResource((signal) => listVoiceProfiles(signal), [campaignId]);
  const create = useAsyncAction();
  const generate = useAsyncAction();
  const remove = useAsyncAction();

  const [displayName, setDisplayName] = useState('My shop voice');
  const [consent, setConsent] = useState(false);
  const [language, setLanguage] = useState('English');
  const [profileId, setProfileId] = useState(null);

  const list = profiles.data ?? [];

  useEffect(() => {
    if (!profileId && list.length) setProfileId(list[0].id);
  }, [list, profileId]);

  const handleCreate = async () => {
    const result = await create.run(() =>
      createVoiceProfile({
        displayName,
        consentConfirmed: consent,
        consentRecord: { source: 'web_workspace', confirmed_at: new Date().toISOString() },
        campaignId,
      }),
    );
    if (result.ok) {
      showToast('Voice profile created.');
      setConsent(false);
      profiles.reload();
    }
  };

  const handleGenerate = async () => {
    const result = await generate.run(() => generateVoice(campaignId, { profileId, language }));
    if (result.ok) {
      showToast(`Narration generated in ${language}.`);
      onChanged();
    }
  };

  const handleDelete = async (id) => {
    const result = await remove.run(() => deleteVoiceProfile(id));
    if (result.ok) {
      showToast('Voice profile deleted.');
      if (profileId === id) setProfileId(null);
      profiles.reload();
    }
  };

  return (
    <div className="ws-card">
      <div className="ws-card-head">
        <h3>
          <Mic2 size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
          Voice narration
        </h3>
        <button type="button" className="ws-btn is-ghost is-small" onClick={profiles.reload}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <ErrorBanner error={profiles.error} title="Voice profiles could not be loaded" />
      <ErrorBanner error={create.error} title="The voice profile was not created" />
      <ErrorBanner error={generate.error} title="Narration failed" />
      <ErrorBanner error={remove.error} title="The profile was not deleted" />

      {profiles.loading ? (
        <div className="ws-skeleton" style={{ height: 40 }} />
      ) : list.length === 0 ? (
        <>
          <p style={{ marginTop: 0, fontSize: 13.5, color: 'var(--muted)' }}>
            A voice profile is reused across campaigns. Recorded consent is stored with it.
          </p>
          <div className="ws-field">
            <label htmlFor="voice-name">Profile name</label>
            <input
              id="voice-name"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="ws-field">
            <label htmlFor="voice-consent" style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <input
                id="voice-consent"
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                I confirm this voice is mine (or I have the speaker’s permission) and may be used to narrate
                my campaigns.
              </span>
            </label>
          </div>
          <button
            type="button"
            className="ws-btn"
            onClick={handleCreate}
            disabled={create.pending || !consent || !displayName.trim()}
          >
            {create.pending ? <Spinner label="Creating…" /> : 'Create voice profile'}
          </button>
        </>
      ) : (
        <>
          <div className="ws-grid cols-3" style={{ alignItems: 'end' }}>
            <div className="ws-field" style={{ marginBottom: 0 }}>
              <label htmlFor="voice-profile">Profile</label>
              <select
                id="voice-profile"
                value={profileId ?? ''}
                onChange={(event) => setProfileId(Number(event.target.value))}
              >
                {list.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.display_name}
                    {profile.is_mock ? ' (demo voice)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="ws-field" style={{ marginBottom: 0 }}>
              <label htmlFor="voice-language">Language</label>
              <select id="voice-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                {VOICE_LANGUAGES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="ws-btn"
              onClick={handleGenerate}
              disabled={generate.pending || !profileId}
            >
              {generate.pending ? <Spinner label="Generating…" /> : 'Generate narration'}
            </button>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'grid', gap: 8 }}>
            {list.map((profile) => (
              <li
                key={profile.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}
              >
                <b style={{ flex: 1 }}>{profile.display_name}</b>
                {profile.is_mock ? <MockBadge provider={profile.provider} /> : null}
                <span className="ws-tag">{profile.provider}</span>
                <button
                  type="button"
                  className="ws-btn is-ghost is-small"
                  onClick={() => handleDelete(profile.id)}
                  disabled={remove.pending}
                  aria-label={`Delete ${profile.display_name}`}
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Reel composition.
 *
 * Composition runs through the backend's job table, so the UI queues a job and
 * then polls it rather than blocking on one long request.
 */
function ReelPanel({ campaignId, hasPoster, onChanged, showToast }) {
  const jobs = useResource((signal) => listVideoJobs(campaignId, signal), [campaignId]);
  const queue = useAsyncAction();
  const drive = useAsyncAction();

  const list = jobs.data ?? [];
  const active = list.find((job) => job.status === 'queued' || job.status === 'running');

  const handleQueue = async () => {
    const result = await queue.run(() => queueVideoJob(campaignId));
    if (result.ok) {
      showToast('Reel job queued.');
      jobs.reload();
    }
  };

  const handleRun = async (jobId) => {
    const result = await drive.run(() => runVideoJob(jobId));
    jobs.reload();
    if (result.ok) {
      if (result.data.asset_id) {
        showToast('Reel composed.');
        onChanged();
      } else {
        showToast(result.data.job?.error || 'The reel job did not produce a video.', { error: true });
      }
    }
  };

  return (
    <div className="ws-card">
      <div className="ws-card-head">
        <h3>
          <Film size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
          Reel composition
        </h3>
        <button type="button" className="ws-btn is-ghost is-small" onClick={jobs.reload}>
          <RefreshCw size={12} /> Refresh jobs
        </button>
      </div>

      {!hasPoster ? (
        <Banner tone="warn">Compose a poster first — the reel animates it.</Banner>
      ) : (
        <p style={{ marginTop: 0, fontSize: 13.5, color: 'var(--muted)' }}>
          The reel is built locally with FFmpeg from the poster plus any generated narration. If FFmpeg is
          not installed, the job fails with that reason instead of producing a placeholder.
        </p>
      )}

      <ErrorBanner error={jobs.error} title="Jobs could not be loaded" />
      <ErrorBanner error={queue.error} title="The reel job was not queued" />
      <ErrorBanner error={drive.error} title="The reel job failed" />

      <div className="ws-asset-foot">
        <button type="button" className="ws-btn" onClick={handleQueue} disabled={!hasPoster || queue.pending}>
          {queue.pending ? <Spinner label="Queueing…" /> : 'Queue a reel'}
        </button>
        {active ? (
          <button
            type="button"
            className="ws-btn is-primary"
            onClick={() => handleRun(active.id)}
            disabled={drive.pending}
          >
            {drive.pending ? <Spinner label="Composing…" /> : <><Play size={13} /> Run job #{active.id}</>}
          </button>
        ) : null}
      </div>

      {list.length ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'grid', gap: 7 }}>
          {list.map((job) => (
            <li key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <span className="ws-mono">#{job.id}</span>
              <span className={`ws-tag ${job.status === 'completed' ? 'is-pass' : job.status === 'failed' ? 'is-fail' : ''}`}>
                {job.status}
              </span>
              <span style={{ color: 'var(--muted)', flex: 1 }}>
                {job.error || `attempts: ${job.attempts}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Previews for one asset kind, with per-asset provenance. */
function AssetGallery({ title, icon, assets, kind }) {
  if (!assets?.length) return null;
  const Icon = icon;
  return (
    <div className="ws-card">
      <div className="ws-card-head">
        <h3>
          <Icon size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
          {title}
        </h3>
        <span className="ws-tag">{assets.length}</span>
      </div>
      <div className={kind === 'caption' ? 'ws-grid cols-2' : 'ws-grid cols-3'}>
        {assets.map((asset) => (
          <article key={asset.id} className="ws-asset">
            {kind === 'poster' ? <AssetImage assetId={asset.id} alt={`Poster ${asset.id}`} /> : null}
            <div className="ws-asset-body">
              <header>
                <span className="ws-mono">#{asset.id}</span>
                <span className="ws-tag">{asset.locale}</span>
                <AssetStatusBadge status={asset.asset_status} />
                {asset.is_mock ? <MockBadge provider={asset.provider} /> : null}
                {asset.used_fallback ? <span className="ws-tag is-review">Fallback art</span> : null}
              </header>
              {asset.text_content ? <p className="ws-asset-text">{asset.text_content}</p> : null}
              {asset.provenance?.channel ? (
                <small style={{ color: 'var(--muted)' }}>Channel: {asset.provenance.channel}</small>
              ) : null}
              <small style={{ color: 'var(--muted)' }} className="ws-hash">
                {asset.fact_hash}
              </small>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
