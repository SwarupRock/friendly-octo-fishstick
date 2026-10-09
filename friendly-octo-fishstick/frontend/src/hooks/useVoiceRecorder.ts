import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "recording" | "stopped" | "error";

const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function recorderSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

interface RecorderState {
  status: RecorderStatus;
  seconds: number;
  error: string | null;
  mimeType: string | null;
  supported: boolean;
}

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>({
    status: "idle",
    seconds: 0,
    error: null,
    mimeType: null,
    supported: recorderSupported(),
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const resolveStopRef = useRef<((blob: Blob | null) => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!state.supported) {
      setState((s) => ({
        ...s,
        status: "error",
        error: "Recording is not supported in this browser. Type instead.",
      }));
      return;
    }
    setState((s) => ({ ...s, status: "idle", error: null }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setState((s) => ({ ...s, status: "error", error: "Recording failed." }));
      };
      recorder.onstop = () => {
        clearTimer();
        releaseStream();
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        resolveStopRef.current?.(blob.size > 0 ? blob : null);
        resolveStopRef.current = null;
        setState((s) => (s.status === "error" ? s : { ...s, status: "stopped" }));
      };

      recorderRef.current = recorder;
      recorder.start();
      setState((s) => ({
        ...s,
        status: "recording",
        seconds: 0,
        error: null,
        mimeType: recorder.mimeType || mimeType || null,
      }));
      timerRef.current = window.setInterval(() => {
        setState((s) => ({ ...s, seconds: s.seconds + 1 }));
      }, 1000);
    } catch {
      releaseStream();
      setState((s) => ({
        ...s,
        status: "error",
        error: "Microphone access was denied. Type instead.",
      }));
    }
  }, [clearTimer, releaseStream, state.supported]);

  const stop = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      resolveStopRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    releaseStream();
    recorderRef.current = null;
    chunksRef.current = [];
    setState((s) => ({ ...s, status: "idle", seconds: 0, error: null }));
  }, [clearTimer, releaseStream]);

  useEffect(() => {
    return () => {
      clearTimer();
      releaseStream();
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
    };
  }, [clearTimer, releaseStream]);

  return { ...state, start, stop, reset };
}
