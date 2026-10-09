import type { CampaignRead } from "../lib/types";

function shortHash(hash: string | null): string {
  if (!hash) return "—";
  return `${hash.slice(0, 14)}…`;
}

export function ResultPanel({ campaign }: { campaign: CampaignRead }) {
  const stt = campaign.stt;
  const sttFailed = stt && stt.status !== "ok";
  const transcript = campaign.transcript;

  return (
    <section className="result" aria-live="polite">
      <header className="result-head">
        <div>
          <h2>Campaign #{campaign.id}</h2>
          <p className="result-sub">
            status <code>{campaign.status}</code>
            {campaign.input_type ? ` · input ${campaign.input_type}` : ""}
          </p>
        </div>
        <span className={`chip chip-${campaign.status}`}>{campaign.status}</span>
      </header>

      {sttFailed && (
        <div className="callout callout-warn">
          <strong>Speech-to-text unavailable.</strong>{" "}
          {stt?.message ?? "Your recording was saved."} Switch to typed input to
          continue.
        </div>
      )}

      {transcript ? (
        <div className="transcript">
          <div className="transcript-head">
            <span>Transcript</span>
            {transcript.is_mock && <span className="tag tag-mock">mock</span>}
            {transcript.language && <span className="tag">{transcript.language}</span>}
          </div>
          <pre className="transcript-body">{transcript.raw}</pre>
          <dl className="meta-grid">
            <div>
              <dt>Provider</dt>
              <dd>{transcript.provider ?? "—"}</dd>
            </div>
            <div>
              <dt>Hash</dt>
              <dd title={transcript.hash ?? undefined}>{shortHash(transcript.hash)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        !sttFailed && <p className="muted">No transcript captured yet.</p>
      )}

      {campaign.audit_events.length > 0 && (
        <details className="audit">
          <summary>Audit trail ({campaign.audit_events.length})</summary>
          <ul>
            {campaign.audit_events.map((event) => (
              <li key={event.id}>
                <code>{event.event_type}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
