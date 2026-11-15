import { diffLines } from 'diff';

export function formatJson(input: string, minify = false): { output: string; error: string | null } {
  try {
    const parsed = JSON.parse(input);
    return {
      output: minify ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2),
      error: null,
    };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : 'Invalid JSON syntax' };
  }
}

export function formatXmlOrHtml(input: string, mode: 'xml' | 'html', minify = false): string {
  const cleaned = input.replace(/>\s+</g, '><').trim();
  if (minify) return cleaned;

  const tokens = cleaned.replace(/(>)(<)(\/*)/g, '$1\n$2$3').split('\n');
  let indent = 0;
  const lines: string[] = [];
  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('</')) {
      indent = Math.max(0, indent - 1);
    }
    lines.push(`${'  '.repeat(indent)}${trimmed}`);

    const isSelfClosing = trimmed.endsWith('/>') || trimmed.startsWith('<?') || trimmed.startsWith('<!');
    const tagMatch = trimmed.match(/^<([a-zA-Z0-9:-]+)/);
    const tagName = tagMatch ? tagMatch[1].toLowerCase() : '';
    const isVoid = mode === 'html' && voidTags.has(tagName);
    const hasInlineClose = trimmed.includes(`</${tagName}>`);

    if (!trimmed.startsWith('</') && !isSelfClosing && !isVoid && !hasInlineClose && trimmed.startsWith('<')) {
      indent += 1;
    }
  }
  return lines.join('\n');
}

export function formatCss(input: string, minify = false): string {
  if (minify) {
    return input
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}:;,])\s*/g, '$1')
      .replace(/;}/g, '}')
      .trim();
  }
  return input
    .replace(/\s*{\s*/g, ' {\n  ')
    .replace(/;\s*/g, ';\n  ')
    .replace(/\s*}\s*/g, '\n}\n\n')
    .replace(/  \n}/g, '}')
    .trim();
}

export function formatJs(input: string, minify = false): string {
  const src = input.trim();
  if (!src) return '';

  if (minify) {
    let out = '';
    let i = 0;
    let inString: string | null = null;
    let pendingSpace = false;

    while (i < src.length) {
      const ch = src[i];
      const next = src[i + 1];

      if (inString) {
        out += ch;
        if (ch === '\\' && i + 1 < src.length) {
          out += src[++i];
        } else if (ch === inString) {
          inString = null;
        }
        i++;
        continue;
      }

      if (ch === "'" || ch === '"' || ch === '`') {
        if (pendingSpace && /[a-zA-Z0-9_$]/.test(out.slice(-1))) out += ' ';
        pendingSpace = false;
        inString = ch;
        out += ch;
        i++;
        continue;
      }

      if (ch === '/' && next === '/') {
        while (i < src.length && src[i] !== '\n') i++;
        continue;
      }

      if (ch === '/' && next === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
        continue;
      }

      if (/\s/.test(ch)) {
        pendingSpace = true;
        i++;
        continue;
      }

      const prevChar = out.slice(-1);
      const needsSpace =
        pendingSpace &&
        /[a-zA-Z0-9_$]/.test(prevChar) &&
        /[a-zA-Z0-9_$]/.test(ch);
      if (needsSpace) out += ' ';
      pendingSpace = false;
      out += ch;
      i++;
    }
    return out.trim();
  }

  let out = '';
  let indent = 0;
  let i = 0;
  let inString: string | null = null;
  let parenDepth = 0;
  let atLineStart = true;

  const pushIndent = () => {
    out += '  '.repeat(indent);
    atLineStart = false;
  };

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (inString) {
      if (atLineStart) pushIndent();
      out += ch;
      if (ch === '\\' && i + 1 < src.length) {
        out += src[++i];
      } else if (ch === inString) {
        inString = null;
      }
      i++;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      if (atLineStart) pushIndent();
      inString = ch;
      out += ch;
      i++;
      continue;
    }

    if (ch === '/' && next === '/') {
      if (atLineStart) pushIndent();
      while (i < src.length && src[i] !== '\n') {
        out += src[i++];
      }
      out += '\n';
      atLineStart = true;
      if (src[i] === '\n') i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      if (atLineStart) pushIndent();
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i++];
      }
      if (i < src.length) {
        out += '*/';
        i += 2;
      }
      continue;
    }

    if (/\s/.test(ch)) {
      if (!atLineStart && out.slice(-1) !== ' ' && out.slice(-1) !== '\n') {
        const nextNonWs = src.slice(i + 1).match(/^\S/)?.[0] || '';
        if (![';', ',', ')', ']', '{'].includes(nextNonWs)) {
          out += ' ';
        }
      }
      i++;
      continue;
    }

    if (ch === '(') parenDepth++;
    if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);

    if (ch === '{') {
      if (atLineStart) pushIndent();
      else if (out.slice(-1) !== ' ') out += ' ';
      out += '{\n';
      indent++;
      atLineStart = true;
      i++;
      continue;
    }

    if (ch === '}') {
      indent = Math.max(0, indent - 1);
      if (!atLineStart) out += '\n';
      pushIndent();
      out += '}';
      const nextNonWs = src.slice(i + 1).match(/^\S/)?.[0] || '';
      if (![';', ',', ')', 'else', '.'].some((t) => src.slice(i + 1).trimStart().startsWith(t)) && nextNonWs !== '') {
        out += '\n';
        atLineStart = true;
      }
      i++;
      continue;
    }

    if (ch === ';' && parenDepth === 0) {
      if (atLineStart) pushIndent();
      out += ';\n';
      atLineStart = true;
      i++;
      continue;
    }

    if (atLineStart) pushIndent();
    out += ch;
    i++;
  }

  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeBase64Utf8(b64: string): { text: string; dataUriMime: string | null; error: string | null } {
  try {
    let raw = b64.trim();
    let dataUriMime: string | null = null;
    const match = raw.match(/^data:([^;]+);base64,(.*)$/s);
    if (match) {
      dataUriMime = match[1];
      raw = match[2];
    }
    const binary = atob(raw.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return { text, dataUriMime, error: null };
  } catch (err) {
    return { text: '', dataUriMime: null, error: err instanceof Error ? err.message : 'Invalid Base64 input' };
  }
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  expired: boolean | null;
  expiresAt: string | null;
}

export function decodeJwt(token: string): { data: DecodedJwt | null; error: string | null } {
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { data: null, error: 'JWT must have 3 dot-separated segments (header.payload.signature).' };
  }
  try {
    const parseB64Url = (seg: string) => {
      const normalized = seg.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const res = decodeBase64Utf8(padded);
      if (res.error) throw new Error(res.error);
      return JSON.parse(res.text) as Record<string, unknown>;
    };

    const header = parseB64Url(parts[0]);
    const payload = parseB64Url(parts[1]);
    let expired: boolean | null = null;
    let expiresAt: string | null = null;
    if (typeof payload.exp === 'number') {
      const expMs = payload.exp * 1000;
      expired = Date.now() > expMs;
      expiresAt = new Date(expMs).toISOString();
    }
    return {
      data: { header, payload, signature: parts[2], expired, expiresAt },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Invalid JWT structure' };
  }
}

export async function computeHashes(
  data: string | ArrayBuffer
): Promise<{ sha1: string; sha256: string; sha384: string; sha512: string }> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data).buffer : data;
  const toHex = (ab: ArrayBuffer) =>
    Array.from(new Uint8Array(ab))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  const [s1, s256, s384, s512] = await Promise.all([
    crypto.subtle.digest('SHA-1', buf),
    crypto.subtle.digest('SHA-256', buf),
    crypto.subtle.digest('SHA-384', buf),
    crypto.subtle.digest('SHA-512', buf),
  ]);

  return {
    sha1: toHex(s1),
    sha256: toHex(s256),
    sha384: toHex(s384),
    sha512: toHex(s512),
  };
}

export function generateUuidBatch(count = 5): string[] {
  const list: string[] = [];
  for (let i = 0; i < count; i++) {
    list.push(crypto.randomUUID());
  }
  return list;
}

export interface RegexMatchItem {
  index: number;
  match: string;
  groups: string[];
}

export function evaluateRegex(
  pattern: string,
  flags: string,
  sample: string
): { matches: RegexMatchItem[]; error: string | null } {
  if (!pattern) return { matches: [], error: null };
  try {
    const safeFlags = flags.includes('g') ? flags : `${flags}g`;
    const re = new RegExp(pattern, safeFlags);
    const matches: RegexMatchItem[] = [];
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(sample)) !== null && guard < 500) {
      matches.push({
        index: m.index,
        match: m[0],
        groups: m.slice(1),
      });
      if (m[0].length === 0) re.lastIndex += 1;
      guard++;
    }
    return { matches, error: null };
  } catch (err) {
    return { matches: [], error: err instanceof Error ? err.message : 'Invalid regular expression' };
  }
}

export function renderSafeMarkdownHtml(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      out.push(inCode ? '</code></pre>' : '<pre class="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs overflow-x-auto my-2"><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(`${escape(line)}\n`);
      continue;
    }

    let formatted = escape(line)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-slate-100 rounded text-xs font-mono">$1</code>');

    if (formatted.startsWith('### ')) {
      out.push(`<h3 class="text-base font-semibold mt-3 mb-1">${formatted.slice(4)}</h3>`);
    } else if (formatted.startsWith('## ')) {
      out.push(`<h2 class="text-lg font-semibold mt-4 mb-1.5">${formatted.slice(3)}</h2>`);
    } else if (formatted.startsWith('# ')) {
      out.push(`<h1 class="text-xl font-bold mt-4 mb-2">${formatted.slice(2)}</h1>`);
    } else if (formatted.startsWith('- ') || formatted.startsWith('* ')) {
      out.push(`<li class="ml-5 list-disc text-sm leading-relaxed">${formatted.slice(2)}</li>`);
    } else if (formatted.trim() === '') {
      out.push('<div class="h-2"></div>');
    } else {
      out.push(`<p class="text-sm leading-relaxed">${formatted}</p>`);
    }
  }
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

export function optimizeSvgMarkup(svg: string): {
  optimized: string;
  originalBytes: number;
  optimizedBytes: number;
  elementCount: number;
  viewBox: string;
  error: string | null;
} {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const errNode = doc.querySelector('parsererror');
    if (errNode) {
      return {
        optimized: '',
        originalBytes: svg.length,
        optimizedBytes: 0,
        elementCount: 0,
        viewBox: 'N/A',
        error: 'Invalid SVG XML markup.',
      };
    }

    const svgEl = doc.querySelector('svg');
    if (!svgEl) {
      return {
        optimized: '',
        originalBytes: svg.length,
        optimizedBytes: 0,
        elementCount: 0,
        viewBox: 'N/A',
        error: 'Root <svg> element not found.',
      };
    }

    // Strip executable/embedded nodes, SMIL animation event triggers, and inline event/unsafe URI attributes
    doc
      .querySelectorAll('script, foreignObject, iframe, object, embed, animate, set, animateMotion, animateTransform')
      .forEach((node) => node.remove());
    doc.querySelectorAll('style').forEach((styleNode) => {
      const rawCss = styleNode.textContent || '';
      styleNode.textContent = rawCss
        .replace(/@import[^;]*;?/gi, '')
        .replace(/url\(\s*['"]?\s*(?:https?:|javascript:|vbscript:|data:text\/html)[^)]*\)/gi, 'none');
    });
    doc.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const val = attr.value.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
        if (
          name.startsWith('on') ||
          name === 'data-name' ||
          name === 'sketch:type' ||
          ((name === 'href' || name === 'xlink:href' || name === 'src') &&
            (val.startsWith('javascript:') ||
              val.startsWith('vbscript:') ||
              val.startsWith('data:text/html') ||
              val.startsWith('http://') ||
              val.startsWith('https://')))
        ) {
          el.removeAttribute(attr.name);
        }
      }
    });

    const viewBox = svgEl.getAttribute('viewBox') || 'Not specified';
    const elementCount = doc.querySelectorAll('path, circle, rect, line, polygon, polyline, ellipse').length;

    const serialized = new XMLSerializer().serializeToString(svgEl);
    const optimized = serialized
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return {
      optimized,
      originalBytes: new Blob([svg]).size,
      optimizedBytes: new Blob([optimized]).size,
      elementCount,
      viewBox,
      error: null,
    };
  } catch (err) {
    return {
      optimized: '',
      originalBytes: svg.length,
      optimizedBytes: 0,
      elementCount: 0,
      viewBox: 'N/A',
      error: err instanceof Error ? err.message : 'SVG parse error',
    };
  }
}

export function computeTextDiff(a: string, b: string) {
  return diffLines(a, b);
}
