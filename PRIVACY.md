# Privacy Architecture & Data Handling — EVERYTHING

**Everything you need. One workspace. Your files stay yours.**

- **Creator & Copyright Holder**: Barnik Basu ([@barnikbasu](https://github.com/barnikbasu))
- **Effective Date**: 2026

---

## 1. Local-First Processing Guarantee

By default, **EVERYTHING** executes file conversion, document manipulation, audio/video processing, optical character recognition (OCR), cryptographic hashing, QR generation/scanning, and data formatting **entirely inside your browser's memory** using client-side Web APIs and bundled/WebAssembly engines (`Canvas 2D`, `Web Audio`, `pdf-lib`, `PDF.js`, `JSZip`, `pako`, `SheetJS`, `mammoth`, `gifenc`, and `Tesseract.js`).

- **No silent file uploads**: Selected, dropped, or pasted files are never automatically uploaded to any backend server.
- **No mandatory login or user accounts**: All core workspace studios work without signing in.
- **No mandatory API keys**: Local engines run with `GEMINI_API_KEY` unset.

## 2. Explicit Consent for Optional Cloud AI Endpoints

Two optional endpoints exist for explicit opt-in workflows:

1. `POST /api/ai/plan` — Accepts a text command prompt and optional **file metadata only** (`name`, `size`, `type`—never raw file bytes) when the user explicitly opts in inside the AI Command Studio.
2. `POST /api/ai/document-assist` — Accepts user-supplied text (up to 45,000 characters) for summarization, translation, or extraction only when `consentGranted: true` is explicitly approved by the user in the UI.

Both endpoints enforce explicit server-side consent verification (`consentGranted === true`) and reject unconsented requests with HTTP `400`.

## 3. Third-Party Runtime Asset Fetches

- **Google Fonts**: `index.html` loads `Plus Jakarta Sans` and `JetBrains Mono` stylesheets when online.
- **Tesseract.js OCR**: When a user explicitly opens and runs OCR in the OCR Studio, `tesseract.js` fetches language traineddata and WASM worker assets from configured CDN endpoints (`cdn.jsdelivr.net` / `tessdata.projectnaptha.com`) if not already cached in browser storage.

## 4. Browser Storage & Memory Lifecycle

- Processed file blobs live transiently in memory via `URL.createObjectURL(...)` and are revoked on export/cleanup/studio reset.
- Recent tool/session history stored locally records lightweight metadata (tool IDs and timestamps) rather than storing raw binary files persistently.
- No telemetry, behavioral tracking pixels, or hidden analytics beacons are bundled.
