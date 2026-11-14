import { z } from 'zod';
import { TOOL_REGISTRY, detectFilesRouting } from '../registry/toolRegistry';
import type { AIWorkflowPlan } from '../types/workspace';

export const AIWorkflowPlanSchema = z.object({
  summary: z.string().min(1),
  toolId: z.string().min(1),
  actionLabel: z.string().min(1),
  requiresConfirmation: z.boolean(),
  parameters: z
    .object({
      width: z.number().optional(),
      height: z.number().optional(),
      quality: z.number().optional(),
      format: z.string().optional(),
      compressionPreset: z.string().optional(),
      language: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  steps: z.array(z.string()).min(1),
  warnings: z.array(z.string()).optional(),
});

/**
 * Deterministic local natural-language planner — requires zero cloud API keys or network calls.
 */
export function buildLocalWorkflowPlan(prompt: string, files: File[]): AIWorkflowPlan {
  const q = prompt.toLowerCase();
  const routing = detectFilesRouting(files);

  let toolId = routing.primaryToolId;
  let requiresConfirmation = false;
  const parameters: AIWorkflowPlan['parameters'] = {};
  const warnings: string[] = [];

  // Extract numeric pixel width if mentioned
  const widthMatch = q.match(/(\d{2,4})\s*(px|pixels?|wide)/);
  if (widthMatch) {
    parameters.width = Number(widthMatch[1]);
  }

  // Deterministic intent matching
  if (q.includes('compress') && (q.includes('pdf') || routing.detectedKind === 'pdf')) {
    toolId = 'pdf-compress';
    parameters.compressionPreset = q.includes('maximum') || q.includes('small') ? 'maximum' : 'recommended';
  } else if (q.includes('merge') && (q.includes('pdf') || routing.detectedKind === 'pdf')) {
    toolId = 'pdf-merge';
  } else if (q.includes('split') || q.includes('extract page')) {
    toolId = 'pdf-split';
  } else if (q.includes('redact') || q.includes('blackout') || q.includes('censor')) {
    toolId = 'pdf-redact';
    requiresConfirmation = true;
    warnings.push('Redaction permanently strips text and rasterizes redacted pages.');
  } else if ((q.includes('image') || q.includes('photo') || q.includes('jpg') || q.includes('png')) && q.includes('pdf')) {
    toolId = 'pdf-images-to-pdf';
  } else if (q.includes('background') || q.includes('cutout') || q.includes('transparent')) {
    toolId = 'image-remove-bg';
  } else if (q.includes('resize') || q.includes('crop') || q.includes('rotate')) {
    toolId = files.length > 1 ? 'batch-lab' : 'image-crop-resize';
  } else if (q.includes('compress') || q.includes('webp') || q.includes('convert')) {
    if (routing.detectedKind === 'image' || q.includes('image') || q.includes('photo') || q.includes('webp')) {
      toolId = files.length > 1 ? 'batch-lab' : 'image-compress';
      if (q.includes('webp')) parameters.format = 'webp';
      else if (q.includes('jpg') || q.includes('jpeg')) parameters.format = 'jpeg';
      else if (q.includes('png')) parameters.format = 'png';
    }
  } else if (q.includes('metadata') || q.includes('exif')) {
    if (q.includes('remove') || q.includes('strip') || q.includes('clean')) {
      requiresConfirmation = true;
      toolId = files.length > 1 ? 'batch-lab' : 'privacy-metadata';
      warnings.push('Stripping EXIF/metadata creates a clean copy without embedded camera/GPS tags.');
    } else {
      toolId = 'privacy-metadata';
    }
  } else if (q.includes('extract audio') || (q.includes('audio') && q.includes('video'))) {
    toolId = 'video-trim-edit';
    parameters.format = 'wav';
  } else if (q.includes('gif')) {
    toolId = 'video-to-gif';
  } else if (q.includes('trim') && (q.includes('video') || routing.detectedKind === 'video')) {
    toolId = 'video-trim-edit';
  } else if (q.includes('normalize') || q.includes('silence') || q.includes('audio')) {
    toolId = 'audio-studio';
  } else if (q.includes('ocr') || q.includes('scan') || q.includes('extract text')) {
    toolId = 'ocr-extract';
  } else if (q.includes('compare') || q.includes('diff')) {
    toolId = 'doc-compare-assist';
  } else if (q.includes('zip') || q.includes('archive')) {
    toolId = 'office-zip';
  } else if (q.includes('csv') || q.includes('excel') || q.includes('xlsx')) {
    toolId = 'office-spreadsheet';
  } else if (q.includes('json') || q.includes('format') || q.includes('base64') || q.includes('jwt')) {
    toolId = q.includes('base64') || q.includes('jwt') ? 'dev-encoding-crypto' : 'dev-formatters';
  } else if (q.includes('batch') || files.length > 1) {
    toolId = 'batch-lab';
  }

  const tool = TOOL_REGISTRY.find((t) => t.id === toolId) || TOOL_REGISTRY[0];
  if (files.length === 0 && tool.requiresFile) {
    warnings.push(`${tool.name} expects an input file. Attach files above or add them in the studio.`);
  }

  return {
    summary: `Route ${files.length > 0 ? `${files.length} file(s)` : 'workspace'} to ${tool.name} (${tool.engineName}).`,
    toolId: tool.id,
    actionLabel: `Launch ${tool.name}`,
    requiresConfirmation,
    parameters,
    steps: [
      `Validate ${files.length > 0 ? `${files.length} attached file(s)` : 'input parameters'} against ${tool.name} rules.`,
      `Open ${tool.name} workspace with pre-configured local engine (${tool.engineName}).`,
      `Preview output in browser memory and export when ready.`,
    ],
    warnings,
  };
}
