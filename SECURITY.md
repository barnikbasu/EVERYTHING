# Security Policy — EVERYTHING

## Security Architecture

EVERYTHING processes user files locally in browser memory and includes hardened server/API boundaries for optional cloud AI capabilities:

- **XSS & Active Content Sanitization**:
  - Untrusted HTML generated during document conversions or previews passes through strict sanitization stripping `<script>`, `<iframe>`, `<object>`, `<embed>`, `<applet>`, `<base>`, `<meta>`, `<link>`, `<form>`, `<noscript>`, inline `on*` event handlers, `srcdoc`, `formaction`, and `javascript:`/`vbscript:`/`data:text/html` URIs.
  - SVG previews render via isolated `Blob` (`image/svg+xml`) `<img>` object URLs instead of unsafe inline DOM injection, and the SVG Optimizer strips scripting, `<foreignObject>`, animation hijack elements, external stylesheets (`@import`), and active URI schemes.
- **Zip-Slip / Archive Path Traversal Protection**:
  - Archive reading, extraction, and repacking across both ZIP and TAR engines normalize and strip `..` segments, leading slashes, Windows drive letters, and null bytes via `sanitizeArchivePath`.
- **Download Filename Sanitization**:
  - All exported Blobs sanitize filenames via `sanitizeDownloadFilename` to strip invalid filesystem characters and leading dots.
- **Zero Client-Side Secrets**:
  - `GEMINI_API_KEY` is read exclusively by server/serverless handlers (`server/aiProvider.ts`, `/api/*`) and never bundled into `VITE_*` client artifacts.
- **HTTP Security Headers & Rate Limiting**:
  - Production Express and Vercel headers include `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`. Express enforces 4 MB JSON payload limits, 20 requests/minute IP rate limiting, and sanitized HTTP 400 errors on invalid JSON.

## Known Upstream Dependency Advisories

- **`xlsx@0.18.5` (`GHSA-4r6h-8v6p-xvw6` Prototype Pollution, `GHSA-5pgg-2g8v-p4x9` ReDoS — High, no fix available on npm)**:
  - **Risk boundary & mitigation**: `xlsx` is never invoked server-side or inside Express/Vercel API routes. It is dynamically lazy-loaded exclusively inside the user's browser sandbox on local files explicitly selected by the user and bounded by tool file-size limits (`maxRecommendedSizeMB`). Avoid opening untrusted external `.xlsx` files from unknown sources if operating in sensitive browser contexts.

## Reporting a Vulnerability

If you discover a security vulnerability, path-traversal edge case, or XSS bypass:

1. **Do not** open a public issue containing exploit payloads or private user data.
2. Open a private security advisory on the repository or contact **Barnik Basu** via GitHub ([@barnikbasu](https://github.com/barnikbasu)).
3. Include minimal reproduction steps, affected studio/module, and expected vs. observed behavior.
