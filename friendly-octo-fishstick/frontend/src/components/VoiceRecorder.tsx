import type { useVoiceRecorder } from "../hooks/useVoiceRecorder";

type Recorder = ReturnType<typeof useVoiceRecorder>;

interface Props {
  recorder: Recorder;
  hasRecording: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function VoiceRecorder({ recorder, hasRecording, onStart, onStop, onReset }: Props) {
  const recording = recorder.status === "recording";

  if (!recorder.supported) {
    return (
      <div className="recorder recorder-unsupported">
        <p className="notice">
          Recording isn’t available in this browser. Use the typed input below.
        </p>
      </div>
    );
  }

  return (
    <div className="recorder">
      <button
        type="button"
        className={`mic-button ${recording ? "is-recording" : ""}`}
        onClick={recording ? onStop : onStart}
        aria-label={recording ? "Stop recording" : "Start recording"}
      >
        <span className="mic-ring" aria-hidden="true" />
        <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
          {recording ? (
            <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
          ) : (
            <path
              d="M12 15a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v5.5A3.5 3.5 0 0 0 12 15Zm6-3.5a6 6 0 0 1-12 0M12 18v3m-3 0h6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      <div className="recorder-meta">
        <span className={`recorder-status status-${recorder.status}`}>
          {recording ? "Recording" : hasRecording ? "Recording ready" : "Ready"}
        </span>
        <span className="recorder-timer">
          {formatDuration(recorder.seconds)}
          {recorder.mimeType ? ` · ${recorder.mimeType.split(";")[0]}` : ""}
        </span>
      </div>

      {(recording || hasRecording) && (
        <button type="button" className="link-button" onClick={onReset}>
          Discard
        </button>
      )}

      {recorder.error && <p className="notice notice-error">{recorder.error}</p>}
    </div>
  );
}
