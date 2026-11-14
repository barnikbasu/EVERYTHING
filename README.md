# EVERYTHING — Unified Privacy-First Digital Workspace

> **Everything you need. One workspace. Your files stay yours.**

EVERYTHING is a full-stack React, TypeScript, and Express digital utility workspace that unifies PDF document operations, image cutout & editing, audio trimming & normalization, video clipping & GIF export, office/spreadsheet utilities, local OCR, developer utilities, privacy forensics, batch file queues, and an optional explicit-consent AI command planner in a single **Discover → Prepare → Execute** interface.

All deterministic tools run **100% locally in browser memory** without requiring an account, login, or API key.

---

## Core Capabilities

- **PDF & Documents (`PdfStudio`)**: Merge PDFs, split by page range or ZIP archive, organize/rotate/delete pages, lossless metadata stripping, raster compression (150 / 96 DPI), images-to-PDF, canvas signatures & watermarks, raster redaction, and AcroForm inspection, filling, and flattening.
- **Image & Cutout (`ImageStudio`)**: Interactive border flood-fill + Sobel edge-preserving background removal with manual keep/erase brush refinement, before/after comparison slider, resize/crop/rotate, tone & sharpen adjustments, JPEG/PNG/WebP export, watermarks, and 300 DPI passport photo sheets.
- **Audio & Video (`AudioStudio`, `VideoStudio`)**: Waveform trim, peak normalization (`-1 dBFS`), silence stripping, fade in/out, playback speed, track merging, microphone capture, 16-bit PCM WAV export; video trim/aspect/rotation, animated GIF encoding (`gifenc`), PNG frame extraction, WAV audio extraction, and browser screen recording.
- **Design & Color (`DesignStudio`)**: Social/meme/banner canvas presets, dominant palette extractor, WCAG contrast ratio calculator, PNG & SVG QR code generator, and multi-size favicon/app-icon ZIP packager.
- **Office & Archives (`OfficeStudio`)**: Spreadsheet (`.xlsx`, `.xls`, `.csv`) viewer, whitespace/empty-row/duplicate cleaner & JSON/CSV export (`SheetJS`), DOCX/Markdown reader (`Mammoth.js`), and ZIP archive inspector & builder (`JSZip`).
- **Local OCR & Document Diff (`OcrStudio`)**: Multi-language optical character recognition (`Tesseract.js` WASM), Searchable PDF export, line-by-line document diff (`diff`), and optional explicit-consent cloud summarization/translation.
- **Developer, Everyday Utilities & Privacy (`DeveloperStudio`, `UtilitiesStudio`, `PrivacyStudio`, `BatchStudio`, `AiCommandStudio`)**: JSON/XML/HTML/CSS formatting, Base64/URL/JWT/UUID/SHA-256 hashing (`Web Crypto API`), regex tester, sanitized Markdown preview, SVG optimizer, QR image reader (`jsQR`), EMI/GST/unit/date/case calculators, magic-byte extension spoof detector, EXIF metadata stripper, CSPRNG password generator, batch multi-file ZIP queue, and deterministic local + optional Gemini AI workflow planner.

---

## Architecture & Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), Lucide Icons, Vite 8.
- **Browser Processing Engines (`src/engines/`)**: `pdf-lib`, `pdfjs-dist`, `tesseract.js`, `xlsx`, `mammoth`, `jszip`, `gifenc`, `qrcode`, `jsqr`, `diff`, `zod`, Canvas 2D, Web Audio API, MediaRecorder, Web Crypto API.
- **Backend (`server.ts`, `server/aiProvider.ts`)**: Express server with Vite dev middleware, static `dist/` serving in production, rate limiting, explicit-consent validation, and optional `@google/genai` integration.

### Three-Stage Workspace Flow

1. **Stage A — Discover (`StageADiscover.tsx`)**: Compact navigation header with command search (`Ctrl/Cmd + K`), category filters, drag-and-drop / clipboard paste (`Ctrl/Cmd + V`) auto-router, and local-only activity history (`localStorage` metadata only—never file bytes).
2. **Stage B — Prepare (`StageBPrepare.tsx`)**: Single-tool pre-flight staging with file extension & size validation, bundled sample assets (`src/assets/samples.ts`), preset selection, and interactive cutout comparison.
3. **Stage C — Execute (`StageCExecute.tsx`, `StudioShell.tsx`)**: Lazy-loaded studio workbenches sharing an export toolbar (editable output filename, undo/redo where supported, output byte size readout, download) and responsive inspector drawers.

---

## Getting Started

### Prerequisites

- Node.js 20+ (verified with Node v22.x)

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env` if needed:

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | No | — | Enables optional `/api/ai/plan` and `/api/ai/document-assist` server routes. All local tools and the deterministic command router run without it. |
| `PORT` | No | `3000` | HTTP port for the Express server. |
| `APP_URL` | No | `http://localhost:3000` | Optional public base URL for deployments. |

### Development

```bash
npm run dev
```

Starts Express with Vite middleware at `http://localhost:3000`.

### Scripts (Typecheck, Test, Build, Production)

```bash
npm run lint    # TypeScript typecheck (tsc --noEmit)
npm test        # Automated Node engine & server API tests (tsx --test tests/*.test.ts)
npm run build   # Production Vite bundle into dist/
npm start       # Serves built dist/ and API routes on PORT (NODE_ENV=production)
```

---

## Supported File Formats

- **Documents**: PDF (`.pdf`), Word (`.docx`), Spreadsheets (`.xlsx`, `.xls`, `.csv`), Plaintext / Markdown (`.txt`, `.md`)
- **Images**: PNG, JPEG, WebP, SVG, GIF/BMP (browser bitmap support)
- **Audio / Video**: MP3, WAV, OGG, WebM, M4A, FLAC, MP4, MOV (subject to host browser codec support)
- **Archives & Data**: ZIP (`.zip`), JSON, XML, HTML, CSS

---

## Privacy & Security Guarantees

1. **Zero Automatic Uploads**: File contents never leave the browser unless the user explicitly checks consent inside the AI Command or Document Assist panels.
2. **Strict Consent Enforcement**: `/api/ai/plan` and `/api/ai/document-assist` both reject requests with HTTP `400` unless `consentGranted === true`. `/api/ai/plan` receives only the command prompt and filename/size/MIME metadata—never file bytes.
3. **Server-Side Key Isolation**: `GEMINI_API_KEY` is read exclusively in `server/aiProvider.ts` and is never exposed to browser bundles or client state.

---

## Verification Matrix

| Area | Verification Method | Scope | Status |
|---|---|---|---|
| TypeScript & Vite Build | `npm run lint` (`tsc --noEmit`), `npm run build` | Full codebase & server | Verified |
| Engine Unit & Roundtrip Suite | `npm test` (`tests/engines.test.ts`) | Routing, PDF merge/split/organize/compress/flatten, XLSX/CSV/ZIP, Dev tools, Finance/Units, Privacy/Magic bytes, QR/Contrast, Local AI Planner | Verified |
| Server API Contract Suite | `npm test` (`tests/server.test.ts`) | `/api/health`, consent HTTP `400` guards, blank input guards, key detection | Verified |
| Browser Canvas / Media / WASM Studios | Browser-runtime APIs (`Canvas 2D`, `Web Audio`, `MediaRecorder`, `Tesseract.js`, `PDF.js` canvas) | Visual pixels, webcam/mic/screen capture, WASM OCR rendering | Typechecked; requires interactive browser verification |

---

## Known Limitations

1. **Video Export Format**: Video transcoding relies on `<canvas>` + `MediaRecorder` rather than cross-origin-isolated `SharedArrayBuffer` FFmpeg WASM, so exports output **WebM (VP8/VP9)** and extracted audio outputs **16-bit PCM WAV**.
2. **Background Cutout Algorithm**: Uses border flood-fill, Sobel edge protection, feathering/defringe, and manual brush overrides in browser RAM rather than downloading a heavy neural segmentation model.
3. **PDF Redaction Mechanism**: Redacted PDF pages are intentionally re-rendered onto a raster canvas with opaque black blocks so underlying PDF text streams cannot be copied or recovered.
4. **PDF Encryption**: Standard client-side `pdf-lib` cannot apply AES-256 user-password encryption directly, so no password-protection claim or fake toggle is exposed.

---

## Deployment

Build the static frontend and start the Node production server:

```bash
npm run build
npm start
```

Ensure `NODE_ENV=production` and `PORT` are configured for your target host. Set `GEMINI_API_KEY` only if enabling optional cloud AI workflows.

---

## License

Apache License 2.0 (see file headers across `src/`).
