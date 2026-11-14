import { gzip, ungzip } from 'pako';
import JSZip from 'jszip';

export interface ArchiveEntryData {
  path: string;
  data: Uint8Array;
}

/**
 * Standard 24-bit or 32-bit uncompressed Windows BMP encoder from RGBA pixels.
 */
export function encodeBmpRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, withAlpha = false): Uint8Array {
  const bpp = withAlpha ? 4 : 3;
  const rowStride = width * bpp;
  const paddedRowSize = withAlpha ? rowStride : Math.ceil(rowStride / 4) * 4;
  const pixelDataSize = paddedRowSize * height;
  const headerSize = 54;
  const fileSize = headerSize + pixelDataSize;

  const out = new Uint8Array(fileSize);
  const view = new DataView(out.buffer);

  // BITMAPFILEHEADER (14 bytes)
  out[0] = 0x42; // 'B'
  out[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, headerSize, true);

  // BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive => bottom-up
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, withAlpha ? 32 : 24, true);
  view.setUint32(30, 0, true); // BI_RGB uncompressed
  view.setUint32(34, pixelDataSize, true);
  view.setInt32(38, 2835, true); // ~72 DPI
  view.setInt32(42, 2835, true);

  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y;
    const dstOffset = headerSize + y * paddedRowSize;
    for (let x = 0; x < width; x++) {
      const s = (srcRow * width + x) * 4;
      const d = dstOffset + x * bpp;
      out[d] = rgba[s + 2]; // B
      out[d + 1] = rgba[s + 1]; // G
      out[d + 2] = rgba[s]; // R
      if (withAlpha) {
        out[d + 3] = rgba[s + 3]; // A
      }
    }
  }

  return out;
}

/**
 * Decode 24-bit or 32-bit uncompressed Windows BMP back to RGBA pixels.
 */
export function decodeBmpRgba(bytes: Uint8Array): { width: number; height: number; rgba: Uint8ClampedArray } {
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    throw new Error('Invalid BMP file signature.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pixelOffset = view.getUint32(10, true);
  const dibSize = view.getUint32(14, true);
  if (dibSize < 40) {
    throw new Error('Unsupported BMP DIB header.');
  }
  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);
  const bitCount = view.getUint16(28, true);
  const compression = view.getUint32(30, true);

  if (width <= 0 || height <= 0 || (bitCount !== 24 && bitCount !== 32) || (compression !== 0 && compression !== 3)) {
    throw new Error(`Unsupported BMP format (${bitCount}-bit, compression=${compression}).`);
  }

  const bpp = bitCount / 8;
  const paddedRowSize = Math.ceil((width * bpp) / 4) * 4;
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const srcRow = topDown ? y : height - 1 - y;
    const rowStart = pixelOffset + srcRow * paddedRowSize;
    if (rowStart + width * bpp > bytes.length) {
      throw new Error('Truncated BMP pixel data.');
    }
    for (let x = 0; x < width; x++) {
      const s = rowStart + x * bpp;
      const d = (y * width + x) * 4;
      rgba[d] = bytes[s + 2];
      rgba[d + 1] = bytes[s + 1];
      rgba[d + 2] = bytes[s];
      rgba[d + 3] = bpp === 4 ? bytes[s + 3] : 255;
    }
  }

  return { width, height, rgba };
}

/**
 * Standard Vista+ PNG-in-ICO binary container builder.
 */
export function encodeIcoFromPngBuffers(
  frames: Array<{ width: number; height: number; pngBytes: Uint8Array }>
): Uint8Array {
  if (frames.length === 0) {
    throw new Error('At least one PNG frame is required to build an ICO file.');
  }
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirTotalSize = headerSize + frames.length * dirEntrySize;
  const totalBytes = dirTotalSize + frames.reduce((s, f) => s + f.pngBytes.length, 0);

  const out = new Uint8Array(totalBytes);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type = 1 (ICO)
  view.setUint16(4, frames.length, true);

  let dataOffset = dirTotalSize;
  frames.forEach((frame, idx) => {
    const entryOffset = headerSize + idx * dirEntrySize;
    out[entryOffset] = frame.width >= 256 ? 0 : frame.width;
    out[entryOffset + 1] = frame.height >= 256 ? 0 : frame.height;
    out[entryOffset + 2] = 0; // palette count
    out[entryOffset + 3] = 0; // reserved
    view.setUint16(entryOffset + 4, 1, true); // color planes
    view.setUint16(entryOffset + 6, 32, true); // bits per pixel
    view.setUint32(entryOffset + 8, frame.pngBytes.length, true);
    view.setUint32(entryOffset + 12, dataOffset, true);

    out.set(frame.pngBytes, dataOffset);
    dataOffset += frame.pngBytes.length;
  });

  return out;
}

/**
 * Extract the largest embedded PNG frame from an ICO container (or throws if only legacy XOR/AND DIB).
 */
export function extractLargestFrameFromIco(icoBytes: Uint8Array): { pngBytes?: Uint8Array; bmpDib?: Uint8Array; width: number; height: number } {
  if (icoBytes.length < 22 || icoBytes[0] !== 0 || icoBytes[1] !== 0 || icoBytes[2] !== 1 || icoBytes[3] !== 0) {
    throw new Error('Invalid ICO container signature.');
  }
  const view = new DataView(icoBytes.buffer, icoBytes.byteOffset, icoBytes.byteLength);
  const count = view.getUint16(4, true);
  if (count === 0) throw new Error('ICO container holds zero images.');

  let bestIdx = 0;
  let bestScore = -1;
  let bestOffset = 0;
  let bestSize = 0;
  let bestW = 0;
  let bestH = 0;

  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    if (e + 16 > icoBytes.length) break;
    const w = icoBytes[e] === 0 ? 256 : icoBytes[e];
    const h = icoBytes[e + 1] === 0 ? 256 : icoBytes[e + 1];
    const size = view.getUint32(e + 8, true);
    const offset = view.getUint32(e + 12, true);
    if (offset + size <= icoBytes.length && w * h > bestScore) {
      bestScore = w * h;
      bestIdx = i;
      bestOffset = offset;
      bestSize = size;
      bestW = w;
      bestH = h;
    }
  }

  void bestIdx;
  const slice = icoBytes.subarray(bestOffset, bestOffset + bestSize);
  if (slice.length >= 4 && slice[0] === 0x89 && slice[1] === 0x50 && slice[2] === 0x4e && slice[3] === 0x47) {
    return { pngBytes: slice, width: bestW, height: bestH };
  }
  return { bmpDib: slice, width: bestW, height: bestH };
}

// ================= POSIX USTAR TAR CODEC =================

function writeOctal(buf: Uint8Array, offset: number, length: number, value: number) {
  const str = value.toString(8).padStart(length - 1, '0');
  for (let i = 0; i < length - 1; i++) {
    buf[offset + i] = str.charCodeAt(i);
  }
  buf[offset + length - 1] = 0;
}

function writeAscii(buf: Uint8Array, offset: number, maxLen: number, str: string) {
  const encoded = new TextEncoder().encode(str);
  const len = Math.min(maxLen, encoded.length);
  buf.set(encoded.subarray(0, len), offset);
}

function readAscii(buf: Uint8Array, offset: number, maxLen: number): string {
  let end = offset;
  const limit = Math.min(buf.length, offset + maxLen);
  while (end < limit && buf[end] !== 0) end++;
  return new TextDecoder('utf-8', { fatal: false }).decode(buf.subarray(offset, end));
}

export function packTarArchive(entries: ArchiveEntryData[]): Uint8Array {
  const chunks: Uint8Array[] = [];

  for (const entry of entries) {
    const header = new Uint8Array(512);
    const cleanName = entry.path.replace(/^\/+/, '').slice(0, 99);
    writeAscii(header, 0, 100, cleanName);
    writeOctal(header, 100, 8, 0o644); // mode
    writeOctal(header, 108, 8, 0); // uid
    writeOctal(header, 116, 8, 0); // gid
    writeOctal(header, 124, 12, entry.data.length);
    writeOctal(header, 136, 12, Math.floor(Date.now() / 1000));
    header.fill(0x20, 148, 156); // checksum placeholder spaces
    header[156] = 0x30; // '0' normal file
    writeAscii(header, 257, 6, 'ustar\0');
    writeAscii(header, 263, 2, '00');

    let chksum = 0;
    for (let i = 0; i < 512; i++) chksum += header[i];
    const chkStr = chksum.toString(8).padStart(6, '0');
    writeAscii(header, 148, 6, chkStr);
    header[154] = 0;
    header[155] = 0x20;

    chunks.push(header);
    if (entry.data.length > 0) {
      chunks.push(entry.data);
      const rem = entry.data.length % 512;
      if (rem !== 0) {
        chunks.push(new Uint8Array(512 - rem));
      }
    }
  }

  // Two 512-byte zero blocks mark EOF
  chunks.push(new Uint8Array(1024));

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

export function unpackTarArchive(tarBytes: Uint8Array): ArchiveEntryData[] {
  const entries: ArchiveEntryData[] = [];
  let offset = 0;

  while (offset + 512 <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + 512);
    let allZero = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) break;

    const name = readAscii(header, 0, 100);
    const prefix = readAscii(header, 345, 155);
    const fullPath = prefix ? `${prefix}/${name}` : name;
    const sizeStr = readAscii(header, 124, 12).trim();
    const size = parseInt(sizeStr || '0', 8) || 0;
    const typeFlag = String.fromCharCode(header[156] || 0x30);

    offset += 512;
    if (offset + size > tarBytes.length) {
      throw new Error(`Corrupt TAR archive: truncated entry "${fullPath}".`);
    }

    if (typeFlag === '0' || typeFlag === '\0') {
      entries.push({
        path: fullPath,
        data: tarBytes.slice(offset, offset + size),
      });
    }

    const padded = Math.ceil(size / 512) * 512;
    offset += padded;
  }

  if (entries.length === 0) {
    throw new Error('Invalid or empty TAR archive.');
  }

  return entries;
}

export function gzipBytes(input: Uint8Array): Uint8Array {
  return gzip(input, { level: 6 });
}

export function gunzipBytes(input: Uint8Array): Uint8Array {
  return ungzip(input);
}

export async function readZipEntries(zipBytes: ArrayBuffer | Uint8Array): Promise<ArchiveEntryData[]> {
  const zip = await JSZip.loadAsync(zipBytes);
  const entries: ArchiveEntryData[] = [];
  for (const [path, obj] of Object.entries(zip.files)) {
    if (obj.dir) continue;
    const data = await obj.async('uint8array');
    entries.push({ path, data });
  }
  return entries;
}

export async function writeZipEntries(entries: ArchiveEntryData[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const e of entries) {
    zip.file(e.path, e.data);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
