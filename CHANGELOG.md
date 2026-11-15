# Changelog

All notable releases and engineering milestones for **EVERYTHING** are documented in this file.

## [1.0.0] - 2026-11-15

### Added
- Unified 3-stage workspace architecture (`Stage A` Discover, `Stage B` Prepare, `Stage C` Execute) supporting file conversion, PDF editing, image processing, audio/video editing, design creation, office inspection, OCR, developer tools, privacy metadata tools, and optional AI command routing.
- Real server-side Gemini integration via `/api/ai/plan` and `/api/ai/document-assist` requiring explicit user consent (`consentGranted: true`), alongside Vercel serverless handlers in `/api/`.
- Security hardening helpers in `src/utils/sanitize.ts`: HTML active-content stripping, SVG optimization hardening, Blob-URL SVG preview isolation, ZIP/TAR Zip-slip traversal protection, and safe download filename normalization.
- 0-byte empty file rejection in `validateFilesForTool` and unmount cancellation cleanup for batch conversion jobs.
- SEO & social sharing setup (`og:image`, Twitter card tags, `WebApplication` JSON-LD schema, `robots.txt`, `sitemap.xml`).
- Accessible, privacy-first `FeedbackModal` for copying feedback reports or opening GitHub issues without attaching user files.
- Automated Node test suite (`tests/*.test.ts`) and GitHub Actions CI workflow (`.github/workflows/ci.yml`).
- Proprietary ownership & licensing documentation (`LICENSE`, `PRIVACY.md`, `SECURITY.md`, `CONTRIBUTING.md`, `README.md`).

### Performance
- Split `StageBPrepare`, `StageCExecute`, `CommandSearchModal`, `HistoryDrawer`, and `FeedbackModal` into lazy-loaded Vite chunks and dynamically loaded `pdf-lib` inside `imageEngine.ts` to keep heavy document/media engines out of the initial entry bundle.
- Resolved Vite v8 native config loader `__dirname` warning and duplicate dynamic import warning in `convertEngine.ts`.
