import type {
  ConversionAvailability,
  ConversionCategory,
  ConversionDefinition,
  ConversionOptionKey,
  ConvertFormatId,
  RuntimeCodecCapabilities,
} from './types';

let cachedCapabilities: RuntimeCodecCapabilities | null = null;

export function detectRuntimeCodecCapabilities(): RuntimeCodecCapabilities {
  if (cachedCapabilities) return cachedCapabilities;

  const isBrowser = typeof document !== 'undefined' && typeof window !== 'undefined';
  if (!isBrowser) {
    return {
      canvasPng: false,
      canvasJpeg: false,
      canvasWebp: false,
      canvasAvif: false,
      mediaRecorderAvailable: false,
      mediaWebmVideo: false,
      mediaWebmOpus: false,
      mediaOggOpus: false,
      webAudioAvailable: false,
      pdfJsAvailable: false,
    };
  }

  let canvasPng = false;
  let canvasJpeg = false;
  let canvasWebp = false;
  let canvasAvif = false;

  try {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    canvasPng = c.toDataURL('image/png').startsWith('data:image/png');
    canvasJpeg = c.toDataURL('image/jpeg').startsWith('data:image/jpeg');
    canvasWebp = c.toDataURL('image/webp').startsWith('data:image/webp');
    canvasAvif = c.toDataURL('image/avif').startsWith('data:image/avif');
  } catch {
    // Ignore restricted canvas environments
  }

  const hasMR = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function';
  const mediaWebmVideo = hasMR && (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') || MediaRecorder.isTypeSupported('video/webm;codecs=vp8') || MediaRecorder.isTypeSupported('video/webm'));
  const mediaWebmOpus = hasMR && MediaRecorder.isTypeSupported('audio/webm;codecs=opus');
  const mediaOggOpus = hasMR && MediaRecorder.isTypeSupported('audio/ogg;codecs=opus');
  const webAudioAvailable =
    typeof AudioContext !== 'undefined' ||
    Boolean((window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);

  cachedCapabilities = {
    canvasPng,
    canvasJpeg,
    canvasWebp,
    canvasAvif,
    mediaRecorderAvailable: hasMR,
    mediaWebmVideo,
    mediaWebmOpus,
    mediaOggOpus,
    webAudioAvailable,
    pdfJsAvailable: true,
  };
  return cachedCapabilities;
}

const MIME_BY_FORMAT: Record<ConvertFormatId, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  heic: 'image/heic',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain;charset=utf-8',
  rtf: 'application/rtf',
  html: 'text/html;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  md: 'text/markdown;charset=utf-8',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  opus: 'audio/opus',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  'tar.gz': 'application/gzip',
  json: 'application/json;charset=utf-8',
  xml: 'application/xml;charset=utf-8',
  yaml: 'application/yaml;charset=utf-8',
};

function def(
  sourceFormat: ConvertFormatId,
  targetFormat: ConvertFormatId,
  category: ConversionCategory,
  processingEngine: string,
  supportedOptions: ConversionOptionKey[],
  limitations: string,
  opts: {
    availability?: ConversionAvailability;
    codecRequirement?: string;
    inputValidation?: string;
    runtimeCheckKey?: ConversionDefinition['runtimeCheckKey'];
  } = {}
): ConversionDefinition {
  return {
    id: `${sourceFormat}->${targetFormat}`,
    sourceFormat,
    targetFormat,
    category,
    processingEngine,
    processingLocation: 'local',
    inputValidation: opts.inputValidation || `Validated ${sourceFormat.toUpperCase()} header or syntax`,
    codecRequirement: opts.codecRequirement || 'Standard browser & JS runtime',
    supportedOptions,
    outputMimeType: MIME_BY_FORMAT[targetFormat],
    outputExtension: targetFormat === 'jpeg' ? 'jpg' : targetFormat,
    limitations,
    availability: opts.availability || 'available',
    runtimeCheckKey: opts.runtimeCheckKey,
  };
}

const IMAGE_RASTER_SOURCES: ConvertFormatId[] = ['jpg', 'png', 'webp', 'bmp', 'gif', 'svg', 'ico', 'avif'];
const IMAGE_TARGETS: Array<{
  fmt: ConvertFormatId;
  engine: string;
  options: ConversionOptionKey[];
  limits: string;
  availability?: ConversionAvailability;
  runtimeCheckKey?: ConversionDefinition['runtimeCheckKey'];
  codecReq?: string;
}> = [
  {
    fmt: 'png',
    engine: 'Canvas 2D / PNG Encoder',
    options: ['dimensions', 'stripMetadata', 'preserveTransparency'],
    limits: 'Lossless RGB/RGBA; re-encoding removes camera EXIF chunks.',
  },
  {
    fmt: 'jpg',
    engine: 'Canvas 2D JPEG Encoder',
    options: ['quality', 'dimensions', 'backgroundColor', 'stripMetadata'],
    limits: 'JPEG does not support alpha transparency; composited onto background color.',
  },
  {
    fmt: 'webp',
    engine: 'Canvas 2D WebP Encoder',
    options: ['quality', 'dimensions', 'preserveTransparency', 'stripMetadata'],
    limits: 'Supports lossy quality and RGBA alpha in Chromium/Firefox/Safari.',
    availability: 'runtime-codec',
    runtimeCheckKey: 'canvas-webp',
    codecReq: 'Browser Canvas image/webp encoder',
  },
  {
    fmt: 'bmp',
    engine: 'Pure TS 24/32-bit BMP Encoder',
    options: ['dimensions', 'backgroundColor', 'preserveTransparency'],
    limits: 'Uncompressed BI_RGB bitmap; produces larger files than PNG/WebP.',
  },
  {
    fmt: 'ico',
    engine: 'Multi-Size PNG-in-ICO Container',
    options: ['dimensions', 'preserveTransparency'],
    limits: 'Packages 16×16, 32×32, 48×48, and 64×64 Vista+ PNG icon frames.',
  },
  {
    fmt: 'gif',
    engine: 'gifenc 256-Color Quantizer',
    options: ['dimensions', 'backgroundColor'],
    limits: 'Quantized to 256-color palette per frame; animated GIFs flatten to frame 1 unless video->gif.',
  },
  {
    fmt: 'avif',
    engine: 'Browser Canvas AVIF Encoder',
    options: ['quality', 'dimensions', 'preserveTransparency', 'stripMetadata'],
    limits: 'Available only when the active browser supports Canvas image/avif encoding.',
    availability: 'runtime-codec',
    runtimeCheckKey: 'canvas-avif',
    codecReq: 'Browser Canvas image/avif encoder',
  },
  {
    fmt: 'pdf',
    engine: 'pdf-lib Image Embedder',
    options: ['pageSize', 'orientation'],
    limits: 'Embeds rasterized image onto a printable A4, Letter, or fit-image PDF page.',
  },
];

const imageEntries: ConversionDefinition[] = [];
for (const src of IMAGE_RASTER_SOURCES) {
  for (const tgt of IMAGE_TARGETS) {
    if (src === tgt.fmt) continue;
    imageEntries.push(
      def(src, tgt.fmt, 'image', tgt.engine, tgt.options, tgt.limits, {
        availability: tgt.availability,
        runtimeCheckKey: tgt.runtimeCheckKey,
        codecRequirement:
          src === 'avif'
            ? `Browser AVIF image decode + ${tgt.codecReq || 'Canvas 2D'}`
            : tgt.codecReq,
      })
    );
  }
}

// Unsupported / decoder-restricted image formats documented honestly
imageEntries.push(
  def('heic', 'png', 'image', 'Native OS HEIC Decoder (Unavailable)', [], 'HEIC/HEIF requires Apple/OS-level HEVC hardware decoding not universally available in browser JavaScript without a multi-MB patent-encumbered decoder.', {
    availability: 'unavailable',
    codecRequirement: 'HEVC / libheif decoder (not installed)',
  }),
  def('tiff', 'png', 'image', 'TIFF IFD Decoder (Unavailable)', [], 'Baseline/LZW/JPEG TIFF decoding is not bundled; convert to PNG or JPEG externally before uploading.', {
    availability: 'unavailable',
    codecRequirement: 'TIFF decoder (not installed)',
  })
);

const documentEntries: ConversionDefinition[] = [
  // PDF conversions
  def('pdf', 'png', 'document', 'PDF.js Page Rasterizer', ['pageRange', 'dpi'], 'Single page exports .png; multi-page range bundles numbered PNGs in a .zip archive.', {
    codecRequirement: 'PDF.js WASM/Worker',
  }),
  def('pdf', 'jpg', 'document', 'PDF.js Page Rasterizer', ['pageRange', 'dpi', 'quality'], 'Single page exports .jpg; multi-page range bundles numbered JPEGs in a .zip archive.', {
    codecRequirement: 'PDF.js WASM/Worker',
  }),
  def('pdf', 'webp', 'document', 'PDF.js Page Rasterizer', ['pageRange', 'dpi', 'quality'], 'Single page exports .webp; multi-page range bundles numbered WebPs in a .zip archive.', {
    availability: 'runtime-codec',
    runtimeCheckKey: 'canvas-webp',
    codecRequirement: 'PDF.js + Browser WebP Canvas encoder',
  }),
  def('pdf', 'txt', 'document', 'PDF.js Text Layer Extractor', ['pageRange'], 'Extracts embedded vector text; scanned image-only PDFs produce sparse text (use OCR Studio for scans).'),
  def('pdf', 'md', 'document', 'PDF.js Text Layer Extractor', ['pageRange'], 'Structures extracted PDF page text with page headings into Markdown.'),
  def('pdf', 'html', 'document', 'PDF.js Text Layer Extractor', ['pageRange'], 'Outputs clean semantic HTML sections per PDF page; complex multi-column positioning is simplified.'),
  def('pdf', 'pdf', 'document', 'pdf-lib / PDF.js Optimizer', ['pdfCompression', 'stripMetadata'], 'Applies object-stream compression/metadata strip (Lossless) or DPI raster compression.'),

  // DOCX conversions
  def('docx', 'html', 'document', 'Mammoth.js DOCX Parser', [], 'Extracts headings, paragraphs, lists, and tables; complex floating shapes or headers/footers may be omitted.'),
  def('docx', 'md', 'document', 'Mammoth.js + Semantic HTML→MD', [], 'Preserves headings, lists, and paragraphs as clean Markdown.'),
  def('docx', 'txt', 'document', 'Mammoth.js Raw Text Extractor', [], 'Extracts clean UTF-8 plain text without styling.'),
  def('docx', 'pdf', 'document', 'Mammoth.js + pdf-lib Paginated Renderer', ['pageSize', 'orientation'], 'Reflows extracted headings and paragraphs into A4/Letter PDF pages; complex Word tables and embedded charts simplify to text flow.'),

  // RTF conversions
  def('rtf', 'txt', 'document', 'Deterministic RTF Control Parser', [], 'Strips font/color destination tables and decodes escaped Unicode text cleanly.'),
  def('rtf', 'md', 'document', 'Deterministic RTF Parser → MD', [], 'Outputs clean text blocks formatted for Markdown.'),
  def('rtf', 'html', 'document', 'Deterministic RTF Parser → HTML', [], 'Wraps decoded paragraphs in clean responsive HTML.'),
  def('rtf', 'pdf', 'document', 'RTF Parser + pdf-lib Renderer', ['pageSize', 'orientation'], 'Typesets decoded RTF paragraphs into clean paginated PDF.'),

  // Markdown / HTML / TXT conversions
  def('md', 'html', 'document', 'Structured Markdown→HTML Serializer', [], 'Generates standalone UTF-8 HTML document with clean typography styling.'),
  def('md', 'txt', 'document', 'Plain Text Extractor', [], 'Outputs normalized plain text.'),
  def('md', 'pdf', 'document', 'pdf-lib Markdown Paginator', ['pageSize', 'orientation'], 'Renders headings (#/##/###) and wrapped paragraphs into A4/Letter PDF pages.'),

  def('html', 'md', 'document', 'Semantic HTML→Markdown Extractor', [], 'Converts headings, lists, blockquotes, and code blocks into clean Markdown.'),
  def('html', 'txt', 'document', 'HTML Tag Stripper', [], 'Extracts readable UTF-8 text and decodes common HTML entities.'),
  def('html', 'pdf', 'document', 'HTML Extractor + pdf-lib Renderer', ['pageSize', 'orientation'], 'Converts semantic text flow to PDF; arbitrary CSS grids/webpages are simplified to linear reading order.'),

  def('txt', 'pdf', 'document', 'pdf-lib Text Typesetter', ['pageSize', 'orientation'], 'Wraps UTF-8 text cleanly across paginated A4 or Letter PDF pages.'),
  def('txt', 'html', 'document', 'HTML Document Wrapper', [], 'Wraps plain text safely with escaped HTML markup.'),
  def('txt', 'md', 'document', 'Markdown Exporter', [], 'Normalizes line endings into clean Markdown text.'),

  // Spreadsheets: XLSX
  def('xlsx', 'csv', 'document', 'SheetJS (xlsx)', ['sheetSelection', 'cleanSpreadsheet', 'csvDelimiter'], 'Exports selected worksheet as RFC CSV.'),
  def('xlsx', 'tsv', 'document', 'SheetJS (xlsx)', ['sheetSelection', 'cleanSpreadsheet'], 'Exports selected worksheet as tab-separated values.'),
  def('xlsx', 'json', 'document', 'SheetJS → JSON Array', ['sheetSelection', 'cleanSpreadsheet', 'prettyPrint'], 'Maps header row columns to JSON record objects.'),
  def('xlsx', 'yaml', 'document', 'SheetJS → js-yaml', ['sheetSelection', 'cleanSpreadsheet'], 'Serializes worksheet records as clean YAML.'),
  def('xlsx', 'html', 'document', 'SheetJS → Semantic HTML Table', ['sheetSelection', 'cleanSpreadsheet'], 'Renders selected sheet rows inside a styled HTML table.'),
  def('xlsx', 'md', 'document', 'SheetJS → Markdown Table', ['sheetSelection', 'cleanSpreadsheet'], 'Formats worksheet rows as a GFM pipe table.'),
  def('xlsx', 'pdf', 'document', 'SheetJS + pdf-lib Tabular PDF', ['sheetSelection', 'cleanSpreadsheet', 'pageSize', 'orientation'], 'Renders tab-aligned rows in monospace font onto PDF pages; wide tables may wrap.'),
  def('xlsx', 'xlsx', 'document', 'SheetJS Cleanup Export', ['sheetSelection', 'cleanSpreadsheet'], 'Re-exports cleaned rows (trimmed/deduplicated) into a fresh XLSX workbook.'),

  // PPTX (explicitly unavailable locally)
  def('pptx', 'pdf', 'document', 'PowerPoint Slide Renderer (Unavailable)', [], 'Faithful PPTX slide rendering requires a full DrawingML/OpenXML layout engine not installed locally.', {
    availability: 'unavailable',
    codecRequirement: 'LibreOffice / headless OpenXML slide renderer (not installed)',
  }),
];

const AUDIO_SOURCES: ConvertFormatId[] = ['wav', 'mp3', 'ogg', 'aac', 'm4a', 'flac', 'opus'];
const audioEntries: ConversionDefinition[] = [];
for (const src of AUDIO_SOURCES) {
  if (src !== 'wav') {
    audioEntries.push(
      def(src, 'wav', 'audio', 'Web Audio API + RIFF PCM Encoder', ['sampleRate', 'channels'], 'Decodes compressed audio in-browser and writes uncompressed 16-bit PCM WAV.', {
        codecRequirement: 'Browser Web Audio decodeAudioData',
      })
    );
  } else {
    audioEntries.push(
      def('wav', 'wav', 'audio', 'Web Audio Resampler + PCM Encoder', ['sampleRate', 'channels'], 'Resamples PCM WAV to target sample rate and mono/stereo channels.', {
        codecRequirement: 'Browser Web Audio OfflineAudioContext',
      })
    );
  }
  audioEntries.push(
    def(src, 'ogg', 'audio', 'Web Audio + MediaRecorder Opus', ['sampleRate', 'channels'], 'Encodes audio stream via browser MediaRecorder only when audio/ogg;codecs=opus is supported.', {
      availability: 'runtime-codec',
      runtimeCheckKey: 'media-ogg-opus',
      codecRequirement: 'MediaRecorder audio/ogg;codecs=opus',
    }),
    def(src, 'webm', 'audio', 'Web Audio + MediaRecorder Opus', ['sampleRate', 'channels'], 'Encodes WebM Opus audio when MediaRecorder audio/webm;codecs=opus is supported in browser.', {
      availability: 'runtime-codec',
      runtimeCheckKey: 'media-webm-opus',
      codecRequirement: 'MediaRecorder audio/webm;codecs=opus',
    })
  );
}
audioEntries.push(
  def('wav', 'mp3', 'audio', 'MP3 Encoder (Unavailable)', [], 'Browser APIs do not provide native MP3 encoding, and patent-safe pure-JS MP3 encoding is not bundled.', {
    availability: 'unavailable',
    codecRequirement: 'LAME / FFmpeg.wasm MP3 encoder (not bundled)',
  }),
  def('wav', 'flac', 'audio', 'FLAC Encoder (Unavailable)', [], 'Native lossless FLAC encoding requires a dedicated FLAC encoder binary not bundled in browser.', {
    availability: 'unavailable',
    codecRequirement: 'libFLAC WASM encoder (not bundled)',
  }),
  def('wav', 'aac', 'audio', 'AAC Encoder (Unavailable)', [], 'Browser MediaRecorder does not expose standalone raw AAC ADTS export consistently across engines.', {
    availability: 'unavailable',
    codecRequirement: 'AAC AudioEncoder / FFmpeg (not bundled)',
  })
);

const VIDEO_SOURCES: ConvertFormatId[] = ['mp4', 'webm', 'mov'];
const videoEntries: ConversionDefinition[] = [];
for (const src of VIDEO_SOURCES) {
  videoEntries.push(
    def(src, 'webm', 'video', 'HTMLVideo + Canvas + MediaRecorder VP8/VP9', ['videoResolution', 'videoAspectRatio', 'muteAudio'], 'Re-encodes frames in real time via MediaRecorder to WebM; playback speed is 1× duration.', {
      availability: 'runtime-codec',
      runtimeCheckKey: 'media-webm-video',
      codecRequirement: 'HTMLVideo playback + MediaRecorder video/webm',
    }),
    def(src, 'gif', 'video', 'gifenc Canvas Frame Sampler', ['videoResolution', 'videoFps'], 'Samples frames (up to 15s clip) into quantized 256-color animated GIF.'),
    def(src, 'wav', 'video', 'Web Audio Track Extractor', ['sampleRate', 'channels'], 'Extracts and decodes the container audio stream to 16-bit PCM WAV.'),
    def(src, 'png', 'video', 'HTMLVideo Canvas Frame Capture', [], 'Captures a lossless PNG keyframe still from the video.')
  );
}
videoEntries.push(
  def('webm', 'mp4', 'video', 'MP4 Muxer (Unavailable)', [], 'Browser MediaRecorder produces WebM containers; cross-browser MP4 muxing requires FFmpeg.wasm (with COOP/COEP headers).', {
    availability: 'unavailable',
    codecRequirement: 'MP4 H.264/AAC muxer (not bundled)',
  }),
  def('mkv', 'webm', 'video', 'Matroska Demuxer (Unavailable)', [], 'Browser <video> playback and MediaRecorder support depend on container codecs; MKV parsing is unverified.', {
    availability: 'unavailable',
    codecRequirement: 'FFmpeg.wasm Matroska demuxer (not bundled)',
  }),
  def('avi', 'webm', 'video', 'AVI Demuxer (Unavailable)', [], 'Legacy RIFF/AVI codecs (DivX/Xvid/MJPEG) are not natively decoded by modern browsers.', {
    availability: 'unavailable',
    codecRequirement: 'FFmpeg.wasm AVI decoder (not bundled)',
  })
);

const archiveEntries: ConversionDefinition[] = [
  def('zip', 'tar', 'archive', 'JSZip → POSIX USTAR TAR', [], 'Decompresses ZIP entries locally and writes POSIX USTAR 512-byte archive blocks.'),
  def('zip', 'tar.gz', 'archive', 'JSZip → USTAR + pako GZIP', [], 'Repacks ZIP entries into a gzipped TAR archive (.tar.gz).'),
  def('tar', 'zip', 'archive', 'USTAR Parser → JSZip DEFLATE', [], 'Reads TAR entries and repacks them into a DEFLATE-compressed ZIP archive.'),
  def('tar', 'tar.gz', 'archive', 'pako GZIP Compressor', [], 'Compresses the TAR stream cleanly with GZIP (1F 8B 08).'),
  def('tar.gz', 'zip', 'archive', 'pako Gunzip + USTAR → JSZip', [], 'Inflates .tar.gz, unpacks TAR entries, and creates a ZIP archive.'),
  def('tar.gz', 'tar', 'archive', 'pako GZIP Inflater', [], 'Decompresses .tar.gz back to raw POSIX USTAR TAR.'),
  def('gz', 'zip', 'archive', 'pako Gunzip → JSZip', [], 'Inflates single-stream .gz file and packages it inside a ZIP archive.'),
  def('gz', 'txt', 'archive', 'pako GZIP Inflater', [], 'Decompresses UTF-8 text streams stored inside a .gz file.'),
];

// Also allow packaging any document/image/structured file into zip, tar, or gz directly
const PACKABLE_EXTS: ConvertFormatId[] = [
  'pdf', 'docx', 'xlsx', 'txt', 'md', 'html', 'rtf', 'json', 'yaml', 'xml', 'csv', 'tsv', 'png', 'jpg', 'webp', 'bmp', 'svg', 'wav',
];
for (const src of PACKABLE_EXTS) {
  archiveEntries.push(
    def(src, 'zip', 'archive', 'JSZip DEFLATE Archiver', [], 'Packages the source file into a standard PKZIP archive.'),
    def(src, 'tar', 'archive', 'POSIX USTAR Archiver', [], 'Packages the source file into an uncompressed USTAR TAR archive.'),
    def(src, 'gz', 'archive', 'pako GZIP Compressor', [], 'Compresses the source file as a standard GZIP (.gz) stream.')
  );
}

const STRUCTURED_FORMATS: ConvertFormatId[] = ['json', 'yaml', 'xml', 'csv', 'tsv', 'html', 'md'];
const structuredEntries: ConversionDefinition[] = [];
for (const src of STRUCTURED_FORMATS) {
  for (const tgt of STRUCTURED_FORMATS) {
    if (src === tgt) continue;
    // Skip redundant document-category duplicates (md<->html already listed under documentEntries)
    if ((src === 'md' && tgt === 'html') || (src === 'html' && tgt === 'md')) continue;
    const opts: ConversionOptionKey[] = ['prettyPrint'];
    if (tgt === 'xml') opts.push('xmlRootName');
    if (tgt === 'csv') opts.push('csvDelimiter');

    structuredEntries.push(
      def(
        src,
        tgt,
        'structured',
        `Structured AST (${src.toUpperCase()} → ${tgt.toUpperCase()})`,
        opts,
        tgt === 'csv' || tgt === 'tsv'
          ? 'Flattens arrays of objects or key-value maps into tabular columns; deeply nested objects serialize as JSON strings.'
          : 'Semantic AST transformation preserving keys, arrays, and primitive values where expressible.'
      )
    );
  }
}
for (const src of ['json', 'yaml', 'xml', 'csv', 'tsv'] as ConvertFormatId[]) {
  if (src !== 'csv' && src !== 'tsv') {
    structuredEntries.push(
      def(src, 'pdf', 'structured', 'pdf-lib Monospace Paginator', ['pageSize', 'orientation', 'prettyPrint'], 'Formats structured data cleanly into paginated monospace PDF.'),
      def(src, 'txt', 'structured', 'UTF-8 Text Serializer', ['prettyPrint'], 'Serializes structured data into readable UTF-8 text.')
    );
  } else {
    structuredEntries.push(
      def(src, 'xlsx', 'structured', 'SheetJS (xlsx)', ['cleanSpreadsheet'], 'Converts delimited table rows into an Excel .xlsx workbook.'),
      def(src, 'pdf', 'structured', 'SheetJS + pdf-lib Tabular PDF', ['pageSize', 'orientation', 'cleanSpreadsheet'], 'Renders delimited table rows into paginated PDF.')
    );
  }
}

export const CONVERSION_REGISTRY: ConversionDefinition[] = [
  ...imageEntries,
  ...documentEntries,
  ...audioEntries,
  ...videoEntries,
  ...archiveEntries,
  ...structuredEntries,
];

export function isDefinitionExecutable(
  item: ConversionDefinition,
  caps: RuntimeCodecCapabilities = detectRuntimeCodecCapabilities()
): { executable: boolean; reason?: string } {
  if (item.availability === 'unavailable') {
    return { executable: false, reason: item.limitations };
  }
  if (item.availability === 'available') {
    return { executable: true };
  }
  switch (item.runtimeCheckKey) {
    case 'canvas-avif':
      return caps.canvasAvif
        ? { executable: true }
        : { executable: false, reason: 'This browser does not support Canvas image/avif encoding.' };
    case 'canvas-webp':
      return caps.canvasWebp
        ? { executable: true }
        : { executable: false, reason: 'This browser does not support Canvas image/webp encoding.' };
    case 'media-webm-video':
      return caps.mediaWebmVideo
        ? { executable: true }
        : { executable: false, reason: 'MediaRecorder WebM video encoding is unavailable in this browser.' };
    case 'media-webm-opus':
      return caps.mediaWebmOpus
        ? { executable: true }
        : { executable: false, reason: 'MediaRecorder audio/webm;codecs=opus is unavailable in this browser.' };
    case 'media-ogg-opus':
      return caps.mediaOggOpus
        ? { executable: true }
        : { executable: false, reason: 'MediaRecorder audio/ogg;codecs=opus is unavailable in this browser.' };
    default:
      return { executable: true };
  }
}

export function getSupportedTargetsForSource(
  sourceFormat: ConvertFormatId | 'unknown',
  caps: RuntimeCodecCapabilities = detectRuntimeCodecCapabilities(),
  includeUnavailable = false
): ConversionDefinition[] {
  if (sourceFormat === 'unknown') return [];
  const normalizedSrc: ConvertFormatId = sourceFormat === 'jpeg' ? 'jpg' : sourceFormat;

  return CONVERSION_REGISTRY.filter((item) => {
    if (item.sourceFormat !== normalizedSrc) return false;
    if (includeUnavailable) return true;
    return isDefinitionExecutable(item, caps).executable;
  });
}

export function findConversionDefinition(
  sourceFormat: ConvertFormatId | 'unknown',
  targetFormat: ConvertFormatId
): ConversionDefinition | undefined {
  if (sourceFormat === 'unknown') return undefined;
  const normalizedSrc: ConvertFormatId = sourceFormat === 'jpeg' ? 'jpg' : sourceFormat;
  const normalizedTgt: ConvertFormatId = targetFormat === 'jpeg' ? 'jpg' : targetFormat;
  return CONVERSION_REGISTRY.find(
    (d) => d.sourceFormat === normalizedSrc && d.targetFormat === normalizedTgt
  );
}
