# Repair Plan for Implementation Agent (GLM 5.3 Flash)

## Overview
This document provides actionable steps for the implementation agent to fix the UI Catch-22 state-transition bug without rewriting large portions of the system. 

The goal is to ensure that when STT fails or is unavailable, the user can successfully input their facts manually in the `FactReviewStep` without being blocked.

## Step 1: Guarantee FactSheet Creation (Backend)
Modify the `POST /campaigns` logic in `backend/app/api/campaigns.py` to ensure that a fallback `FactSheet` is ALWAYS created, even if `campaign.transcript` is empty.

**Current Logic:**
```python
    db.commit()
    if campaign.transcript:
        await _run_extraction(db, campaign, settings, business_name=shop.name)
    return _serialize(db, campaign, stt=stt_status_view)
```

**Proposed Change:**
Instead of bypassing extraction entirely, ensure a fallback `FactSheet` is committed to the campaign.
```python
    db.commit()
    if campaign.transcript:
        await _run_extraction(db, campaign, settings, business_name=shop.name)
    else:
        # Guarantee a FactSheet exists so the frontend can render the manual form.
        from ..services.extraction import normalize_fact_data, record_extraction
        fallback = normalize_fact_data({})
        record_extraction(
            db, 
            campaign, 
            extracted=None, 
            extraction={"status": "unavailable", "message": "No transcript available."}, 
            fallback_facts=fallback
        )
    return _serialize(db, campaign, stt=stt_status_view)
```
*Note: Verify the imports and exact function signatures for `normalize_fact_data` and `record_extraction` in `backend/app/api/campaigns.py`.*

## Step 2: Handle Missing Transcripts Gracefully (Frontend)
While Step 1 guarantees the form will render, the UI must also clearly inform the user why they are looking at an empty form. In `frontend/apps/web/src/workspace/FactReviewStep.jsx`, update the short-circuit logic so it doesn't instruct the user to "Re-run extraction" when STT failed.

**Current Logic:**
```javascript
  if (!factsheet) {
    return (
      <div className="ws-card">
        <Banner tone="warn" title="No fact sheet yet">
          This campaign has no extracted facts. Re-run extraction from the capture step.
        </Banner>
      </div>
    );
  }
```

**Proposed Change:**
Because Step 1 will ensure `factsheet` is not null, this short-circuit will naturally be bypassed. However, ensure the user understands they must enter facts manually if extraction was skipped. The existing code handles extraction errors nicely:
```javascript
        {extraction && extraction.status !== 'ok' ? (
          <Banner tone="warn" title="Automatic extraction was unavailable">
            {extraction.message || 'Enter the facts manually below.'}
          </Banner>
        ) : null}
```
This existing block will naturally activate if Step 1 populates `extraction={"status": "unavailable", ...}`.

## Step 3: Frontend Step Navigation Fix
Optionally, in `frontend/apps/web/src/workspace/Workspace.jsx`, you may conditionally set the starting step of a newly created campaign based on the STT result. If STT fails, you might want to force the user to view the `capture` step first to see the `STT unavailable` message, or just let them stay on `facts` since the empty form will now be available. 
Because `CampaignTranscript` specifically says "Enter the facts by hand in the next step," leaving the default step as `facts` is logically sound, provided the form is rendered (which Step 1 achieves).

## Summary
By enforcing the creation of a fallback `FactSheet` on the backend, the frontend's strict dependencies are satisfied, breaking the Catch-22 and allowing graceful degradation to typed input as originally intended.
