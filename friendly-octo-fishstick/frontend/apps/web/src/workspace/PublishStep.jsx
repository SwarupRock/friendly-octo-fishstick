import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react';
import {
  approvePublish,
  executePublish,
  exportCampaign,
  getPublishCapabilities,
  listPublishRecords,
  preparePublish,
} from '../lib/api';
import { useAsyncAction, useResource } from './hooks';
import { AssetStatusBadge, Banner, EmptyState, ErrorBanner, Spinner } from './ui';

/**
 * Steps G + H — approval, export and publishing.
 *
 * The distinction this screen has to make unmistakable is *what actually
 * happened*. Four different outcomes exist and they are labelled differently:
 *
 *  - exported locally (a JSON bundle you download);
 *  - prepared for manual posting (no API can post it for you);
 *  - prepared as a WhatsApp link you send yourself;
 *  - published through a configured provider (only with a real success response).
 */

const PLATFORMS = [
  { value: 'sandbox', label: 'Sandbox (offline test)', mediaKind: 'image' },
  { value: 'whatsapp', label: 'WhatsApp link', mediaKind: 'text' },
  { value: 'instagram', label: 'Instagram', mediaKind: 'image' },
  { value: 'facebook', label: 'Facebook', mediaKind: 'image' },
];

const STATUS_COPY = {
  READY_FOR_REVIEW: { tone: 'info', label: 'Ready for your approval' },
  APPROVED: { tone: 'ok', label: 'Approved — not yet sent' },
  PUBLISHING: { tone: 'info', label: 'Sending…' },
  PUBLISHED: { tone: 'ok', label: 'Published' },
  MANUAL_REQUIRED: { tone: 'warn', label: 'Manual posting required' },
  ACTION_UNAVAILABLE: { tone: 'warn', label: 'No usable action for this platform' },
  FAILED: { tone: 'error', label: 'Failed' },
  NOT_CONNECTED: { tone: 'warn', label: 'Account not connected' },
};

const PUBLISHABLE = new Set(['verified', 'human_verified']);

export default function PublishStep({ campaignId, assets, showToast }) {
  const capabilities = useResource((signal) => getPublishCapabilities(campaignId, signal), [campaignId]);
  const records = useResource((signal) => listPublishRecords(campaignId, signal), [campaignId]);
  const prepare = useAsyncAction();
  const approve = useAsyncAction();
  const execute = useAsyncAction();
  const exporter = useAsyncAction();

  const [platform, setPlatform] = useState('sandbox');
  const [assetId, setAssetId] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const eligible = useMemo(
    () => (assets ?? []).filter((asset) => PUBLISHABLE.has(asset.asset_status)),
    [assets],
  );

  const selectedPlatform = PLATFORMS.find((item) => item.value === platform) ?? PLATFORMS[0];
  const compatible = useMemo(
    () =>
      eligible.filter((asset) =>
        selectedPlatform.mediaKind === 'text'
          ? asset.kind === 'caption' || asset.kind === 'voice'
          : asset.kind === 'poster' || asset.kind === 'video',
      ),
    [eligible, selectedPlatform],
  );

  const effectiveAssetId = assetId && compatible.some((a) => a.id === assetId) ? assetId : compatible[0]?.id ?? null;

  const handlePrepare = async () => {
    if (!effectiveAssetId) return;
    const result = await prepare.run(() =>
      preparePublish(campaignId, {
        assetId: effectiveAssetId,
        platform,
        mediaKind: selectedPlatform.mediaKind,
      }),
    );
    if (result.ok) {
      showToast(
        result.data.status === 'MANUAL_REQUIRED'
          ? 'Prepared for manual posting — no platform API can publish this.'
          : 'Prepared. Review it, then approve.',
      );
      records.reload();
    }
  };

  const handleApprove = async (publishId) => {
    const result = await approve.run(() => approvePublish(publishId));
    if (result.ok) {
      showToast('Approved. Nothing has been sent yet.');
      records.reload();
    }
  };

  const handleExecute = async (record) => {
    setConfirming(null);
    const result = await execute.run(() => executePublish(record.id));
    records.reload();
    if (result.ok) {
      const published = result.data.status === 'PUBLISHED';
      if (published && record.destination === 'whatsapp') {
        showToast('WhatsApp link ready — open it to send the message yourself.');
      } else {
        showToast(published ? 'Published.' : `Not published: ${result.data.status}.`, { error: !published });
      }
    }
  };

  const handleExport = async () => {
    const result = await exporter.run(() => exportCampaign(campaignId));
    if (!result.ok) return;
    // Download the bundle client-side; nothing leaves the machine.
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `svarah-campaign-${campaignId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Export downloaded.');
  };

  const caps = capabilities.data;
  const list = records.data ?? [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="ws-card">
        <div className="ws-card-head">
          <div>
            <span className="ws-kicker">Step 6 · Approve &amp; publish</span>
            <h2>Review before anything leaves Svarah</h2>
          </div>
          {caps ? (
            <span className={`ws-tag ${caps.is_mock ? 'is-mock' : 'is-pass'}`}>
              {caps.is_mock ? 'Publishing provider not configured' : 'Publishing provider connected'}
            </span>
          ) : null}
        </div>

        {caps?.is_mock ? (
          <Banner tone="warn" title="No live publishing is configured">
            Only the offline <b>sandbox</b> destination and the WhatsApp link work right now. Real social
            posting needs <span className="ws-mono">TITAN_WINDSOR_API_KEY</span> and{' '}
            <span className="ws-mono">TITAN_MODE=live</span>. Svarah never reports a post as published
            without a real success response.
          </Banner>
        ) : null}

        {eligible.length === 0 ? (
          <Banner tone="warn" title="Nothing is approved for publishing yet">
            Only assets the Guardian verified can be prepared. Run step 5, and repair anything that failed.
          </Banner>
        ) : null}

        <ErrorBanner error={capabilities.error} title="Capabilities could not be read" />
        <ErrorBanner error={prepare.error} title="Preparation refused" />

        <div className="ws-grid cols-3" style={{ alignItems: 'end' }}>
          <div className="ws-field" style={{ marginBottom: 0 }}>
            <label htmlFor="pub-platform">Destination</label>
            <select id="pub-platform" value={platform} onChange={(event) => setPlatform(event.target.value)}>
              {PLATFORMS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="ws-field" style={{ marginBottom: 0 }}>
            <label htmlFor="pub-asset">Verified asset</label>
            <select
              id="pub-asset"
              value={effectiveAssetId ?? ''}
              onChange={(event) => setAssetId(Number(event.target.value))}
              disabled={!compatible.length}
            >
              {compatible.length ? (
                compatible.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    #{asset.id} · {asset.kind} · {asset.locale}
                  </option>
                ))
              ) : (
                <option value="">No verified {selectedPlatform.mediaKind} asset</option>
              )}
            </select>
          </div>
          <button
            type="button"
            className="ws-btn"
            onClick={handlePrepare}
            disabled={prepare.pending || !effectiveAssetId}
          >
            {prepare.pending ? <Spinner label="Preparing…" /> : 'Prepare for review'}
          </button>
        </div>
      </div>

      <div className="ws-card">
        <div className="ws-card-head">
          <h3>Prepared publications</h3>
          <button type="button" className="ws-btn is-ghost is-small" onClick={records.reload}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        <ErrorBanner error={records.error} title="Records could not be loaded" />
        <ErrorBanner error={approve.error} title="Approval refused" />
        <ErrorBanner error={execute.error} title="Sending refused" />

        {records.loading ? (
          <div className="ws-skeleton" style={{ height: 50 }} />
        ) : list.length === 0 ? (
          <EmptyState icon={Send} title="Nothing prepared yet">
            Prepare a verified asset above. Preparing binds the exact caption and asset bytes, so a later
            edit invalidates the approval.
          </EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {list.map((record) => {
              const copy = STATUS_COPY[record.status] ?? { tone: 'info', label: record.status };
              const waUrl = record.response?.wa_me_url;
              return (
                <article key={record.id} className="ws-card" style={{ background: 'var(--sand)' }}>
                  <div className="ws-card-head" style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="ws-mono">#{record.id}</span>
                      <span className="ws-tag">{record.destination}</span>
                      <span className="ws-tag">asset #{record.asset_id}</span>
                    </div>
                    <span
                      className={`ws-tag ${
                        copy.tone === 'ok' ? 'is-pass' : copy.tone === 'error' ? 'is-fail' : copy.tone === 'warn' ? 'is-review' : ''
                      }`}
                    >
                      {copy.label}
                    </span>
                  </div>

                  {record.status === 'MANUAL_REQUIRED' && record.response?.instructions ? (
                    <Banner tone="warn" title="Post this one yourself">
                      {record.response.instructions}
                    </Banner>
                  ) : null}

                  {record.error ? (
                    <Banner tone="error" title="The provider returned an error">
                      <span className="ws-mono">{JSON.stringify(record.error)}</span>
                    </Banner>
                  ) : null}

                  {record.caption_hash ? (
                    <dl className="ws-kv" style={{ marginBottom: 10 }}>
                      <dt>Caption bound</dt>
                      <dd className="ws-hash">{record.caption_hash}</dd>
                    </dl>
                  ) : null}

                  <div className="ws-asset-foot">
                    {record.status === 'READY_FOR_REVIEW' ? (
                      <button
                        type="button"
                        className="ws-btn is-primary is-small"
                        onClick={() => handleApprove(record.id)}
                        disabled={approve.pending}
                      >
                        {approve.pending ? <Spinner label="Approving…" /> : <><CheckCircle2 size={13} /> Approve</>}
                      </button>
                    ) : null}

                    {record.status === 'APPROVED' ? (
                      confirming === record.id ? (
                        <>
                          <span style={{ fontSize: 12.5, alignSelf: 'center' }}>
                            {record.destination === 'whatsapp'
                              ? 'Create the WhatsApp link?'
                              : record.destination === 'sandbox'
                                ? 'Run the offline sandbox publish?'
                                : `Publish to ${record.destination} for real?`}
                          </span>
                          <button
                            type="button"
                            className="ws-btn is-small is-danger"
                            onClick={() => handleExecute(record)}
                            disabled={execute.pending}
                          >
                            {execute.pending ? <Spinner label="Sending…" /> : 'Yes, send it'}
                          </button>
                          <button
                            type="button"
                            className="ws-btn is-ghost is-small"
                            onClick={() => setConfirming(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ws-btn is-small"
                          onClick={() => setConfirming(record.id)}
                        >
                          <Send size={13} /> Send…
                        </button>
                      )
                    ) : null}

                    {waUrl ? (
                      <a className="ws-btn is-small is-ghost" href={waUrl} target="_blank" rel="noreferrer">
                        <MessageCircle size={13} /> Open WhatsApp <ExternalLink size={11} />
                      </a>
                    ) : null}

                    {record.provider_result_ids?.post_id ? (
                      <span className="ws-tag is-pass">post {record.provider_result_ids.post_id}</span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="ws-card">
        <div className="ws-card-head">
          <h3>
            <Download size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
            Export
          </h3>
        </div>
        <p style={{ marginTop: 0, fontSize: 13.5, color: 'var(--muted)' }}>
          Download every caption, asset reference and publication record as a JSON bundle. Poster and reel
          files are downloaded individually from the asset cards.
        </p>
        <ErrorBanner error={exporter.error} title="Export failed" />
        <button type="button" className="ws-btn is-ghost" onClick={handleExport} disabled={exporter.pending}>
          {exporter.pending ? <Spinner label="Building…" /> : 'Download campaign bundle'}
        </button>
      </div>

      {eligible.length === 0 && (assets ?? []).length > 0 ? (
        <div className="ws-card">
          <div className="ws-card-head">
            <h3>
              <ShieldAlert size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
              Why nothing is publishable
            </h3>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 7 }}>
            {(assets ?? []).map((asset) => (
              <li key={asset.id} style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13 }}>
                <span className="ws-mono">#{asset.id}</span>
                <span className="ws-tag">{asset.kind}</span>
                <AssetStatusBadge status={asset.asset_status} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
