# EVERYTHING

**Everything you need. One workspace. Your files stay yours.**

EVERYTHING is a complete, production-oriented, privacy-first digital utility workspace that brings essential file processing, document manipulation, media editing, creative creation, developer formatting, and OCR tools into one unified web application.

---

## Key Features

- **Universal File Converter ("Convert Anything")**: Signature-based detection and local conversion across image, document, audio, video, archive, and structured-data formats (JSON, YAML, XML, CSV, TSV, XLSX, PDF, ZIP, TAR, GZ).
- **PDF & Document Lab**: Local merge, split, compression (DPI / stream cleanup), visual page reordering, signature drawing, secure redaction, and AcroForm filling.
- **Image & Cutout Studio**: Browser-based subject matting, background removal, cropping, resizing, tone adjustment, EXIF metadata stripping, and passport ID photo layout sheets.
- **Audio & Video Studio**: Web Audio waveform editing, silence removal, normalization, WAV/Opus export, video trimming, GIF quantization, and screen recording.
- **Developer Toolbox**: JSON, XML, HTML, CSS, and JS formatting/validation, Base64/JWT/UUID inspection, SHA-256 hashing, regex testing, Markdown preview, and SVG optimization.
- **OCR & Smart Document Studio**: Local optical character recognition via Tesseract.js and searchable PDF generation.
- **Privacy & Security Architecture**: Local-first processing by default. Files remain in your device's browser memory unless you explicitly consent to use optional AI features.

---

## Technology Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide Icons.
- **Backend**: Node.js, Express, TypeScript (`tsx`).
- **Processing Engines**: `pdf-lib`, `pdfjs-dist`, `tesseract.js`, `xlsx`, `jszip`, `pako`, `mammoth`, `gifenc`, `js-yaml`, `fast-xml-parser`.

---

## Getting Started (New Developer Guide)

### 1. Prerequisites
- Node.js (v18+ recommended)
- npm or pnpm

### 2. Clone & Install Dependencies
\`\`\`bash
git clone https://github.com/your-username/everything-workspace.git
cd everything-workspace
npm install
\`\`\`

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
\`\`\`bash
cp .env.example .env
\`\`\`
*Note: All local processing tools work without any API keys. `GEMINI_API_KEY` is strictly optional and only required if you want to use the optional cloud AI command planner.*

### 4. Run Development Server
\`\`\`bash
npm run dev
\`\`\`
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Testing & Quality Assurance

EVERYTHING includes a comprehensive test suite covering file signature detection, binary codecs, structured data roundtrips, PDF manipulation, and archive extraction.

Execute tests locally:
\`\`\`bash
npm test
\`\`\`

Check TypeScript types & linter:
\`\`\`bash
npm run lint
\`\`\`

Production build:
\`\`\`bash
npm run build
\`\`\`

---

## License

Licensed under the [Apache-2.0 License](LICENSE).
