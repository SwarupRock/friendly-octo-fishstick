import { useState } from "react";

import { ApiError } from "../lib/api";
import type { AssetView } from "../lib/types";

interface StudioProps {
  campaignId: number;
  factsheetStatus: string | null;
  onChanged: () => void | Promise<void>;
}

const LANGUAGES = ["English", "Hindi", "Kannada", "Tamil", "Telugu"];

interface PlanSummary {
  is_mock: boolean;
  localization: Array<{ language: string; locale: string }>;
  copy_templates: Record<string, string>;
}

export function Studio({
  campaignId,
  factsheetStatus,
  onChanged,
}: StudioProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [certificate, setCertificate] = useState<Record<string, unknown> | null>(null);
  const [profile, setProfile] = useState<{ id: number; is_mock: boolean } | null>(null);
  const [publishResult, setPublishResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ownerUid = "demo-owner";
  const [language, setLanguage] = useState("English");

  const locked = factsheetStatus === "locked";

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(null);
    }
  };

  const generatePlan = () =>
    run("plan", async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/plan`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).error?.message ?? "plan failed");
      setPlan(await response.json());
    });

  const generateAssets = () =>
    run("assets", async () => {
      await fetch(`/api/campaigns/${campaignId}/assets/posters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variants: 1 }),
      });
      await fetch(`/api/campaigns/${campaignId}/assets/captions`, { method: "POST" });
      const response = await fetch(`/api/campaigns/${campaignId}/assets`);
      setAssets(await response.json());
    });

  const verify = () =>
    run("verify", async () => {
      await fetch(`/api/campaigns/${campaignId}/verify`, { method: "POST" });
      const response = await fetch(`/api/campaigns/${campaignId}/assets`);
      setAssets(await response.json());
    });

  const issueCertificate = () =>
    run("certificate", async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/certificate`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).error?.message ?? "certificate failed");
      setCertificate(await response.json());
    });

  const createMidProfile = () =>
    run("voice-profiles", async () => {
      const response = await fetch("/api/voice-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_uid: ownerUid,
          display_name: "Shopkeeper (demo)",
          consent_confirmed: true,
          consent_record: { source: "in_app_recording", language: "en-IN" },
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error?.message ?? "profile failed");
      const created = await response.json();
      setProfile(created);
    });

  const generateVoice = () =>
    run("voice", async () => {
      if (!profile) throw new Error("Create the demo voice profile first.");
      const response = await fetch(`/api/campaigns/${campaignId}/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profile.id, owner_uid: ownerUid, language }),
      });
      if (!response.ok) throw new Error((await response.json()).error?.message ?? "voice failed");
      const listed = await fetch(`/api/campaigns/${campaignId}/assets`);
      setAssets(await listed.json());
    });

  const prepareSandboxPublish = () =>
    run("publish", async () => {
      const poster = assets.find((a) => a.kind === "poster");
      if (!poster) throw new Error("Generate a poster first.");
      const prepared = await (
        await fetch(`/api/campaigns/${campaignId}/publish/prepare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset_id: poster.id,
            platform: "sandbox",
            media_kind: "image",
            owner_uid: ownerUid,
          }),
        })
      ).json();
      if (prepared.status !== "READY_FOR_REVIEW") {
        setPublishResult(prepared);
        return;
      }
      const approved = await (
        await fetch(`/api/campaigns/publish/${prepared.id}/approve`, { method: "POST" })
      ).json();
      setPublishResult(
        await (
          await fetch(`/api/campaigns/publish/${approved.id}/execute`, { method: "POST" })
        ).json(),
      );
    });

  return (
    <section className="card studio" aria-label="Campaign studio">
      <h2>Campaign studio</h2>
      <p className="studio-note">
        {locked ? "Facts are locked — creative generation is safe." : "Lock the FactSheet first."}
      </p>

      <div className="studio-actions">
        <button type="button" disabled={!locked || busy !== null} onClick={generatePlan}>
          {busy === "plan" ? "Planning…" : "Generate plan"}
        </button>
        <button type="button" disabled={plan === null || busy !== null} onClick={generateAssets}>
          {busy === "assets" ? "Composing…" : "Posters + captions"}
        </button>
        <button type="button" disabled={busy !== null} onClick={createMidProfile}>
          {busy === "voice-profiles" ? "Creating…" : "Create demo voice profile"}
        </button>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={!profile}>
          {LANGUAGES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <button type="button" disabled={!plan || busy !== null} onClick={generateVoice}>
          {busy === "voice" ? "Synthesizing…" : "Generate voice"}
        </button>
        <button type="button" disabled={assets.length === 0 || busy !== null} onClick={verify}>
          {busy === "verify" ? "Verifying…" : "Guardian verify"}
        </button>
        <button type="button" disabled={busy !== null} onClick={issueCertificate}>
          {busy === "certificate" ? "Issuing…" : "Certificate"}
        </button>
        <button type="button" disabled={busy !== null} onClick={prepareSandboxPublish}>
          {busy === "publish" ? "Publishing…" : "Sandbox publish"}
        </button>
      </div>

      {profile && (
        <p className="studio-note">
          Voice profile #{profile.id} — {profile.is_mock ? "MOCK provider (labelled)" : "live provider"}.
        </p>
      )}

      {plan && (
        <div className="studio-plan">
          <h3>
            Plan {plan.is_mock ? "(mock brain, labelled)" : "(live)"} — {plan.localization?.length ?? 0} localization(s)
          </h3>
          <ul>
            {Object.entries(plan.copy_templates ?? {}).map(([channel, template]) => (
              <li key={channel}>
                <b>{channel}</b>: <pre className="tpl">{template}</pre>
              </li>
            ))}
          </ul>
        </div>
      )}

      {assets.length > 0 && (
        <div className="studio-assets">
          <h3>Assets ({assets.length})</h3>
          <table>
            <thead>
              <tr>
                <th>#</th><th>Kind</th><th>Locale</th><th>Status</th><th>Checks</th><th>Labels</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{a.kind}</td>
                  <td>{a.locale}</td>
                  <td>
                    <span className={`status ${a.asset_status}`}>{a.asset_status}</span>
                  </td>
                  <td>
                    {(a.verification ?? []).length === 0
                      ? "—"
                      : (a.verification as Array<{ check: string; verdict: string }>)
                          .map((v) => `${v.check}: ${v.verdict}`)
                          .join(", ")}
                  </td>
                  <td>
                    {a.is_mock ? "MOCK " : ""}
                    {a.used_fallback ? "FALLBACK" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {certificate && (
        <div className="studio-cert">
          <h3>
            Verification Certificate — {String(certificate.verdict)}
          </h3>
          <code>seal {String(certificate.integrity_seal)}</code>
        </div>
      )}

      {publishResult && (
        <pre className="studio-publish">{JSON.stringify(publishResult, null, 2)}</pre>
      )}

      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
