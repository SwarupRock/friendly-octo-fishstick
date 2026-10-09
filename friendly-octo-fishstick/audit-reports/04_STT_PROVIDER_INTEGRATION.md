# STT Provider Integration

## Provider Abstraction
The system utilizes a strategy pattern to manage Speech-to-Text capabilities, abstracting the implementation details inside `backend/app/services/stt.py`.

The active provider is determined by the `TITAN_STT_PROVIDER` environment variable, which defaults to `auto`.

### Provider Implementations
1. **MockSTTProvider (`mock`)**: 
   - Used when `TITAN_MODE=mock`.
   - Deterministically returns a hardcoded mock transcript ("Mock transcript: 20% off cold coffee...").
   - Cannot fail.

2. **SarvamSaarasSTTProvider (`sarvam`)**:
   - The primary live API provider.
   - Requires valid `TITAN_SARVAM_API_KEY`.
   - Makes a multipart form-data POST request to `https://api.sarvam.ai/speech-to-text`.

3. **FasterWhisperSTTProvider (`faster-whisper`)**:
   - The primary offline fallback provider.
   - Relies on the `faster-whisper` Python package.
   - Performs inference locally.

## The Integration Failure Point
The `auto` resolution logic attempts to utilize Sarvam in live mode. If Sarvam is not configured, it drops down to `faster-whisper`. 

The `faster-whisper` package is an heavy, optional dependency. When the backend attempts to load it using `from faster_whisper import WhisperModel`, an `ImportError` is frequently raised if the dependency is not installed. 

This `ImportError` is caught by `_load_model()` and intentionally re-raised as an `STTUnavailableError("faster-whisper is not installed. Install the optional requirements or use typed input.")`. 

This specific error triggers the graceful degradation path in the `POST /campaigns` router, setting off the chain reaction that breaks the frontend workflow.
