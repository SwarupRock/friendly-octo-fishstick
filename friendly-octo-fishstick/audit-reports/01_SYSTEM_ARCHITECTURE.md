# System Architecture

## Overview
The Svarah.ai project is a monorepo containing a React/Vite frontend (`apps/web`) and a FastAPI/SQLAlchemy backend (`backend`).

The application is designed to ingest business campaign briefs through multi-modal input (primarily audio), transcribe the audio into text using an STT provider, extract structured facts using an LLM, and finally generate promotional campaign materials (posters, video, voice cloning).

## Core Components Relevant to the Audit

### Frontend (`frontend/apps/web/src/`)
- **Workspace State Management (`Workspace.jsx`)**: Manages the overarching campaign state. Once a campaign is created, the workspace automatically advances the UI through several steps.
- **Capture Step (`CaptureStep.jsx`)**: Responsible for recording audio via `MediaRecorder` or accepting typed input. Submits audio as a base64 encoded blob to the backend.
- **Fact Review Step (`FactReviewStep.jsx`)**: The second step in the workflow. Depends heavily on the presence of a `FactSheet` to display fields and allow the user to lock or edit facts.

### Backend (`backend/app/`)
- **Campaign Endpoint (`api/campaigns.py`)**: The primary entry point for new campaign creation (`POST /campaigns`). Handles audio decoding, routes the audio to the STT provider, and then kicks off the extraction workflow.
- **STT Provider Layer (`services/stt.py`)**: Implements a strategy pattern with multiple providers (`Mock`, `SarvamSaaras`, `FasterWhisper`). It is designed to degrade gracefully (throwing an `STTUnavailableError`) instead of returning 500 server errors.
- **Extraction Provider Layer (`services/extraction.py`)**: Interacts with the Agnes AI LLM to convert a raw transcript into a structured `FactSheet`. It is only invoked if a transcript successfully exists.

### System Flow
1. **Audio Capture**: User records audio via UI -> Base64 encodes.
2. **Campaign Initialization**: UI posts to `/campaigns` -> Backend receives audio.
3. **Transcription**: Backend sends audio to STT Provider. STT returns a transcript.
4. **Extraction**: Backend passes the transcript to the Extraction provider. Extraction provider creates a `FactSheet` in the database.
5. **Response**: Backend serializes the campaign (now containing the `FactSheet`) and returns `201 Created`.
6. **UI Advancement**: UI receives response -> advances step state to `'facts'` -> User validates the facts.
