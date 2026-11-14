import { TOOL_REGISTRY } from '../registry/toolRegistry';
import { AIWorkflowPlanSchema } from '../engines/aiCommandEngine';
import type { AIWorkflowPlan } from '../types/workspace';

export interface AiHealthStatus {
  cloudAiConfigured: boolean;
  defaultModel: string;
}

export async function fetchAiHealth(): Promise<AiHealthStatus> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    return { cloudAiConfigured: false, defaultModel: 'unavailable' };
  }
  const data = await res.json();
  return {
    cloudAiConfigured: Boolean(data.cloudAiConfigured),
    defaultModel: String(data.defaultModel || 'unknown'),
  };
}

export async function requestCloudAiPlan(
  prompt: string,
  files: File[],
  consentGranted: boolean
): Promise<{ plan: AIWorkflowPlan; engine: string }> {
  const response = await fetch('/api/ai/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      consentGranted,
      files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      catalog: TOOL_REGISTRY.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        description: t.description,
        acceptedExtensions: t.acceptedExtensions,
      })),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Cloud AI planner returned an error');
  }

  const parsed = AIWorkflowPlanSchema.safeParse(data.plan);
  if (!parsed.success) {
    throw new Error('Cloud AI returned an invalid workflow plan schema.');
  }

  const validTool = TOOL_REGISTRY.find((t) => t.id === parsed.data.toolId);
  if (!validTool) {
    throw new Error(`Planner returned unknown tool ID: ${parsed.data.toolId}`);
  }

  return { plan: parsed.data, engine: data.engine || 'gemini-4-hydrogen' };
}

export async function requestCloudDocumentAssist(params: {
  task: 'summarize' | 'translate' | 'extract-key-points';
  text: string;
  targetLanguage?: string;
  consentGranted: boolean;
}): Promise<{ result: string; engine: string }> {
  const res = await fetch('/api/ai/document-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Cloud document assist failed');
  }

  return {
    result: String(data.result || ''),
    engine: String(data.engine || 'gemini-4-hydrogen'),
  };
}
