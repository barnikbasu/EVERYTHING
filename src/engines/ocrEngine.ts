import Tesseract from 'tesseract.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { renderPdfPreviews } from './pdfEngine';
import { diffLines } from 'diff';
import { dataUrlToArrayBuffer, fileToCanvas } from '../utils/mediaUtils';

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  tsv: string;
  confidence: number;
  imageUrl: string;
  width: number;
  height: number;
}

export async function runLocalOcr(
  file: File,
  language = 'eng',
  onProgress?: (status: string, pct: number) => void
): Promise<{ pages: OcrPageResult[]; fullText: string; avgConfidence: number }> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  const imagesToScan: Array<{ pageNumber: number; url: string; width: number; height: number }> = [];

  if (isPdf) {
    onProgress?.('Rendering PDF pages for OCR…', 10);
    const rendered = await renderPdfPreviews(file, 1.8);
    rendered.pages.forEach((p) => {
      imagesToScan.push({
        pageNumber: p.pageNumber,
        url: p.thumbnailUrl,
        width: p.width,
        height: p.height,
      });
    });
  } else {
    const { canvas, width, height } = await fileToCanvas(file);
    imagesToScan.push({
      pageNumber: 1,
      url: canvas.toDataURL('image/png'),
      width,
      height,
    });
  }

  const worker = await Tesseract.createWorker(language, 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.('Recognizing text…', Math.round(m.progress * 100));
      }
    },
  });

  const pages: OcrPageResult[] = [];
  try {
    for (let i = 0; i < imagesToScan.length; i++) {
      const target = imagesToScan[i];
      onProgress?.(`OCR Page ${i + 1} of ${imagesToScan.length}`, Math.round(((i + 0.1) / imagesToScan.length) * 100));
      const res = await worker.recognize(target.url);
      pages.push({
        pageNumber: target.pageNumber,
        text: res.data.text || '',
        tsv: res.data.tsv || '',
        confidence: Math.round(res.data.confidence || 0),
        imageUrl: target.url,
        width: target.width,
        height: target.height,
      });
    }
  } finally {
    await worker.terminate();
  }

  const fullText = pages
    .map((p) => (pages.length > 1 ? `--- Page ${p.pageNumber} ---\n${p.text}` : p.text))
    .join('\n\n');

  const avgConfidence =
    pages.length > 0
      ? Math.round(pages.reduce((acc, p) => acc + p.confidence, 0) / pages.length)
      : 0;

  return { pages, fullText, avgConfidence };
}

export async function createSearchablePdfFromOcr(pages: OcrPageResult[]): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const page of pages) {
    const imgBytes = dataUrlToArrayBuffer(page.imageUrl);
    const isPng = page.imageUrl.startsWith('data:image/png');
    const embedded = isPng ? await doc.embedPng(imgBytes) : await doc.embedJpg(imgBytes);
    const pdfPage = doc.addPage([embedded.width, embedded.height]);

    // Draw invisible selectable text layer first, then page image or semi-transparent overlay
    const lines = page.text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const lineStep = embedded.height / Math.max(12, lines.length + 2);
    lines.forEach((line, idx) => {
      const safeLine = line.replace(/[^\x20-\x7E]/g, ' ');
      pdfPage.drawText(safeLine, {
        x: 24,
        y: Math.max(16, embedded.height - (idx + 2) * lineStep),
        size: 10,
        font,
        color: rgb(0, 0, 0),
        opacity: 0.01,
      });
    });

    pdfPage.drawImage(embedded, {
      x: 0,
      y: 0,
      width: embedded.width,
      height: embedded.height,
    });
  }

  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export function computeDocumentDiff(textA: string, textB: string) {
  return diffLines(textA, textB);
}
