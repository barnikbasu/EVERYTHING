import {
  isCloudAiConfigured,
  runCloudDocumentAssist,
  type DocumentAssistTask,
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
    task?: DocumentAssistTask;
    text?: string;
    targetLanguage?: string;
    consentGranted?: boolean;
  };

  if (body.consentGranted !== true) {
    res.status(400).json({
      error: 'Explicit consent is required before sending document text to cloud assist.',
    });
    return;
  }

  if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
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
    const result = await runCloudDocumentAssist({
      task: body.task,
      text: body.text,
      targetLanguage: body.targetLanguage,
    });
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloud document assist failed.';
    res.status(500).json({ error: message });
  }
}
