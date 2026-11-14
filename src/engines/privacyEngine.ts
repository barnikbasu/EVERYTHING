import { PDFDocument, PDFName } from 'pdf-lib';
import { fileToCanvas } from '../utils/mediaUtils';

export interface FileSignatureInspection {
  filename: string;
  declaredMime: string;
  sizeBytes: number;
  magicHex: string;
  detectedFormat: string;
  extensionMismatch: boolean;
  metadataFindings: Array<{ key: string; value: string }>;
  sha256: string;
}

const MAGIC_SIGNATURES: Array<{ hexPrefix: string; label: string; expectedExts: string[] }> = [
  { hexPrefix: '25504446', label: 'PDF Document (%PDF)', expectedExts: ['pdf'] },
  { hexPrefix: '89504E470D0A1A0A', label: 'PNG Image', expectedExts: ['png'] },
  { hexPrefix: 'FFD8FF', label: 'JPEG Image', expectedExts: ['jpg', 'jpeg'] },
  { hexPrefix: '47494638', label: 'GIF Image', expectedExts: ['gif'] },
  { hexPrefix: '52494646', label: 'RIFF Container (WebP / WAV / AVI)', expectedExts: ['webp', 'wav', 'avi'] },
  { hexPrefix: '504B0304', label: 'ZIP / Office OpenXML (ZIP / DOCX / XLSX)', expectedExts: ['zip', 'docx', 'xlsx', 'pptx'] },
  { hexPrefix: '494433', label: 'MP3 Audio (ID3v2)', expectedExts: ['mp3'] },
  { hexPrefix: '1A45DFA3', label: 'Matroska / WebM Video', expectedExts: ['webm', 'mkv'] },
  { hexPrefix: '664C6143', label: 'FLAC Lossless Audio', expectedExts: ['flac'] },
  { hexPrefix: '4F676753', label: 'Ogg Container', expectedExts: ['ogg', 'oga', 'ogv'] },
];

function extractJpegSegments(bytes: Uint8Array): Array<{ key: string; value: string }> {
  const findings: Array<{ key: string; value: string }> = [];
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return findings;

  let pos = 2;
  while (pos + 4 < bytes.length) {
    if (bytes[pos] !== 0xff) break;
    const marker = bytes[pos + 1];
    if (marker === 0xda || marker === 0xd9) break; // SOS / EOI
    const segLen = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (segLen < 2 || pos + 2 + segLen > bytes.length) break;

    if (marker === 0xe1) {
      const header = new TextDecoder('ascii').decode(bytes.subarray(pos + 4, Math.min(bytes.length, pos + 10)));
      if (header.startsWith('Exif')) {
        findings.push({ key: 'JPEG APP1 (EXIF)', value: `${segLen} bytes embedded (camera/GPS/device tags may exist)` });
      } else {
        findings.push({ key: 'JPEG APP1 (XMP/Meta)', value: `${segLen} bytes` });
      }
    } else if (marker === 0xed) {
      findings.push({ key: 'JPEG APP13 (IPTC/Photoshop)', value: `${segLen} bytes` });
    } else if (marker === 0xe2) {
      findings.push({ key: 'JPEG APP2 (ICC Profile)', value: `${segLen} bytes` });
    } else if (marker === 0xfe) {
      const comment = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(pos + 4, pos + 2 + segLen));
      findings.push({ key: 'JPEG Comment', value: comment.slice(0, 120) });
    }
    pos += 2 + segLen;
  }
  return findings;
}

function extractPngTextChunks(bytes: Uint8Array): Array<{ key: string; value: string }> {
  const findings: Array<{ key: string; value: string }> = [];
  if (bytes.length < 8) return findings;
  let pos = 8;
  const dec = new TextDecoder('latin1');
  while (pos + 12 <= bytes.length) {
    const len = ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
    const type = dec.decode(bytes.subarray(pos + 4, pos + 8));
    if (type === 'tEXt' || type === 'iTXt') {
      const payload = dec.decode(bytes.subarray(pos + 8, Math.min(bytes.length, pos + 8 + len)));
      const [k, ...rest] = payload.split('\0');
      findings.push({ key: `PNG ${type} (${k})`, value: rest.join(' ').slice(0, 140) || '(binary/compressed)' });
    } else if (type === 'eXIf') {
      findings.push({ key: 'PNG eXIf Chunk', value: `${len} bytes` });
    }
    if (type === 'IEND') break;
    pos += 12 + len;
  }
  return findings;
}

export async function inspectFilePrivacy(file: File): Promise<FileSignatureInspection> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const headHex = Array.from(bytes.subarray(0, 16))
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');

  const matched = MAGIC_SIGNATURES.find((sig) => headHex.startsWith(sig.hexPrefix));
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const detectedFormat = matched ? matched.label : 'Unrecognized / Plain Text / Raw Binary';
  const extensionMismatch = Boolean(matched && ext && !matched.expectedExts.includes(ext));

  const metadataFindings: Array<{ key: string; value: string }> = [];
  if (headHex.startsWith('FFD8FF')) {
    metadataFindings.push(...extractJpegSegments(bytes));
  } else if (headHex.startsWith('89504E470D0A1A0A')) {
    metadataFindings.push(...extractPngTextChunks(bytes));
  } else if (headHex.startsWith('25504446')) {
    try {
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
      const infoEntries: Array<[string, string | undefined]> = [
        ['PDF Title', pdfDoc.getTitle()],
        ['PDF Author', pdfDoc.getAuthor()],
        ['PDF Subject', pdfDoc.getSubject()],
        ['PDF Creator', pdfDoc.getCreator()],
        ['PDF Producer', pdfDoc.getProducer()],
      ];
      const keywords = pdfDoc.getKeywords();
      if (keywords && keywords.trim()) {
        infoEntries.push(['PDF Keywords', keywords]);
      }
      const created = pdfDoc.getCreationDate();
      if (created) infoEntries.push(['PDF Creation Date', created.toISOString()]);
      const modified = pdfDoc.getModificationDate();
      if (modified) infoEntries.push(['PDF Modification Date', modified.toISOString()]);
      for (const [key, val] of infoEntries) {
        if (val && val.trim()) {
          metadataFindings.push({ key, value: val.trim() });
        }
      }
      if (pdfDoc.catalog.has(PDFName.of('Metadata'))) {
        metadataFindings.push({ key: 'PDF XMP Metadata Stream', value: 'Embedded /Metadata catalog stream present' });
      }
    } catch {
      const textSlice = new TextDecoder('latin1').decode(bytes);
      const producer = textSlice.match(/\/Producer\s*\(([^)]+)\)/);
      const creator = textSlice.match(/\/Creator\s*\(([^)]+)\)/);
      const author = textSlice.match(/\/Author\s*\(([^)]+)\)/);
      if (producer) metadataFindings.push({ key: 'PDF Producer', value: producer[1] });
      if (creator) metadataFindings.push({ key: 'PDF Creator', value: creator[1] });
      if (author) metadataFindings.push({ key: 'PDF Author', value: author[1] });
    }
  }

  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  const sha256 = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    filename: file.name,
    declaredMime: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    magicHex: headHex.match(/.{1,2}/g)?.slice(0, 12).join(' ') || '',
    detectedFormat,
    extensionMismatch,
    metadataFindings,
    sha256,
  };
}

export async function stripImageMetadata(file: File): Promise<Blob> {
  const { canvas } = await fileToCanvas(file);
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  const outMime =
    file.type === 'image/png' || (!file.type && ext === 'png')
      ? 'image/png'
      : file.type === 'image/webp' || (!file.type && ext === 'webp')
      ? 'image/webp'
      : 'image/jpeg';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode clean image'))),
      outMime,
      outMime === 'image/png' ? undefined : 0.94
    );
  });
}

export async function stripPdfMetadata(file: File): Promise<Blob> {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('');
  doc.setProducer('');
  const epoch = new Date(0);
  doc.setCreationDate(epoch);
  doc.setModificationDate(epoch);
  if (doc.catalog.has(PDFName.of('Metadata'))) {
    doc.catalog.delete(PDFName.of('Metadata'));
  }
  const cleanBytes = await doc.save({ useObjectStreams: true });
  return new Blob([new Uint8Array(cleanBytes)], { type: 'application/pdf' });
}

export function generateSecurePassword(opts: {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}): { password: string; entropyBits: number; poolSize: number } {
  let pool = '';
  if (opts.uppercase) pool += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  if (opts.lowercase) pool += 'abcdefghijkmnopqrstuvwxyz';
  if (opts.numbers) pool += '23456789';
  if (opts.symbols) pool += '!@#$%^&*()-_=+[]{}';
  if (!pool) pool = 'abcdefghijkmnopqrstuvwxyz23456789';

  const arr = new Uint32Array(opts.length);
  crypto.getRandomValues(arr);
  let password = '';
  for (let i = 0; i < opts.length; i++) {
    password += pool[arr[i] % pool.length];
  }
  const entropyBits = Math.round(opts.length * Math.log2(pool.length));
  return { password, entropyBits, poolSize: pool.length };
}

export function estimatePasswordEntropy(password: string): {
  entropyBits: number;
  charsetSize: number;
  label: 'Very Weak' | 'Weak' | 'Moderate' | 'Strong';
} {
  let charsetSize = 0;
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 32;

  const entropyBits = password.length > 0 && charsetSize > 0 ? Math.round(password.length * Math.log2(charsetSize)) : 0;
  let label: 'Very Weak' | 'Weak' | 'Moderate' | 'Strong' = 'Very Weak';
  if (entropyBits >= 75) label = 'Strong';
  else if (entropyBits >= 55) label = 'Moderate';
  else if (entropyBits >= 35) label = 'Weak';

  return { entropyBits, charsetSize, label };
}
