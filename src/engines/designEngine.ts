import QRCode from 'qrcode';
import JSZip from 'jszip';
import { fileToCanvas } from '../utils/mediaUtils';

export interface SocialPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  platform: string;
}

export const SOCIAL_PRESETS: SocialPreset[] = [
  { id: 'ig-square', label: 'Instagram Post (1:1)', width: 1080, height: 1080, platform: 'Instagram' },
  { id: 'ig-portrait', label: 'Instagram Portrait (4:5)', width: 1080, height: 1350, platform: 'Instagram' },
  { id: 'story', label: 'Story / Reel Cover (9:16)', width: 1080, height: 1920, platform: 'Stories' },
  { id: 'yt-thumb', label: 'YouTube Thumbnail (16:9)', width: 1280, height: 720, platform: 'YouTube' },
  { id: 'og-card', label: 'OpenGraph / Link Card', width: 1200, height: 630, platform: 'Web' },
  { id: 'x-header', label: 'Banner / Header (3:1)', width: 1500, height: 500, platform: 'Social' },
];

export interface DesignCompositionOptions {
  width: number;
  height: number;
  backgroundColor: string;
  imageFit: 'cover' | 'contain';
  topText: string;
  bottomText: string;
  textColor: string;
  strokeColor: string;
  fontSize: number;
  overlayScrim: number; // 0..0.7
  badgeText: string;
  badgeColor: string;
  outputFormat?: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
}

export async function renderDesignComposition(
  sourceImage: HTMLImageElement | HTMLCanvasElement | null,
  opts: DesignCompositionOptions
): Promise<{ blob: Blob; dataUrl: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  ctx.fillStyle = opts.backgroundColor || '#17191D';
  ctx.fillRect(0, 0, opts.width, opts.height);

  if (sourceImage) {
    const sw = sourceImage instanceof HTMLImageElement ? sourceImage.naturalWidth : sourceImage.width;
    const sh = sourceImage instanceof HTMLImageElement ? sourceImage.naturalHeight : sourceImage.height;
    const scale =
      opts.imageFit === 'cover'
        ? Math.max(opts.width / sw, opts.height / sh)
        : Math.min(opts.width / sw, opts.height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(sourceImage, (opts.width - dw) / 2, (opts.height - dh) / 2, dw, dh);
  }

  if (opts.overlayScrim > 0) {
    ctx.fillStyle = `rgba(15, 23, 42, ${opts.overlayScrim})`;
    ctx.fillRect(0, 0, opts.width, opts.height);
  }

  if (opts.badgeText.trim()) {
    const padX = Math.round(opts.width * 0.04);
    const padY = Math.round(opts.height * 0.05);
    const bFontSize = Math.max(16, Math.round(opts.fontSize * 0.48));
    ctx.font = `700 ${bFontSize}px "Plus Jakarta Sans", sans-serif`;
    const metrics = ctx.measureText(opts.badgeText);
    const bw = metrics.width + 32;
    const bh = bFontSize + 20;
    ctx.fillStyle = opts.badgeColor || '#1D4ED8';
    ctx.beginPath();
    ctx.roundRect(padX, padY, bw, bh, 8);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(opts.badgeText, padX + 16, padY + bh / 2);
  }

  const drawCaption = (text: string, y: number) => {
    if (!text.trim()) return;
    ctx.font = `700 ${opts.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, Math.round(opts.fontSize * 0.14));
    ctx.strokeStyle = opts.strokeColor || '#000000';
    ctx.fillStyle = opts.textColor || '#FFFFFF';

    const maxW = opts.width * 0.88;
    ctx.strokeText(text, opts.width / 2, y, maxW);
    ctx.fillText(text, opts.width / 2, y, maxW);
  };

  drawCaption(opts.topText, opts.height * 0.14);
  drawCaption(opts.bottomText, opts.height * 0.86);

  const outMime = opts.outputFormat || 'image/png';
  const quality = outMime === 'image/png' ? undefined : (opts.quality ?? 0.92);
  const dataUrl = canvas.toDataURL(outMime, quality);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), outMime, quality)
  );
  return { blob, dataUrl };
}

export interface PaletteSwatch {
  hex: string;
  rgb: [number, number, number];
  hsl: string;
  contrastWhite: number;
  contrastBlack: number;
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function computeContrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const l1 = relativeLuminance(...rgb1);
  const l2 = relativeLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

function rgbToHslString(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h /= 6;
  }
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

export async function extractPaletteFromFile(file: File, count = 6): Promise<PaletteSwatch[]> {
  const { canvas, ctx } = await fileToCanvas(file, 96);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    // Quantize into 24-level RGB bins
    const qr = Math.round(data[i] / 24) * 24;
    const qg = Math.round(data[i + 1] / 24) * 24;
    const qb = Math.round(data[i + 2] / 24) * 24;
    const key = `${qr},${qg},${qb}`;
    const cur = buckets.get(key);
    if (cur) {
      cur.r += data[i];
      cur.g += data[i + 1];
      cur.b += data[i + 2];
      cur.n += 1;
    } else {
      buckets.set(key, { r: data[i], g: data[i + 1], b: data[i + 2], n: 1 });
    }
  }

  const sorted = Array.from(buckets.values()).sort((a, b) => b.n - a.n);
  const picked: PaletteSwatch[] = [];

  for (const b of sorted) {
    if (picked.length >= count) break;
    const avg: [number, number, number] = [
      Math.round(b.r / b.n),
      Math.round(b.g / b.n),
      Math.round(b.b / b.n),
    ];
    const tooClose = picked.some((p) => {
      const dr = p.rgb[0] - avg[0];
      const dg = p.rgb[1] - avg[1];
      const db = p.rgb[2] - avg[2];
      return Math.sqrt(dr * dr + dg * dg + db * db) < 42;
    });
    if (tooClose) continue;

    picked.push({
      hex: rgbToHex(...avg),
      rgb: avg,
      hsl: rgbToHslString(...avg),
      contrastWhite: computeContrastRatio(avg, [255, 255, 255]),
      contrastBlack: computeContrastRatio(avg, [0, 0, 0]),
    });
  }

  return picked;
}

export async function renderPaletteCardPng(
  swatches: PaletteSwatch[],
  fgHex: string,
  bgHex: string
): Promise<Blob> {
  const width = 1200;
  const height = 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#17191D';
  ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('EVERYTHING — Color Palette & WCAG Sheet', 48, 60);

  const ratioHex = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16) || 0,
      parseInt(clean.slice(2, 4), 16) || 0,
      parseInt(clean.slice(4, 6), 16) || 0,
    ];
  };
  const pairRatio = computeContrastRatio(ratioHex(fgHex), ratioHex(bgHex));

  ctx.fillStyle = bgHex;
  ctx.beginPath();
  ctx.roundRect(48, 88, width - 96, 88, 12);
  ctx.fill();
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = fgHex;
  ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`WCAG Pair: ${fgHex} on ${bgHex} — Contrast ${pairRatio}:1 (${pairRatio >= 4.5 ? 'AA Pass' : 'Large/Fail'})`, 72, 140);

  const count = Math.max(1, swatches.length);
  const gap = 20;
  const cardW = (width - 96 - gap * (count - 1)) / count;
  swatches.forEach((s, idx) => {
    const x = 48 + idx * (cardW + gap);
    const y = 212;
    ctx.fillStyle = s.hex;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, 330, 12);
    ctx.fill();

    ctx.fillStyle = '#17191D';
    ctx.font = '700 18px "JetBrains Mono", monospace';
    ctx.fillText(s.hex, x, 574);
    ctx.fillStyle = '#4B5563';
    ctx.font = '500 13px "JetBrains Mono", monospace';
    ctx.fillText(`rgb(${s.rgb.join(', ')})`, x, 602);
    ctx.fillText(`vs #FFF: ${s.contrastWhite}:1`, x, 628);
    ctx.fillText(`vs #000: ${s.contrastBlack}:1`, x, 650);
  });

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode palette PNG'))), 'image/png')
  );
}

export async function generateQrOutputs(
  text: string,
  darkColor = '#17191D',
  lightColor = '#FFFFFF',
  width = 512,
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H' = 'M'
): Promise<{ pngDataUrl: string; svgString: string }> {
  const safeText = text.trim() || 'https://everything.local';
  const [pngDataUrl, svgString] = await Promise.all([
    QRCode.toDataURL(safeText, {
      width,
      margin: 2,
      errorCorrectionLevel,
      color: { dark: darkColor, light: lightColor },
    }),
    QRCode.toString(safeText, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel,
      color: { dark: darkColor, light: lightColor },
    }),
  ]);
  return { pngDataUrl, svgString };
}

export async function generateFaviconZip(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const sizes = [16, 32, 48, 96, 180, 192, 512];
  const zip = new JSZip();

  for (const size of sizes) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, size, size);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG error'))), 'image/png')
      );
      zip.file(`icon-${size}x${size}.png`, blob);
    }
  }
  bitmap.close();

  const manifest = {
    name: 'Web App',
    icons: [
      { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
  zip.file('site.webmanifest', JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: 'blob' });
}
