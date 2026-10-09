import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Edit3, Lock, LockKeyhole, ShieldCheck } from 'lucide-react';
import { lockFactSheet, patchFactSheet } from '../lib/api';
import { useAsyncAction } from './hooks';
import { Banner, ErrorBanner, Spinner } from './ui';

/**
 * Step C — fact review.
 *
 * The owner confirms what Svarah heard before anything is generated from it.
 * Three rules this screen enforces on the client side (the backend enforces
 * them again, and the backend is the authority):
 *
 *  - a locked version is read-only; editing it creates a new draft version;
 *  - fields the extractor could not fill stay visibly empty — never guessed;
 *  - the integrity metadata (hash, seal, version) is shown as-is, including a
 *    failed seal check.
 */

const LANGUAGES = ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Human label for the dotted fact paths the backend reports. */
const FIELD_LABELS = {
  'business.name': 'Business name',
  'business.location': 'Business location',
  'offer.product': 'Product',
  'offer.discount_percent': 'Discount %',
  'offer.discount_flat': 'Flat discount',
  'offer.price': 'Price',
  'offer.quantity': 'Quantity',
  'offer.audience': 'Audience',
  'offer.days': 'Days',
  'offer.date_start': 'Start date',
  'offer.date_end': 'End date',
  'offer.start_time': 'Start time',
  'offer.end_time': 'End time',
  'offer.conditions': 'Conditions',
  'offer.location': 'Offer location',
  languages: 'Languages',
};

const labelFor = (path) => FIELD_LABELS[path] ?? path;

/** `['a','b']` ⇄ `"a, b"` for the comma-separated list inputs. */
const listToText = (value) => (Array.isArray(value) ? value.join(', ') : '');
const textToList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const numberOrNull = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

function draftFrom(facts) {
  const business = facts?.business ?? {};
  const offer = facts?.offer ?? {};
  return {
    businessName: business.name ?? '',
    businessLocation: business.location ?? '',
    product: listToText(offer.product),
    discountPercent: offer.discount_percent ?? '',
    discountFlat: offer.discount_flat ?? '',
    price: offer.price ?? '',
    quantity: offer.quantity ?? '',
    audience: listToText(offer.audience),
    days: Array.isArray(offer.days) ? offer.days : [],
    dateStart: offer.date_start ?? '',
    dateEnd: offer.date_end ?? '',
    startTime: offer.start_time ?? '',
    endTime: offer.end_time ?? '',
    conditions: listToText(offer.conditions),
    offerLocation: offer.location ?? '',
    languages: Array.isArray(facts?.languages) ? facts.languages : [],
  };
}

/** Only send sections the owner actually touched. */
function buildPatch(draft) {
  return {
    business: {
      name: draft.businessName.trim() || null,
      location: draft.businessLocation.trim() || null,
    },
    offer: {
      product: textToList(draft.product),
      discount_percent: numberOrNull(draft.discountPercent),
      discount_flat: numberOrNull(draft.discountFlat),
      price: numberOrNull(draft.price),
      quantity: numberOrNull(draft.quantity),
      audience: textToList(draft.audience),
      days: draft.days,
      date_start: draft.dateStart.trim() || null,
      date_end: draft.dateEnd.trim() || null,
      start_time: draft.startTime.trim() || null,
      end_time: draft.endTime.trim() || null,
      conditions: textToList(draft.conditions),
      location: draft.offerLocation.trim() || null,
    },
    languages: draft.languages,
  };
}

export default function FactReviewStep({ campaign, factsheet, onUpdated, onLocked }) {
  const facts = factsheet?.facts;
  const isLocked = factsheet?.status === 'locked';
  const [draft, setDraft] = useState(() => draftFrom(facts));
  const [editingLocked, setEditingLocked] = useState(false);

  // Re-seed the form whenever the server hands back a different version.
  useEffect(() => {
    setDraft(draftFrom(facts));
    setEditingLocked(false);
  }, [factsheet?.id, factsheet?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAsyncAction();
  const lock = useAsyncAction();

  const missing = useMemo(() => new Set(facts?.missing ?? []), [facts]);
  const inferred = useMemo(() => new Set(facts?.inferred ?? []), [facts]);
  const readOnly = isLocked && !editingLocked;

  const set = (key) => (event) => {
    const value = event?.target?.type === 'checkbox' ? event.target.checked : event.target.value;
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const toggleIn = (key, item) =>
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].includes(item) ? prev[key].filter((v) => v !== item) : [...prev[key], item],
    }));

  const handleSave = async () => {
    const result = await save.run(() => patchFactSheet(factsheet.id, buildPatch(draft)));
    if (result.ok) {
      setEditingLocked(false);
      onUpdated(result.data);
    }
  };

  const handleLock = async () => {
    const result = await lock.run(() => lockFactSheet(factsheet.id));
    if (result.ok) onLocked(result.data);
  };

  if (!factsheet) {
    return (
      <div className="ws-card">
        <Banner tone="warn" title="No fact sheet yet">
          This campaign has no extracted facts. Re-run extraction from the capture step.
        </Banner>
      </div>
    );
  }

  const extraction = factsheet.extraction;
  const fieldClass = (path) => `ws-field ${missing.has(path) ? 'is-missing' : ''}`;
  const hint = (path) => {
    if (missing.has(path)) return 'Svarah did not hear this — add it yourself.';
    if (inferred.has(path)) return 'Inferred from what you said. Confirm or correct it.';
    return null;
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="ws-card">
        <div className="ws-card-head">
          <div>
            <span className="ws-kicker">Step 2 · Confirm the facts</span>
            <h2>What Svarah heard</h2>
          </div>
          <div className="ws-chips">
            <span className={`ws-tag ${isLocked ? 'is-locked' : ''}`}>
              Version {factsheet.version} · {factsheet.status}
            </span>
            {extraction?.is_mock ? <span className="ws-tag is-mock">Offline extractor</span> : null}
          </div>
        </div>

        {extraction && extraction.status !== 'ok' ? (
          <Banner tone="warn" title="Automatic extraction was unavailable">
            {extraction.message || 'Enter the facts manually below.'}
          </Banner>
        ) : null}

        {campaign?.transcript ? (
          <div style={{ marginBottom: 16 }}>
            <span className="ws-stat-label">Transcript</span>
            <div className="ws-readout" style={{ marginTop: 6 }}>
              {campaign.transcript.raw}
            </div>
            <small style={{ color: 'var(--muted)', display: 'block', marginTop: 6 }}>
              {campaign.transcript.provider ? `Source: ${campaign.transcript.provider}` : null}
              {campaign.transcript.is_mock ? ' · offline mock transcription' : null}
            </small>
          </div>
        ) : null}

        {facts?.ambiguities?.length ? (
          <Banner tone="warn" title="Ambiguous details">
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {facts.ambiguities.map((item) => (
                <li key={`${item.field}-${item.note}`}>
                  <b>{labelFor(item.field)}</b>: {item.note}
                  {item.candidates?.length ? ` (${item.candidates.join(' / ')})` : ''}
                </li>
              ))}
            </ul>
          </Banner>
        ) : null}

        {missing.size ? (
          <Banner tone="warn" title={`${missing.size} detail${missing.size === 1 ? '' : 's'} still missing`}>
            {[...missing].map(labelFor).join(', ')}. Svarah will not invent these — add what applies, and
            leave the rest blank.
          </Banner>
        ) : null}

        {readOnly ? (
          <Banner tone="ok" title="These facts are locked">
            A locked version is immutable. Editing it creates a new draft version and supersedes this one —
            any assets already generated become stale and must be regenerated.
            <div style={{ marginTop: 10 }}>
              <button type="button" className="ws-btn is-ghost is-small" onClick={() => setEditingLocked(true)}>
                <Edit3 size={13} /> Edit as a new version
              </button>
            </div>
          </Banner>
        ) : null}

        <ErrorBanner error={save.error} title="The edit was not saved" />

        <fieldset
          disabled={readOnly}
          style={{ border: 0, padding: 0, margin: 0, opacity: readOnly ? 0.72 : 1 }}
        >
          <div className="ws-grid cols-2">
            <div>
              <div className={fieldClass('business.name')}>
                <label htmlFor="f-business-name">Business name</label>
                <input id="f-business-name" type="text" value={draft.businessName} onChange={set('businessName')} />
                {hint('business.name') ? <small>{hint('business.name')}</small> : null}
              </div>

              <div className={fieldClass('offer.product')}>
                <label htmlFor="f-product">Product or service</label>
                <input
                  id="f-product"
                  type="text"
                  value={draft.product}
                  placeholder="cold coffee, iced tea"
                  onChange={set('product')}
                />
                <small>{hint('offer.product') ?? 'Comma-separated.'}</small>
              </div>

              <div className="ws-grid cols-3" style={{ gap: 12 }}>
                <div className={fieldClass('offer.discount_percent')}>
                  <label htmlFor="f-discount-pct">Discount %</label>
                  <input
                    id="f-discount-pct"
                    type="number"
                    min="0"
                    max="100"
                    value={draft.discountPercent}
                    onChange={set('discountPercent')}
                  />
                </div>
                <div className="ws-field">
                  <label htmlFor="f-discount-flat">Flat off</label>
                  <input id="f-discount-flat" type="number" min="0" value={draft.discountFlat} onChange={set('discountFlat')} />
                </div>
                <div className="ws-field">
                  <label htmlFor="f-price">Price</label>
                  <input id="f-price" type="number" min="0" value={draft.price} onChange={set('price')} />
                </div>
              </div>
              <small style={{ color: 'var(--muted)', display: 'block', marginTop: -6, marginBottom: 14 }}>
                At least one of discount, flat-off or price is required to lock.
              </small>

              <div className={fieldClass('offer.audience')}>
                <label htmlFor="f-audience">Audience</label>
                <input
                  id="f-audience"
                  type="text"
                  value={draft.audience}
                  placeholder="college students"
                  onChange={set('audience')}
                />
                {hint('offer.audience') ? <small>{hint('offer.audience')}</small> : null}
              </div>
            </div>

            <div>
              <div className={fieldClass('offer.days')}>
                <span id="f-days-label">Days</span>
                <div className="ws-chips" role="group" aria-labelledby="f-days-label">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      className={`ws-chip ${draft.days.includes(day) ? 'is-on' : ''}`}
                      aria-pressed={draft.days.includes(day)}
                      onClick={() => toggleIn('days', day)}
                      disabled={readOnly}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
                {hint('offer.days') ? <small>{hint('offer.days')}</small> : null}
              </div>

              <div className="ws-grid cols-2" style={{ gap: 12 }}>
                <div className={fieldClass('offer.start_time')}>
                  <label htmlFor="f-start-time">Opens</label>
                  <input id="f-start-time" type="time" value={draft.startTime} onChange={set('startTime')} />
                </div>
                <div className={fieldClass('offer.end_time')}>
                  <label htmlFor="f-end-time">Closes</label>
                  <input id="f-end-time" type="time" value={draft.endTime} onChange={set('endTime')} />
                </div>
                <div className={fieldClass('offer.date_start')}>
                  <label htmlFor="f-date-start">From date</label>
                  <input id="f-date-start" type="date" value={draft.dateStart} onChange={set('dateStart')} />
                </div>
                <div className={fieldClass('offer.date_end')}>
                  <label htmlFor="f-date-end">To date</label>
                  <input id="f-date-end" type="date" value={draft.dateEnd} onChange={set('dateEnd')} />
                </div>
              </div>

              <div className={fieldClass('offer.location')}>
                <label htmlFor="f-offer-location">Location</label>
                <input id="f-offer-location" type="text" value={draft.offerLocation} onChange={set('offerLocation')} />
                {hint('offer.location') ? <small>{hint('offer.location')}</small> : null}
              </div>

              <div className="ws-field">
                <label htmlFor="f-conditions">Conditions</label>
                <input
                  id="f-conditions"
                  type="text"
                  value={draft.conditions}
                  placeholder="dine-in only"
                  onChange={set('conditions')}
                />
                <small>Comma-separated. These are printed verbatim.</small>
              </div>

              <div className={fieldClass('languages')}>
                <span id="f-langs-label">Languages to publish in</span>
                <div className="ws-chips" role="group" aria-labelledby="f-langs-label">
                  {LANGUAGES.map((language) => (
                    <button
                      key={language}
                      type="button"
                      className={`ws-chip ${draft.languages.includes(language) ? 'is-on' : ''}`}
                      aria-pressed={draft.languages.includes(language)}
                      onClick={() => toggleIn('languages', language)}
                      disabled={readOnly}
                    >
                      {language}
                    </button>
                  ))}
                </div>
                {hint('languages') ? <small>{hint('languages')}</small> : null}
              </div>
            </div>
          </div>
        </fieldset>

        {!readOnly ? (
          <div className="ws-asset-foot" style={{ marginTop: 10 }}>
            <button type="button" className="ws-btn is-ghost" onClick={handleSave} disabled={save.pending}>
              {save.pending ? <Spinner label="Saving…" /> : 'Save corrections'}
            </button>
            {!isLocked ? (
              <button type="button" className="ws-btn is-primary" onClick={handleLock} disabled={lock.pending}>
                {lock.pending ? <Spinner label="Locking…" /> : <><Lock size={14} /> Lock these facts</>}
              </button>
            ) : null}
          </div>
        ) : null}

        <ErrorBanner error={lock.error} title="These facts could not be locked" />
      </div>

      {isLocked ? <IntegrityCard factsheet={factsheet} /> : null}

      {campaign?.factsheet_versions?.length > 1 ? (
        <div className="ws-card">
          <div className="ws-card-head">
            <h3>Version history</h3>
          </div>
          <dl className="ws-kv">
            {campaign.factsheet_versions.map((version) => (
              <React.Fragment key={version.id}>
                <dt>
                  v{version.version} · {version.status}
                </dt>
                <dd className="ws-hash">{version.fact_hash || '—'}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

/** Lock-time integrity metadata, including a failed seal check. */
function IntegrityCard({ factsheet }) {
  const sealValid = factsheet.seal_valid;
  return (
    <div className="ws-card">
      <div className="ws-card-head">
        <h3>
          <LockKeyhole size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
          Fact integrity
        </h3>
        {sealValid === true ? (
          <span className="ws-tag is-pass">
            <ShieldCheck size={11} /> Seal verified
          </span>
        ) : sealValid === false ? (
          <span className="ws-tag is-fail">
            <AlertTriangle size={11} /> Seal invalid
          </span>
        ) : (
          <span className="ws-tag">Seal not verifiable</span>
        )}
      </div>

      {sealValid === false ? (
        <Banner tone="error" title="These facts failed seal re-verification">
          The stored facts no longer match their signature. Campaign planning is refused until this is
          resolved — re-enter and re-lock the facts.
        </Banner>
      ) : null}
      {sealValid === null ? (
        <Banner tone="warn">
          No signing secret is configured on the backend, so the seal cannot be re-checked. Set
          <span className="ws-mono"> TITAN_SEAL_SECRET</span> and lock again.
        </Banner>
      ) : null}

      <dl className="ws-kv">
        <dt>Locked at</dt>
        <dd>{factsheet.locked_at ? new Date(factsheet.locked_at).toLocaleString() : '—'}</dd>
        <dt>Fact hash</dt>
        <dd className="ws-hash">{factsheet.fact_hash || '—'}</dd>
        <dt>Seal</dt>
        <dd className="ws-hash">{factsheet.seal || '—'}</dd>
        <dt>Algorithm</dt>
        <dd>{factsheet.seal_algorithm || '—'}</dd>
      </dl>

      {factsheet.tokens ? (
        <div style={{ marginTop: 14 }}>
          <span className="ws-stat-label">Approved fact tokens</span>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 8px' }}>
            Copy is written against these tokens only. Literal values are substituted at render time.
          </p>
          <dl className="ws-kv">
            {Object.entries(factsheet.tokens).map(([token, value]) => (
              <React.Fragment key={token}>
                <dt className="ws-mono">{`{{${token}}}`}</dt>
                <dd>{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
