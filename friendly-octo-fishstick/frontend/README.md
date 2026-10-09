# Wispr Flow — Frontend recreation

A multi-page web + mobile frontend for the Titan voice-first marketing system, visually inspired by the public Wispr Flow website. This is an independent project and is not affiliated with or endorsed by Wispr AI. Authentication and dictation are frontend demos for now — the web app connects to the existing Titan FastAPI backend for data and generation features.

## Run locally

Requirements: Node.js 20+ recommended. Start the backend first (see `../README.md`).

```bash
npm install
npm run dev        # web app -> http://localhost:5173 (proxies /api to :8000)
```

Open the local URL printed by Vite. To create a production build:

```bash
npm run build
npm run preview
```

Mobile (Expo):

```bash
npm run mobile     # starts the Expo dev server
```

## Local routes

- `/` — dictation homepage and animated product demos
- `/notetaker` — AI meeting-notes product page
- `/why-flow` — side-by-side dictation comparison
- `/pricing` — pricing UI with monthly/annual selector
- `/downloads` — platform selector and official download destination
- `/web-demo` — interactive frontend demo (does not request microphone access)
- `/privacy` — privacy/security overview
- `/microphones` — microphone setup guide
- `/business` — teams overview
- `/developers` — developer-focused page
- `/india` — India landing page

Unknown routes show a 404 page. Internal navigation is handled with React Router. Download, sales, help center, and official resources link to official destinations where appropriate.

## Motion and interaction resources

The visual pass uses lightweight, locally implemented interactions inspired by the open-source component patterns in [React Bits](https://reactbits.dev/): scroll-triggered reveals, pointer-following spotlight cards, animated waveform details, floating product-demo panels, and responsive UI transitions. These are implemented directly in React/CSS so the project does not depend on a third-party animation runtime. React Bits is a separate project and is not bundled as a dependency.

## Notes

- The project contains frontend simulations only. It does not request microphone permissions or claim to transcribe speech.
- Commercial details and feature availability can change. Verify current information on the official website.
- Fonts use Google Fonts when online, with system fallbacks.
- Original Wispr Flow assets are not bundled unless included in this project; some visual elements are recreated as frontend mockups.
