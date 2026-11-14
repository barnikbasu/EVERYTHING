import { GoogleGenAI, Type } from '@google/genai';

export const GEMINI_PLANNER_MODEL = 'gemini-4-hydrogen';

export interface ToolCatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  acceptedExtensions: string[];
}

export interface PlanFileMeta {
  name: string;
  size: number;
  type: string;
}

export type DocumentAssistTask = 'summarize' | 'translate' | 'extract-key-points' | 'custom';

export function isCloudAiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey.trim() !== '' && apiKey !== 'MY_GEMINI_API_KEY');
}

function createGeminiClient(): GoogleGenAI | null {
  if (!isCloudAiConfigured()) return null;
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function generateStructuredWorkflowPlan(input: {
  prompt: string;
  files: PlanFileMeta[];
  catalog: ToolCatalogItem[];
}): Promise<{ plan: unknown; engine: string }> {
  const ai = createGeminiClient();
  if (!ai) {
    throw new Error('CLOUD_AI_NOT_CONFIGURED');
  }

  const safeCatalog = input.catalog.slice(0, 80);
  const safeFiles = input.files.slice(0, 30).map((f) => ({
    name: String(f.name || '').slice(0, 200),
    size: Number(f.size || 0),
    type: String(f.type || '').slice(0, 100),
  }));

  const systemInstruction =
    'You are the workflow planner for EVERYTHING, a privacy-first local file utility workspace. ' +
    'Map the user request and attached file metadata ONLY to valid tool IDs from the provided catalog. ' +
    'Never invent tool IDs. Never emit code. Flag destructive or irreversible actions (like redaction, metadata stripping, or overwriting) with requiresConfirmation=true.';

  const response = await ai.models.generateContent({
    model: GEMINI_PLANNER_MODEL,
    contents: JSON.stringify({
      userRequest: input.prompt.slice(0, 1500),
      attachedFiles: safeFiles,
      availableTools: safeCatalog,
    }),
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: 'Concise 1-sentence summary of the planned workflow.',
          },
          toolId: {
            type: Type.STRING,
            description: 'Exact matching tool ID from availableTools.',
          },
          actionLabel: {
            type: Type.STRING,
            description: 'Short button label for executing the plan.',
          },
          requiresConfirmation: {
            type: Type.BOOLEAN,
            description: 'True if the action removes content or alters files destructively.',
          },
          parameters: {
            type: Type.OBJECT,
            description: 'Structured parameters extracted from the user prompt.',
            properties: {
              width: { type: Type.NUMBER },
              height: { type: Type.NUMBER },
              quality: { type: Type.NUMBER },
              format: { type: Type.STRING },
              compressionPreset: { type: Type.STRING },
              language: { type: Type.STRING },
              notes: { type: Type.STRING },
            },
          },
          steps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Ordered list of 2-4 concrete execution steps.',
          },
          warnings: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Any file compatibility warnings or limitations.',
          },
        },
        required: ['summary', 'toolId', 'actionLabel', 'requiresConfirmation', 'steps'],
      },
    },
  });

  const plan = JSON.parse((response.text || '{}').trim());
  return { plan, engine: GEMINI_PLANNER_MODEL };
}

export async function runCloudDocumentAssist(input: {
  task?: DocumentAssistTask;
  text: string;
  targetLanguage?: string;
}): Promise<{
  result: string;
  charactersProcessed: number;
  truncated: boolean;
  engine: string;
}> {
  const ai = createGeminiClient();
  if (!ai) {
    throw new Error('CLOUD_AI_NOT_CONFIGURED');
  }

  const clipped = input.text.slice(0, 45000);
  let instruction = 'Analyze the provided document text concisely and accurately.';
  if (input.task === 'summarize') {
    instruction =
      'Provide a clear, structured summary of the document: 1) Executive summary (2-3 sentences), 2) Key facts & figures, 3) Action items or conclusions if present.';
  } else if (input.task === 'translate') {
    const lang = (input.targetLanguage || 'English').slice(0, 60);
    instruction = `Translate the following document text accurately into ${lang}, preserving formatting, headings, and numerical values.`;
  } else if (input.task === 'extract-key-points') {
    instruction = 'Extract key entities, dates, metrics, and main points as clean bulleted lists.';
  }

  const response = await ai.models.generateContent({
    model: GEMINI_PLANNER_MODEL,
    contents: `${instruction}\n\n---\n${clipped}`,
    config: {
      systemInstruction:
        'You are a precise document assistant inside EVERYTHING. Only state facts grounded in the provided text.',
    },
  });

  return {
    result: response.text || '',
    charactersProcessed: clipped.length,
    truncated: input.text.length > clipped.length,
    engine: GEMINI_PLANNER_MODEL,
  };
}
