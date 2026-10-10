import React, { useMemo, useState } from 'react';
import { Check, Copy, Sparkles, Wand2 } from 'lucide-react';
import { createPlan } from '../lib/api';
import { copyText, useAsyncAction } from './hooks';
import { Banner, EmptyState, ErrorBanner, Spinner } from './ui';

/**
 * Step D — campaign planning.
 *
 * The plan the backend stores is tokenized: templates reference `{{DISCOUNT}}`
 * rather than "20%". This screen shows both the template and the substituted
 * result so it is obvious which parts are creative and which are facts.
 *
 * The owner can steer the Campaign Director with an objective, a tone and
 * free-form instructions. Those only shape the writing: a number or claim that
 * is not in the locked facts is rejected by the backend's plan validation.
 */

const OBJECTIVES = [
  { value: 'footfall', label: 'Bring people into the shop' },
  { value: 'sales', label: 'Sell more of this product' },
  { value: 'awareness', label: 'Make the shop better known' },
  { value: 'launch', label: 'Launch something new' },
  { value: 'festival', label: 'Festival / seasonal push' },
  { value: 'loyalty', label: 'Reward regular customers' },
];

/** Objective, tone and instructions for the Campaign Director. */
function BriefFields({ brief, setBrief, disabled }) {
  const set = (key) => (event) => setBrief((prev) => ({ ...prev, [key]: event.target.value }));
  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: '0 0 14px', textAlign: 'left' }}>
      <div className="ws-grid cols-2">
        <div className="ws-field">
          <label htmlFor="plan-objective">Campaign goal</label>
          <select id="plan-objective" value={brief.objective} onChange={set('objective')}>
            {OBJECTIVES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="ws-field">
          <label htmlFor="plan-tone">Tone (optional)</label>
          <input
            id="plan-tone"
            type="text"
            maxLength={120}
            value={brief.tone}
            placeholder="warm, playful, premium…"
            onChange={set('tone')}
          />
        </div>
      </div>
      <div className="ws-field">
        <label htmlFor="plan-instructions">Anything else the writer should know (optional)</label>
        <textarea
          id="plan-instructions"
          maxLength={600}
          value={brief.instructions}
          placeholder="Mention that we are family-run. Keep it short."
          onChange={set('instructions')}
        />
        <small>Style guidance only. Prices, discounts and dates always come from your locked facts.</small>
      </div>
    </fieldset>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      className="ws-btn is-ghost is-small"
      onClick={async () => {
        setCopied(await copyText(text));
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
    </button>
  );
}

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

/** Fill `{{TOKEN}}` spans with the locked fact values; unknown tokens stay as written. */
function fillTokens(text, tokens) {
  return String(text ?? '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, name) => tokens?.[name] ?? match);
}

export default function PlanStep({ campaignId, factsLocked, plan, substituted, tokens, onPlanned }) {
  const { run, pending, error } = useAsyncAction();
  const [brief, setBrief] = useState(() => ({
    objective: plan?.brief?.objective ?? 'footfall',
    tone: plan?.brief?.tone ?? '',
    instructions: plan?.brief?.instructions ?? '',
  }));

  const generate = async ({ regenerate = false } = {}) => {
    const result = await run(() =>
      createPlan(campaignId, {
        objective: brief.objective,
        tone: brief.tone.trim(),
        instructions: brief.instructions.trim(),
        regenerate,
      }),
    );
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
            <div style={{ width: '100%', maxWidth: 640 }}>
              <BriefFields brief={brief} setBrief={setBrief} disabled={pending} />
              <button type="button" className="ws-btn is-primary" onClick={() => generate()} disabled={pending}>
                {pending ? <Spinner label="Writing the plan…" /> : 'Generate the campaign plan'}
              </button>
              {pending ? (
                <small style={{ color: 'var(--muted)', display: 'block', marginTop: 8 }} role="status">
                  The Campaign Director is planning. Its output is checked against your facts before it
                  is saved, so this can take up to a minute.
                </small>
              ) : null}
            </div>
          }
        >
          The Campaign Director drafts the angle, the per-channel copy, the poster and video briefs and the
          voice script. Numbers, dates and prices come from your locked facts, not from the model.
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
            <h2>{fillTokens(plan.strategy?.angle, tokens) || 'Campaign plan'}</h2>
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
          <p style={{ marginTop: 0, fontSize: 13.5, color: 'var(--muted)' }}>{fillTokens(plan.strategy.rationale, tokens)}</p>
        ) : null}

        <Banner tone="info" title="Facts are not editable here">
          Templates below use approved fact tokens. To change a number or a date, edit the facts in step 2 —
          that creates a new version and the copy is rebuilt against it.
        </Banner>

        {plan.missing_information?.length ? (
          <Banner tone="warn" title="The Director would like to know">
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {plan.missing_information.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            Nothing was made up to fill these gaps. Add what applies in step 2 and plan again.
          </Banner>
        ) : null}

        <ErrorBanner error={error} title="A new plan was not generated — the current one is unchanged" />
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 13, cursor: 'pointer' }}>Change the brief and write a new version</summary>
          <div style={{ marginTop: 12 }}>
            <BriefFields brief={brief} setBrief={setBrief} disabled={pending} />
            <button
              type="button"
              className="ws-btn is-ghost is-small"
              onClick={() => generate({ regenerate: true })}
              disabled={pending}
            >
              {pending ? <Spinner label="Writing a new version…" /> : <><Sparkles size={13} /> Write a new plan version</>}
            </button>
            <small style={{ color: 'var(--muted)', display: 'block', marginTop: 6 }}>
              Version {plan.version}. Assets already created keep pointing at the version they were built from.
            </small>
          </div>
        </details>
      </div>

      <div className="ws-card">
        <div className="ws-card-head">
          <h3>Channel copy</h3>
          <span className="ws-tag">master · English</span>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          {Object.entries(plan.copy ?? {}).map(([channel, item]) => (
            <article key={channel}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span className="ws-stat-label">{CHANNEL_LABELS[channel] ?? channel}</span>
                <CopyButton text={master[channel]} />
              </div>
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
            <span className="ws-tag">
              {Object.keys(localized).length} {Object.keys(localized).length === 1 ? 'language' : 'languages'}
            </span>
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

      {plan.video_brief?.prompt ? (
        <div className="ws-card">
          <div className="ws-card-head">
            <h3>Video brief</h3>
          </div>
          {plan.video_brief.concept ? (
            <p style={{ marginTop: 0, fontSize: 13.5 }}>{plan.video_brief.concept}</p>
          ) : null}
          <div className="ws-readout">{plan.video_brief.prompt}</div>
          <small style={{ color: 'var(--muted)' }}>
            Used by “Generate an AI video” in the next step. It describes a scene only — no text or numbers.
          </small>
        </div>
      ) : null}
    </div>
  );
}
