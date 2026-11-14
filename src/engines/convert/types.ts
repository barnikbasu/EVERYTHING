export type ConversionCategory =
  | 'image'
  | 'document'
  | 'audio'
  | 'video'
  | 'archive'
  | 'structured';

export type ConvertFormatId =
  // Image
  | 'jpg'
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'avif'
  | 'bmp'
  | 'gif'
  | 'tiff'
  | 'svg'
  | 'ico'
  | 'heic'
  // Document / Spreadsheet
  | 'pdf'
  | 'docx'
  | 'txt'
  | 'rtf'
  | 'html'
  | 'csv'
  | 'tsv'
  | 'xlsx'
  | 'pptx'
  | 'md'
  // Audio
  | 'mp3'
  | 'wav'
  | 'aac'
  | 'flac'
  | 'ogg'
  | 'm4a'
  | 'opus'
  // Video
  | 'mp4'
  | 'mov'
  | 'webm'
  | 'mkv'
  | 'avi'
  // Archive
  | 'zip'
  | 'tar'
  | 'gz'
  | 'tar.gz'
  // Structured Data
  | 'json'
  | 'xml'
  | 'yaml';

export type ConversionOptionKey =
  | 'quality'
  | 'dimensions'
  | 'aspectRatio'
  | 'backgroundColor'
  | 'preserveTransparency'
  | 'stripMetadata'
  | 'pageRange'
  | 'pageSize'
  | 'orientation'
  | 'dpi'
  | 'pdfCompression'
  | 'sampleRate'
  | 'channels'
  | 'audioBitrate'
  | 'audioCodec'
  | 'videoResolution'
  | 'videoFps'
  | 'videoBitrate'
  | 'muteAudio'
  | 'videoAspectRatio'
  | 'sheetSelection'
  | 'cleanSpreadsheet'
  | 'prettyPrint'
  | 'xmlRootName'
  | 'csvDelimiter';

export type ConversionAvailability = 'available' | 'runtime-codec' | 'unavailable';

export interface ConversionDefinition {
  id: string;
  sourceFormat: ConvertFormatId;
  targetFormat: ConvertFormatId;
  category: ConversionCategory;
  processingEngine: string;
  processingLocation: 'local';
  inputValidation: string;
  codecRequirement: string;
  supportedOptions: ConversionOptionKey[];
  outputMimeType: string;
  outputExtension: string;
  limitations: string;
  availability: ConversionAvailability;
  runtimeCheckKey?: 'canvas-avif' | 'canvas-webp' | 'media-webm-opus' | 'media-ogg-opus' | 'media-webm-video' | 'image-avif-decode';
}

export interface RuntimeCodecCapabilities {
  canvasPng: boolean;
  canvasJpeg: boolean;
  canvasWebp: boolean;
  canvasAvif: boolean;
  mediaRecorderAvailable: boolean;
  mediaWebmVideo: boolean;
  mediaWebmOpus: boolean;
  mediaOggOpus: boolean;
  webAudioAvailable: boolean;
  pdfJsAvailable: boolean;
}

export interface DetectedFileFormat {
  format: ConvertFormatId | 'unknown';
  category: ConversionCategory | 'unknown';
  label: string;
  mimeType: string;
  signatureHex: string;
  detectionMethod: 'magic-bytes' | 'container-inspect' | 'text-heuristic' | 'extension-fallback' | 'unknown';
  declaredExtension: string;
  extensionMismatch: boolean;
  confidence: 'high' | 'medium' | 'low';
  details?: string;
}

export interface ConversionSettings {
  // Image settings
  quality: number; // 10..100
  width: number | null;
  height: number | null;
  maintainAspect: boolean;
  backgroundColor: string;
  preserveTransparency: boolean;
  stripMetadata: boolean;

  // PDF & Document settings
  pageRange: string;
  pageSize: 'a4' | 'letter' | 'fit';
  orientation: 'portrait' | 'landscape';
  dpi: 72 | 150 | 300;
  pdfCompression: 'recommended' | 'maximum' | 'lossless';
  sheetName: string;
  trimCells: boolean;
  deduplicateRows: boolean;

  // Audio settings
  sampleRate: 16000 | 22050 | 44100 | 48000;
  channels: 1 | 2;
  audioBitrateKbps: 96 | 128 | 192 | 256;

  // Video settings
  videoMaxWidth: 480 | 720 | 1280 | 1920;
  videoFps: 8 | 12 | 24 | 30;
  videoBitrateKbps: 1200 | 2500 | 5000;
  muteAudio: boolean;
  videoAspectRatio: 'original' | '16:9' | '9:16' | '1:1' | '4:5';

  // Structured data settings
  prettyPrint: boolean;
  xmlRootName: string;
  csvDelimiter: ',' | ';' | '\t';
}

export const DEFAULT_CONVERSION_SETTINGS: ConversionSettings = {
  quality: 88,
  width: null,
  height: null,
  maintainAspect: true,
  backgroundColor: '#FFFFFF',
  preserveTransparency: true,
  stripMetadata: true,

  pageRange: '',
  pageSize: 'a4',
  orientation: 'portrait',
  dpi: 150,
  pdfCompression: 'recommended',
  sheetName: '',
  trimCells: true,
  deduplicateRows: false,

  sampleRate: 44100,
  channels: 2,
  audioBitrateKbps: 128,

  videoMaxWidth: 1280,
  videoFps: 12,
  videoBitrateKbps: 2500,
  muteAudio: false,
  videoAspectRatio: 'original',

  prettyPrint: true,
  xmlRootName: 'root',
  csvDelimiter: ',',
};

export interface ConversionResult {
  blob: Blob;
  outputFilename: string;
  outputMimeType: string;
  outputFormat: ConvertFormatId;
  sourceFormat: ConvertFormatId;
  inputSize: number;
  outputSize: number;
  durationMs: number;
  signatureValid: boolean;
  signatureNote: string;
  previewKind: 'image' | 'audio' | 'video' | 'text' | 'pdf' | 'archive' | 'none';
  previewText?: string;
  archiveEntries?: Array<{ path: string; size: number; dir: boolean }>;
  warnings: string[];
  estimatedNote?: string;
}
