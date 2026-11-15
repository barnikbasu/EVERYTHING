# EVERYTHING

**Everything you need. One workspace. Your files stay yours.**

- **Creator & Developer**: Barnik Basu ([@barnikbasu](https://github.com/barnikbasu))
- **Project**: EVERYTHING
- **Copyright**: © 2026 Barnik Basu. All rights reserved.
- **License**: Proprietary (See [LICENSE](LICENSE))

EVERYTHING is a privacy-first digital utility workspace that brings local file conversion, PDF editing, image processing, audio/video editing, design creation, office inspection, OCR, and developer utilities into one unified web application.

---

## Core Privacy & Execution Principles

- **Local Processing by Default**: File conversion, PDF manipulation, image cutouts, audio waveforms, video trimming, OCR, hashing, QR tools, and data formatting execute directly in your browser's memory.
- **Zero Mandatory Account or API Key**: All local studios run offline or locally without authentication or external AI keys.
- **Explicit Consent for Cloud AI**: Optional `/api/ai/plan` and `/api/ai/document-assist` routes run only when explicitly approved by the user (`consentGranted: true`) and when `GEMINI_API_KEY` is configured on the server.
- **No Silent Tracking or Uploads**: No analytics SDKs, advertising trackers, or background file uploads are bundled.

---

## Key Features

- **Convert Anything**: Signature-based detection and local conversion across image, document, audio, archive (`ZIP`, `TAR`, `GZ`), and structured data formats (`JSON`, `YAML`, `XML`, `CSV`, `TSV`, `XLSX`, `PDF`).
- **PDF & Document Lab**: Local merge, split, compression, visual page reordering, signature drawing, redaction, and form filling.
- **Image & Cutout Studio**: Browser subject cutout, resizing, cropping, tone adjustments, EXIF stripping, and passport ID sheet export.
- **Audio & Video Studio**: Web Audio waveform editing, silence removal, normalization, WAV export, video trimming, and GIF encoding.
- **Design Studio**: Card maker, poster composition, palette extraction, collage grids, and canvas social mockups.
- **Office & Archive Studio**: DOCX HTML inspection, XLSX spreadsheet viewer, Markdown rendering, RTF preview, and ZIP inspector with Zip-slip path protection.
- **OCR Studio**: Client-side optical character recognition via `tesseract.js`.
- **Developer Toolbox**: JSON/XML/HTML/CSS/JS formatting & validation, Base64/JWT/UUID decoding, SHA-256 hashing, regex testing, Markdown preview, and sanitized SVG optimization.

---

## Technology Stack

- **Frontend**: React 19, Vite 8, Tailwind CSS v4, Lucide Icons
- **Server / API**: Node.js 22, Express 4, Vercel Serverless `/api/*` handlers, TypeScript (`tsx`)
- **Client Engines**: `pdf-lib`, `pdfjs-dist`, `tesseract.js`, `xlsx`, `jszip`, `pako`, `mammoth`, `gifenc`, `js-yaml`, `fast-xml-parser`, `jsqr`, `qrcode`

---

## Getting Started

### 1. Prerequisites

- **Node.js** `v20+` (`v22+` recommended)
- **npm** `v10+`

### 2. Clone & Install Dependencies

```bash
git clone https://github.com/barnikbasu/everything-workspace.git
cd everything-workspace
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

All browser-based tools work without setting any environment variables. Configure `GEMINI_API_KEY` inside `.env` only if you want to enable the optional opt-in cloud AI command planner and document assistant.

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Verification Scripts

```bash
npm run typecheck   # TypeScript type validation (tsc --noEmit)
npm run lint        # Typecheck alias (tsc --noEmit)
npm test            # Node unit, security, workflow, and API tests
npm run build       # Production Vite build (dist/)
npm start           # Start production Express server on port 3000
```

---

## Deployment

### Node.js / Express Server

```bash
npm install
npm run build
npm start
```

Set `PORT` (defaults to `3000`) and optionally `GEMINI_API_KEY` in the runtime environment.

### Vercel

The repository includes `vercel.json` and zero-dependency serverless handlers under `/api/`:
- `/api/health.ts`
- `/api/ai/plan.ts`
- `/api/ai/document-assist.ts`

Deploy directly from GitHub to Vercel. Add `GEMINI_API_KEY` as a **Server / Encrypted Environment Variable** in Vercel Project Settings only if you want optional Cloud AI endpoints enabled. Never prefix keys with `VITE_`.

---

## Documentation

- [Privacy Architecture (`PRIVACY.md`)](PRIVACY.md)
- [Security Policy (`SECURITY.md`)](SECURITY.md)
- [Contributing Guide (`CONTRIBUTING.md`)](CONTRIBUTING.md)
- [Changelog (`CHANGELOG.md`)](CHANGELOG.md)

---

## Ownership, Copyright & Licensing

### Creator & Project Ownership
**EVERYTHING** is designed, architected, and developed by **Barnik Basu**.

### Copyright Notice
© 2026 Barnik Basu. All rights reserved.

### Proprietary License
All original source code, graphic designs, user interfaces, schemas, documentation, and architecture in this repository are proprietary. Reproduction, distribution, modification, or commercial use without prior explicit written permission from the copyright holder is strictly prohibited. Refer to [LICENSE](LICENSE) for details.

### Third-Party Software Acknowledgement
This software incorporates and relies upon open-source libraries, packages, and frameworks (`react`, `vite`, `tailwindcss`, `lucide-react`, `pdf-lib`, `pdfjs-dist`, `xlsx`, `tesseract.js`, `jszip`, `pako`, `mammoth`, `gifenc`, `express`, etc.). All third-party dependencies remain the intellectual property of their respective authors and are governed by their respective open-source licenses. Nothing in this repository claims ownership of third-party intellectual property or modifies third-party licensing terms.
