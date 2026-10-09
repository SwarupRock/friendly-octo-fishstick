# Executive Summary

## Goal of Audit
This forensic audit investigated the root cause of the critical failure in the Svarah.ai campaign creation workflow. The user reported that after speaking into the application and receiving confirmation that the voice was captured, the downstream workflow would not complete.

## Root Cause
The root cause is a Catch-22 state-transition bug between the frontend and backend caused by silent, graceful degradation of the STT (Speech-to-Text) provider. 

When the primary STT provider is unavailable or falls back to a local model (e.g., `faster-whisper`) that is not installed, the backend gracefully catches the `STTUnavailableError`. It suppresses the error, skips transcript generation, and returns a `201 Created` HTTP response to the frontend with an empty transcript, instructing the user to type their input manually. 

However, because the `transcript` field is empty, the backend skips the `_run_extraction` routine entirely, failing to generate a `FactSheet` object for the campaign.

The frontend receives the `201 Created` response, considers the campaign creation successful, and automatically navigates the user to the `facts` step (`FactReviewStep.jsx`). The `FactReviewStep` component expects a `factsheet` to exist. When it finds that `factsheet` is null, it displays a warning instructing the user to "Re-run extraction from the capture step," and outright refuses to render the manual entry form. 

If the user attempts to re-run extraction, the backend rejects the request because the campaign has no transcript. The user is thus trapped in an unresolvable loop.

## Immediate Action
To resolve this issue, the implementation agent (GLM 5.3 Flash) must address the frontend state transitions and backend extraction behavior so that the user can seamlessly fallback to manual input without being blocked by a missing `FactSheet`.

## Next Steps
The subsequent reports provide an in-depth breakdown of the architecture, the failure trace, provider integration issues, and a detailed repair plan.
