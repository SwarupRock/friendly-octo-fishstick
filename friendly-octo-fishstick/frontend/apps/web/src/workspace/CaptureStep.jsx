import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Type, Upload } from 'lucide-react';
import { createAudioCampaign, createTextCampaign } from '../lib/api';
import { useAsyncAction } from './hooks';
import { Banner, ErrorBanner, Spinner } from './ui';

/**
 * Step B — campaign input.
 *
 * Typed text is always available. Recording is offered only when the browser
 * actually exposes `MediaRecorder` over a secure context; otherwise the UI
 * says so and stays on text rather than simulating a recording.
 */

const LANGUAGE_HINTS = [
  { value: '', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
];

const SAMPLE_BRIEF =
  '20% off cold coffee this Saturday and Sunday, 4 PM to 8 PM at our cafe for college students.';

/** True only where real microphone capture is possible. */
function recordingSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    Boolean(navigator?.mediaDevices?.getUserMedia) &&
    (window.isSecureContext || window.location.hostname === 'localhost')
  );
}

/** Pick a container the current browser can actually produce. */
function preferredMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) ?? '';
}

function formatSeconds(total) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function CaptureStep({ onCreated }) {
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [languageHint, setLanguageHint] = useState('');
  const [recorderError, setRecorderError] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState(() => new Array(28).fill(4));
  const [clip, setClip] = useState(null);
  const [progress, setProgress] = useState('');

  const supported = recordingSupported();
  const { run, pending, error } = useAsyncAction();

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const timerRef = useRef(null);

  const stopMeters = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Release the microphone and the preview URL whatever ends the component.
  useEffect(
    () => () => {
      stopMeters();
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      if (clip?.url) URL.revokeObjectURL(clip.url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopMeters],
  );

  const drawLevels = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buffer = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buffer);
    const bars = 28;
    const step = Math.max(1, Math.floor(buffer.length / bars));
    const next = new Array(bars);
    for (let i = 0; i < bars; i += 1) {
      next[i] = 4 + Math.round((buffer[i * step] / 255) * 28);
    }
    setLevels(next);
    rafRef.current = requestAnimationFrame(drawLevels);
  }, []);

  const startRecording = async () => {
    setRecorderError('');
    if (clip?.url) URL.revokeObjectURL(clip.url);
    setClip(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        rafRef.current = requestAnimationFrame(drawLevels);
      }

      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        stopMeters();
        setLevels(new Array(28).fill(4));
        setRecording(false);
        if (!blob.size) {
          setRecorderError('No audio was captured. Check the microphone and try again.');
          return;
        }
        setClip({ blob, url: URL.createObjectURL(blob), mimeType: blob.type, seconds: elapsed });
      };
      recorder.onerror = () => {
        setRecorderError('Recording stopped unexpectedly. You can type the brief instead.');
        stopMeters();
        setRecording(false);
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);
    } catch (caught) {
      stopMeters();
      setRecording(false);
      // The common case by far is a denied permission prompt; say that plainly.
      const denied = caught?.name === 'NotAllowedError' || caught?.name === 'SecurityError';
      setRecorderError(
        denied
          ? 'Microphone access was declined. Allow it in your browser, or type the brief instead.'
          : 'No microphone is available. Type the brief instead.',
      );
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const onPickFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setRecorderError('');
    if (clip?.url) URL.revokeObjectURL(clip.url);
    setClip({ blob: file, url: URL.createObjectURL(file), mimeType: file.type, seconds: null, name: file.name });
  };

  const submitText = async () => {
    const brief = text.trim();
    if (!brief) {
      setRecorderError('Describe the offer first.');
      return;
    }
    setProgress('Saving the brief and extracting facts…');
    const result = await run(() => createTextCampaign({ text: brief, languageHint: languageHint || undefined }));
    setProgress('');
    if (result.ok) onCreated(result.data);
  };

  const submitAudio = async () => {
    if (!clip?.blob) return;
    setProgress('Uploading audio, transcribing, then extracting facts…');
    const result = await run(() =>
      createAudioCampaign({ blob: clip.blob, mimeType: clip.mimeType, languageHint: languageHint || undefined }),
    );
    setProgress('');
    if (result.ok) onCreated(result.data);
  };

  return (
    <div className="ws-card">
      <div className="ws-card-head">
        <div>
          <span className="ws-kicker">Step 1 · Capture</span>
          <h2>Describe the offer</h2>
        </div>
        <div className="ws-chips">
          <button type="button" className={`ws-chip ${mode === 'text' ? 'is-on' : ''}`} onClick={() => setMode('text')}>
            <Type size={12} style={{ marginRight: 5 }} />
            Type it
          </button>
          <button
            type="button"
            className={`ws-chip ${mode === 'voice' ? 'is-on' : ''}`}
            onClick={() => setMode('voice')}
          >
            <Mic size={12} style={{ marginRight: 5 }} />
            Speak it
          </button>
        </div>
      </div>

      <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 13.5 }}>
        Say the product, the discount or price, when it runs, and who it is for. Svarah extracts those as
        facts for you to confirm — it never fills in a number you did not give it.
      </p>

      <ErrorBanner error={error} title="The campaign was not created" />
      {recorderError ? <Banner tone="warn">{recorderError}</Banner> : null}

      {mode === 'voice' && !supported ? (
        <Banner tone="warn" title="Recording is not available in this browser">
          Microphone capture needs a secure context (https or localhost) and <code>MediaRecorder</code>. You
          can upload an audio file below, or switch to “Type it”.
        </Banner>
      ) : null}

      <div className="ws-field">
        <label htmlFor="capture-language">Spoken language (optional hint)</label>
        <select
          id="capture-language"
          value={languageHint}
          onChange={(event) => setLanguageHint(event.target.value)}
        >
          {LANGUAGE_HINTS.map((item) => (
            <option key={item.value || 'auto'} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {mode === 'text' ? (
        <>
          <div className="ws-field">
            <label htmlFor="capture-text">Offer brief</label>
            <textarea
              id="capture-text"
              value={text}
              placeholder={SAMPLE_BRIEF}
              onChange={(event) => setText(event.target.value)}
            />
            <small>
              Not sure what to write?{' '}
              <button type="button" className="ws-btn is-ghost is-small" onClick={() => setText(SAMPLE_BRIEF)}>
                Use the sample brief
              </button>
            </small>
          </div>
          <button type="button" className="ws-btn is-primary" onClick={submitText} disabled={pending}>
            {pending ? <Spinner label="Working…" /> : 'Extract the facts'}
          </button>
        </>
      ) : (
        <>
          <div className="ws-recorder">
            {supported ? (
              <button
                type="button"
                className={`ws-rec-btn ${recording ? 'is-recording' : ''}`}
                onClick={recording ? stopRecording : startRecording}
                disabled={pending}
              >
                {recording ? <Square size={16} /> : <Mic size={17} />}
                {recording ? 'Stop recording' : 'Start recording'}
              </button>
            ) : null}

            <div className="ws-wave" aria-hidden="true">
              {levels.map((height, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <i key={index} style={{ '--h': `${height}px` }} />
              ))}
            </div>

            <span className="ws-rec-time">{recording ? formatSeconds(elapsed) : clip ? 'Ready' : '0:00'}</span>

            <label className="ws-btn is-ghost is-small" style={{ cursor: 'pointer' }}>
              <Upload size={13} />
              Upload audio
              <input type="file" accept="audio/*" onChange={onPickFile} style={{ display: 'none' }} />
            </label>
          </div>

          {recording ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }} role="status">
              Recording — your microphone is live.
            </p>
          ) : null}

          {clip ? (
            <div style={{ marginTop: 14 }}>
              <audio controls src={clip.url} style={{ width: '100%' }}>
                <track kind="captions" />
              </audio>
              <div className="ws-asset-foot" style={{ marginTop: 12 }}>
                <button type="button" className="ws-btn is-primary" onClick={submitAudio} disabled={pending}>
                  {pending ? <Spinner label="Working…" /> : 'Transcribe and extract facts'}
                </button>
                <button
                  type="button"
                  className="ws-btn is-ghost"
                  disabled={pending}
                  onClick={() => {
                    URL.revokeObjectURL(clip.url);
                    setClip(null);
                  }}
                >
                  Discard clip
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {progress ? (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12 }} role="status">
          {progress}
        </p>
      ) : null}
    </div>
  );
}
