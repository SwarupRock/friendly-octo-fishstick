# Frontend/Backend API Contract

## API Boundary: `POST /campaigns`

The `POST /campaigns` endpoint serves as the primary entry point for turning raw multimodal user intent into a structured system object. 

### Expected Contract (Happy Path)
1. Frontend sends a `CampaignCreate` JSON payload containing `audio_b64`.
2. Backend processes the audio, performs STT, and generates a `FactSheet`.
3. Backend responds with `201 Created` and a `CampaignRead` object containing the `transcript` and `factsheet` schemas.
4. Frontend consumes the `factsheet` data and populates the `FactReviewStep` form.

### Degraded Contract (Error Path)
1. Frontend sends a `CampaignCreate` JSON payload.
2. Backend processes the audio, but the STT provider is unavailable.
3. **Backend behavior:** Instead of returning a `500 Server Error` or `503 Service Unavailable`, the backend swallows the error to preserve the recorded audio. It returns `201 Created`. The `CampaignRead` object contains an `stt` schema indicating failure (`fallback: "typed_text"`), but `transcript` is `null` and `factsheet` is missing.
4. **Frontend behavior:** The frontend API client `useAsyncAction` only checks for HTTP error codes. Since it receives a `201`, `result.ok` is set to `true`. The workspace assumes the happy path completed and pushes the UI state forward. 

## The Disconnect
The core issue is that the API contract implies "201 Created" means "Campaign successfully created and initialized with data." However, the backend treats "201 Created" as "Campaign shell created, but data processing may have been completely skipped." 

The frontend does not inspect the `campaign.stt.status` or verify the existence of the `transcript` before advancing the user to the `facts` step. Because it blindly advances to a view that requires a `FactSheet`, it results in a broken UI state.

If the backend intends to support a "graceful degradation" path, it must either:
a) Ensure a fallback/empty `FactSheet` is always generated so the frontend form can render.
b) Have the frontend recognize the degraded state and redirect the user back to the Capture step or explicitly render the manual entry form without requiring an existing `FactSheet` object.
