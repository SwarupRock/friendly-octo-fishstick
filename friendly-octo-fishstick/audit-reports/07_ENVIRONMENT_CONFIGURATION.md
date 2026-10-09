# Environment Configuration

## The Role of `.env`

The environment configuration plays a massive role in whether this bug manifests in development or production.

### TITAN_MODE
The default `.env.example` specifies `TITAN_MODE=mock`. In mock mode, the STT provider resolves to `MockSTTProvider`, which deterministically returns a successful hardcoded transcript ("Mock transcript: 20% off cold coffee..."). Because it never fails, `campaign.transcript` is always present, `_run_extraction` is always called, and the UI Catch-22 is completely hidden during default local testing.

### TITAN_STT_PROVIDER
If an operator changes `TITAN_MODE=live` but fails to provide a valid `TITAN_SARVAM_API_KEY`, the `auto` resolution logic falls back to `faster-whisper`.
If `faster-whisper` is not installed in the python environment (which is highly likely as it is marked as an "optional" heavy requirement), the `STTUnavailableError` is thrown, triggering the failure cascade.

If an operator explicitly tests `TITAN_STT_PROVIDER=none`, the same failure cascade occurs because the fallback `stt_status_view` is generated and `transcript` is omitted.

## Configuration Conclusion
The bug exists fundamentally in the code logic, but its visibility is heavily masked by the default `mock` environment configuration, making it a severe production-only landmine for operators attempting to use live integrations without optional local fallbacks.
