import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { dataUrlToArrayBuffer, fileToCanvas } from '../utils/mediaUtils';

// Configure PDF.js worker via Vite-compatible module URL
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface PdfPagePreview {
  pageNumber: number; // 1-based
  width: number;
  height: number;
  thumbnailUrl: string;
}

export interface PdfPageSpec {
  originalIndex: number; // 0-based
  rotation: 0 | 90 | 180 | 270;
  deleted: boolean;
}

export interface PdfAnnotationItem {
  id: string;
  pageNumber: number; // 1-based
  type: 'text' | 'highlight' | 'signature' | 'redact';
  xRatio: number; // 0..1 from left
  yRatio: number; // 0..1 from top
  wRatio: number; // 0..1
  hRatio: number; // 0..1
  text?: string;
  color?: string;
  signatureDataUrl?: string;
}

export interface PdfFormFieldInfo {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'other';
  value: string;
  checked?: boolean;
  options?: string[];
}

export async function renderPdfPreviews(
  file: File,
  scale = 0.45
): Promise<{ pageCount: number; pages: PdfPagePreview[] }> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  try {
    const pdf = await loadingTask.promise;
    const pages: PdfPagePreview[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      }
      pages.push({
        pageNumber: i,
        width: viewport.width,
        height: viewport.height,
        thumbnailUrl: canvas.toDataURL('image/jpeg', 0.82),
      });
    }

    return { pageCount: pages.length, pages };
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

export async function renderSinglePdfPageCanvas(
  file: File,
  pageNumber: number,
  scale = 1.6
): Promise<HTMLCanvasElement> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  try {
    const pdf = await loadingTask.promise;
    const safePage = Math.max(1, Math.min(pdf.numPages, pageNumber));
    const page = await pdf.getPage(safePage);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize canvas for PDF page render');
    }
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvas;
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

export async function renderPdfPagesToImageBlobs(
  file: File,
  options: {
    targetFormat: 'png' | 'jpg' | 'webp';
    dpi: number;
    quality: number;
    pageRange?: string;
    signal?: AbortSignal;
    onProgress?: (pct: number, stepLabel: string) => void;
  }
): Promise<Array<{ name: string; bytes: Uint8Array; blob: Blob }>> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  try {
    const pdfDoc = await loadingTask.promise;
    const indices = options.pageRange?.trim()
      ? parsePageRangeExpression(options.pageRange, pdfDoc.numPages)
      : pdfDoc.numPages > 0
      ? Array.from({ length: pdfDoc.numPages }, (_, i) => i)
      : [];

    if (indices.length === 0) {
      throw new Error(
        `No valid pages matched "${options.pageRange || ''}" (document has ${pdfDoc.numPages} pages).`
      );
    }

    const scale = options.dpi / 72;
    const rendered: Array<{ name: string; bytes: Uint8Array; blob: Blob }> = [];
    const base = file.name.replace(/\.pdf$/i, '');
    const mime =
      options.targetFormat === 'jpg'
        ? 'image/jpeg'
        : options.targetFormat === 'webp'
        ? 'image/webp'
        : 'image/png';
    const qualityArg =
      mime === 'image/png' ? undefined : Math.max(0.2, Math.min(1, options.quality / 100));

    for (let k = 0; k < indices.length; k++) {
      if (options.signal?.aborted) {
        throw new Error('Conversion cancelled by user.');
      }
      const pageNum = indices[k] + 1;
      options.onProgress?.(
        20 + Math.round(((k + 1) / indices.length) * 65),
        `Rendering PDF page ${pageNum} at ${options.dpi} DPI…`
      );
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D unavailable');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      const imgBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error(`Failed to encode ${mime}`))),
          mime,
          qualityArg
        );
      });
      rendered.push({
        name: `${base}_page_${pageNum}.${options.targetFormat}`,
        bytes: new Uint8Array(await imgBlob.arrayBuffer()),
        blob: imgBlob,
      });
    }

    return rendered;
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

export async function extractPdfText(file: File): Promise<{ pageNumber: number; text: string }[]> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  try {
    const pdf = await loadingTask.promise;
    const results: { pageNumber: number; text: string }[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean);
      results.push({ pageNumber: i, text: strings.join(' ') });
    }

    return results;
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

export async function mergePdfs(files: File[]): Promise<Blob> {
  if (files.length < 2) {
    throw new Error('Please add at least 2 PDF files to merge.');
  }
  const merged = await PDFDocument.create();
  for (const f of files) {
    const bytes = await f.arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    const copied = await merged.copyPages(doc, doc.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
  }
  const outBytes = await merged.save();
  return new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' });
}

export function parsePageRangeExpression(expr: string, totalPages: number): number[] {
  const indices = new Set<number>();
  const parts = expr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [aStr, bStr] = part.split('-').map((s) => s.trim());
      const a = Number(aStr);
      const b = Number(bStr);
      if (Number.isInteger(a) && Number.isInteger(b)) {
        const start = Math.max(1, Math.min(a, b));
        const end = Math.min(totalPages, Math.max(a, b));
        for (let p = start; p <= end; p++) indices.add(p - 1);
      }
    } else {
      const p = Number(part);
      if (Number.isInteger(p) && p >= 1 && p <= totalPages) {
        indices.add(p - 1);
      }
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

export async function splitPdf(
  file: File,
  rangeExpr: string,
  mode: 'single-pdf' | 'zip-pages'
): Promise<{ blob: Blob; extension: string }> {
  const bytes = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(bytes);
  const total = srcDoc.getPageCount();
  const selected = rangeExpr.trim()
    ? parsePageRangeExpression(rangeExpr, total)
    : srcDoc.getPageIndices();

  if (selected.length === 0) {
    throw new Error(`No valid pages matched "${rangeExpr}". Document has ${total} pages.`);
  }

  if (mode === 'single-pdf') {
    const outDoc = await PDFDocument.create();
    const copied = await outDoc.copyPages(srcDoc, selected);
    copied.forEach((p) => outDoc.addPage(p));
    const outBytes = await outDoc.save();
    return {
      blob: new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' }),
      extension: 'pdf',
    };
  }

  const zip = new JSZip();
  const base = file.name.replace(/\.pdf$/i, '');
  for (const idx of selected) {
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(srcDoc, [idx]);
    single.addPage(copied);
    const pageBytes = await single.save();
    zip.file(`${base}_page_${idx + 1}.pdf`, pageBytes);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return { blob: zipBlob, extension: 'zip' };
}

export async function organizePdf(file: File, specs: PdfPageSpec[]): Promise<Blob> {
  const active = specs.filter((s) => !s.deleted);
  if (active.length === 0) {
    throw new Error('Cannot export an empty PDF. Keep at least 1 page.');
  }
  const bytes = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(bytes);
  const outDoc = await PDFDocument.create();

  for (const spec of active) {
    const [page] = await outDoc.copyPages(srcDoc, [spec.originalIndex]);
    if (spec.rotation !== 0) {
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + spec.rotation) % 360));
    }
    outDoc.addPage(page);
  }

  const outBytes = await outDoc.save();
  return new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' });
}

export async function compressPdf(
  file: File,
  preset: 'recommended' | 'maximum' | 'lossless',
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const bytes = await file.arrayBuffer();

  if (preset === 'lossless') {
    onProgress?.(40);
    const doc = await PDFDocument.load(bytes);
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setProducer('EVERYTHING Local PDF Engine');
    doc.setCreator('');
    const outBytes = await doc.save({ useObjectStreams: true });
    onProgress?.(100);
    return new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' });
  }

  const dpiScale = preset === 'maximum' ? 96 / 72 : 150 / 72;
  const jpegQuality = preset === 'maximum' ? 0.52 : 0.72;

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
  const outDoc = await PDFDocument.create();
  try {
    const pdfJsDoc = await loadingTask.promise;
    const total = pdfJsDoc.numPages;

    for (let i = 1; i <= total; i++) {
      const page = await pdfJsDoc.getPage(i);
      const origViewport = page.getViewport({ scale: 1 });
      const renderViewport = page.getViewport({ scale: dpiScale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(renderViewport.width));
      canvas.height = Math.max(1, Math.floor(renderViewport.height));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;
      }

      const jpgDataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
      const jpgBytes = dataUrlToArrayBuffer(jpgDataUrl);
      const embedded = await outDoc.embedJpg(jpgBytes);

      const outPage = outDoc.addPage([origViewport.width, origViewport.height]);
      outPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: origViewport.width,
        height: origViewport.height,
      });
      onProgress?.(Math.round((i / total) * 100));
    }
  } finally {
    await loadingTask.destroy().catch(() => {});
  }

  const outBytes = await outDoc.save({ useObjectStreams: true });
  return new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' });
}

export async function imagesToPdf(
  files: File[],
  pageMode: 'fit-image' | 'a4' | 'letter' = 'a4',
  marginPt = 24
): Promise<Blob> {
  if (files.length === 0) throw new Error('Select at least one image.');
  const doc = await PDFDocument.create();

  for (const f of files) {
    const { canvas } = await fileToCanvas(f);
    const isPng = f.type === 'image/png' || f.name.toLowerCase().endsWith('.png');
    const dataUrl = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.92);
    const imgBytes = dataUrlToArrayBuffer(dataUrl);
    const embedded = isPng ? await doc.embedPng(imgBytes) : await doc.embedJpg(imgBytes);

    if (pageMode === 'fit-image') {
      const page = doc.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    } else {
      const pageSize: [number, number] = pageMode === 'letter' ? [612, 792] : [595.28, 841.89];
      const page = doc.addPage(pageSize);
      const availW = pageSize[0] - marginPt * 2;
      const availH = pageSize[1] - marginPt * 2;
      const scale = Math.min(availW / embedded.width, availH / embedded.height);
      const drawW = embedded.width * scale;
      const drawH = embedded.height * scale;
      page.drawImage(embedded, {
        x: (pageSize[0] - drawW) / 2,
        y: (pageSize[1] - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    }
  }

  const outBytes = await doc.save();
  return new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' });
}

export async function applyAnnotationsAndRedactions(
  file: File,
  items: PdfAnnotationItem[],
  watermark?: { text: string; opacity: number; fontSize: number }
): Promise<Blob> {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  // Identify pages requiring true secure redaction (must be raster-cleansed so text is irrecoverable)
  const redactedPages = new Set(
    items.filter((it) => it.type === 'redact').map((it) => it.pageNumber)
  );

  if (redactedPages.size > 0) {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
    try {
      const pdfJsDoc = await loadingTask.promise;
      const pages = doc.getPages();

      for (const pageNum of redactedPages) {
        const pageIdx = pageNum - 1;
        if (pageIdx < 0 || pageIdx >= pages.length) continue;
        const origPage = pages[pageIdx];
        const { width: ptW, height: ptH } = origPage.getSize();

        const jsPage = await pdfJsDoc.getPage(pageNum);
        const viewport = jsPage.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await jsPage.render({ canvasContext: ctx, viewport, canvas }).promise;

          // Paint opaque black redaction blocks directly onto raster pixels
          ctx.fillStyle = '#000000';
          for (const red of items.filter((it) => it.type === 'redact' && it.pageNumber === pageNum)) {
            ctx.fillRect(
              red.xRatio * canvas.width,
              red.yRatio * canvas.height,
              red.wRatio * canvas.width,
              red.hRatio * canvas.height
            );
          }

          const pngDataUrl = canvas.toDataURL('image/png');
          const pngBytes = dataUrlToArrayBuffer(pngDataUrl);
          const embeddedImg = await doc.embedPng(pngBytes);

          // Replace page completely to guarantee zero underlying text operators remain
          doc.removePage(pageIdx);
          const cleanPage = doc.insertPage(pageIdx, [ptW, ptH]);
          cleanPage.drawImage(embeddedImg, { x: 0, y: 0, width: ptW, height: ptH });
        }
      }
    } finally {
      await loadingTask.destroy().catch(() => {});
    }
  }

  // Apply non-redaction annotations (highlights, text, signatures, watermark)
  const allPages = doc.getPages();
  for (const item of items.filter((it) => it.type !== 'redact')) {
    const page = allPages[item.pageNumber - 1];
    if (!page) continue;
    const { width, height } = page.getSize();
    const x = item.xRatio * width;
    const w = item.wRatio * width;
    const h = item.hRatio * height;
    const y = height - item.yRatio * height - h;

    if (item.type === 'highlight') {
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: rgb(1, 0.92, 0.23),
        opacity: 0.42,
      });
    } else if (item.type === 'text' && item.text) {
      page.drawText(item.text, {
        x,
        y: height - item.yRatio * height - 14,
        size: 13,
        font,
        color: rgb(0.09, 0.1, 0.11),
      });
    } else if (item.type === 'signature' && item.signatureDataUrl) {
      const sigBytes = dataUrlToArrayBuffer(item.signatureDataUrl);
      const sigImg = await doc.embedPng(sigBytes);
      page.drawImage(sigImg, { x, y, width: w, height: h });
    }
  }

  if (watermark && watermark.text.trim()) {
    for (const page of allPages) {
      const { width, height } = page.getSize();
      page.drawText(watermark.text, {
        x: width * 0.18,
        y: height * 0.45,
        size: watermark.fontSize || 42,
        font,
        color: rgb(0.45, 0.48, 0.55),
        opacity: watermark.opacity ?? 0.28,
        rotate: degrees(35),
      });
    }
  }

  const outBytes = await doc.save();
  return new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' });
}

export async function inspectPdfFormFields(file: File): Promise<PdfFormFieldInfo[]> {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  const fields = form.getFields();

  return fields.map((field) => {
    const name = field.getName();
    const ctor = field.constructor.name;
    if (ctor.includes('Text')) {
      const tf = form.getTextField(name);
      return { name, type: 'text', value: tf.getText() || '' };
    }
    if (ctor.includes('CheckBox')) {
      const cb = form.getCheckBox(name);
      return { name, type: 'checkbox', value: cb.isChecked() ? 'true' : 'false', checked: cb.isChecked() };
    }
    if (ctor.includes('Dropdown')) {
      const dd = form.getDropdown(name);
      return { name, type: 'dropdown', value: dd.getSelected()[0] || '', options: dd.getOptions() };
    }
    return { name, type: 'other', value: '' };
  });
}

export async function fillAndFlattenPdf(
  file: File,
  updates: Record<string, string | boolean>,
  flatten: boolean
): Promise<Blob> {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();

  for (const field of form.getFields()) {
    const name = field.getName();
    if (!(name in updates)) continue;
    const val = updates[name];
    const ctor = field.constructor.name;
    if (ctor.includes('Text') && typeof val === 'string') {
      form.getTextField(name).setText(val);
    } else if (ctor.includes('CheckBox') && typeof val === 'boolean') {
      const cb = form.getCheckBox(name);
      if (val) cb.check();
      else cb.uncheck();
    } else if (ctor.includes('Dropdown') && typeof val === 'string' && val.length > 0) {
      form.getDropdown(name).select(val);
    }
  }

  if (flatten) {
    form.flatten();
  }

  const outBytes = await doc.save();
  return new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' });
}
