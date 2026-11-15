import type { ToolDefinition } from '../types/workspace';
import { sanitizeDownloadFilename } from './sanitize';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val >= 100 || idx === 0 ? val.toFixed(0) : val.toFixed(val >= 10 ? 1 : 2)} ${units[idx]}`;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00.0';
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${rem.toFixed(1).padStart(4, '0')}`;
}

export function replaceFileExtension(filename: string, newExt: string): string {
  const cleanExt = newExt.replace(/^\./, '').toLowerCase();
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) return `${filename}.${cleanExt}`;
  return `${filename.slice(0, lastDot)}.${cleanExt}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeDownloadFilename(filename, 'export');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function validateFilesForTool(
  files: File[],
  tool: ToolDefinition
): { valid: File[]; errors: string[] } {
  const valid: File[] = [];
  const errors: string[] = [];

  if (files.length === 0) {
    return { valid, errors: ['No files selected.'] };
  }

  const allowsAny = tool.acceptedExtensions.includes('*') || tool.acceptedExtensions.length === 0;

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const mime = file.type.toLowerCase();
    const maxBytes = tool.maxRecommendedSizeMB * 1024 * 1024;

    if (file.size === 0) {
      errors.push(`"${file.name}" is empty (0 B). Please select a non-empty file.`);
      continue;
    }

    if (file.size > maxBytes) {
      errors.push(
        `"${file.name}" (${formatBytes(file.size)}) exceeds the recommended ${tool.maxRecommendedSizeMB} MB browser limit.`
      );
      continue;
    }

    if (!allowsAny) {
      const extMatch = tool.acceptedExtensions.includes(ext);
      const mimeMatch = tool.acceptedMimePrefixes.some((p) => mime.startsWith(p));
      if (!extMatch && !mimeMatch) {
        errors.push(
          `"${file.name}" (.${ext || 'unknown'}) is not supported by ${tool.name}. Expected: ${tool.acceptedExtensions
            .map((e) => e.toUpperCase())
            .join(', ')}.`
        );
        continue;
      }
    }

    valid.push(file);
  }

  if (!tool.supportsMultiple && valid.length > 1) {
    valid.splice(1);
  }

  return { valid, errors };
}

export async function urlToFile(url: string, filename: string, mimeType = 'image/jpeg'): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not load sample file: ${filename}`);
  }
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || mimeType });
}
