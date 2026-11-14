import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import JSZip from 'jszip';

export interface SpreadsheetData {
  sheetNames: string[];
  sheets: Record<string, string[][]>;
}

export interface ZipEntryInfo {
  path: string;
  dir: boolean;
  uncompressedSize: number;
  compressedSize: number;
  date: Date | null;
}

export async function parseSpreadsheetFile(file: File): Promise<SpreadsheetData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheets: Record<string, string[][]> = {};
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    sheets[name] = rows.map((row) => row.map((cell) => String(cell ?? '')));
  }
  return { sheetNames: workbook.SheetNames, sheets };
}

export function cleanSpreadsheetRows(
  rows: string[][],
  opts: { trimWhitespace: boolean; removeEmptyRows: boolean; deduplicateRows: boolean }
): string[][] {
  let result = rows.map((r) =>
    opts.trimWhitespace ? r.map((c) => c.trim().replace(/\s+/g, ' ')) : [...r]
  );

  if (opts.removeEmptyRows) {
    result = result.filter((r) => r.some((cell) => cell.trim() !== ''));
  }

  if (opts.deduplicateRows && result.length > 0) {
    const seen = new Set<string>();
    const deduped: string[][] = [];
    for (let i = 0; i < result.length; i++) {
      const key = result[i].join('\u0001');
      if (i === 0 || !seen.has(key)) {
        seen.add(key);
        deduped.push(result[i]);
      }
    }
    result = deduped;
  }

  return result;
}

export function exportSpreadsheet(
  rows: string[][],
  sheetName: string,
  format: 'csv' | 'xlsx' | 'json'
): Blob {
  if (format === 'json') {
    if (rows.length === 0) return new Blob(['[]'], { type: 'application/json' });
    const headers = rows[0].map((h, i) => h.trim() || `column_${i + 1}`);
    const records = rows.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] ?? '';
      });
      return obj;
    });
    return new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Sheet1');

  if (format === 'csv') {
    const csvStr = XLSX.utils.sheet_to_csv(ws);
    return new Blob([csvStr], { type: 'text/csv;charset=utf-8' });
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function readDocxFile(file: File): Promise<{
  html: string;
  plainText: string;
  warnings: string[];
}> {
  const arrayBuffer = await file.arrayBuffer();
  const [htmlRes, textRes] = await Promise.all([
    mammoth.convertToHtml({ arrayBuffer }),
    mammoth.extractRawText({ arrayBuffer }),
  ]);
  return {
    html: htmlRes.value,
    plainText: textRes.value,
    warnings: htmlRes.messages.map((m) => m.message),
  };
}

export function htmlToSimpleMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines: string[] = [];
  doc.body.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const text = (el.textContent || '').trim();
      if (!text) return;
      if (tag === 'h1') lines.push(`# ${text}\n`);
      else if (tag === 'h2') lines.push(`## ${text}\n`);
      else if (tag === 'h3') lines.push(`### ${text}\n`);
      else if (tag === 'ul' || tag === 'ol') {
        el.querySelectorAll('li').forEach((li, idx) => {
          lines.push(tag === 'ol' ? `${idx + 1}. ${li.textContent?.trim() || ''}` : `- ${li.textContent?.trim() || ''}`);
        });
        lines.push('');
      } else {
        lines.push(`${text}\n`);
      }
    }
  });
  return lines.join('\n').trim();
}

const RTF_SKIP_DESTINATIONS = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'object',
  'fldinst',
  'header',
  'footer',
  'headerl',
  'headerr',
  'headerf',
  'footerl',
  'footerr',
  'footerf',
  'footnote',
  'listtable',
  'listoverridetable',
  'revtbl',
  'rsidtbl',
  'pgdsctbl',
  'xmlopen',
]);

export function parseRtfText(rtf: string): string {
  const stack: Array<{ uc: number; skip: boolean }> = [];
  let uc = 1;
  let skip = false;
  let skipChars = 0;
  const out: string[] = [];

  let i = 0;
  const len = rtf.length;
  while (i < len) {
    const ch = rtf[i];
    if (ch === '{') {
      stack.push({ uc, skip });
      i++;
    } else if (ch === '}') {
      const prev = stack.pop();
      if (prev) {
        uc = prev.uc;
        skip = prev.skip;
      }
      skipChars = 0;
      i++;
    } else if (ch === '\\') {
      i++;
      if (i >= len) break;
      const next = rtf[i];
      if (next === '\\' || next === '{' || next === '}') {
        if (!skip) out.push(next);
        i++;
      } else if (next === "'") {
        const hex = rtf.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          if (!skip && skipChars === 0) {
            out.push(String.fromCharCode(parseInt(hex, 16)));
          } else if (skipChars > 0) {
            skipChars--;
          }
          i += 3;
        } else {
          i++;
        }
      } else if (next === '*') {
        skip = true;
        i++;
      } else if (next === '~') {
        if (!skip) out.push('\u00A0');
        i++;
      } else if (next === '-' || next === '_') {
        if (!skip && next === '_') out.push('-');
        i++;
      } else if (next === '\r' || next === '\n') {
        if (!skip) out.push('\n');
        i++;
      } else {
        let word = '';
        while (i < len && /[a-zA-Z]/.test(rtf[i])) {
          word += rtf[i++];
        }
        let paramStr = '';
        if (i < len && (rtf[i] === '-' || /[0-9]/.test(rtf[i]))) {
          paramStr += rtf[i++];
          while (i < len && /[0-9]/.test(rtf[i])) {
            paramStr += rtf[i++];
          }
        }
        if (i < len && rtf[i] === ' ') i++;

        const param = paramStr ? Number(paramStr) : null;
        if (RTF_SKIP_DESTINATIONS.has(word)) {
          skip = true;
        } else if (word === 'uc' && param !== null) {
          uc = Math.max(0, param);
        } else if (word === 'u' && param !== null) {
          const codePoint = param < 0 ? 65536 + param : param;
          if (!skip) out.push(String.fromCodePoint(codePoint));
          skipChars = uc;
        } else if (!skip) {
          if (word === 'par' || word === 'line') out.push('\n');
          else if (word === 'tab') out.push('\t');
          else if (word === 'emdash') out.push('\u2014');
          else if (word === 'endash') out.push('\u2013');
          else if (word === 'lquote') out.push('\u2018');
          else if (word === 'rquote') out.push('\u2019');
          else if (word === 'ldblquote') out.push('\u201C');
          else if (word === 'rdblquote') out.push('\u201D');
          else if (word === 'bullet') out.push('\u2022');
        }
      }
    } else if (ch === '\r' || ch === '\n') {
      i++;
    } else {
      if (skipChars > 0) {
        skipChars--;
      } else if (!skip) {
        out.push(ch);
      }
      i++;
    }
  }

  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export async function inspectZipFile(file: File): Promise<{
  zip: JSZip;
  entries: ZipEntryInfo[];
}> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const entries: ZipEntryInfo[] = [];

  zip.forEach((relativePath, entry) => {
    const internal = entry as unknown as {
      _data?: { uncompressedSize?: number; compressedSize?: number };
    };
    entries.push({
      path: relativePath,
      dir: entry.dir,
      uncompressedSize: internal._data?.uncompressedSize ?? 0,
      compressedSize: internal._data?.compressedSize ?? 0,
      date: entry.date || null,
    });
  });

  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { zip, entries };
}

export async function createZipFromFiles(
  files: Array<{ name: string; data: Blob | File | ArrayBuffer | string }>
): Promise<Blob> {
  const zip = new JSZip();
  for (const item of files) {
    zip.file(item.name, item.data);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
