# Contributing to EVERYTHING

Thank you for your interest in **EVERYTHING** (`© 2026 Barnik Basu. All rights reserved.`).

> **Licensing Note:** EVERYTHING is proprietary software created and owned by **Barnik Basu**. Review [LICENSE](LICENSE) before contributing or submitting pull requests. Any accepted contributions require prior agreement with the copyright holder.

## Development Workflow

### Prerequisites

- **Node.js**: v20+ or v22+ LTS
- **npm**: v10+

### Setup

```bash
git clone https://github.com/barnikbasu/everything-workspace.git
cd everything-workspace
npm install
cp .env.example .env   # Optional; only required for optional Gemini AI routes
```

### Verification Commands

Before opening an issue or proposing a patch, ensure every verification script passes:

```bash
npm run typecheck   # TypeScript strict typecheck (tsc --noEmit)
npm run lint        # Alias for TypeScript validation
npm test            # Node.js unit, workflow, security, and HTTP API tests
npm run build       # Vite production bundle compilation
```

### Engineering Standards

- Maintain local-first browser processing; never introduce silent network uploads or hidden telemetry.
- Keep `GEMINI_API_KEY` strictly server-side (`server/` and `api/`). Never use `VITE_GEMINI_API_KEY`.
- Preserve keyboard navigation, visible focus rings, screen-reader labels, and >=40px mobile touch targets across all studios and dialogs.
- Sanitize any rendered HTML, SVG, archive entry paths, and downloaded filenames.
