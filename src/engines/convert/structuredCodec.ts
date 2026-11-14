import * as yaml from 'js-yaml';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ConvertFormatId } from './types';

function toWinAnsiSafe(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, '--')
    .replace(/\u2013/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '*')
    .replace(/\u20AC/g, 'EUR ')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(h[1-6]|p|div|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function htmlToMarkdownUniversal(html: string): string {
  const cleaned = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');

  const lines: string[] = [];
  const blockRegex = /<(h1|h2|h3|h4|p|li|pre|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(cleaned)) !== null) {
    const tag = match[1].toLowerCase();
    const inner = stripHtmlTags(match[2]).trim();
    if (!inner) continue;
    if (tag === 'h1') lines.push(`# ${inner}\n`);
    else if (tag === 'h2') lines.push(`## ${inner}\n`);
    else if (tag === 'h3') lines.push(`### ${inner}\n`);
    else if (tag === 'h4') lines.push(`#### ${inner}\n`);
    else if (tag === 'li') lines.push(`- ${inner}`);
    else if (tag === 'pre') lines.push(`\`\`\`\n${inner}\n\`\`\`\n`);
    else if (tag === 'blockquote') lines.push(`> ${inner}\n`);
    else lines.push(`${inner}\n`);
  }

  if (lines.length === 0) {
    return stripHtmlTags(cleaned);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function markdownToCleanHtmlDocument(md: string, title = 'Converted Document'): string {
  const lines = md.split(/\r?\n/);
  const body: string[] = [];
  let inCode = false;
  let inList = false;

  const closeList = () => {
    if (inList) {
      body.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeList();
      body.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      body.push(escapeHtml(line));
      continue;
    }
    const esc = escapeHtml(line)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

    if (esc.startsWith('### ')) {
      closeList();
      body.push(`<h3>${esc.slice(4)}</h3>`);
    } else if (esc.startsWith('## ')) {
      closeList();
      body.push(`<h2>${esc.slice(3)}</h2>`);
    } else if (esc.startsWith('# ')) {
      closeList();
      body.push(`<h1>${esc.slice(2)}</h1>`);
    } else if (esc.startsWith('- ') || esc.startsWith('* ')) {
      if (!inList) {
        body.push('<ul>');
        inList = true;
      }
      body.push(`<li>${esc.slice(2)}</li>`);
    } else if (esc.trim() === '') {
      closeList();
    } else {
      closeList();
      body.push(`<p>${esc}</p>`);
    }
  }
  closeList();
  if (inCode) body.push('</code></pre>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 820px; margin: 2.5rem auto; padding: 0 1.25rem; line-height: 1.6; color: #17191D; }
    h1, h2, h3 { margin-top: 1.5rem; margin-bottom: 0.5rem; }
    pre { background: #F6F7F9; padding: 1rem; border-radius: 6px; overflow-x: auto; }
    code { font-family: monospace; font-size: 0.9em; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #E2E5EC; padding: 6px 10px; text-align: left; }
    th { background: #F6F7F9; }
  </style>
</head>
<body>
${body.join('\n')}
</body>
</html>`;
}

export function rowsToHtmlDocument(rows: string[][], title = 'Table Export'): string {
  if (rows.length === 0) {
    return markdownToCleanHtmlDocument(`# ${title}\n\n_No rows found._`, title);
  }
  const head = rows[0].map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const bodyRows = rows
    .slice(1)
    .map((r) => `<tr>${rows[0].map((_, idx) => `<td>${escapeHtml(r[idx] ?? '')}</td>`).join('')}</tr>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1.25rem; color: #17191D; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th, td { border: 1px solid #E2E5EC; padding: 6px 10px; text-align: left; }
    th { background: #F6F7F9; font-weight: 600; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}

export function rowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const escCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const header = rows[0].concat(Array(Math.max(0, colCount - rows[0].length)).fill('')).map(escCell);
  const sep = header.map(() => '---');
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
  ];
  for (let i = 1; i < rows.length; i++) {
    const padded = Array.from({ length: colCount }, (_, idx) => escCell(rows[i][idx] ?? ''));
    lines.push(`| ${padded.join(' | ')} |`);
  }
  return lines.join('\n');
}

export function parseCsvOrTsvText(text: string, delimiter: ',' | ';' | '\t' = ','): string[][] {
  const wb = XLSX.read(text, { type: 'string', FS: delimiter });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[first], { header: 1, defval: '' });
  return rows.map((r) => r.map((c) => String(c ?? '')));
}

export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h, i) => h.trim() || `column_${i + 1}`);
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? '';
    });
    return obj;
  });
}

export function objectsToRows(data: unknown): string[][] {
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    if (data.every((item) => Array.isArray(item))) {
      return (data as unknown[][]).map((r) => r.map((c) => String(c ?? '')));
    }
    if (data.every((item) => item && typeof item === 'object')) {
      const keys = Array.from(
        data.reduce<Set<string>>((set, obj) => {
          Object.keys(obj as Record<string, unknown>).forEach((k) => set.add(k));
          return set;
        }, new Set<string>())
      );
      return [
        keys,
        ...data.map((obj) =>
          keys.map((k) => {
            const val = (obj as Record<string, unknown>)[k];
            if (val === null || val === undefined) return '';
            return typeof val === 'object' ? JSON.stringify(val) : String(val);
          })
        ),
      ];
    }
    return [['value'], ...data.map((v) => [String(v ?? '')])];
  }

  if (data && typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    return [
      ['key', 'value'],
      ...entries.map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')]),
    ];
  }

  return [['value'], [String(data ?? '')]];
}

export function parseStructuredInput(sourceFormat: ConvertFormatId, text: string): unknown {
  if (sourceFormat === 'json') {
    return JSON.parse(text);
  }
  if (sourceFormat === 'yaml') {
    const loaded = yaml.load(text);
    if (loaded === undefined) return {};
    return loaded;
  }
  if (sourceFormat === 'xml') {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: true,
    });
    return parser.parse(text);
  }
  if (sourceFormat === 'csv' || sourceFormat === 'tsv') {
    const rows = parseCsvOrTsvText(text, sourceFormat === 'tsv' ? '\t' : ',');
    return rowsToObjects(rows);
  }
  if (sourceFormat === 'html') {
    // Attempt extracting HTML table rows first; otherwise extract heading/paragraph blocks
    const trMatches = Array.from(text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
    if (trMatches.length > 0) {
      const rows = trMatches.map((m) =>
        Array.from(m[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)).map((c) =>
          stripHtmlTags(c[1]).trim()
        )
      );
      if (rows.length > 0 && rows[0].length > 0) {
        return rowsToObjects(rows);
      }
    }
    return { text: stripHtmlTags(text), markdown: htmlToMarkdownUniversal(text) };
  }
  if (sourceFormat === 'md') {
    // Extract Markdown pipe table if present, otherwise structured sections
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const tableLines = lines.filter((l) => l.startsWith('|') && l.endsWith('|'));
    if (tableLines.length >= 2 && /^\|[\s:-|]+\|$/.test(tableLines[1])) {
      const parsePipeRow = (line: string) =>
        line
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
      const headers = parsePipeRow(tableLines[0]);
      const dataRows = tableLines.slice(2).map(parsePipeRow);
      return rowsToObjects([headers, ...dataRows]);
    }
    return { content: text };
  }
  return { content: text };
}

export function serializeStructuredOutput(
  targetFormat: ConvertFormatId,
  data: unknown,
  opts: {
    prettyPrint?: boolean;
    xmlRootName?: string;
    csvDelimiter?: ',' | ';' | '\t';
    title?: string;
  } = {}
): string {
  const pretty = opts.prettyPrint !== false;

  if (targetFormat === 'json') {
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  }

  if (targetFormat === 'yaml') {
    return yaml.dump(data, { indent: 2, lineWidth: 120, noRefs: true });
  }

  if (targetFormat === 'xml') {
    const rootName = (opts.xmlRootName || 'root').replace(/[^a-zA-Z0-9_-]/g, '') || 'root';
    const payload =
      data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data as object).length === 1
        ? data
        : Array.isArray(data)
        ? { [rootName]: { item: data } }
        : { [rootName]: data };
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: pretty,
      indentBy: '  ',
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(payload)}`;
  }

  if (targetFormat === 'csv' || targetFormat === 'tsv') {
    const delim = targetFormat === 'tsv' ? '\t' : opts.csvDelimiter || ',';
    const rows = objectsToRows(data);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    return XLSX.utils.sheet_to_csv(ws, { FS: delim });
  }

  if (targetFormat === 'html') {
    if (Array.isArray(data) || (data && typeof data === 'object')) {
      const rows = objectsToRows(data);
      return rowsToHtmlDocument(rows, opts.title || 'Converted Data');
    }
    return markdownToCleanHtmlDocument(String(data ?? ''), opts.title || 'Converted Document');
  }

  if (targetFormat === 'md') {
    if (Array.isArray(data)) {
      return rowsToMarkdownTable(objectsToRows(data));
    }
    if (data && typeof data === 'object') {
      const rec = data as Record<string, unknown>;
      if (typeof rec.markdown === 'string') return rec.markdown;
      if (typeof rec.content === 'string') return rec.content;
      return rowsToMarkdownTable(objectsToRows(data));
    }
    return String(data ?? '');
  }

  if (targetFormat === 'txt') {
    if (typeof data === 'string') return data;
    return JSON.stringify(data, null, 2);
  }

  throw new Error(`Unsupported structured target format: ${targetFormat}`);
}

export async function renderFormattedTextToPdf(
  text: string,
  opts: {
    title?: string;
    pageSize?: 'a4' | 'letter' | 'fit';
    orientation?: 'portrait' | 'landscape';
    monospace?: boolean;
  } = {}
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (opts.title) doc.setTitle(toWinAnsiSafe(opts.title));
  doc.setProducer('EVERYTHING Local Document Converter');

  const regularFont = await doc.embedFont(opts.monospace ? StandardFonts.Courier : StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(opts.monospace ? StandardFonts.CourierBold : StandardFonts.HelveticaBold);

  const baseDims: [number, number] = opts.pageSize === 'letter' ? [612, 792] : [595.28, 841.89];
  const pageSize: [number, number] =
    opts.orientation === 'landscape' ? [baseDims[1], baseDims[0]] : baseDims;

  const margin = 44;
  const maxWidth = pageSize[0] - margin * 2;
  let page = doc.addPage(pageSize);
  let y = pageSize[1] - margin;

  const ensureRoom = (lineHeight: number) => {
    if (y - lineHeight < margin) {
      page = doc.addPage(pageSize);
      y = pageSize[1] - margin;
    }
  };

  const rawLines = toWinAnsiSafe(text).split(/\r?\n/);

  for (const rawLine of rawLines) {
    let fontSize = opts.monospace ? 9.5 : 11;
    let font = regularFont;
    let lineText = rawLine;
    let color = rgb(0.09, 0.1, 0.11);

    if (!opts.monospace && rawLine.startsWith('# ')) {
      fontSize = 18;
      font = boldFont;
      lineText = rawLine.slice(2);
      y -= 4;
    } else if (!opts.monospace && rawLine.startsWith('## ')) {
      fontSize = 14;
      font = boldFont;
      lineText = rawLine.slice(3);
      y -= 3;
    } else if (!opts.monospace && rawLine.startsWith('### ')) {
      fontSize = 12;
      font = boldFont;
      lineText = rawLine.slice(4);
      y -= 2;
    }

    const lineHeight = fontSize * 1.45;
    if (lineText.trim() === '') {
      y -= lineHeight * 0.6;
      ensureRoom(lineHeight);
      continue;
    }

    // Word wrap paragraph line cleanly to maxWidth
    const words = lineText.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          ensureRoom(lineHeight);
          page.drawText(current, { x: margin, y: y - fontSize, size: fontSize, font, color });
          y -= lineHeight;
        }
        // Break oversized single word/token if needed
        let remaining = word;
        while (font.widthOfTextAtSize(remaining, fontSize) > maxWidth && remaining.length > 1) {
          let cut = Math.floor(remaining.length * 0.6);
          while (cut > 1 && font.widthOfTextAtSize(remaining.slice(0, cut), fontSize) > maxWidth) {
            cut--;
          }
          ensureRoom(lineHeight);
          page.drawText(remaining.slice(0, cut), { x: margin, y: y - fontSize, size: fontSize, font, color });
          y -= lineHeight;
          remaining = remaining.slice(cut);
        }
        current = remaining;
      }
    }
    if (current) {
      ensureRoom(lineHeight);
      page.drawText(current, { x: margin, y: y - fontSize, size: fontSize, font, color });
      y -= lineHeight;
    }
  }

  return doc.save({ useObjectStreams: true });
}
