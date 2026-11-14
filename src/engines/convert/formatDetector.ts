import JSZip from 'jszip';
import * as yaml from 'js-yaml';
import { gunzipBytes } from './binaryCodecs';
import type { ConversionCategory, ConvertFormatId, DetectedFileFormat } from './types';

export const FORMAT_META: Record<
  ConvertFormatId,
  { label: string; category: ConversionCategory; mime: string }
> = {
  jpg: { label: 'JPEG Image', category: 'image', mime: 'image/jpeg' },
  jpeg: { label: 'JPEG Image', category: 'image', mime: 'image/jpeg' },
  png: { label: 'PNG Image', category: 'image', mime: 'image/png' },
  webp: { label: 'WebP Image', category: 'image', mime: 'image/webp' },
  avif: { label: 'AVIF Image', category: 'image', mime: 'image/avif' },
  bmp: { label: 'Bitmap (BMP)', category: 'image', mime: 'image/bmp' },
  gif: { label: 'GIF Image', category: 'image', mime: 'image/gif' },
  tiff: { label: 'TIFF Image', category: 'image', mime: 'image/tiff' },
  svg: { label: 'SVG Vector', category: 'image', mime: 'image/svg+xml' },
  ico: { label: 'ICO Icon', category: 'image', mime: 'image/x-icon' },
  heic: { label: 'HEIC / HEIF Image', category: 'image', mime: 'image/heic' },
  pdf: { label: 'PDF Document', category: 'document', mime: 'application/pdf' },
  docx: {
    label: 'Word Document (DOCX)',
    category: 'document',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  txt: { label: 'Plain Text (TXT)', category: 'document', mime: 'text/plain' },
  rtf: { label: 'Rich Text (RTF)', category: 'document', mime: 'application/rtf' },
  html: { label: 'HTML Document', category: 'document', mime: 'text/html' },
  csv: { label: 'CSV Table', category: 'structured', mime: 'text/csv' },
  tsv: { label: 'TSV Table', category: 'structured', mime: 'text/tab-separated-values' },
  xlsx: {
    label: 'Excel Workbook (XLSX)',
    category: 'document',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  pptx: {
    label: 'PowerPoint Deck (PPTX)',
    category: 'document',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  md: { label: 'Markdown (MD)', category: 'structured', mime: 'text/markdown' },
  mp3: { label: 'MP3 Audio', category: 'audio', mime: 'audio/mpeg' },
  wav: { label: 'WAV Audio (PCM)', category: 'audio', mime: 'audio/wav' },
  aac: { label: 'AAC Audio', category: 'audio', mime: 'audio/aac' },
  flac: { label: 'FLAC Lossless Audio', category: 'audio', mime: 'audio/flac' },
  ogg: { label: 'Ogg Audio', category: 'audio', mime: 'audio/ogg' },
  m4a: { label: 'M4A Audio', category: 'audio', mime: 'audio/mp4' },
  opus: { label: 'Opus Audio', category: 'audio', mime: 'audio/opus' },
  mp4: { label: 'MP4 Video', category: 'video', mime: 'video/mp4' },
  mov: { label: 'QuickTime Video (MOV)', category: 'video', mime: 'video/quicktime' },
  webm: { label: 'WebM Video', category: 'video', mime: 'video/webm' },
  mkv: { label: 'Matroska Video (MKV)', category: 'video', mime: 'video/x-matroska' },
  avi: { label: 'AVI Video', category: 'video', mime: 'video/x-msvideo' },
  zip: { label: 'ZIP Archive', category: 'archive', mime: 'application/zip' },
  tar: { label: 'TAR Archive (USTAR)', category: 'archive', mime: 'application/x-tar' },
  gz: { label: 'GZIP File (.gz)', category: 'archive', mime: 'application/gzip' },
  'tar.gz': { label: 'TAR.GZ Archive (.tgz)', category: 'archive', mime: 'application/gzip' },
  json: { label: 'JSON Data', category: 'structured', mime: 'application/json' },
  xml: { label: 'XML Document', category: 'structured', mime: 'application/xml' },
  yaml: { label: 'YAML Document', category: 'structured', mime: 'application/yaml' },
};

function toHex(bytes: Uint8Array, limit = 12): string {
  return Array.from(bytes.subarray(0, limit))
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

function getAscii(bytes: Uint8Array, start: number, len: number): string {
  if (start + len > bytes.length) return '';
  let s = '';
  for (let i = start; i < start + len; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

function normalizeExt(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tar.gz')) return 'tar.gz';
  if (lower.endsWith('.tgz')) return 'tar.gz';
  return lower.split('.').pop() || '';
}

function isLikelyPlainText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  if (sample.length === 0) return true;
  let weird = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) weird++;
  }
  return weird / sample.length < 0.03;
}

function hasUstarMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 263 && getAscii(bytes, 257, 5) === 'ustar';
}

function looksLikeCsvOrTsv(text: string): 'csv' | 'tsv' | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (lines.length < 2) return null;

  const tabCounts = lines.map((l) => (l.match(/\t/g) || []).length);
  if (tabCounts[0] >= 1 && tabCounts.every((c) => c === tabCounts[0])) {
    return 'tsv';
  }
  const commaCounts = lines.map((l) => (l.match(/,/g) || []).length);
  if (commaCounts[0] >= 1 && commaCounts.every((c) => Math.abs(c - commaCounts[0]) <= 1)) {
    return 'csv';
  }
  return null;
}

export async function detectFileFormat(file: File): Promise<DetectedFileFormat> {
  const declaredExtension = normalizeExt(file.name);
  const headLen = Math.min(file.size, 65536);
  const headBuf = await file.slice(0, headLen).arrayBuffer();
  const bytes = new Uint8Array(headBuf);
  const signatureHex = toHex(bytes);

  const buildResult = (
    format: ConvertFormatId | 'unknown',
    detectionMethod: DetectedFileFormat['detectionMethod'],
    confidence: DetectedFileFormat['confidence'],
    details?: string
  ): DetectedFileFormat => {
    if (format === 'unknown') {
      return {
        format: 'unknown',
        category: 'unknown',
        label: 'Unrecognized Format',
        mimeType: file.type || 'application/octet-stream',
        signatureHex,
        detectionMethod,
        declaredExtension,
        extensionMismatch: false,
        confidence,
        details,
      };
    }

    const meta = FORMAT_META[format];
    const extAliases: Record<string, string[]> = {
      jpg: ['jpg', 'jpeg', 'jpe'],
      jpeg: ['jpg', 'jpeg', 'jpe'],
      yaml: ['yaml', 'yml'],
      md: ['md', 'markdown'],
      html: ['html', 'htm'],
      'tar.gz': ['tar.gz', 'tgz'],
      tiff: ['tif', 'tiff'],
      heic: ['heic', 'heif'],
      mp4: ['mp4', 'm4v'],
      ogg: ['ogg', 'oga', 'ogv'],
    };
    const validExts = extAliases[format] || [format];
    const extensionMismatch =
      Boolean(declaredExtension) &&
      detectionMethod !== 'extension-fallback' &&
      !validExts.includes(declaredExtension);

    return {
      format,
      category: meta.category,
      label: meta.label,
      mimeType: meta.mime,
      signatureHex,
      detectionMethod,
      declaredExtension,
      extensionMismatch,
      confidence,
      details,
    };
  };

  // 1. Magic byte signatures
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return buildResult('pdf', 'magic-bytes', 'high', 'Header %PDF');
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return buildResult('png', 'magic-bytes', 'high', 'PNG IHDR signature');
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return buildResult('jpg', 'magic-bytes', 'high', 'JPEG SOI marker FF D8 FF');
  }
  if (bytes.length >= 6 && (getAscii(bytes, 0, 6) === 'GIF87a' || getAscii(bytes, 0, 6) === 'GIF89a')) {
    return buildResult('gif', 'magic-bytes', 'high', getAscii(bytes, 0, 6));
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return buildResult('bmp', 'magic-bytes', 'high', 'BMP BM header');
  }
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) {
    return buildResult('ico', 'magic-bytes', 'high', 'ICO ICONDIR header');
  }
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))
  ) {
    return buildResult('tiff', 'magic-bytes', 'high', 'TIFF IFD byte order marker');
  }

  // RIFF family: WebP, WAV, AVI
  if (bytes.length >= 12 && getAscii(bytes, 0, 4) === 'RIFF') {
    const fourcc = getAscii(bytes, 8, 4);
    if (fourcc === 'WEBP') return buildResult('webp', 'magic-bytes', 'high', 'RIFF/WEBP container');
    if (fourcc === 'WAVE') return buildResult('wav', 'magic-bytes', 'high', 'RIFF/WAVE PCM container');
    if (fourcc === 'AVI ') return buildResult('avi', 'magic-bytes', 'high', 'RIFF/AVI container');
  }

  // ISO Base Media File Format (ftyp)
  if (bytes.length >= 12 && getAscii(bytes, 4, 4) === 'ftyp') {
    const brand = getAscii(bytes, 8, 4).toLowerCase();
    if (brand === 'avif' || brand === 'avis') {
      return buildResult('avif', 'magic-bytes', 'high', `ISO BMFF ftyp=${brand}`);
    }
    if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'mif1' || brand === 'msf1') {
      return buildResult('heic', 'magic-bytes', 'high', `ISO BMFF ftyp=${brand}`);
    }
    if (brand === 'm4a ' || brand === 'm4b ') {
      return buildResult('m4a', 'magic-bytes', 'high', `ISO BMFF ftyp=${brand.trim()}`);
    }
    if (brand === 'qt  ') {
      return buildResult('mov', 'magic-bytes', 'high', 'QuickTime ftyp=qt');
    }
    return buildResult('mp4', 'magic-bytes', 'high', `ISO BMFF ftyp=${brand.trim()}`);
  }

  // Audio headers
  if (bytes.length >= 4 && getAscii(bytes, 0, 4) === 'fLaC') {
    return buildResult('flac', 'magic-bytes', 'high', 'FLAC stream marker');
  }
  if (bytes.length >= 4 && getAscii(bytes, 0, 4) === 'OggS') {
    const headerSlice = getAscii(bytes, 0, Math.min(bytes.length, 128));
    if (headerSlice.includes('OpusHead')) {
      return buildResult('opus', 'magic-bytes', 'high', 'Ogg Opus stream');
    }
    return buildResult('ogg', 'magic-bytes', 'high', 'Ogg container');
  }
  if (
    (bytes.length >= 3 && getAscii(bytes, 0, 3) === 'ID3') ||
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  ) {
    return buildResult('mp3', 'magic-bytes', 'high', 'MP3 ID3/MPEG frame sync');
  }

  // Matroska / WebM EBML
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    const probeStr = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 256))).toLowerCase();
    if (probeStr.includes('webm')) {
      return buildResult('webm', 'magic-bytes', 'high', 'EBML DocType webm');
    }
    return buildResult('mkv', 'magic-bytes', 'high', 'EBML DocType matroska');
  }

  // GZIP / TAR.GZ
  if (bytes.length >= 3 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08) {
    if (declaredExtension === 'tar.gz') {
      return buildResult('tar.gz', 'container-inspect', 'high', 'GZIP + TAR extension');
    }
    try {
      if (file.size <= 12 * 1024 * 1024) {
        const full = new Uint8Array(await file.arrayBuffer());
        const inflated = gunzipBytes(full);
        if (hasUstarMagic(inflated)) {
          return buildResult('tar.gz', 'container-inspect', 'high', 'GZIP wrapping USTAR TAR');
        }
      }
    } catch {
      // Malformed gzip still detected as gz signature
    }
    return buildResult('gz', 'magic-bytes', 'high', 'GZIP header 1F 8B 08');
  }

  // USTAR TAR
  if (hasUstarMagic(bytes)) {
    return buildResult('tar', 'magic-bytes', 'high', 'POSIX USTAR archive');
  }

  // ZIP & Office OpenXML containers (50 4B 03 04 / 05 06)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06))
  ) {
    try {
      const fullBuf = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(fullBuf);
      if (zip.file('word/document.xml')) {
        return buildResult('docx', 'container-inspect', 'high', 'OpenXML word/document.xml');
      }
      if (zip.file('xl/workbook.xml')) {
        return buildResult('xlsx', 'container-inspect', 'high', 'OpenXML xl/workbook.xml');
      }
      if (zip.file('ppt/presentation.xml')) {
        return buildResult('pptx', 'container-inspect', 'high', 'OpenXML ppt/presentation.xml');
      }
      return buildResult('zip', 'container-inspect', 'high', 'PKZIP archive');
    } catch {
      return buildResult('zip', 'magic-bytes', 'medium', 'PK header (corrupt or partial ZIP)');
    }
  }

  // 2. Text / Structured content inspection
  if (isLikelyPlainText(bytes)) {
    const rawText = new TextDecoder('utf-8', { fatal: false }).decode(
      file.size <= 262144 ? new Uint8Array(await file.arrayBuffer()) : bytes
    );
    const trimmed = rawText.trimStart();

    if (trimmed.startsWith('{\\rtf')) {
      return buildResult('rtf', 'text-heuristic', 'high', 'RTF control header {\\rtf');
    }
    if (/^<svg[\s>]/i.test(trimmed) || (/^<\?xml/i.test(trimmed) && trimmed.includes('<svg'))) {
      return buildResult('svg', 'text-heuristic', 'high', 'SVG root element');
    }
    if (/^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
      return buildResult('html', 'text-heuristic', 'high', 'HTML document root');
    }
    if (trimmed.startsWith('<?xml') || (/^<[a-zA-Z][\w:-]*(\s|>)/.test(trimmed) && /<\/[a-zA-Z][\w:-]*>\s*$/.test(trimmed.trim()))) {
      return buildResult('xml', 'text-heuristic', 'high', 'XML root markup');
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(rawText);
        return buildResult('json', 'text-heuristic', 'high', 'Valid JSON document');
      } catch {
        // Keep checking other formats
      }
    }

    if (declaredExtension === 'tsv' || (declaredExtension === '' && looksLikeCsvOrTsv(rawText) === 'tsv')) {
      return buildResult('tsv', 'text-heuristic', 'medium', 'Tab-delimited rows');
    }
    if (declaredExtension === 'csv' || looksLikeCsvOrTsv(rawText) === 'csv') {
      return buildResult('csv', 'text-heuristic', 'medium', 'Comma-delimited rows');
    }

    if (
      declaredExtension === 'yaml' ||
      declaredExtension === 'yml' ||
      trimmed.startsWith('---') ||
      /^[a-zA-Z0-9_-]+:\s+/m.test(trimmed)
    ) {
      try {
        const parsed = yaml.load(rawText);
        if (parsed && typeof parsed === 'object') {
          return buildResult('yaml', 'text-heuristic', declaredExtension === 'yaml' || declaredExtension === 'yml' ? 'high' : 'medium', 'Parsed YAML structure');
        }
      } catch {
        // Not valid YAML
      }
    }

    if (
      declaredExtension === 'md' ||
      declaredExtension === 'markdown' ||
      /^#{1,6}\s+.+/m.test(rawText) ||
      /^```/m.test(rawText)
    ) {
      return buildResult('md', 'text-heuristic', 'medium', 'Markdown syntax');
    }

    if (declaredExtension === 'html' || declaredExtension === 'htm') {
      return buildResult('html', 'extension-fallback', 'medium', 'HTML text content');
    }

    return buildResult('txt', 'text-heuristic', 'medium', 'UTF-8 plain text');
  }

  // 3. Extension fallback for unrecognized binary blobs
  if (declaredExtension in FORMAT_META) {
    return buildResult(declaredExtension as ConvertFormatId, 'extension-fallback', 'low', 'Extension only');
  }

  return buildResult('unknown', 'unknown', 'low');
}

export function validateOutputSignature(
  bytes: Uint8Array,
  targetFormat: ConvertFormatId
): { valid: boolean; note: string } {
  if (bytes.length === 0) {
    return { valid: false, note: 'Output buffer is empty (0 bytes).' };
  }

  switch (targetFormat) {
    case 'png': {
      const ok =
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47;
      return { valid: ok, note: ok ? 'Verified PNG signature (89 50 4E 47)' : 'Invalid PNG header bytes' };
    }
    case 'jpg':
    case 'jpeg': {
      const ok = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      return { valid: ok, note: ok ? 'Verified JPEG SOI marker (FF D8 FF)' : 'Invalid JPEG header bytes' };
    }
    case 'webp': {
      const ok = getAscii(bytes, 0, 4) === 'RIFF' && getAscii(bytes, 8, 4) === 'WEBP';
      return { valid: ok, note: ok ? 'Verified RIFF/WEBP signature' : 'Invalid WebP header' };
    }
    case 'avif': {
      const ok = getAscii(bytes, 4, 4) === 'ftyp';
      return { valid: ok, note: ok ? 'Verified ISO BMFF AVIF container' : 'Invalid AVIF header' };
    }
    case 'bmp': {
      const ok = bytes.length >= 54 && bytes[0] === 0x42 && bytes[1] === 0x4d;
      return { valid: ok, note: ok ? 'Verified BMP header (42 4D)' : 'Invalid BMP header' };
    }
    case 'ico': {
      const ok = bytes.length >= 22 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00;
      return { valid: ok, note: ok ? 'Verified ICO ICONDIR (00 00 01 00)' : 'Invalid ICO header' };
    }
    case 'gif': {
      const head = getAscii(bytes, 0, 6);
      const ok = head === 'GIF87a' || head === 'GIF89a';
      return { valid: ok, note: ok ? `Verified ${head} signature` : 'Invalid GIF header' };
    }
    case 'pdf': {
      const ok = getAscii(bytes, 0, 4) === '%PDF';
      return { valid: ok, note: ok ? 'Verified %PDF header' : 'Invalid PDF header' };
    }
    case 'wav': {
      const ok = getAscii(bytes, 0, 4) === 'RIFF' && getAscii(bytes, 8, 4) === 'WAVE';
      return { valid: ok, note: ok ? 'Verified RIFF/WAVE PCM header' : 'Invalid WAV header' };
    }
    case 'webm': {
      const ok = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
      return { valid: ok, note: ok ? 'Verified EBML/WebM header' : 'Invalid WebM header' };
    }
    case 'ogg':
    case 'opus': {
      const ok = getAscii(bytes, 0, 4) === 'OggS';
      return { valid: ok, note: ok ? 'Verified OggS container signature' : 'Invalid Ogg header' };
    }
    case 'zip':
    case 'xlsx':
    case 'docx': {
      const ok = bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);
      return { valid: ok, note: ok ? 'Verified PKZIP container signature (50 4B)' : 'Invalid ZIP header' };
    }
    case 'tar': {
      const ok = hasUstarMagic(bytes);
      return { valid: ok, note: ok ? 'Verified POSIX USTAR signature' : 'Invalid TAR header' };
    }
    case 'gz':
    case 'tar.gz': {
      const ok = bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08;
      return { valid: ok, note: ok ? 'Verified GZIP signature (1F 8B 08)' : 'Invalid GZIP header' };
    }
    case 'json': {
      try {
        JSON.parse(new TextDecoder().decode(bytes));
        return { valid: true, note: 'Verified valid JSON syntax' };
      } catch {
        return { valid: false, note: 'Invalid JSON output syntax' };
      }
    }
    case 'yaml': {
      try {
        yaml.load(new TextDecoder().decode(bytes));
        return { valid: true, note: 'Verified valid YAML syntax' };
      } catch {
        return { valid: false, note: 'Invalid YAML output syntax' };
      }
    }
    default:
      return { valid: bytes.length > 0, note: `Verified non-empty ${targetFormat.toUpperCase()} payload` };
  }
}
