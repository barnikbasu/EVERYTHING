import {
  generateStructuredWorkflowPlan,
  isCloudAiConfigured,
  type PlanFileMeta,
  type ToolCatalogItem,
} from '../../server/aiProvider.ts';

interface ServerlessReq {
  method?: string;
  body?: unknown;
}

interface ServerlessRes {
  setHeader(name: string, value: string): void;
  status(code: number): { json(payload: unknown): void };
}

export default async function handler(req: ServerlessReq, res: ServerlessRes): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
    prompt?: string;
    files?: PlanFileMeta[];
    catalog?: ToolCatalogItem[];
    consentGranted?: boolean;
  };

  if (body.consentGranted !== true) {
    res.status(400).json({
      error: 'Explicit user consent is required before sending request text to the cloud AI planner.',
    });
    return;
  }

  if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
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
      prompt: body.prompt,
      files: Array.isArray(body.files) ? body.files : [],
      catalog: Array.isArray(body.catalog) ? body.catalog : [],
    });
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI planning request failed.';
    res.status(500).json({ error: message });
  }
}
