import { GEMINI_PLANNER_MODEL, isCloudAiConfigured } from '../server/aiProvider.ts';

interface ServerlessReq {
  method?: string;
}

interface ServerlessRes {
  setHeader(name: string, value: string): void;
  status(code: number): { json(payload: unknown): void };
}

export default function handler(req: ServerlessReq, res: ServerlessRes): void {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  const configured = isCloudAiConfigured();
  res.status(200).json({
    ok: true,
    aiConfigured: configured,
    cloudAiConfigured: configured,
    defaultModel: GEMINI_PLANNER_MODEL,
    mode: process.env.NODE_ENV || 'production',
  });
}
