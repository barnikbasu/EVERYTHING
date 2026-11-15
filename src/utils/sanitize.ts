/**
 * Shared HTML, SVG, Archive Path, and Filename sanitization helpers.
 * Works identically in browser and Node.js test environments.
 */

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Neutralize path traversal segments (`..`, leading slashes, Windows drive letters, null bytes)
 * before displaying, extracting, or repacking ZIP / TAR archive entries.
 */
export function sanitizeArchivePath(rawPath: string): string {
  const withoutNulls = String(rawPath || '').replace(/\0/g, '');
  const normalizedSlashes = withoutNulls.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
  const safeSegments = normalizedSlashes
    .split('/')
    .map((seg) => seg.trim())
    .filter((seg) => seg !== '' && seg !== '.' && seg !== '..');

  return safeSegments.join('/') || 'entry';
}

export function sanitizeDownloadFilename(rawName: string, fallback = 'download'): string {
  const cleaned = String(rawName || '')
    .replace(/\0/g, '')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

const UNSAFE_HTML_CONTAINER_TAGS =
  /<\s*(script|iframe|object|embed|applet|base|meta|link|form|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const UNSAFE_HTML_VOID_TAGS =
  /<\s*(script|iframe|object|embed|applet|base|meta|link|form)\b[^>]*\/?>/gi;

/**
 * Strips active scripts, embedded frames/objects, inline event handlers, and dangerous URI schemes
 * while preserving safe semantic formatting markup produced by DOCX/Markdown readers.
 */
export function sanitizeHtmlMarkup(html: string): string {
  if (!html) return '';

  let clean = String(html)
    .replace(UNSAFE_HTML_CONTAINER_TAGS, '')
    .replace(UNSAFE_HTML_VOID_TAGS, '')
    // Strip inline event handlers (onmouseover=..., onclick="...", onload='...')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Strip srcdoc & formaction attributes
    .replace(/\s+(?:srcdoc|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Neutralize javascript:, vbscript:, and data:text/html schemes inside href/src/xlink:href/action
  clean = clean.replace(
    /(\b(?:href|src|xlink:href|action)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (_full, attrPrefix: string, dq?: string, sq?: string, bare?: string) => {
      const rawVal = (dq ?? sq ?? bare ?? '').trim();
      const collapsed = rawVal.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
      if (
        collapsed.startsWith('javascript:') ||
        collapsed.startsWith('vbscript:') ||
        collapsed.startsWith('data:text/html') ||
        collapsed.startsWith('data:application/xhtml+xml')
      ) {
        return `${attrPrefix}"#blocked"`;
      }
      return `${attrPrefix}"${rawVal.replace(/"/g, '&quot;')}"`;
    }
  );

  return clean;
}
