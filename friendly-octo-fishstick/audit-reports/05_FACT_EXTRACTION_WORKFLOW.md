# Fact Extraction Workflow

## Extraction Dependency
The Fact Extraction workflow relies exclusively on the Agnes AI LLM provider to process a raw text string (the transcript) into a structured JSON dictionary that maps to the `FactSheet` schema.

The function `_run_extraction(db, campaign, settings)` defined in `backend/app/api/campaigns.py` and `backend/app/services/extraction.py` is the orchestrator for this step.

### Normal Operation
1. The `_run_extraction` routine is invoked.
2. It calls the active LLM provider (Mock or Agnes).
3. The LLM processes the `campaign.transcript.raw` text.
4. The output is parsed into a JSON dictionary.
5. `record_extraction()` commits a `FactSheet` database model attached to the campaign.

### Bypassed Operation
The most critical aspect of the extraction workflow regarding the reported bug is the strict dependency check located in `backend/app/api/campaigns.py`:

```python
    if campaign.transcript:
        await _run_extraction(db, campaign, settings, business_name=shop.name)
```

Because extraction is intrinsically a text-to-structured-data operation, the backend logic intentionally skips the entire `_run_extraction` block if `campaign.transcript` is falsy. 

If the extraction is skipped:
- `record_extraction()` is never executed.
- The `campaign` object has no `FactSheet` associated with it.

Even if an error occurred *during* `_run_extraction` (e.g., Agnes LLM is down), the extraction module is designed to catch the error and generate an empty "fallback" FactSheet so the UI still functions. However, because the check occurs *before* `_run_extraction` is called, the fallback mechanism is circumvented entirely when STT fails.
