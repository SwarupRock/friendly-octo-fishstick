import React, { useMemo } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { createPlan } from '../lib/api';
import { useAsyncAction } from './hooks';
import { Banner, EmptyState, ErrorBanner, Spinner } from './ui';

/**
 * Step D — campaign planning.
 *
 * The plan the backend stores is tokenized: templates reference `{{DISCOUNT}}`
 * rather than "20%". This screen shows both the template and the substituted
 * result so it is obvious which parts are creative and which are facts.
 */

const CHANNEL_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  whatsapp: 'WhatsApp',
  poster_headline: 'Poster headline',
  poster_subline: 'Poster subline',
  reel_script: 'Reel script',
  voice_script: 'Voice script',
};

/** Highlight `{{TOKEN}}` spans inside a template string. */
function TokenizedTemplate({ template }) {
  const parts = useMemo(() => String(template ?? '').split(/(\{\{\s*[A-Za-z0-9_]+\s*\}\})/g), [template]);
  return (
    <span className="ws-mono">
      {parts.map((part, index) =>
        /^\{\{\s*[A-Za-z0-9_]+\s*\}\}$/.test(part) ? (
          // eslint-disable-next-line react/no-array-index-key
          <mark key={index} className="ws-token">
            {part}
          </mark>
        ) : (
          // eslint-disable-next-line react/no-array-index-key
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </span>
  );
}

export default function PlanStep({ campaignId, factsLocked, plan, substituted, onPlanned }) {
  const { run, pending, error } = useAsyncAction();

  const generate = async () => {
    const result = await run(() => createPlan(campaignId));
    if (result.ok) onPlanned(result.data);
  };

  if (!factsLocked) {
    return (
      <div className="ws-card">
        <Banner tone="warn" title="Lock the facts first">
          The campaign brain only writes against locked, sealed facts. Go back to step 2, confirm what Svarah
          heard, and lock it.
        </Banner>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="ws-card">
        <ErrorBanner error={error} title="The plan was not generated" />
        <EmptyState
          icon={Wand2}
          title="No campaign plan yet"
          action={
            <button type="button" className="ws-btn is-primary" onClick={generate} disabled={pending}>
              {pending ? <Spinner label="Writing the plan…" /> : 'Generate the campaign plan'}
            </button>
          }
        >
          Svarah drafts the angle, the per-channel copy and the poster brief. Numbers, dates and prices come
          from your locked facts, not from the model.
        </EmptyState>
      </div>
    );
  }

  const master = substituted?.master ?? {};
  const localized = substituted?.localized ?? {};

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="ws-card">
        <div className="ws-card-head">
          <div>
            <span className="ws-kicker">Step 3 · Plan</span>
            <h2>{plan.strategy?.angle || 'Campaign plan'}</h2>
          </div>
          <div className="ws-chips">
            {plan.is_mock ? <span className="ws-tag is-mock">Offline campaign brain</span> : null}
            <span className="ws-tag">
              {plan.provider}
              {plan.model ? ` · ${plan.model}` : ''}
            </span>
          </div>
        </div>

        {plan.strategy?.rationale ? (
          <p style={{ marginTop: 0, fontSize: 13.5, color: 'var(--muted)' }}>{plan.strategy.rationale}</p>
        ) : null}

        <Banner tone="info" title="Facts are not editable here">
          Templates below use approved fact tokens. To change a number or a date, edit the facts in step 2 —
          that creates a new version and the copy is rebuilt against it.
        </Banner>

        <ErrorBanner error={error} title="Regeneration failed" />
        <button type="button" className="ws-btn is-ghost is-small" onClick={generate} disabled={pending}>
          {pending ? <Spinner label="Working…" /> : <><Sparkles size={13} /> Reload plan</>}
        </button>
      </div>

      <div className="ws-card">
        <div className="ws-card-head">
          <h3>Channel copy</h3>
          <span className="ws-tag">master · English</span>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          {Object.entries(plan.copy ?? {}).map(([channel, item]) => (
            <article key={channel}>
              <span className="ws-stat-label">{CHANNEL_LABELS[channel] ?? channel}</span>
              <div className="ws-readout" style={{ marginTop: 5 }}>
                {master[channel] ?? '—'}
              </div>
              <details style={{ marginTop: 6 }}>
                <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
                  Show the tokenized template
                </summary>
                <div style={{ marginTop: 6 }}>
                  <TokenizedTemplate template={item.template} />
                </div>
              </details>
            </article>
          ))}
        </div>
      </div>

      {Object.keys(localized).length ? (
        <div className="ws-card">
          <div className="ws-card-head">
            <h3>Localized copy</h3>
            <span className="ws-tag">{Object.keys(localized).length} languages</span>
          </div>
          <div className="ws-grid cols-2">
            {Object.entries(localized).map(([language, channels]) => (
              <section key={language}>
                <span className="ws-stat-label">{language}</span>
                <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
                  {Object.entries(channels).map(([channel, text]) => (
                    <div key={channel}>
                      <small style={{ color: 'var(--muted)' }}>{CHANNEL_LABELS[channel] ?? channel}</small>
                      <div className="ws-readout" style={{ marginTop: 3 }}>
                        {text}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}

      {plan.poster_briefs?.length ? (
        <div className="ws-card">
          <div className="ws-card-head">
            <h3>Poster brief</h3>
          </div>
          {plan.poster_briefs.map((brief, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} style={{ marginBottom: 10 }}>
              <div className="ws-readout">{brief.art_prompt}</div>
              {brief.overlay_layout ? (
                <small style={{ color: 'var(--muted)' }}>Layout: {brief.overlay_layout}</small>
              ) : null}
            </div>
          ))}
          <small style={{ color: 'var(--muted)' }}>
            Art prompts deliberately forbid text. Every word on the poster is drawn from your locked facts by
            the composer, so the image model can never introduce a number.
          </small>
        </div>
      ) : null}
    </div>
  );
}
