/**
 * Shared browser Canvas, ImageBitmap, DataURL, MIME, and Web Audio helpers.
 */

export async function fileToCanvas(
  file: File | Blob,
  maxDimension?: number
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    if (maxDimension && Math.max(bitmap.width, bitmap.height) > maxDimension) {
      const scale = maxDimension / Math.max(bitmap.width, bitmap.height);
      width = Math.max(1, Math.round(bitmap.width * scale));
      height = Math.max(1, Math.round(bitmap.height * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D Canvas context unavailable');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { canvas, ctx, width, height };
  } finally {
    bitmap.close();
  }
}

export function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('Invalid data URL');
  }
  const meta = dataUrl.slice(0, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  if (meta.includes(';base64')) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
  const decoded = decodeURIComponent(payload);
  return new TextEncoder().encode(decoded).buffer;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(',');
  const meta = commaIdx >= 0 ? dataUrl.slice(0, commaIdx) : '';
  const mimeMatch = meta.match(/^data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  return new Blob([dataUrlToArrayBuffer(dataUrl)], { type: mime });
}

export function imageMimeToExt(mime: string): 'jpg' | 'webp' | 'png' {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

export function createBrowserAudioContext(): AudioContext {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new AudioCtx();
}
