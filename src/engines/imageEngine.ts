import { PDFDocument } from 'pdf-lib';
import { dataUrlToArrayBuffer, fileToCanvas } from '../utils/mediaUtils';

export interface ImageAdjustments {
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  saturation: number; // -100 to 100
  blur: number; // 0 to 20
  sharpen: number; // 0 to 100
  grayscale: boolean;
  sepia: boolean;
}

export interface CutoutOptions {
  enabled: boolean;
  tolerance: number; // 5 to 90
  feather: number; // 0 to 6 px
  defringe: boolean;
  recoverShadow: boolean;
  backdropMode: 'transparent' | 'white' | 'solid' | 'blur';
  backdropColor: string;
}

export interface WatermarkOptions {
  enabled: boolean;
  text: string;
  opacity: number; // 0.05 to 1
  fontSize: number;
  tiled: boolean;
  color: string;
}

export interface ImageTransformOptions {
  rotateDeg: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  cropRect: { x: number; y: number; w: number; h: number } | null; // normalized 0..1
  targetWidth: number | null;
  targetHeight: number | null;
}

export interface ImageProcessParams {
  cutout: CutoutOptions;
  adjustments: ImageAdjustments;
  transform: ImageTransformOptions;
  watermark: WatermarkOptions;
  outputFormat: 'image/png' | 'image/jpeg' | 'image/webp';
  quality: number; // 0.1 to 1.0
  maskOverrides?: Float32Array | null; // optional per-pixel alpha override (-1 = unset, 0..1 = forced alpha) in source pixel coords
}

export interface ProcessedImageResult {
  blob: Blob;
  width: number;
  height: number;
  durationMs: number;
  canvas: HTMLCanvasElement;
}

export const DEFAULT_IMAGE_PARAMS: ImageProcessParams = {
  cutout: {
    enabled: false,
    tolerance: 34,
    feather: 1.5,
    defringe: true,
    recoverShadow: false,
    backdropMode: 'transparent',
    backdropColor: '#1D4ED8',
  },
  adjustments: {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    blur: 0,
    sharpen: 0,
    grayscale: false,
    sepia: false,
  },
  transform: {
    rotateDeg: 0,
    flipH: false,
    flipV: false,
    cropRect: null,
    targetWidth: null,
    targetHeight: null,
  },
  watermark: {
    enabled: false,
    text: 'CONFIDENTIAL',
    opacity: 0.35,
    fontSize: 36,
    tiled: false,
    color: '#FFFFFF',
  },
  outputFormat: 'image/png',
  quality: 0.92,
  maskOverrides: null,
};

export async function loadImageCanvas(file: File | Blob): Promise<{
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}> {
  const { canvas, width, height } = await fileToCanvas(file);
  return { canvas, width, height };
}

/**
 * Edge-connected background segmentation + Sobel edge preservation + box feathering.
 * Works deterministically in pure browser memory with zero network uploads.
 */
export function computeCutoutAlphaMask(
  imageData: ImageData,
  tolerance: number,
  featherPx: number,
  defringe: boolean
): { mask: Uint8ClampedArray; data: Uint8ClampedArray } {
  const { width, height, data } = imageData;
  const total = width * height;
  const out = new Uint8ClampedArray(data);

  // Sample border ring pixels to estimate dominant background palette (up to 4 clusters via median/grid)
  const samples: Array<[number, number, number]> = [];
  const stepX = Math.max(1, Math.floor(width / 48));
  const stepY = Math.max(1, Math.floor(height / 48));

  for (let x = 0; x < width; x += stepX) {
    const topIdx = x * 4;
    const botIdx = ((height - 1) * width + x) * 4;
    samples.push([data[topIdx], data[topIdx + 1], data[topIdx + 2]]);
    samples.push([data[botIdx], data[botIdx + 1], data[botIdx + 2]]);
  }
  for (let y = 0; y < height; y += stepY) {
    const leftIdx = y * width * 4;
    const rightIdx = (y * width + (width - 1)) * 4;
    samples.push([data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]]);
    samples.push([data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]]);
  }

  // Compute mean & corner reference colors
  const corners = [
    0,
    width - 1,
    (height - 1) * width,
    height * width - 1,
  ].map((idx) => [data[idx * 4], data[idx * 4 + 1], data[idx * 4 + 2]] as [number, number, number]);

  let avgR = 0,
    avgG = 0,
    avgB = 0;
  for (const s of samples) {
    avgR += s[0];
    avgG += s[1];
    avgB += s[2];
  }
  avgR /= samples.length;
  avgG /= samples.length;
  avgB /= samples.length;
  const refs: Array<[number, number, number]> = [[avgR, avgG, avgB], ...corners];

  // Distance function weighted perceptually
  const colorDist = (r: number, g: number, b: number, ref: [number, number, number]) => {
    const dr = r - ref[0];
    const dg = g - ref[1];
    const db = b - ref[2];
    return Math.sqrt(0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db);
  };

  // Compute Sobel gradient magnitude to protect sharp foreground edges
  const grad = new Float32Array(total);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const l = (idx - 1) * 4;
      const r = (idx + 1) * 4;
      const u = (idx - width) * 4;
      const d = (idx + width) * 4;
      const gx =
        Math.abs(data[r] - data[l]) +
        Math.abs(data[r + 1] - data[l + 1]) +
        Math.abs(data[r + 2] - data[l + 2]);
      const gy =
        Math.abs(data[d] - data[u]) +
        Math.abs(data[d + 1] - data[u + 1]) +
        Math.abs(data[d + 2] - data[u + 2]);
      grad[idx] = (gx + gy) / 6;
    }
  }

  // BFS flood fill from all 4 image boundaries
  const bgVisited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const threshold = tolerance * 2.1;

  const tryEnqueue = (pIdx: number, parentR: number, parentG: number, parentB: number) => {
    if (bgVisited[pIdx]) return;
    const i4 = pIdx * 4;
    const r = data[i4];
    const g = data[i4 + 1];
    const b = data[i4 + 2];

    let minRefDist = Infinity;
    for (const ref of refs) {
      const d = colorDist(r, g, b, ref);
      if (d < minRefDist) minRefDist = d;
    }

    const localDist = Math.sqrt(
      0.299 * (r - parentR) ** 2 + 0.587 * (g - parentG) ** 2 + 0.114 * (b - parentB) ** 2
    );

    const edgePenalty = grad[pIdx] * 0.55;
    if (minRefDist + edgePenalty <= threshold && localDist <= threshold * 0.85) {
      bgVisited[pIdx] = 1;
      queue[tail++] = pIdx;
    }
  };

  // Seed perimeter
  for (let x = 0; x < width; x++) {
    const top = x;
    const bot = (height - 1) * width + x;
    tryEnqueue(top, data[top * 4], data[top * 4 + 1], data[top * 4 + 2]);
    tryEnqueue(bot, data[bot * 4], data[bot * 4 + 1], data[bot * 4 + 2]);
  }
  for (let y = 0; y < height; y++) {
    const left = y * width;
    const right = y * width + (width - 1);
    tryEnqueue(left, data[left * 4], data[left * 4 + 1], data[left * 4 + 2]);
    tryEnqueue(right, data[right * 4], data[right * 4 + 1], data[right * 4 + 2]);
  }

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % width;
    const cy = (cur - cx) / width;
    const c4 = cur * 4;
    const pr = data[c4];
    const pg = data[c4 + 1];
    const pb = data[c4 + 2];

    if (cx > 0) tryEnqueue(cur - 1, pr, pg, pb);
    if (cx < width - 1) tryEnqueue(cur + 1, pr, pg, pb);
    if (cy > 0) tryEnqueue(cur - width, pr, pg, pb);
    if (cy < height - 1) tryEnqueue(cur + width, pr, pg, pb);
  }

  // Build raw alpha mask
  const mask = new Uint8ClampedArray(total);
  for (let i = 0; i < total; i++) {
    if (bgVisited[i]) {
      mask[i] = 0;
    } else {
      // Soft falloff for near-threshold pixels
      const i4 = i * 4;
      let minRefDist = Infinity;
      for (const ref of refs) {
        const d = colorDist(data[i4], data[i4 + 1], data[i4 + 2], ref);
        if (d < minRefDist) minRefDist = d;
      }
      if (minRefDist < threshold * 0.75) {
        mask[i] = Math.round(Math.min(255, Math.max(40, ((minRefDist - threshold * 0.4) / (threshold * 0.35)) * 255)));
      } else {
        mask[i] = 255;
      }
    }
  }

  // Optional feather pass (separable 1D box blur on alpha mask)
  const radius = Math.round(featherPx);
  if (radius > 0) {
    const temp = new Float32Array(total);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        const x0 = Math.max(0, x - radius);
        const x1 = Math.min(width - 1, x + radius);
        for (let k = x0; k <= x1; k++) {
          sum += mask[y * width + k];
          count++;
        }
        temp[y * width + x] = sum / count;
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        const y0 = Math.max(0, y - radius);
        const y1 = Math.min(height - 1, y + radius);
        for (let k = y0; k <= y1; k++) {
          sum += temp[k * width + x];
          count++;
        }
        const orig = mask[y * width + x];
        const blurred = sum / count;
        // Preserve solid interior while feathering boundary pixels
        mask[y * width + x] = orig === 255 && blurred > 240 ? 255 : Math.round(blurred);
      }
    }
  }

  for (let i = 0; i < total; i++) {
    const a = mask[i];
    const i4 = i * 4;
    if (defringe && a > 10 && a < 235) {
      // Pull semi-transparent boundary pixel slightly away from background average color
      const t = (255 - a) / 255;
      out[i4] = Math.min(255, Math.max(0, Math.round(out[i4] - (avgR - out[i4]) * t * 0.35)));
      out[i4 + 1] = Math.min(255, Math.max(0, Math.round(out[i4 + 1] - (avgG - out[i4 + 1]) * t * 0.35)));
      out[i4 + 2] = Math.min(255, Math.max(0, Math.round(out[i4 + 2] - (avgB - out[i4 + 2]) * t * 0.35)));
    }
    out[i4 + 3] = Math.round((data[i4 + 3] * a) / 255);
  }

  return { mask, data: out };
}

function applySharpen(ctx: CanvasRenderingContext2D, width: number, height: number, amount: number) {
  if (amount <= 0) return;
  const strength = (amount / 100) * 0.8;
  const imgData = ctx.getImageData(0, 0, width, height);
  const src = imgData.data;
  const dst = new Uint8ClampedArray(src);
  const center = 1 + 4 * strength;
  const side = -strength;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const val =
          src[idx + c] * center +
          src[idx - 4 + c] * side +
          src[idx + 4 + c] * side +
          src[idx - width * 4 + c] * side +
          src[idx + width * 4 + c] * side;
        dst[idx + c] = Math.min(255, Math.max(0, val));
      }
    }
  }
  imgData.data.set(dst);
  ctx.putImageData(imgData, 0, 0);
}

export async function processImageCanvas(
  sourceCanvas: HTMLCanvasElement,
  params: ImageProcessParams
): Promise<ProcessedImageResult> {
  const start = performance.now();

  // Step 1: Work on source canvas (cutout + brush overrides)
  const workCanvas = document.createElement('canvas');
  workCanvas.width = sourceCanvas.width;
  workCanvas.height = sourceCanvas.height;
  const workCtx = workCanvas.getContext('2d');
  if (!workCtx) throw new Error('Could not initialize image canvas context');
  workCtx.drawImage(sourceCanvas, 0, 0);

  if (params.cutout.enabled) {
    const imgData = workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);
    const { data } = computeCutoutAlphaMask(
      imgData,
      params.cutout.tolerance,
      params.cutout.feather,
      params.cutout.defringe
    );
    if (params.maskOverrides && params.maskOverrides.length === workCanvas.width * workCanvas.height) {
      for (let i = 0; i < params.maskOverrides.length; i++) {
        const override = params.maskOverrides[i];
        if (override >= 0) {
          data[i * 4 + 3] = Math.round(override * 255);
        }
      }
    }
    const nextData = new ImageData(new Uint8ClampedArray(data), workCanvas.width, workCanvas.height);
    workCtx.putImageData(nextData, 0, 0);
  } else if (params.maskOverrides && params.maskOverrides.length === workCanvas.width * workCanvas.height) {
    const imgData = workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);
    for (let i = 0; i < params.maskOverrides.length; i++) {
      const override = params.maskOverrides[i];
      if (override >= 0) {
        imgData.data[i * 4 + 3] = Math.round(override * 255);
      }
    }
    workCtx.putImageData(imgData, 0, 0);
  }

  // Step 2: Crop rectangle in source coordinates
  const crop = params.transform.cropRect || { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.max(0, Math.round(crop.x * workCanvas.width));
  const sy = Math.max(0, Math.round(crop.y * workCanvas.height));
  const sw = Math.max(1, Math.min(workCanvas.width - sx, Math.round(crop.w * workCanvas.width)));
  const sh = Math.max(1, Math.min(workCanvas.height - sy, Math.round(crop.h * workCanvas.height)));

  // Step 3: Rotation & final target dimensions
  const rotated90 = params.transform.rotateDeg === 90 || params.transform.rotateDeg === 270;
  const baseW = rotated90 ? sh : sw;
  const baseH = rotated90 ? sw : sh;
  const outW = Math.max(1, Math.round(params.transform.targetWidth || baseW));
  const outH = Math.max(1, Math.round(params.transform.targetHeight || baseH));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('Could not initialize output canvas context');

  // Optional backdrop if cutout is active or JPEG output
  if (params.cutout.enabled && params.cutout.backdropMode !== 'transparent') {
    if (params.cutout.backdropMode === 'white') {
      outCtx.fillStyle = '#FFFFFF';
      outCtx.fillRect(0, 0, outW, outH);
    } else if (params.cutout.backdropMode === 'solid') {
      outCtx.fillStyle = params.cutout.backdropColor || '#1D4ED8';
      outCtx.fillRect(0, 0, outW, outH);
    } else if (params.cutout.backdropMode === 'blur') {
      outCtx.save();
      outCtx.filter = 'blur(18px)';
      outCtx.drawImage(sourceCanvas, sx, sy, sw, sh, -16, -16, outW + 32, outH + 32);
      outCtx.restore();
    }
  } else if (params.outputFormat === 'image/jpeg') {
    outCtx.fillStyle = '#FFFFFF';
    outCtx.fillRect(0, 0, outW, outH);
  }

  // Apply CSS Canvas filters for tone adjustments
  const adj = params.adjustments;
  const filterParts: string[] = [];
  if (adj.brightness !== 0) filterParts.push(`brightness(${100 + adj.brightness}%)`);
  if (adj.contrast !== 0) filterParts.push(`contrast(${100 + adj.contrast}%)`);
  if (adj.saturation !== 0) filterParts.push(`saturate(${100 + adj.saturation}%)`);
  if (adj.blur > 0) filterParts.push(`blur(${adj.blur}px)`);
  if (adj.grayscale) filterParts.push('grayscale(100%)');
  if (adj.sepia) filterParts.push('sepia(100%)');

  outCtx.save();
  if (filterParts.length > 0) {
    outCtx.filter = filterParts.join(' ');
  }
  if (params.cutout.enabled && params.cutout.recoverShadow) {
    outCtx.shadowColor = 'rgba(15, 23, 42, 0.35)';
    outCtx.shadowBlur = Math.max(8, Math.round(outW * 0.02));
    outCtx.shadowOffsetY = Math.max(4, Math.round(outH * 0.015));
  }

  outCtx.translate(outW / 2, outH / 2);
  outCtx.rotate((params.transform.rotateDeg * Math.PI) / 180);
  outCtx.scale(params.transform.flipH ? -1 : 1, params.transform.flipV ? -1 : 1);

  const drawW = rotated90 ? outH : outW;
  const drawH = rotated90 ? outW : outH;
  outCtx.drawImage(workCanvas, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
  outCtx.restore();

  if (adj.sharpen > 0) {
    applySharpen(outCtx, outW, outH, adj.sharpen);
  }

  // Step 4: Watermark overlay
  if (params.watermark.enabled && params.watermark.text.trim()) {
    outCtx.save();
    outCtx.globalAlpha = params.watermark.opacity;
    outCtx.fillStyle = params.watermark.color || '#FFFFFF';
    const scaledFont = Math.max(14, Math.round((params.watermark.fontSize / 1000) * outW));
    outCtx.font = `600 ${scaledFont}px "Plus Jakarta Sans", sans-serif`;
    outCtx.textBaseline = 'middle';
    outCtx.textAlign = 'center';

    if (params.watermark.tiled) {
      outCtx.translate(outW / 2, outH / 2);
      outCtx.rotate(-Math.PI / 6);
      const stepX = Math.max(160, scaledFont * params.watermark.text.length * 0.75);
      const stepY = Math.max(110, scaledFont * 3);
      for (let y = -outH; y <= outH; y += stepY) {
        for (let x = -outW; x <= outW; x += stepX) {
          outCtx.fillText(params.watermark.text, x, y);
        }
      }
    } else {
      outCtx.textAlign = 'right';
      outCtx.fillText(params.watermark.text, outW - Math.round(outW * 0.04), outH - Math.round(outH * 0.06));
    }
    outCtx.restore();
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    outCanvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to encode output image'));
      },
      params.outputFormat,
      params.outputFormat === 'image/png' ? undefined : params.quality
    );
  });

  return {
    blob,
    width: outW,
    height: outH,
    durationMs: performance.now() - start,
    canvas: outCanvas,
  };
}

export async function generatePassportSheet(
  sourceCanvas: HTMLCanvasElement,
  preset: '35x45mm' | '2x2in',
  sheetType: '4x6in' | 'a4',
  bgHex = '#FFFFFF',
  outputFormat: 'image/jpeg' | 'image/png' | 'application/pdf' = 'image/jpeg'
): Promise<ProcessedImageResult> {
  const start = performance.now();
  const dpi = 300;
  const sheetW = sheetType === '4x6in' ? 6 * dpi : Math.round(8.27 * dpi);
  const sheetH = sheetType === '4x6in' ? 4 * dpi : Math.round(11.69 * dpi);

  const photoW = preset === '35x45mm' ? Math.round((35 / 25.4) * dpi) : 2 * dpi;
  const photoH = preset === '35x45mm' ? Math.round((45 / 25.4) * dpi) : 2 * dpi;

  const canvas = document.createElement('canvas');
  canvas.width = sheetW;
  canvas.height = sheetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, sheetW, sheetH);

  const gap = 36;
  const cols = Math.max(1, Math.floor((sheetW - gap) / (photoW + gap)));
  const rows = Math.max(1, Math.floor((sheetH - gap) / (photoH + gap)));

  const startX = Math.round((sheetW - (cols * photoW + (cols - 1) * gap)) / 2);
  const startY = Math.round((sheetH - (rows * photoH + (rows - 1) * gap)) / 2);

  // Center-crop source to photo aspect ratio
  const srcAspect = sourceCanvas.width / sourceCanvas.height;
  const dstAspect = photoW / photoH;
  let sx = 0,
    sy = 0,
    sw = sourceCanvas.width,
    sh = sourceCanvas.height;
  if (srcAspect > dstAspect) {
    sw = Math.round(sourceCanvas.height * dstAspect);
    sx = Math.round((sourceCanvas.width - sw) / 2);
  } else {
    sh = Math.round(sourceCanvas.width / dstAspect);
    sy = Math.round((sourceCanvas.height - sh) / 2);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = startX + c * (photoW + gap);
      const py = startY + r * (photoH + gap);
      ctx.fillStyle = bgHex;
      ctx.fillRect(px, py, photoW, photoH);
      ctx.drawImage(sourceCanvas, sx, sy, sw, sh, px, py, photoW, photoH);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, photoW, photoH);
    }
  }

  let blob: Blob;
  if (outputFormat === 'application/pdf') {
    const imgUrl = canvas.toDataURL('image/png');
    const imgBytes = dataUrlToArrayBuffer(imgUrl);
    const pdfDoc = await PDFDocument.create();
    const embedded = await pdfDoc.embedPng(imgBytes);
    const pageW = (sheetW * 72) / dpi;
    const pageH = (sheetH * 72) / dpi;
    const page = pdfDoc.addPage([pageW, pageH]);
    page.drawImage(embedded, { x: 0, y: 0, width: pageW, height: pageH });
    const pdfBytes = await pdfDoc.save();
    blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  } else {
    const imgMime = outputFormat === 'image/png' ? 'image/png' : 'image/jpeg';
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode passport sheet'))),
        imgMime,
        imgMime === 'image/png' ? undefined : 0.95
      );
    });
  }

  return {
    blob,
    width: sheetW,
    height: sheetH,
    durationMs: performance.now() - start,
    canvas,
  };
}
