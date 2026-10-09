# State Transition Bugs

## The Catch-22

The Svarah.ai UI utilizes `StepRail` and state variables to guide the user linearly through the campaign creation process. The state transition logic contains a fatal flaw when handling gracefully degraded campaigns.

### The Trigger
When a campaign is created via audio input, the `CaptureStep.jsx` calls `onCreated(result.data)` on success. The parent component, `Workspace.jsx`, sets the newly created campaign ID as the `openCampaignId`, replacing the dashboard view with `CampaignDetail`.

### The Bad Transition
Inside `CampaignDetail`:
```javascript
const [step, setStep] = useState('facts');
```
The state defaults to the `'facts'` step immediately upon opening a newly created campaign. The component then conditionally renders the `FactReviewStep` component:
```javascript
{step === 'facts' ? (
    <FactReviewStep campaign={campaign.data} factsheet={factsheet} />
) : null}
```

### The Blocked UI
Inside `FactReviewStep.jsx`, the code includes a protective guard clause:
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
If `factsheet` is null (because the backend bypassed extraction after an STT failure), this banner is displayed. Crucially, the rest of the component—which contains the HTML forms and input fields for manually entering facts—is skipped. The user cannot enter data.

### The Dead End
Following the banner's instructions, if the user clicks the "Capture" rail item, they navigate to the `CampaignTranscript` view.
The `CampaignTranscript` view sees that `transcript` is null and outputs a warning:
```javascript
if (!campaign?.transcript) {
    return (
        <div className="ws-card">
        <Banner tone="warn" title="No transcript was captured">
            {campaign?.stt?.message ||
            'Speech-to-text was unavailable for this campaign. Enter the facts by hand in the next step.'}
        </Banner>
        </div>
    );
}
```
The user is told to "Enter the facts by hand in the next step." If the user clicks the button to "Re-run fact extraction," the frontend issues a `POST /{campaign_id}/extract` request. The backend immediately rejects this request with a 400 Bad Request: "Cannot extract facts: the campaign has no transcript. Submit typed text or record audio first."

The user is therefore caught in an inescapable logic loop.
