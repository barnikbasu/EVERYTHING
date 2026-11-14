import {
  gunzipBytes,
  gzipBytes,
  packTarArchive,
  readZipEntries,
  unpackTarArchive,
  writeZipEntries,
  type ArchiveEntryData,
} from './binaryCodecs';
import { parseStructuredInput, serializeStructuredOutput } from './structuredCodec';
import type { ConversionSettings, ConvertFormatId } from './types';

export interface WorkerArchiveRequest {
  kind: 'archive';
  filename: string;
  sourceFormat: ConvertFormatId;
  targetFormat: ConvertFormatId;
  bytes: Uint8Array;
}

export interface WorkerArchiveResponse {
  bytes: Uint8Array;
  mime: string;
  ext: string;
  entries: Array<{ path: string; size: number; dir: boolean }>;
  previewText?: string;
}

export interface WorkerStructuredRequest {
  kind: 'structured';
  filename: string;
  sourceFormat: ConvertFormatId;
  targetFormat: ConvertFormatId;
  mime: string;
  text: string;
  settings: ConversionSettings;
}

export interface WorkerStructuredResponse {
  text: string;
}

export type ConvertWorkerRequest = WorkerArchiveRequest | WorkerStructuredRequest;

export async function runArchiveTask(req: WorkerArchiveRequest): Promise<WorkerArchiveResponse> {
  const { filename, sourceFormat, targetFormat, bytes } = req;

  if (!['zip', 'tar', 'gz', 'tar.gz'].includes(sourceFormat)) {
    const singleEntry: ArchiveEntryData = { path: filename, data: bytes };
    if (targetFormat === 'zip') {
      const zipBytes = await writeZipEntries([singleEntry]);
      return {
        bytes: zipBytes,
        mime: 'application/zip',
        ext: 'zip',
        entries: [{ path: filename, size: bytes.length, dir: false }],
      };
    }
    if (targetFormat === 'tar') {
      const tarBytes = packTarArchive([singleEntry]);
      return {
        bytes: tarBytes,
        mime: 'application/x-tar',
        ext: 'tar',
        entries: [{ path: filename, size: bytes.length, dir: false }],
      };
    }
    if (targetFormat === 'gz') {
      const gzBytes = gzipBytes(bytes);
      return {
        bytes: gzBytes,
        mime: 'application/gzip',
        ext: 'gz',
        entries: [{ path: filename, size: bytes.length, dir: false }],
      };
    }
  }

  let entries: ArchiveEntryData[] = [];
  if (sourceFormat === 'zip') {
    entries = await readZipEntries(bytes);
  } else if (sourceFormat === 'tar') {
    entries = unpackTarArchive(bytes);
  } else if (sourceFormat === 'tar.gz') {
    const inflated = gunzipBytes(bytes);
    entries = unpackTarArchive(inflated);
  } else if (sourceFormat === 'gz') {
    const inflated = gunzipBytes(bytes);
    const innerName = filename.replace(/\.gz$/i, '') || 'decompressed.txt';
    if (targetFormat === 'txt') {
      return {
        bytes: inflated,
        mime: 'text/plain;charset=utf-8',
        ext: 'txt',
        entries: [{ path: innerName, size: inflated.length, dir: false }],
        previewText: new TextDecoder('utf-8').decode(inflated),
      };
    }
    entries = [{ path: innerName, data: inflated }];
  }

  const summary = entries.map((e) => ({ path: e.path, size: e.data.length, dir: false }));

  if (targetFormat === 'zip') {
    const zipBytes = await writeZipEntries(entries);
    return { bytes: zipBytes, mime: 'application/zip', ext: 'zip', entries: summary };
  }
  if (targetFormat === 'tar') {
    const tarBytes = packTarArchive(entries);
    return { bytes: tarBytes, mime: 'application/x-tar', ext: 'tar', entries: summary };
  }
  if (targetFormat === 'tar.gz') {
    const tarBytes = packTarArchive(entries);
    const gzBytes = gzipBytes(tarBytes);
    return { bytes: gzBytes, mime: 'application/gzip', ext: 'tar.gz', entries: summary };
  }

  throw new Error(`Unsupported archive conversion ${sourceFormat} -> ${targetFormat}`);
}

export function runStructuredTask(req: WorkerStructuredRequest): WorkerStructuredResponse {
  const ast = parseStructuredInput(req.sourceFormat, req.text);
  const serialized = serializeStructuredOutput(req.targetFormat, ast, {
    prettyPrint: req.settings.prettyPrint,
    xmlRootName: req.settings.xmlRootName,
    csvDelimiter: req.settings.csvDelimiter,
    title: req.filename,
  });
  return { text: serialized };
}

// Worker listener when spawned inside a Web Worker context
if (typeof self !== 'undefined' && typeof (self as unknown as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined') {
  self.onmessage = async (event: MessageEvent<{ id: number; payload: ConvertWorkerRequest }>) => {
    const { id, payload } = event.data;
    try {
      if (payload.kind === 'archive') {
        const res = await runArchiveTask(payload);
        (self as unknown as { postMessage: (msg: unknown, transfer?: Transferable[]) => void }).postMessage(
          { id, ok: true, result: res },
          [res.bytes.buffer]
        );
      } else {
        const res = runStructuredTask(payload);
        (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({ id, ok: true, result: res });
      }
    } catch (err) {
      (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
        id,
        ok: false,
        error: err instanceof Error ? err.message : 'Worker conversion failed',
      });
    }
  };
}
