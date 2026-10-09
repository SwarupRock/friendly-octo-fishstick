import { useState } from "react";

import { FactSheetView } from "./components/FactSheetView";
import { HealthBadge } from "./components/HealthBadge";
import { ResultPanel } from "./components/ResultPanel";
import { Studio } from "./components/Studio";
import { VoiceRecorder } from "./components/VoiceRecorder";
import { useHealth } from "./hooks/useHealth";
import { useVoiceRecorder } from "./hooks/useVoiceRecorder";
import {
  ApiError,
  blobToBase64,
  createCampaign,
  getCampaign,
} from "./lib/api";
import type { CampaignRead } from "./lib/types";

type Mode = "speak" | "type";

export default function App() {
  const health = useHealth();
  const recorder = useVoiceRecorder();

  const [mode, setMode] = useState<Mode>(recorder.supported ? "speak" : "type");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CampaignRead | null>(null);

  const handleStop = async () => {
    const blob = await recorder.stop();
    if (blob) setAudioBlob(blob);
  };

  const handleDiscard = () => {
    recorder.reset();
    setAudioBlob(null);
  };

  const canSubmit = mode === "type" ? text.trim().length > 0 : audioBlob !== null;

  const handleSubmit = async () => {    setError(null);
    if (!canSubmit) {
      setError(
        mode === "type" ? "Type your offer first." : "Record your message first.",
      );
      return;
    }
    setSubmitting(true);
    try {
      let result: CampaignRead;
      if (mode === "type") {
        result = await createCampaign({ text: text.trim() });
      } else {
        const audio_b64 = await blobToBase64(audioBlob as Blob);
        result = await createCampaign({
          audio_b64,
          audio_mime: (audioBlob as Blob).type || "audio/webm",
        });
      }
      setCampaign(result);

      if (result.stt && result.stt.status !== "ok") {
        // Graceful fallback: keep the audio, hand the user typed input.
        setMode("type");
      } else {
        setAudioBlob(null);
        recorder.reset();
        if (mode === "type") setText("");
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const refreshCampaign = async () => {
    if (!campaign) return;
    const fresh = await getCampaign(campaign.id);
    setCampaign(fresh);
  };

  return (
    <div className="page">
      <header className="top">
        <span className="brand">TITAN</span>
        <HealthBadge health={health} />
      </header>

      <main>
        <h1>Tell us about your offer.</h1>
        <p className="lede">
          Speak naturally, or type it. Titan captures your exact words first —
          nothing is invented.
        </p>

        <section className="card">
          <div className="mode-switch" role="tablist" aria-label="Input mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "speak"}
              className={mode === "speak" ? "active" : ""}
              disabled={!recorder.supported}
              onClick={() => setMode("speak")}
            >
              Speak
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "type"}
              className={mode === "type" ? "active" : ""}
              onClick={() => setMode("type")}
            >
              Type
            </button>
          </div>

          {mode === "speak" ? (
            <VoiceRecorder
              recorder={recorder}
              hasRecording={audioBlob !== null}
              onStart={() => void recorder.start()}
              onStop={() => void handleStop()}
              onReset={handleDiscard}
            />
          ) : (
            <label className="typed-input">
              <span className="visually-hidden">Your offer</span>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="e.g. 20% off cold coffee this Saturday and Sunday, 4 to 8 PM."
                rows={5}
              />
            </label>
          )}

          {mode === "speak" && (
            <button type="button" className="link-button centered" onClick={() => setMode("type")}>
              Prefer typing? Use typed input
            </button>
          )}

          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            className="submit"
            onClick={() => void handleSubmit()}
            disabled={submitting || !canSubmit}
          >
            {submitting
              ? mode === "speak"
                ? "Transcribing…"
                : "Submitting…"
              : "Capture offer"}
          </button>
        </section>

        {campaign && <ResultPanel campaign={campaign} />}
        {campaign && (
          <FactSheetView campaign={campaign} onChanged={refreshCampaign} />
        )}
        {campaign && (
          <Studio
            campaignId={campaign.id}
            factsheetStatus={campaign.factsheet?.status ?? null}
            onChanged={refreshCampaign}
          />
        )}
      </main>

      <footer className="foot">
        Titan · facts are locked, not regenerated · every asset is verified · humans approve publication
      </footer>
    </div>
  );
}
