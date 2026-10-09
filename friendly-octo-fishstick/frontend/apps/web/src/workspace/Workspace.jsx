import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AudioLines,
  LogOut,
  Megaphone,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { extractFacts, getCampaign, getPlan, listAssets, listCampaigns } from '../lib/api';
import { useAuth } from '../AuthContext';
import ThemeToggle from '../ThemeToggle';
import { useAsyncAction, useBackendStatus, useResource, useToast } from './hooks';
import { Banner, EmptyState, ErrorBanner, Spinner, StatusPill, StepRail, Toast } from './ui';
import CaptureStep from './CaptureStep';
import FactReviewStep from './FactReviewStep';
import PlanStep from './PlanStep';
import AssetsStep from './AssetsStep';
import VerifyStep from './VerifyStep';
import PublishStep from './PublishStep';
import './workspace.css';

/**
 * The signed-in Svarah workspace.
 *
 * Holds one piece of state that matters — which campaign is open — and loads
 * everything else from the backend. There is no local mirror of campaign data
 * to drift out of sync: after any mutation the affected resource is reloaded.
 */

const STEPS = [
  { id: 'capture', label: 'Capture' },
  { id: 'facts', label: 'Confirm facts' },
  { id: 'plan', label: 'Plan' },
  { id: 'assets', label: 'Create' },
  { id: 'verify', label: 'Verify' },
  { id: 'publish', label: 'Approve & publish' },
];

export default function Workspace() {
  const { user, checking, sessionNotice, logout } = useAuth();
  const navigate = useNavigate();
  const [openCampaignId, setOpenCampaignId] = useState(null);
  const backend = useBackendStatus();
  const { toast, show, showError, dismiss } = useToast();

  useEffect(() => {
    if (!checking && !user) navigate('/login', { replace: true });
  }, [checking, user, navigate]);

  if (checking) {
    return (
      <div className="ws-root">
        <div className="ws-body">
          <Spinner label="Restoring your session…" />
        </div>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="ws-root">
      <header className="ws-nav">
        <Link to="/" className="ws-nav-logo" aria-label="Svarah home">
          <span className="logo-mark">
            <AudioLines size={17} strokeWidth={2.5} />
          </span>
          Svarah<span style={{ color: 'var(--muted)' }}>.AI</span>
        </Link>

        <BackendPill backend={backend} />

        <span className="ws-nav-spacer" />

        <ThemeToggle />
        <div className="ws-account">
          <span className="ws-avatar">{user.avatar}</span>
          <span className="ws-account-meta">
            <b>{user.name}</b>
            <small>{user.isDemo ? 'Demo account' : user.email}</small>
          </span>
          <button
            type="button"
            className="ws-btn is-ghost is-small"
            onClick={() => {
              logout();
              navigate('/');
            }}
          >
            <LogOut size={13} />
            <span className="hide-mobile">Sign out</span>
          </button>
        </div>
      </header>

      <main className="ws-body">
        {sessionNotice ? <Banner tone="warn">{sessionNotice}</Banner> : null}
        {backend.status === 'offline' ? (
          <Banner tone="error" title="The backend is not reachable">
            Start it with <span className="ws-mono">uvicorn app.main:app --reload</span> in{' '}
            <span className="ws-mono">backend/</span>. Nothing on this page is cached, so what you see is
            whatever the backend last returned — not stale campaign data.
          </Banner>
        ) : null}

        {openCampaignId ? (
          <CampaignDetail
            campaignId={openCampaignId}
            backend={backend}
            onClose={() => setOpenCampaignId(null)}
            showToast={show}
            showError={showError}
          />
        ) : (
          <CampaignHome
            backend={backend}
            onOpen={setOpenCampaignId}
            showToast={show}
          />
        )}
      </main>

      <Toast toast={toast} />
    </div>
  );
}

/** Connection + provider-mode indicator. */
function BackendPill({ backend }) {
  const label =
    backend.status === 'online'
      ? `${backend.health.mode} mode · v${backend.health.version}`
      : backend.status === 'degraded'
        ? 'backend degraded'
        : backend.status === 'offline'
          ? 'backend offline'
          : 'checking backend';

  const sealOk = backend.modes?.seal?.configured;
  return (
    <>
      <StatusPill status={backend.status} title={backend.modes?.database?.url}>
        {label}
      </StatusPill>
      {backend.modes && !sealOk ? (
        <StatusPill status="degraded" title={backend.modes.seal?.detail}>
          fact lock disabled
        </StatusPill>
      ) : null}
    </>
  );
}

/** Step A — dashboard: real campaigns, real counts, one clear next action. */
function CampaignHome({ backend, onOpen, showToast }) {
  const campaigns = useResource((signal) => listCampaigns({ signal }), []);
  const [creating, setCreating] = useState(false);

  const list = campaigns.data ?? [];
  const counts = useMemo(() => {
    const result = { total: list.length, locked: 0, verified: 0, published: 0 };
    list.forEach((campaign) => {
      if (['locked', 'generating', 'verified', 'needs_review', 'approved', 'published', 'exported'].includes(campaign.status)) {
        result.locked += 1;
      }
      if (['verified', 'approved', 'published', 'exported'].includes(campaign.status)) result.verified += 1;
      if (['published', 'exported'].includes(campaign.status)) result.published += 1;
    });
    return result;
  }, [list]);

  const handleCreated = (campaign) => {
    setCreating(false);
    showToast(`Campaign #${campaign.id} created.`);
    campaigns.reload();
    onOpen(campaign.id);
  };

  if (creating) {
    return (
      <>
        <button type="button" className="ws-btn is-ghost is-small" onClick={() => setCreating(false)} style={{ marginBottom: 16 }}>
          <ArrowLeft size={13} /> Back to campaigns
        </button>
        <CaptureStep onCreated={handleCreated} />
      </>
    );
  }

  return (
    <>
      <div className="ws-page-head">
        <div>
          <span className="ws-kicker">Workspace</span>
          <h1>Your campaigns</h1>
          <p>
            Describe an offer once. Svarah confirms the facts with you, writes the copy, builds the poster and
            reel, checks every number against what you approved, and gets it ready to publish.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="ws-btn is-ghost" onClick={campaigns.reload}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button type="button" className="ws-btn is-primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> New campaign
          </button>
        </div>
      </div>

      <div className="ws-grid cols-4" style={{ marginBottom: 20 }}>
        <Stat label="Campaigns" value={counts.total} sub="Stored in your account" loading={campaigns.loading} />
        <Stat label="Facts locked" value={counts.locked} sub="Sealed and planable" loading={campaigns.loading} />
        <Stat label="Verified" value={counts.verified} sub="Passed Guardian checks" loading={campaigns.loading} />
        <Stat
          label="Provider mode"
          value={backend.health?.mode ?? '—'}
          sub={backend.health?.mode === 'mock' ? 'Offline demo providers' : 'Live providers configured'}
          loading={backend.status === 'checking'}
        />
      </div>

      <ErrorBanner error={campaigns.error} title="Campaigns could not be loaded" />

      {campaigns.loading ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="ws-skeleton" style={{ height: 64 }} />
          <div className="ws-skeleton" style={{ height: 64 }} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          action={
            <button type="button" className="ws-btn is-primary" onClick={() => setCreating(true)}>
              <Plus size={15} /> Start your first campaign
            </button>
          }
        >
          Start by describing an offer — “20% off cold coffee this weekend, 4 to 8 PM, for college students”.
        </EmptyState>
      ) : (
        <div>
          {list.map((campaign) => (
            <button
              key={campaign.id}
              type="button"
              className="ws-campaign-row"
              onClick={() => onOpen(campaign.id)}
            >
              <span className="ws-campaign-id">#{campaign.id}</span>
              <span className="ws-campaign-main">
                <b>{campaign.input_type === 'audio' ? 'Spoken brief' : 'Typed brief'}</b>
                <span>
                  {new Date(campaign.created_at).toLocaleString()}
                  {campaign.has_transcript ? '' : ' · no transcript captured'}
                </span>
              </span>
              <span className="ws-tag">{campaign.status.replace(/_/g, ' ')}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ label, value, sub, loading }) {
  return (
    <div className="ws-stat">
      <span className="ws-stat-label">{label}</span>
      {loading ? (
        <div className="ws-skeleton" style={{ height: 30, margin: '8px 0 6px' }} />
      ) : (
        <div className="ws-stat-value">{value}</div>
      )}
      <span className="ws-stat-sub">{sub}</span>
    </div>
  );
}

/** Steps B–H for one campaign. */
function CampaignDetail({ campaignId, backend, onClose, showToast, showError }) {
  const [step, setStep] = useState('facts');

  const campaign = useResource((signal) => getCampaign(campaignId, signal), [campaignId]);
  const assets = useResource((signal) => listAssets(campaignId, signal), [campaignId]);
  // The plan is absent until step 3 runs, so a 404 here is an expected state
  // rather than an error worth showing.
  const plan = useResource(
    (signal) =>
      getPlan(campaignId, signal).catch((error) => {
        if (error?.status === 404) return null;
        throw error;
      }),
    [campaignId],
  );

  const factsheet = campaign.data?.factsheet ?? null;
  const factsLocked = factsheet?.status === 'locked' && factsheet?.seal_valid !== false;
  const hasPlan = Boolean(plan.data?.plan);
  const hasAssets = (assets.data ?? []).length > 0;
  const anyVerified = (assets.data ?? []).some(
    (asset) => asset.asset_status === 'verified' || asset.asset_status === 'human_verified',
  );

  const reloadAll = useCallback(() => {
    campaign.reload();
    assets.reload();
    plan.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.reload, assets.reload, plan.reload]);

  const steps = useMemo(
    () => [
      { ...STEPS[0], done: Boolean(campaign.data?.transcript), disabled: false },
      { ...STEPS[1], done: Boolean(factsheet), disabled: !campaign.data },
      {
        ...STEPS[2],
        done: hasPlan,
        disabled: !factsLocked,
        disabledReason: 'Lock the facts first.',
      },
      {
        ...STEPS[3],
        done: hasAssets,
        disabled: !hasPlan,
        disabledReason: 'Generate the campaign plan first.',
      },
      {
        ...STEPS[4],
        done: anyVerified,
        disabled: !hasAssets,
        disabledReason: 'Create at least one asset first.',
      },
      {
        ...STEPS[5],
        done: false,
        disabled: !hasAssets,
        disabledReason: 'Create and verify an asset first.',
      },
    ],
    [campaign.data, factsheet, factsLocked, hasPlan, hasAssets, anyVerified],
  );

  if (campaign.loading && !campaign.data) {
    return (
      <>
        <BackLink onClose={onClose} />
        <div className="ws-card">
          <div className="ws-skeleton" style={{ height: 22, width: 220, marginBottom: 12 }} />
          <div className="ws-skeleton" style={{ height: 90 }} />
        </div>
      </>
    );
  }

  if (campaign.error) {
    return (
      <>
        <BackLink onClose={onClose} />
        <ErrorBanner
          error={campaign.error}
          title="This campaign could not be opened"
          action={
            <button type="button" className="ws-btn is-ghost is-small" onClick={campaign.reload}>
              Retry
            </button>
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="ws-page-head">
        <div>
          <BackLink onClose={onClose} />
          <span className="ws-kicker">Campaign #{campaignId}</span>
          <h1>{campaign.data?.factsheet?.facts?.business?.name || 'Untitled campaign'}</h1>
          <p>
            Status <b>{campaign.data?.status?.replace(/_/g, ' ')}</b>
            {backend.health?.mode === 'mock'
              ? ' · running on offline demo providers, so generated media is labelled as demo output'
              : null}
          </p>
        </div>
        <button type="button" className="ws-btn is-ghost" onClick={reloadAll}>
          <RefreshCw size={14} /> Reload
        </button>
      </div>

      <StepRail steps={steps} current={step} onSelect={setStep} />

      {step === 'capture' ? (
        <CampaignTranscript campaign={campaign.data} onReExtract={reloadAll} showError={showError} />
      ) : null}

      {step === 'facts' ? (
        <FactReviewStep
          campaign={campaign.data}
          factsheet={factsheet}
          onUpdated={() => {
            campaign.reload();
            showToast('Facts updated.');
          }}
          onLocked={() => {
            campaign.reload();
            showToast('Facts locked and sealed.');
            setStep('plan');
          }}
        />
      ) : null}

      {step === 'plan' ? (
        <PlanStep
          campaignId={campaignId}
          factsLocked={factsLocked}
          plan={plan.data?.plan}
          substituted={plan.data?.substituted}
          onPlanned={() => {
            plan.reload();
            showToast('Campaign plan ready.');
          }}
        />
      ) : null}

      {step === 'assets' ? (
        <AssetsStep
          campaignId={campaignId}
          hasPlan={hasPlan}
          assets={assets.data}
          onAssetsChanged={() => {
            assets.reload();
            campaign.reload();
          }}
          showToast={showToast}
        />
      ) : null}

      {step === 'verify' ? (
        <VerifyStep
          campaignId={campaignId}
          assets={assets.data}
          onAssetsChanged={() => {
            assets.reload();
            campaign.reload();
          }}
          showToast={showToast}
        />
      ) : null}

      {step === 'publish' ? (
        <PublishStep campaignId={campaignId} assets={assets.data} showToast={showToast} />
      ) : null}
    </>
  );
}

function BackLink({ onClose }) {
  return (
    <button type="button" className="ws-btn is-ghost is-small" onClick={onClose} style={{ marginBottom: 12 }}>
      <ArrowLeft size={13} /> All campaigns
    </button>
  );
}

/** Read-only view of what was captured, plus a re-extract action. */
function CampaignTranscript({ campaign, onReExtract, showError }) {
  const { run, pending, error } = useAsyncAction();

  const reExtract = async () => {
    const result = await run(() => extractFacts(campaign.id));
    if (result.ok) onReExtract();
    else showError(result.error);
  };

  if (!campaign?.transcript) {
    return (
      <div className="ws-card">
        <Banner tone="warn" title="No transcript was captured">
          {campaign?.stt?.message ||
            'Speech-to-text was unavailable for this campaign. Enter the facts by hand in the next step.'}
        </Banner>
      </div>
    );
  }

  const t = campaign.transcript;
  return (
    <div className="ws-card">
      <div className="ws-card-head">
        <div>
          <span className="ws-kicker">Step 1 · Captured</span>
          <h2>What you said</h2>
        </div>
        <div className="ws-chips">
          <span className="ws-tag">{campaign.input_type}</span>
          {t.is_mock ? <span className="ws-tag is-mock">Offline transcription</span> : null}
        </div>
      </div>

      <div className="ws-readout">{t.raw}</div>

      <dl className="ws-kv" style={{ marginTop: 14 }}>
        <dt>Provider</dt>
        <dd>{t.provider || '—'}</dd>
        <dt>Language</dt>
        <dd>{t.language || 'not detected'}</dd>
        {t.duration_seconds ? (
          <>
            <dt>Duration</dt>
            <dd>{t.duration_seconds}s</dd>
          </>
        ) : null}
        <dt>Transcript hash</dt>
        <dd className="ws-hash">{t.hash || '—'}</dd>
      </dl>

      <ErrorBanner error={error} title="Re-extraction failed" />
      <div className="ws-asset-foot">
        <button type="button" className="ws-btn is-ghost is-small" onClick={reExtract} disabled={pending}>
          {pending ? <Spinner label="Extracting…" /> : 'Re-run fact extraction'}
        </button>
      </div>
      <small style={{ color: 'var(--muted)' }}>
        The raw transcript is immutable — re-extraction only re-reads it. It is refused once the facts are
        locked.
      </small>
    </div>
  );
}
