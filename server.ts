import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GEMINI_PLANNER_MODEL,
  generateStructuredWorkflowPlan,
  isCloudAiConfigured,
  runCloudDocumentAssist,
  type DocumentAssistTask,
  type PlanFileMeta,
  type ToolCatalogItem,
} from './server/aiProvider.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxPerMinute = 20): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= maxPerMinute) {
    return false;
  }
  bucket.count += 1;
  return true;
}

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=()');
    if (isProduction) {
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          "img-src 'self' data: blob:",
          "media-src 'self' data: blob:",
          "worker-src 'self' blob:",
          "connect-src 'self' data: blob: https://cdn.jsdelivr.net https://tessdata.projectnaptha.com",
          "object-src 'none'",
          "base-uri 'self'",
        ].join('; ')
      );
    }
    next();
  });

  app.use(express.json({ limit: '4mb' }));
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'Invalid JSON request payload.' });
      return;
    }
    next(err);
  });

  app.get('/api/health', (_req, res) => {
    const configured = isCloudAiConfigured();
    res.json({
      ok: true,
      aiConfigured: configured,
      cloudAiConfigured: configured,
      defaultModel: GEMINI_PLANNER_MODEL,
      mode: isProduction ? 'production' : 'development',
    });
  });

  // Optional AI Command Planner: receives only text prompt + file metadata (no file bytes).
  app.post('/api/ai/plan', async (req, res) => {
    const clientIp = req.ip || 'local';
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({ error: 'Rate limit exceeded. Please wait a minute before retrying.' });
      return;
    }

    const { prompt, files, catalog, consentGranted } = req.body as {
      prompt?: string;
      files?: PlanFileMeta[];
      catalog?: ToolCatalogItem[];
      consentGranted?: boolean;
    };

    if (consentGranted !== true) {
      res.status(400).json({
        error: 'Explicit user consent is required before sending request text to the cloud AI planner.',
      });
      return;
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      res.status(400).json({ error: 'A command prompt is required.' });
      return;
    }

    if (!isCloudAiConfigured()) {
      res.status(503).json({
        error: 'Cloud AI is not configured on this server. You can still use the local deterministic command router.',
      });
      return;
    }

    try {
      const result = await generateStructuredWorkflowPlan({
        prompt,
        files: Array.isArray(files) ? files : [],
        catalog: Array.isArray(catalog) ? catalog : [],
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI planning request failed.';
      res.status(500).json({ error: message });
    }
  });

  // Optional Cloud Document Assistant: runs only when the user explicitly opts in.
  app.post('/api/ai/document-assist', async (req, res) => {
    const clientIp = req.ip || 'local';
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({ error: 'Rate limit exceeded. Please wait a minute before retrying.' });
      return;
    }

    const { task, text, targetLanguage, consentGranted } = req.body as {
      task?: DocumentAssistTask;
      text?: string;
      targetLanguage?: string;
      consentGranted?: boolean;
    };

    if (consentGranted !== true) {
      res.status(400).json({
        error: 'Explicit consent is required before sending document text to cloud assist.',
      });
      return;
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({ error: 'Document text is empty.' });
      return;
    }

    if (!isCloudAiConfigured()) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server. Set GEMINI_API_KEY in your environment to enable cloud document assist.',
      });
      return;
    }

    try {
      const result = await runCloudDocumentAssist({ task, text, targetLanguage });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloud document assist failed.';
      res.status(500).json({ error: message });
    }
  });

  return app;
}

async function startServer() {
  const app = createApp();

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EVERYTHING workspace server listening on http://localhost:${PORT}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}
