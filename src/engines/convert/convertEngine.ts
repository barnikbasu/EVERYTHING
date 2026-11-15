import mammoth from 'mammoth';
import { PDFDocument } from 'pdf-lib';
import { detectFileFormat, validateOutputSignature } from './formatDetector';
import {
  detectRuntimeCodecCapabilities,
  findConversionDefinition,
  isDefinitionExecutable,
} from './compatibilityRegistry';
import {
  decodeBmpRgba,
  encodeBmpRgba,
  encodeIcoFromPngBuffers,
  extractLargestFrameFromIco,
  writeZipEntries,
} from './binaryCodecs';
import {
  htmlToMarkdownUniversal,
  markdownToCleanHtmlDocument,
  parseCsvOrTsvText,
  parseStructuredInput,
  renderFormattedTextToPdf,
  rowsToHtmlDocument,
  rowsToMarkdownTable,
  serializeStructuredOutput,
} from './structuredCodec';
import { runArchiveOffloaded, runStructuredOffloaded } from './workerBridge';
import {
  cleanSpreadsheetRows,
  exportSpreadsheet,
  parseRtfText,
  parseSpreadsheetFile,
} from '../officeEngine';
import {
  compressPdf,
  extractPdfText,
  parsePageRangeExpression,
  renderPdfPagesToImageBlobs,
} from '../pdfEngine';
import { decodeAudioFile, encodeAudioBufferToWav } from '../audioEngine';
import {
  exportVideoToGif,
  extractAudioTrackFromVideo,
  extractVideoThumbnails,
  transcodeVideoWithCanvas,
} from '../videoEngine';
import { createBrowserAudioContext, dataUrlToArrayBuffer, fileToCanvas } from '../../utils/mediaUtils';
import { formatBytes, replaceFileExtension } from '../../utils/formatters';
import type { ConversionResult, ConversionSettings, ConvertFormatId } from './types';

export function estimateConversionOutput(
  fileSize: number,
  sourceFormat: ConvertFormatId | 'unknown',
  targetFormat: ConvertFormatId,
  settings: ConversionSettings,
  meta?: { width?: number; height?: number; durationSec?: number }
): string | null {
  if (sourceFormat === 'unknown') return null;

  // Uncompressed 24/32-bit BI_RGB BMP exact byte size
  if (targetFormat === 'bmp' && meta?.width && meta?.height) {
    let w = settings.width && settings.width > 0 ? Math.round(settings.width) : meta.width;
    let h = settings.height && settings.height > 0 ? Math.round(settings.height) : meta.height;
    if (settings.maintainAspect) {
      if (settings.width && !settings.height) {
        h = Math.max(1, Math.round((w * meta.height) / meta.width));
      } else if (!settings.width && settings.height) {
        w = Math.max(1, Math.round((h * meta.width) / meta.height));
      }
    }
    const bpp = settings.preserveTransparency ? 4 : 3;
    const stride = Math.ceil((w * bpp) / 4) * 4;
    const exactBytes = 54 + stride * h;
    return `~${formatBytes(exactBytes)} uncompressed (${w}×${h})`;
  }

  // Uncompressed 16-bit PCM WAV exact byte size
  if (targetFormat === 'wav' && meta?.durationSec && meta.durationSec > 0) {
    const samples = Math.round(meta.durationSec * settings.sampleRate);
    const exactBytes = 44 + samples * settings.channels * 2;
    return `~${formatBytes(exactBytes)} (${settings.sampleRate / 1000} kHz, ${settings.channels}ch PCM)`;
  }

  // Uncompressed POSIX USTAR TAR packaging of a single file
  if (targetFormat === 'tar' && !['zip', 'tar', 'gz', 'tar.gz'].includes(sourceFormat)) {
    const blocks = Math.ceil(fileSize / 512) * 512;
    return `~${formatBytes(512 + blocks + 1024)} (USTAR uncompressed)`;
  }

  return null;
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('Conversion cancelled by user.');
  }
}

async function decodeAnyImageToCanvas(
  file: File,
  sourceFormat: ConvertFormatId
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  if (sourceFormat === 'bmp') {
    const raw = new Uint8Array(await file.arrayBuffer());
    const { width, height, rgba } = decodeBmpRgba(raw);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D Canvas unavailable');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    return { canvas, width, height };
  }

  if (sourceFormat === 'ico') {
    const raw = new Uint8Array(await file.arrayBuffer());
    const extracted = extractLargestFrameFromIco(raw);
    if (extracted.pngBytes) {
      const pngBlob = new Blob([new Uint8Array(extracted.pngBytes)], { type: 'image/png' });
      const { canvas, width, height } = await fileToCanvas(pngBlob);
      return { canvas, width, height };
    }
    throw new Error('Legacy DIB-only ICO without embedded PNG frame is not supported for raster decoding.');
  }

  if (sourceFormat === 'svg') {
    const svgText = await file.text();
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Could not parse or render SVG markup.'));
        el.src = url;
      });
      const w = Math.max(1, img.naturalWidth || 512);
      const h = Math.max(1, img.naturalHeight || 512);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D Canvas unavailable');
      ctx.drawImage(img, 0, 0, w, h);
      return { canvas, width: w, height: h };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const { canvas, width, height } = await fileToCanvas(file);
  return { canvas, width, height };
}

function resizeCanvasForSettings(
  sourceCanvas: HTMLCanvasElement,
  settings: ConversionSettings,
  backgroundFill?: string
): HTMLCanvasElement {
  let targetW = settings.width && settings.width > 0 ? Math.round(settings.width) : sourceCanvas.width;
  let targetH = settings.height && settings.height > 0 ? Math.round(settings.height) : sourceCanvas.height;

  if (settings.maintainAspect) {
    if (settings.width && !settings.height) {
      targetH = Math.max(1, Math.round((targetW * sourceCanvas.height) / sourceCanvas.width));
    } else if (!settings.width && settings.height) {
      targetW = Math.max(1, Math.round((targetH * sourceCanvas.width) / sourceCanvas.height));
    }
  }

  const out = document.createElement('canvas');
  out.width = Math.max(1, targetW);
  out.height = Math.max(1, targetH);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D Canvas unavailable');

  if (backgroundFill) {
    ctx.fillStyle = backgroundFill;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, out.width, out.height);
  return out;
}

async function canvasToBlobAsync(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`Failed to encode ${mime}`))),
      mime,
      quality
    );
  });
}

async function encodeImageCanvasToTarget(
  srcCanvas: HTMLCanvasElement,
  targetFormat: ConvertFormatId,
  settings: ConversionSettings
): Promise<Blob> {
  const needsOpaqueBg =
    targetFormat === 'jpg' ||
    targetFormat === 'jpeg' ||
    !settings.preserveTransparency;

  const resized = resizeCanvasForSettings(
    srcCanvas,
    settings,
    needsOpaqueBg ? settings.backgroundColor || '#FFFFFF' : undefined
  );

  if (targetFormat === 'png') {
    return canvasToBlobAsync(resized, 'image/png');
  }
  if (targetFormat === 'jpg' || targetFormat === 'jpeg') {
    return canvasToBlobAsync(resized, 'image/jpeg', Math.max(0.1, Math.min(1, settings.quality / 100)));
  }
  if (targetFormat === 'webp') {
    return canvasToBlobAsync(resized, 'image/webp', Math.max(0.1, Math.min(1, settings.quality / 100)));
  }
  if (targetFormat === 'avif') {
    return canvasToBlobAsync(resized, 'image/avif', Math.max(0.1, Math.min(1, settings.quality / 100)));
  }
  if (targetFormat === 'bmp') {
    const ctx = resized.getContext('2d');
    if (!ctx) throw new Error('2D Canvas unavailable');
    const imgData = ctx.getImageData(0, 0, resized.width, resized.height);
    const bmpBytes = encodeBmpRgba(imgData.data, resized.width, resized.height, settings.preserveTransparency);
    return new Blob([new Uint8Array(bmpBytes)], { type: 'image/bmp' });
  }
  if (targetFormat === 'ico') {
    const icoSizes = [16, 32, 48, 64];
    const frames: Array<{ width: number; height: number; pngBytes: Uint8Array }> = [];
    for (const s of icoSizes) {
      const c = document.createElement('canvas');
      c.width = s;
      c.height = s;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(resized, 0, 0, s, s);
        const pngBlob = await canvasToBlobAsync(c, 'image/png');
        frames.push({ width: s, height: s, pngBytes: new Uint8Array(await pngBlob.arrayBuffer()) });
      }
    }
    const icoBytes = encodeIcoFromPngBuffers(frames);
    return new Blob([new Uint8Array(icoBytes)], { type: 'image/x-icon' });
  }
  if (targetFormat === 'gif') {
    const gifMod = await import('gifenc');
    const gifNs = (
      'GIFEncoder' in gifMod
        ? gifMod
        : (gifMod as unknown as { default: typeof gifMod }).default
    ) as typeof gifMod;
    const { GIFEncoder, quantize, applyPalette } = gifNs;
    const ctx = resized.getContext('2d');
    if (!ctx) throw new Error('2D Canvas unavailable');
    const { data } = ctx.getImageData(0, 0, resized.width, resized.height);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    const gif = GIFEncoder();
    gif.writeFrame(index, resized.width, resized.height, { palette });
    gif.finish();
    return new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' });
  }
  if (targetFormat === 'pdf') {
    const usePng = settings.preserveTransparency;
    const mime = usePng ? 'image/png' : 'image/jpeg';
    const dataUrl = resized.toDataURL(mime, usePng ? undefined : Math.max(0.2, settings.quality / 100));
    const imgBytes = dataUrlToArrayBuffer(dataUrl);
    const pdfDoc = await PDFDocument.create();
    const embedded = usePng ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
    if (settings.pageSize === 'fit') {
      const p = pdfDoc.addPage([embedded.width, embedded.height]);
      p.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    } else {
      const base: [number, number] = settings.pageSize === 'letter' ? [612, 792] : [595.28, 841.89];
      const dims: [number, number] = settings.orientation === 'landscape' ? [base[1], base[0]] : base;
      const page = pdfDoc.addPage(dims);
      const margin = 24;
      const scale = Math.min((dims[0] - margin * 2) / embedded.width, (dims[1] - margin * 2) / embedded.height);
      const dw = embedded.width * scale;
      const dh = embedded.height * scale;
      page.drawImage(embedded, { x: (dims[0] - dw) / 2, y: (dims[1] - dh) / 2, width: dw, height: dh });
    }
    const outBytes = await pdfDoc.save();
    return new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' });
  }

  throw new Error(`Unsupported target image format: ${targetFormat}`);
}

// Archive conversions run inside convertWorker.ts via runArchiveOffloaded

export async function executeFileConversion(
  file: File,
  targetFormat: ConvertFormatId,
  settings: ConversionSettings,
  options: {
    signal?: AbortSignal;
    onProgress?: (pct: number, stepLabel: string) => void;
    detectedHint?: ConvertFormatId;
  } = {}
): Promise<ConversionResult> {
  const t0 = performance.now();
  const { signal, onProgress } = options;
  checkAborted(signal);

  onProgress?.(8, 'Inspecting file signature…');
  const detected = await detectFileFormat(file);
  const sourceFormat =
    detected.format !== 'unknown'
      ? detected.format
      : options.detectedHint || 'unknown';

  if (sourceFormat === 'unknown') {
    throw new Error(`Could not identify file signature or format for "${file.name}".`);
  }

  const normalizedSrc: ConvertFormatId = sourceFormat === 'jpeg' ? 'jpg' : sourceFormat;
  const normalizedTgt: ConvertFormatId = targetFormat === 'jpeg' ? 'jpg' : targetFormat;

  const def = findConversionDefinition(normalizedSrc, normalizedTgt);
  if (!def) {
    throw new Error(`Conversion ${normalizedSrc.toUpperCase()} → ${normalizedTgt.toUpperCase()} is not supported.`);
  }

  const caps = detectRuntimeCodecCapabilities();
  const isNodeTestEnv = typeof document === 'undefined';
  if (!isNodeTestEnv) {
    const execCheck = isDefinitionExecutable(def, caps);
    if (!execCheck.executable) {
      throw new Error(execCheck.reason || `Conversion unavailable in this browser.`);
    }
  }

  checkAborted(signal);
  const warnings: string[] = [];
  if (detected.extensionMismatch) {
    warnings.push(
      `File extension ".${detected.declaredExtension}" disagreed with detected signature (${detected.label}); converted using real content signature.`
    );
  }

  let outBlob: Blob;
  let outExt = def.outputExtension;
  let outMime = def.outputMimeType;
  let previewKind: ConversionResult['previewKind'] = 'none';
  let previewText: string | undefined;
  let archiveEntries: Array<{ path: string; size: number; dir: boolean }> | undefined;

  // ===================== 1. ARCHIVE CONVERSIONS =====================
  if (def.category === 'archive') {
    onProgress?.(25, `Processing ${normalizedSrc.toUpperCase()} → ${normalizedTgt.toUpperCase()} in worker…`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const arch = await runArchiveOffloaded(
      {
        filename: file.name,
        sourceFormat: normalizedSrc,
        targetFormat: normalizedTgt,
        bytes,
      },
      signal
    );
    outBlob = new Blob([new Uint8Array(arch.bytes)], { type: arch.mime });
    outExt = arch.ext;
    archiveEntries = arch.entries;
    previewKind = normalizedTgt === 'txt' ? 'text' : 'archive';
    if (normalizedTgt === 'txt') {
      previewText = arch.previewText ?? (await outBlob.text());
    }
  }
  // ===================== 2. IMAGE SOURCE CONVERSIONS =====================
  else if (
    ['jpg', 'png', 'webp', 'bmp', 'gif', 'svg', 'ico', 'avif'].includes(normalizedSrc) &&
    def.category === 'image'
  ) {
    onProgress?.(30, 'Decoding source image onto Canvas…');
    const { canvas } = await decodeAnyImageToCanvas(file, normalizedSrc);
    checkAborted(signal);
    onProgress?.(68, `Encoding ${normalizedTgt.toUpperCase()} output…`);
    outBlob = await encodeImageCanvasToTarget(canvas, normalizedTgt, settings);
    if (normalizedSrc === 'gif' && normalizedTgt !== 'gif') {
      warnings.push('Animated GIFs convert using the first decoded raster frame.');
    }
    previewKind = normalizedTgt === 'pdf' ? 'pdf' : 'image';
  }
  // ===================== 3. PDF SOURCE CONVERSIONS =====================
  else if (normalizedSrc === 'pdf') {
    if (normalizedTgt === 'pdf') {
      onProgress?.(35, 'Optimizing PDF…');
      outBlob = await compressPdf(file, settings.pdfCompression, (p) =>
        onProgress?.(35 + Math.round(p * 0.6), 'Optimizing PDF pages…')
      );
      previewKind = 'pdf';
    } else if (normalizedTgt === 'png' || normalizedTgt === 'jpg' || normalizedTgt === 'webp') {
      const rendered = await renderPdfPagesToImageBlobs(file, {
        targetFormat: normalizedTgt,
        dpi: settings.dpi,
        quality: settings.quality,
        pageRange: settings.pageRange,
        signal,
        onProgress,
      });

      if (rendered.length === 1) {
        outBlob = rendered[0].blob;
        previewKind = 'image';
      } else {
        const zipBytes = await writeZipEntries(
          rendered.map((r) => ({ path: r.name, data: r.bytes }))
        );
        outBlob = new Blob([new Uint8Array(zipBytes)], { type: 'application/zip' });
        outMime = 'application/zip';
        outExt = `${normalizedTgt}_pages.zip`;
        archiveEntries = rendered.map((r) => ({ path: r.name, size: r.bytes.length, dir: false }));
        previewKind = 'archive';
        warnings.push(`Exported ${rendered.length} pages packaged inside a single ZIP archive.`);
      }
    } else {
      onProgress?.(40, 'Extracting text from PDF…');
      const pages = await extractPdfText(file);
      const selectedIdx = settings.pageRange.trim()
        ? new Set(parsePageRangeExpression(settings.pageRange, pages.length))
        : null;
      const filteredPages = selectedIdx ? pages.filter((_, idx) => selectedIdx.has(idx)) : pages;
      if (filteredPages.every((p) => !p.text.trim())) {
        warnings.push('Extracted PDF text is empty — this PDF appears scanned or image-only. Use OCR Studio for optical recognition.');
      }
      if (normalizedTgt === 'txt') {
        previewText = filteredPages.map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`).join('\n\n');
        outBlob = new Blob([previewText], { type: 'text/plain;charset=utf-8' });
      } else if (normalizedTgt === 'md') {
        previewText = filteredPages.map((p) => `## Page ${p.pageNumber}\n\n${p.text}`).join('\n\n');
        outBlob = new Blob([previewText], { type: 'text/markdown;charset=utf-8' });
      } else {
        const mdSource = filteredPages.map((p) => `## Page ${p.pageNumber}\n\n${p.text}`).join('\n\n');
        previewText = markdownToCleanHtmlDocument(mdSource, file.name);
        outBlob = new Blob([previewText], { type: 'text/html;charset=utf-8' });
      }
      previewKind = 'text';
    }
  }
  // ===================== 4. AUDIO CONVERSIONS =====================
  else if (def.category === 'audio') {
    onProgress?.(35, 'Decoding audio buffer via Web Audio API…');
    const sourceBuf = await decodeAudioFile(file);
    checkAborted(signal);
    const targetRate = settings.sampleRate;
    const targetChannels = settings.channels;
    const targetLen = Math.max(1, Math.round((sourceBuf.length / sourceBuf.sampleRate) * targetRate));
    const offline = new OfflineAudioContext(targetChannels, targetLen, targetRate);
    const srcNode = offline.createBufferSource();
    srcNode.buffer = sourceBuf;
    srcNode.connect(offline.destination);
    srcNode.start(0);
    onProgress?.(70, `Resampling (${targetRate} Hz, ${targetChannels}ch)…`);
    const renderedBuf = await offline.startRendering();

    if (normalizedTgt === 'wav') {
      outBlob = encodeAudioBufferToWav(renderedBuf);
      previewKind = 'audio';
    } else {
      const targetMime =
        normalizedTgt === 'ogg' ? 'audio/ogg;codecs=opus' : 'audio/webm;codecs=opus';
      if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(targetMime)) {
        throw new Error(`${targetMime} recording is unsupported in this browser.`);
      }
      onProgress?.(80, `Encoding ${normalizedTgt.toUpperCase()} Opus stream…`);
      const actx = createBrowserAudioContext();
      try {
        const dest = actx.createMediaStreamDestination();
        const playSrc = actx.createBufferSource();
        playSrc.buffer = renderedBuf;
        playSrc.connect(dest);
        const recorder = new MediaRecorder(dest.stream, {
          mimeType: targetMime,
          audioBitsPerSecond: settings.audioBitrateKbps * 1000,
        });
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        outBlob = await new Promise<Blob>((resolve, reject) => {
          const abortHandler = () => {
            if (recorder.state !== 'inactive') recorder.stop();
            playSrc.stop();
            reject(new Error('Audio conversion cancelled.'));
          };
          signal?.addEventListener('abort', abortHandler, { once: true });
          recorder.onerror = () => reject(new Error('MediaRecorder audio encoding error.'));
          recorder.onstop = () => {
            signal?.removeEventListener('abort', abortHandler);
            resolve(new Blob(chunks, { type: targetMime }));
          };
          playSrc.onended = () => {
            if (recorder.state !== 'inactive') recorder.stop();
          };
          recorder.start();
          playSrc.start();
        });
        previewKind = 'audio';
      } finally {
        await actx.close().catch(() => {});
      }
    }
  }
  // ===================== 5. VIDEO CONVERSIONS =====================
  else if (def.category === 'video') {
    const videoUrl = URL.createObjectURL(file);
    try {
      if (normalizedTgt === 'wav') {
        onProgress?.(45, 'Extracting audio track to PCM WAV…');
        outBlob = await extractAudioTrackFromVideo(file);
        previewKind = 'audio';
      } else if (normalizedTgt === 'png') {
        onProgress?.(50, 'Capturing video frame…');
        const stills = await extractVideoThumbnails(videoUrl, [0.5]);
        if (stills.length === 0) throw new Error('Could not capture frame from video.');
        outBlob = stills[0].blob;
        previewKind = 'image';
      } else if (normalizedTgt === 'gif') {
        onProgress?.(20, 'Sampling video frames into GIF…');
        const vidEl = document.createElement('video');
        vidEl.src = videoUrl;
        await new Promise<void>((res, rej) => {
          vidEl.onloadedmetadata = () => res();
          vidEl.onerror = () => rej(new Error('Unable to read video duration'));
        });
        const spanEnd = Math.min(Number.isFinite(vidEl.duration) ? vidEl.duration : 8, 12);
        outBlob = await exportVideoToGif(
          videoUrl,
          { trimStartSec: 0, trimEndSec: Math.max(0.5, spanEnd), fps: settings.videoFps, width: Math.min(640, settings.videoMaxWidth) },
          (p) => onProgress?.(20 + Math.round(p * 0.75), 'Quantizing animated GIF…'),
          signal
        );
        previewKind = 'image';
      } else {
        onProgress?.(15, 'Transcoding video frames via MediaRecorder…');
        const vidEl = document.createElement('video');
        vidEl.src = videoUrl;
        await new Promise<void>((res, rej) => {
          vidEl.onloadedmetadata = () => res();
          vidEl.onerror = () => rej(new Error('Unable to read video metadata'));
        });
        const endSec = Number.isFinite(vidEl.duration) && vidEl.duration > 0 ? vidEl.duration : 10;
        outBlob = await transcodeVideoWithCanvas(
          videoUrl,
          {
            trimStartSec: 0,
            trimEndSec: endSec,
            rotateDeg: 0,
            aspectPreset: settings.videoAspectRatio,
            maxWidth: settings.videoMaxWidth,
            muteAudio: settings.muteAudio,
            playbackRate: 1,
          },
          (p) => onProgress?.(15 + Math.round(p * 0.8), 'Encoding WebM stream…'),
          signal
        );
        previewKind = 'video';
      }
    } finally {
      URL.revokeObjectURL(videoUrl);
    }
  }
  // ===================== 6. DOCUMENTS (DOCX, RTF, XLSX, MD, HTML, TXT) =====================
  else if (normalizedSrc === 'docx') {
    onProgress?.(40, 'Extracting DOCX document via Mammoth.js…');
    const ab = await file.arrayBuffer();
    const [htmlRes, textRes] = await Promise.all([
      mammoth.convertToHtml({ arrayBuffer: ab }),
      mammoth.extractRawText({ arrayBuffer: ab }),
    ]);
    htmlRes.messages.forEach((m) => warnings.push(m.message));

    if (normalizedTgt === 'html') {
      previewText = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>${file.name}</title></head><body>${htmlRes.value}</body></html>`;
      outBlob = new Blob([previewText], { type: 'text/html;charset=utf-8' });
      previewKind = 'text';
    } else if (normalizedTgt === 'md') {
      previewText = htmlToMarkdownUniversal(htmlRes.value) || textRes.value;
      outBlob = new Blob([previewText], { type: 'text/markdown;charset=utf-8' });
      previewKind = 'text';
    } else if (normalizedTgt === 'txt') {
      previewText = textRes.value;
      outBlob = new Blob([previewText], { type: 'text/plain;charset=utf-8' });
      previewKind = 'text';
    } else {
      const mdBody = htmlToMarkdownUniversal(htmlRes.value) || textRes.value;
      const pdfBytes = await renderFormattedTextToPdf(mdBody, {
        title: file.name,
        pageSize: settings.pageSize,
        orientation: settings.orientation,
      });
      outBlob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      previewKind = 'pdf';
      warnings.push('DOCX→PDF preserves text flow and headings cleanly; floating shapes and Word margins are simplified.');
    }
  } else if (normalizedSrc === 'rtf') {
    onProgress?.(45, 'Parsing RTF control groups…');
    const plain = parseRtfText(await file.text());
    if (normalizedTgt === 'txt') {
      previewText = plain;
      outBlob = new Blob([plain], { type: 'text/plain;charset=utf-8' });
      previewKind = 'text';
    } else if (normalizedTgt === 'md') {
      previewText = plain;
      outBlob = new Blob([plain], { type: 'text/markdown;charset=utf-8' });
      previewKind = 'text';
    } else if (normalizedTgt === 'html') {
      previewText = markdownToCleanHtmlDocument(plain, file.name);
      outBlob = new Blob([previewText], { type: 'text/html;charset=utf-8' });
      previewKind = 'text';
    } else {
      const pdfBytes = await renderFormattedTextToPdf(plain, {
        title: file.name,
        pageSize: settings.pageSize,
        orientation: settings.orientation,
      });
      outBlob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      previewKind = 'pdf';
    }
  } else if (normalizedSrc === 'xlsx') {
    onProgress?.(40, 'Parsing Excel workbook via SheetJS…');
    const parsed = await parseSpreadsheetFile(file);
    const chosenSheet =
      settings.sheetName && parsed.sheets[settings.sheetName]
        ? settings.sheetName
        : parsed.sheetNames[0];
    if (!chosenSheet) throw new Error('Workbook contains no sheets.');
    const rawRows = parsed.sheets[chosenSheet] || [];
    const cleaned = cleanSpreadsheetRows(rawRows, {
      trimWhitespace: settings.trimCells,
      removeEmptyRows: settings.trimCells,
      deduplicateRows: settings.deduplicateRows,
    });

    if (normalizedTgt === 'xlsx') {
      outBlob = exportSpreadsheet(cleaned, chosenSheet, 'xlsx');
    } else if (normalizedTgt === 'csv') {
      const textOut = serializeStructuredOutput(
        'csv',
        parseStructuredInput('csv', await exportSpreadsheet(cleaned, chosenSheet, 'csv').text()),
        { csvDelimiter: settings.csvDelimiter }
      );
      previewText = textOut;
      outBlob = new Blob([textOut], { type: 'text/csv;charset=utf-8' });
      previewKind = 'text';
    } else if (normalizedTgt === 'tsv') {
      const csvRaw = await exportSpreadsheet(cleaned, chosenSheet, 'csv').text();
      const rows = parseCsvOrTsvText(csvRaw, ',');
      previewText = rows.map((r) => r.join('\t')).join('\n');
      outBlob = new Blob([previewText], { type: 'text/tab-separated-values;charset=utf-8' });
      previewKind = 'text';
    } else if (normalizedTgt === 'json') {
      outBlob = exportSpreadsheet(cleaned, chosenSheet, 'json');
      previewText = await outBlob.text();
      previewKind = 'text';
    } else if (normalizedTgt === 'yaml') {
      const jsonRecords = JSON.parse(await exportSpreadsheet(cleaned, chosenSheet, 'json').text());
      previewText = serializeStructuredOutput('yaml', jsonRecords, { prettyPrint: settings.prettyPrint });
      outBlob = new Blob([previewText], { type: 'application/yaml;charset=utf-8' });
      previewKind = 'text';
    } else if (normalizedTgt === 'html') {
      previewText = rowsToHtmlDocument(cleaned, chosenSheet);
      outBlob = new Blob([previewText], { type: 'text/html;charset=utf-8' });
      previewKind = 'text';
    } else if (normalizedTgt === 'md') {
      previewText = rowsToMarkdownTable(cleaned);
      outBlob = new Blob([previewText], { type: 'text/markdown;charset=utf-8' });
      previewKind = 'text';
    } else {
      const tabText = cleaned.map((r) => r.join('  |  ')).join('\n');
      const pdfBytes = await renderFormattedTextToPdf(tabText, {
        title: `${file.name} (${chosenSheet})`,
        pageSize: settings.pageSize,
        orientation: settings.orientation,
        monospace: true,
      });
      outBlob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      previewKind = 'pdf';
    }
  } else if (
    (normalizedSrc === 'md' || normalizedSrc === 'html' || normalizedSrc === 'txt') &&
    ['html', 'md', 'txt', 'pdf'].includes(normalizedTgt)
  ) {
    const raw = await file.text();
    onProgress?.(50, 'Transforming document…');
    if (normalizedSrc === 'md' && normalizedTgt === 'html') {
      previewText = markdownToCleanHtmlDocument(raw, file.name);
      outBlob = new Blob([previewText], { type: 'text/html;charset=utf-8' });
      previewKind = 'text';
    } else if (normalizedSrc === 'html' && normalizedTgt === 'md') {
      previewText = htmlToMarkdownUniversal(raw);
      outBlob = new Blob([previewText], { type: 'text/markdown;charset=utf-8' });
      previewKind = 'text';
    } else if (normalizedTgt === 'txt') {
      previewText = normalizedSrc === 'html' ? htmlToMarkdownUniversal(raw) : raw;
      outBlob = new Blob([previewText], { type: 'text/plain;charset=utf-8' });
      previewKind = 'text';
    } else if (normalizedTgt === 'html') {
      previewText = markdownToCleanHtmlDocument(raw, file.name);
      outBlob = new Blob([previewText], { type: 'text/html;charset=utf-8' });
      previewKind = 'text';
    } else if (normalizedTgt === 'md') {
      previewText = raw;
      outBlob = new Blob([previewText], { type: 'text/markdown;charset=utf-8' });
      previewKind = 'text';
    } else {
      const plainForPdf = normalizedSrc === 'html' ? htmlToMarkdownUniversal(raw) : raw;
      const pdfBytes = await renderFormattedTextToPdf(plainForPdf, {
        title: file.name,
        pageSize: settings.pageSize,
        orientation: settings.orientation,
      });
      outBlob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      previewKind = 'pdf';
    }
  }
  // ===================== 7. STRUCTURED DATA CONVERSIONS =====================
  else {
    onProgress?.(40, `Parsing ${normalizedSrc.toUpperCase()} AST…`);
    const text = await file.text();

    if ((normalizedSrc === 'csv' || normalizedSrc === 'tsv') && normalizedTgt === 'xlsx') {
      const rows = parseCsvOrTsvText(text, normalizedSrc === 'tsv' ? '\t' : ',');
      const cleaned = cleanSpreadsheetRows(rows, {
        trimWhitespace: settings.trimCells,
        removeEmptyRows: settings.trimCells,
        deduplicateRows: settings.deduplicateRows,
      });
      outBlob = exportSpreadsheet(cleaned, 'Sheet1', 'xlsx');
    } else if (normalizedTgt === 'pdf') {
      const ast = parseStructuredInput(normalizedSrc, text);
      const formatted = serializeStructuredOutput(
        normalizedSrc === 'yaml' ? 'yaml' : normalizedSrc === 'xml' ? 'xml' : 'json',
        ast,
        { prettyPrint: true }
      );
      const pdfBytes = await renderFormattedTextToPdf(formatted, {
        title: file.name,
        pageSize: settings.pageSize,
        orientation: settings.orientation,
        monospace: true,
      });
      outBlob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      previewKind = 'pdf';
    } else {
      const workerRes = await runStructuredOffloaded(
        {
          filename: file.name,
          sourceFormat: normalizedSrc,
          targetFormat: normalizedTgt,
          mime: outMime,
          text,
          settings,
        },
        signal
      );
      previewText = workerRes.text;
      outBlob = new Blob([previewText], { type: outMime });
      previewKind = 'text';
    }
  }

  checkAborted(signal);
  onProgress?.(92, 'Validating output file signature…');
  const outBytes = new Uint8Array(await outBlob.arrayBuffer());
  const validationFormat: ConvertFormatId = outExt.endsWith('.zip') ? 'zip' : normalizedTgt;
  const sigCheck = validateOutputSignature(outBytes, validationFormat);
  if (!sigCheck.valid) {
    throw new Error(`Output integrity check failed: ${sigCheck.note}`);
  }

  const outputFilename =
    outExt.endsWith('.zip')
      ? replaceFileExtension(file.name, 'zip').replace('.zip', `_${outExt}`)
      : normalizedTgt === 'gz' && !['zip', 'tar', 'gz', 'tar.gz'].includes(normalizedSrc)
      ? `${file.name}.gz`
      : file.name.toLowerCase().endsWith('.tar.gz')
      ? file.name.replace(/\.tar\.gz$/i, `.${outExt}`)
      : replaceFileExtension(file.name, outExt);

  onProgress?.(100, 'Complete');
  return {
    blob: outBlob,
    outputFilename,
    outputMimeType: outMime,
    outputFormat: normalizedTgt,
    sourceFormat: normalizedSrc,
    inputSize: file.size,
    outputSize: outBlob.size,
    durationMs: performance.now() - t0,
    signatureValid: sigCheck.valid,
    signatureNote: sigCheck.note,
    previewKind,
    previewText: previewText ? previewText.slice(0, 24000) : undefined,
    archiveEntries,
    warnings,
  };
}
