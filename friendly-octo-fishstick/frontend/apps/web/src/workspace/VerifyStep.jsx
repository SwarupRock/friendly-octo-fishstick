import React, { useMemo, useState } from 'react';
import { Award, FileCheck2, RefreshCw, ShieldCheck, UserCheck, Wrench } from 'lucide-react';
import { humanVerifyAsset, issueCertificate, repairAsset, verifyCampaign } from '../lib/api';
import { useAsyncAction } from './hooks';
import { AssetStatusBadge, Banner, EmptyState, ErrorBanner, Spinner, VerdictBadge } from './ui';

/**
 * Step F — Guardian verification.
 *
 * The verdict rendered here is the backend's, parsed from the response body —
 * a 200 response alone is never read as "verified". A FAIL or NEEDS_REVIEW
 * leaves the asset unpublishable, which is also enforced server-side at
 * prepare, approve and execute.
 */

const CHECK_LABELS = {
  aggregate: 'Overall verdict',
  numeric_parity: 'Numbers match the locked facts',
  token_residue: 'No unresolved tokens left in the copy',
  unsupported_claims: 'No invented claims or guarantees',
  fact_parity_days: 'Days match the locked facts',
  registry_vs_tokens: 'Every rendered word traces to a locked value',
  ocr_cross_check: 'Poster text read back by OCR',
  asr_roundtrip: 'Narration transcribed back and compared',
  conditions_present: 'Stated conditions are carried through',
};

export default function VerifyStep({ campaignId, assets, onAssetsChanged, showToast }) {
  const verify = useAsyncAction();
  const repair = useAsyncAction();
  const humanVerify = useAsyncAction();
  const certificate = useAsyncAction();
  const [reports, setReports] = useState(null);
  const [cert, setCert] = useState(null);
  // Which asset is currently having a human decision recorded, plus its note.
  const [reviewingAssetId, setReviewingAssetId] = useState(null);
  const [reviewNote, setReviewNote] = useState('');

  const reportByAsset = useMemo(() => {
    const map = new Map();
    (reports ?? []).forEach((report) => map.set(report.asset_id, report));
    return map;
  }, [reports]);

  const verifiable = (assets ?? []).filter((asset) => asset.kind !== 'caption' || asset.text_content);

  const runVerify = async () => {
    const result = await verify.run(() => verifyCampaign(campaignId));
    if (result.ok) {
      setReports(result.data);
      const failed = result.data.filter((r) => r.verdict === 'FAIL').length;
      const review = result.data.filter((r) => r.verdict === 'WARN' || r.verdict === 'NEEDS_REVIEW').length;
      showToast(
        failed
          ? `${failed} asset${failed === 1 ? '' : 's'} failed verification.`
          : review
            ? `${review} asset${review === 1 ? '' : 's'} need a human look.`
            : 'All assets verified.',
        { error: failed > 0 },
      );
      onAssetsChanged();
    }
  };

  const runRepair = async (assetId) => {
    const result = await repair.run(() => repairAsset(assetId));
    if (result.ok) {
      showToast(`Repair finished: ${result.data.final_status}.`, {
        error: result.data.final_status !== 'verified',
      });
      onAssetsChanged();
      // The repair loop re-verifies internally; refresh the displayed verdicts.
      await runVerify();
    }
  };

  /**
   * Accept an inconclusive verdict as the owner. The backend refuses a hard
   * FAIL and keeps the Guardian rows, so this records responsibility rather
   * than erasing the machine's finding. Re-running verification afterwards
   * recomputes the verdict and clears the human decision — which is why this
   * does not trigger a re-verify.
   */
  const runHumanVerify = async (assetId) => {
    const result = await humanVerify.run(() => humanVerifyAsset(assetId, reviewNote.trim()));
    if (result.ok) {
      showToast(`Asset #${assetId} recorded as human-verified.`);
      setReviewingAssetId(null);
      setReviewNote('');
      onAssetsChanged();
    }
  };

  const runCertificate = async () => {
    const result = await certificate.run(() => issueCertificate(campaignId));
    if (result.ok) {
      setCert(result.data);
      showToast('Verification certificate issued.');
    }
  };

  if (!verifiable.length) {
    return (
      <div className="ws-card">
        <EmptyState icon={ShieldCheck} title="Nothing to verify yet">
          Generate a poster or materialize the captions first. The Guardian checks assets, not plans.
        </EmptyState>
      </div>
    );
  }

  const counts = (assets ?? []).reduce(
    (acc, asset) => {
      const bucket =
        asset.asset_status === 'verified' || asset.asset_status === 'human_verified'
          ? 'verified'
          : asset.asset_status === 'failed'
            ? 'failed'
            : 'open';
      acc[bucket] += 1;
      return acc;
    },
    { verified: 0, failed: 0, open: 0 },
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="ws-card">
        <div className="ws-card-head">
          <div>
            <span className="ws-kicker">Step 5 · Verify</span>
            <h2>Guardian verification</h2>
          </div>
          <div className="ws-chips">
            <span className="ws-tag is-pass">{counts.verified} verified</span>
            {counts.failed ? <span className="ws-tag is-fail">{counts.failed} failed</span> : null}
            {counts.open ? <span className="ws-tag is-review">{counts.open} unresolved</span> : null}
          </div>
        </div>

        <p style={{ marginTop: 0, fontSize: 13.5, color: 'var(--muted)' }}>
          Every asset is checked against the locked facts: numbers, days, conditions, leftover tokens and
          invented claims. Only assets the backend reports as verified — or that you explicitly accept
          after review — can be approved or published.
        </p>

        <ErrorBanner error={verify.error} title="Verification could not run" />
        <ErrorBanner error={repair.error} title="Repair failed" />
        <ErrorBanner error={humanVerify.error} title="The human decision was not recorded" />

        <div className="ws-asset-foot">
          <button type="button" className="ws-btn is-primary" onClick={runVerify} disabled={verify.pending}>
            {verify.pending ? <Spinner label="Checking…" /> : <><ShieldCheck size={14} /> Run verification</>}
          </button>
          {reports ? (
            <button type="button" className="ws-btn is-ghost" onClick={runVerify} disabled={verify.pending}>
              <RefreshCw size={13} /> Re-run
            </button>
          ) : null}
        </div>
      </div>

      {reports ? (
        <div className="ws-card">
          <div className="ws-card-head">
            <h3>Results</h3>
            <span className="ws-tag">{reports.length} assets checked</span>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {(assets ?? []).map((asset) => {
              const report = reportByAsset.get(asset.id);
              if (!report) return null;
              const checks = (report.checks ?? []).filter((check) => check.check !== 'aggregate');
              return (
                <article key={asset.id} className="ws-card" style={{ background: 'var(--sand)' }}>
                  <div className="ws-card-head" style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="ws-mono">#{asset.id}</span>
                      <span className="ws-tag">{asset.kind}</span>
                      <span className="ws-tag">{asset.locale}</span>
                      <AssetStatusBadge status={asset.asset_status} />
                    </div>
                    <VerdictBadge verdict={report.verdict} />
                  </div>

                  {asset.text_content ? (
                    <div className="ws-readout" style={{ background: '#fff', marginBottom: 10 }}>
                      {asset.text_content}
                    </div>
                  ) : null}

                  <ul className="ws-checks">
                    {checks.map((check) => (
                      <li key={`${asset.id}-${check.check}`} className="ws-check">
                        <VerdictBadge verdict={check.verdict} />
                        <span style={{ flex: 1 }}>{CHECK_LABELS[check.check] ?? check.check}</span>
                        <code>{check.check}</code>
                      </li>
                    ))}
                  </ul>

                  {report.verdict === 'FAIL' ? (
                    <div style={{ marginTop: 12 }}>
                      <Banner tone="error" title="This asset cannot be published">
                        The Guardian found a mismatch against your locked facts. Repair regenerates it
                        deterministically, up to two attempts, then hands it to you.
                      </Banner>
                      <button
                        type="button"
                        className="ws-btn is-small"
                        onClick={() => runRepair(asset.id)}
                        disabled={repair.pending}
                      >
                        {repair.pending ? <Spinner label="Repairing…" /> : <><Wrench size={12} /> Attempt repair</>}
                      </button>
                    </div>
                  ) : null}

                  {report.verdict === 'NEEDS_REVIEW' || report.verdict === 'WARN' ? (
                    <div style={{ marginTop: 12 }}>
                      <Banner tone="warn" title="Needs a human look">
                        A check could not reach a confident conclusion — commonly because OCR or ASR is not
                        installed locally. That is disclosed rather than passed silently. You can accept it
                        yourself, taking responsibility for the call, or publication stays blocked.
                      </Banner>
                      {asset.asset_status === 'human_verified' ? (
                        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '10px 0 0' }}>
                          Recorded as human-verified. The Guardian result above is kept alongside it, and
                          running verification again recomputes the verdict and clears this decision.
                        </p>
                      ) : reviewingAssetId === asset.id ? (
                        <div style={{ marginTop: 10 }}>
                          <label style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                            What did you check? (stored in the audit log)
                            <input
                              type="text"
                              value={reviewNote}
                              onChange={(event) => setReviewNote(event.target.value)}
                              placeholder="e.g. Read the poster — the price and the days match the offer."
                              style={{ display: 'block', width: '100%', marginTop: 6 }}
                            />
                          </label>
                          <div className="ws-asset-foot">
                            <button
                              type="button"
                              className="ws-btn is-primary is-small"
                              onClick={() => runHumanVerify(asset.id)}
                              disabled={humanVerify.pending}
                            >
                              {humanVerify.pending ? (
                                <Spinner label="Recording…" />
                              ) : (
                                <><ShieldCheck size={12} /> Confirm human verification</>
                              )}
                            </button>
                            <button
                              type="button"
                              className="ws-btn is-ghost is-small"
                              onClick={() => {
                                setReviewingAssetId(null);
                                setReviewNote('');
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="ws-btn is-small"
                          onClick={() => {
                            setReviewingAssetId(asset.id);
                            setReviewNote('');
                          }}
                        >
                          <UserCheck size={12} /> I reviewed this — record a human decision
                        </button>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="ws-card">
        <div className="ws-card-head">
          <h3>
            <Award size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
            Verification certificate
          </h3>
        </div>
        <p style={{ marginTop: 0, fontSize: 13.5, color: 'var(--muted)' }}>
          A signed record of what was checked, against which fact hash, and with what verdict.
        </p>
        <ErrorBanner error={certificate.error} title="The certificate was not issued" />
        <button type="button" className="ws-btn is-ghost" onClick={runCertificate} disabled={certificate.pending}>
          {certificate.pending ? <Spinner label="Issuing…" /> : <><FileCheck2 size={14} /> Issue certificate</>}
        </button>

        {cert ? (
          <dl className="ws-kv" style={{ marginTop: 14 }}>
            {Object.entries(cert).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key.replace(/_/g, ' ')}</dt>
                <dd className={typeof value === 'string' && value.startsWith('sha256:') ? 'ws-hash' : undefined}>
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}
