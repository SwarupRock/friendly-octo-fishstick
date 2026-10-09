import { useEffect, useMemo, useState } from "react";

import type { CampaignRead, FactSheet, FactSheetPatch } from "../lib/types";
import {
  ApiError,
  extractFacts,
  lockFactSheet,
  patchFactSheet,
} from "../lib/api";

interface Props {
  campaign: CampaignRead;
  onChanged: () => Promise<void>;
}

/** Ordered field definitions so the form is stable and reviewable. */
const OFFER_FIELDS: Array<{
  key: string;
  path: string;
  label: string;
  kind: "text" | "number" | "time" | "date" | "list";
  placeholder?: string;
}> = [
  { key: "product", path: "offer.product", label: "Product / offer", kind: "list", placeholder: "cold coffee, cake" },
  { key: "discountPercent", path: "offer.discount_percent", label: "Discount %", kind: "number", placeholder: "20" },
  { key: "discountFlat", path: "offer.discount_flat", label: "Flat discount", kind: "number", placeholder: "100" },
  { key: "price", path: "offer.price", label: "Price", kind: "number", placeholder: "499" },
  { key: "quantity", path: "offer.quantity", label: "Quantity", kind: "number", placeholder: "2" },
  { key: "days", path: "offer.days", label: "Days", kind: "list", placeholder: "Saturday, Sunday" },
  { key: "startTime", path: "offer.start_time", label: "Start time", kind: "time", placeholder: "4 PM" },
  { key: "endTime", path: "offer.end_time", label: "End time", kind: "time", placeholder: "8 PM" },
  { key: "dateStart", path: "offer.date_start", label: "Valid from", kind: "date", placeholder: "2026-10-10" },
  { key: "dateEnd", path: "offer.date_end", label: "Valid until", kind: "date", placeholder: "2026-10-12" },
  { key: "audience", path: "offer.audience", label: "Audience", kind: "list", placeholder: "college students" },
  { key: "conditions", path: "offer.conditions", label: "Conditions", kind: "list", placeholder: "for students only" },
  { key: "offerLocation", path: "offer.location", label: "Location", kind: "text", placeholder: "Indiranagar branch" },
];

interface FormState {
  businessName: string;
  businessLocation: string;
  languages: string;
  [key: string]: string;
}

function listToText(values: string[]): string {
  return values.join(", ");
}

function textToList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberish(value: string): number | string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed; // number words are normalized server-side
}

function buildForm(sheet: FactSheet): FormState {
  const offer = sheet.offer;
  return {
    businessName: sheet.business.name ?? "",
    businessLocation: sheet.business.location ?? "",
    languages: listToText(sheet.languages),
    product: listToText(offer.product),
    discountPercent: offer.discount_percent?.toString() ?? "",
    discountFlat: offer.discount_flat?.toString() ?? "",
    price: offer.price?.toString() ?? "",
    quantity: offer.quantity?.toString() ?? "",
    days: listToText(offer.days),
    startTime: offer.start_time ?? "",
    endTime: offer.end_time ?? "",
    dateStart: offer.date_start ?? "",
    dateEnd: offer.date_end ?? "",
    audience: listToText(offer.audience),
    conditions: listToText(offer.conditions),
    offerLocation: offer.location ?? "",
  };
}

function buildPatch(form: FormState): FactSheetPatch {
  const offer: Record<string, unknown> = {
    product: textToList(form.product),
    discount_percent: numberish(form.discountPercent),
    discount_flat: numberish(form.discountFlat),
    price: numberish(form.price),
    quantity: numberish(form.quantity),
    days: textToList(form.days),
    start_time: form.startTime.trim() || null,
    end_time: form.endTime.trim() || null,
    date_start: form.dateStart.trim() || null,
    date_end: form.dateEnd.trim() || null,
    audience: textToList(form.audience),
    conditions: textToList(form.conditions),
    location: form.offerLocation.trim() || null,
  };
  return {
    business: {
      name: form.businessName.trim() || null,
      location: form.businessLocation.trim() || null,
    },
    offer,
    languages: textToList(form.languages),
  };
}

function shortHash(value: string | null): string {
  if (!value) return "—";
  const [, digest = value] = value.split(":");
  return `${value.split(":")[0]}:${digest.slice(0, 16)}…`;
}

export function FactSheetView({ campaign, onChanged }: Props) {
  const sheet = campaign.factsheet;

  const [form, setForm] = useState<FormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Re-initialize the form whenever a different version becomes active.
  useEffect(() => {
    if (sheet) {
      setForm(buildForm(sheet.facts));
      setEditing(false);
      setError(null);
      setNotice(null);
    } else {
      setForm(null);
    }
  }, [sheet?.id, sheet?.version, sheet?.updated_at]);

  const isDraft = sheet?.status === "draft";
  const isLocked = sheet?.status === "locked";
  const readOnly = !isDraft && !editing;

  const baseline = useMemo(() => (sheet ? buildForm(sheet.facts) : null), [sheet]);
  const hasChanges = useMemo(() => {
    if (!form || !baseline) return false;
    return JSON.stringify(form) !== JSON.stringify(baseline);
  }, [form, baseline]);

  const setField = (key: string, value: string) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleError = (err: unknown) => {
    setError(
      err instanceof ApiError
        ? err.message
        : "Something went wrong. Please try again.",
    );
  };

  const handleSave = async () => {
    if (!sheet || !form) return;
    setError(null);
    setNotice(null);
    if (!hasChanges) {
      setNotice("No changes to save.");
      return;
    }
    setSaving(true);
    try {
      const updated = await patchFactSheet(sheet.id, buildPatch(form));
      setEditing(false);
      setNotice(
        updated.status === "locked"
          ? "New draft created. Lock again to seal it."
          : "Draft saved.",
      );
      await onChanged();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleLock = async () => {
    if (!sheet) return;
    setError(null);
    setNotice(null);
    setLocking(true);
    try {
      await lockFactSheet(sheet.id);
      setEditing(false);
      setNotice("Facts locked and sealed.");
      await onChanged();
    } catch (err) {
      handleError(err);
    } finally {
      setLocking(false);
    }
  };

  const handleExtract = async () => {
    setError(null);
    setNotice(null);
    setExtracting(true);
    try {
      await extractFacts(campaign.id);
      await onChanged();
    } catch (err) {
      handleError(err);
    } finally {
      setExtracting(false);
    }
  };

  if (!sheet || !form) {
    return (
      <section className="factsheet">
        <header className="factsheet-head">
          <h2>FactSheet</h2>
        </header>
        <p className="muted">No FactSheet has been extracted yet.</p>
        {campaign.transcript && (
          <button type="button" className="submit" onClick={() => void handleExtract()}>
            {extracting ? "Extracting…" : "Extract facts"}
          </button>
        )}
      </section>
    );
  }

  const facts = sheet.facts;
  const statusClass =
    sheet.status === "locked"
      ? "chip-locked"
      : sheet.status === "superseded"
        ? "chip-superseded"
        : "chip-draft";

  const renderField = (field: (typeof OFFER_FIELDS)[number]) => {
    const inferred = facts.inferred.includes(field.path);
    const confidence = facts.extraction_confidence[field.path];
    const missing = facts.missing.includes(field.path);
    return (
      <label className="field" key={field.key}>
        <span className="field-head">
          <span className="field-label">{field.label}</span>
          {inferred && <span className="tag tag-inferred">inferred</span>}
          {missing && <span className="tag tag-missing">missing</span>}
          {typeof confidence === "number" && (
            <span className="conf" title="model confidence">
              {confidence.toFixed(2)}
            </span>
          )}
        </span>
        <input
          type="text"
          inputMode={field.kind === "number" ? "decimal" : undefined}
          value={form[field.key]}
          placeholder={field.placeholder}
          disabled={readOnly}
          onChange={(event) => setField(field.key, event.target.value)}
        />
      </label>
    );
  };

  return (
    <section className="factsheet">
      <header className="factsheet-head">
        <div>
          <h2>FactSheet</h2>
          <p className="result-sub">
            version <code>{sheet.version}</code> · updated{" "}
            {new Date(sheet.updated_at).toLocaleString()}
          </p>
        </div>
        <span className={`chip ${statusClass}`}>{sheet.status}</span>
      </header>

      {sheet.extraction && sheet.extraction.status !== "ok" && (
        <div className="callout callout-warn">
          <strong>Fact extraction unavailable.</strong>{" "}
          {sheet.extraction.message ?? "Enter the facts manually below."}
        </div>
      )}
      {sheet.extraction?.is_mock && (
        <p className="mock-note">
          <span className="tag tag-mock">mock extraction</span> Review and correct
          every field before locking.
        </p>
      )}

      {facts.ambiguities.length > 0 && (
        <div className="callout callout-warn">
          <strong>Please resolve {facts.ambiguities.length} ambiguous field(s):</strong>
          <ul className="callout-list">
            {facts.ambiguities.map((item, index) => (
              <li key={`${item.field}-${index}`}>
                <code>{item.field}</code> — {item.note}
                {item.candidates.length > 0 && ` (${item.candidates.join(", ")})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {facts.missing.length > 0 && (
        <p className="notice">
          Missing information: {facts.missing.join(", ")}. Fill what you can; only
          product and a price/discount are required to lock.
        </p>
      )}

      <div className="fact-grid">
        <label className="field">
          <span className="field-head">
            <span className="field-label">Business name</span>
            {facts.inferred.includes("business.name") && (
              <span className="tag tag-inferred">inferred</span>
            )}
          </span>
          <input
            type="text"
            value={form.businessName}
            disabled={readOnly}
            onChange={(event) => setField("businessName", event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-head">
            <span className="field-label">Business location</span>
          </span>
          <input
            type="text"
            value={form.businessLocation}
            disabled={readOnly}
            onChange={(event) => setField("businessLocation", event.target.value)}
          />
        </label>
        {OFFER_FIELDS.map(renderField)}
        <label className="field">
          <span className="field-head">
            <span className="field-label">Languages</span>
          </span>
          <input
            type="text"
            value={form.languages}
            placeholder="English, Kannada"
            disabled={readOnly}
            onChange={(event) => setField("languages", event.target.value)}
          />
        </label>
      </div>

      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="notice notice-ok">{notice}</p>}

      <div className="fact-actions">
        {isLocked && !editing && (
          <button type="button" className="secondary" onClick={() => setEditing(true)}>
            Edit facts (new version)
          </button>
        )}
        {isLocked && editing && (
          <>
            <button
              type="button"
              className="secondary"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save as new draft"}
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setEditing(false);
                setForm(buildForm(sheet.facts));
                setNotice(null);
                setError(null);
              }}
            >
              Cancel editing
            </button>
          </>
        )}
        {isDraft && (
          <>
            <button
              type="button"
              className="secondary"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            {campaign.transcript && (
              <button
                type="button"
                className="secondary"
                onClick={() => void handleExtract()}
                disabled={extracting}
              >
                {extracting ? "Extracting…" : "Re-extract"}
              </button>
            )}
            <button
              type="button"
              className="submit submit-inline"
              onClick={() => void handleLock()}
              disabled={locking}
            >
              {locking ? "Locking…" : "Lock these facts"}
            </button>
          </>
        )}
        {!isDraft && !isLocked && (
          <p className="muted">
            This version is historical. Edit the active version to make changes.
          </p>
        )}
      </div>

      {sheet.fact_hash && (
        <div className="seal-panel">
          <div className="seal-row">
            <span className="seal-label">Fact hash</span>
            <code title={sheet.fact_hash}>{shortHash(sheet.fact_hash)}</code>
          </div>
          <div className="seal-row">
            <span className="seal-label">Seal</span>
            <code title={sheet.seal ?? undefined}>{shortHash(sheet.seal)}</code>
            <span
              className={`seal-state ${
                sheet.seal_valid === true
                  ? "seal-ok"
                  : sheet.seal_valid === false
                    ? "seal-bad"
                    : "seal-unknown"
              }`}
            >
              {sheet.seal_valid === true
                ? "verified"
                : sheet.seal_valid === false
                  ? "INVALID"
                  : "not checkable"}
            </span>
          </div>
          {sheet.locked_at && (
            <div className="seal-row">
              <span className="seal-label">Locked at</span>
              <span>{new Date(sheet.locked_at).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {sheet.tokens && Object.keys(sheet.tokens).length > 0 && (
        <div className="tokens">
          <div className="section-label">Fact Tokens</div>
          <div className="token-grid">
            {Object.entries(sheet.tokens).map(([name, value]) => (
              <div className="token" key={name}>
                <code>{`{{${name}}}`}</code>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {campaign.factsheet_versions.length > 1 && (
        <details className="audit">
          <summary>Version history ({campaign.factsheet_versions.length})</summary>
          <ul>
            {campaign.factsheet_versions.map((version) => (
              <li key={version.id}>
                v{version.version} · {version.status}
                {version.fact_hash ? ` · ${shortHash(version.fact_hash)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
