# Failure Mode Analysis

## The Incident
The user initiates the campaign creation workflow by recording audio in the UI. Upon stopping and clicking the submission button, the UI displays a loading state ("Uploading audio, transcribing, then extracting facts…"). The loading state clears, and the UI advances to the next step—seemingly indicating success. However, the workflow abruptly halts. The user is told to "Re-run extraction," but is functionally blocked from proceeding or entering data manually.

## Event Trace

1. **Audio Submission**: `CaptureStep.jsx` collects the audio blob, encodes it to base64, and calls the API client method `createAudioCampaign`.
2. **Backend Reception**: The `POST /campaigns` route in `backend/app/api/campaigns.py` receives the payload.
3. **STT Invocation & Failure**: The backend fetches the STT provider and attempts transcription. If the provider is unavailable (e.g., Sarvam API keys are missing, or the `faster-whisper` local package is not installed), an `STTUnavailableError` is raised.
4. **Graceful Error Suppression**: The backend catches `STTUnavailableError`. Instead of aborting the request, it creates a fallback `STTStatus` object indicating that the provider is unavailable and the user should use "typed_text". 
5. **Extraction Bypassed**: Because transcription failed, the `campaign.transcript` attribute is `None`. The backend explicitly skips calling `_run_extraction()` if there is no transcript. 
6. **No FactSheet Created**: Because `_run_extraction()` is bypassed, no `FactSheet` object is committed to the database.
7. **201 Created Response**: The backend serializes the campaign (which is now missing both a transcript and a FactSheet) and successfully returns a `201 Created` HTTP response.
8. **Frontend State Transition**: The `createAudioCampaign` API call resolves without an error. `result.ok` is true. `Workspace.jsx` calls `onOpen(campaign.id)`. The component `CampaignDetail` renders with `step` initialized to `'facts'`.
9. **The Trap**: `CampaignDetail` renders `FactReviewStep.jsx`. However, `FactReviewStep.jsx` includes a short-circuit check: `if (!factsheet) { return <Banner>No fact sheet yet... Re-run extraction</Banner>; }`. This prevents the manual input form from rendering. The user is trapped because re-running extraction is also impossible without a transcript.

## Root Cause Summary
The failure is caused by a misalignment between the backend's "graceful degradation" logic and the frontend's strict structural expectations. The backend gracefully suppresses the error, but the frontend's UI components assume that a successful 201 response guarantees the existence of a `FactSheet`.
