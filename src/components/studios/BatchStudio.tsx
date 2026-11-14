import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Plus, Trash2, XCircle } from 'lucide-react';
import { StudioShell } from '../StudioShell';
import { StudioEmptyCard, StudioNotice } from '../StudioFeedback';
import { useWorkspace } from '../../state/workspaceStore';
import { DEFAULT_IMAGE_PARAMS, loadImageCanvas, processImageCanvas } from '../../engines/imageEngine';
import { createZipFromFiles } from '../../engines/officeEngine';
import { downloadBlob, formatBytes, replaceFileExtension } from '../../utils/formatters';
import { imageMimeToExt } from '../../utils/mediaUtils';

interface BatchItemResult {
  sourceId: string;
  originalName: string;
  outputName: string;
  inputSize: number;
  outputSize: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  blob?: Blob;
  error?: string;
}

export const BatchStudio: React.FC = () => {
  const { files, addFiles, removeFile, clearFiles, recordHistory, initialPlanParams } = useWorkspace();
  const filePickerRef = useRef<HTMLInputElement>(null);

  const [operation, setOperation] = useState<'image-convert' | 'rename-zip'>('image-convert');
  const [targetFormat, setTargetFormat] = useState<'image/webp' | 'image/jpeg' | 'image/png'>('image/webp');
  const [quality, setQuality] = useState(0.84);
  const [maxWidth, setMaxWidth] = useState<string>('');
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [results, setResults] = useState<Record<string, BatchItemResult>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!initialPlanParams) return;
    if (initialPlanParams.width && initialPlanParams.width > 0) {
      setMaxWidth(String(initialPlanParams.width));
      setOperation('image-convert');
    }
    if (typeof initialPlanParams.quality === 'number') {
      setQuality(Math.max(0.2, Math.min(1, initialPlanParams.quality / 100)));
    }
    if (initialPlanParams.format) {
      const f = initialPlanParams.format.toLowerCase();
      if (f === 'png') setTargetFormat('image/png');
      else if (f === 'jpg' || f === 'jpeg') setTargetFormat('image/jpeg');
      else if (f === 'webp') setTargetFormat('image/webp');
    }
  }, [initialPlanParams]);

  const computeOutputName = (name: string, idx: number, extOverride?: string) => {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const origExt = dot > 0 ? name.slice(dot + 1) : 'bin';
    const nextExt = extOverride || origExt;
    const renamed = `${prefix}${base}${suffix}`.trim() || `file_${idx + 1}`;
    return replaceFileExtension(`${renamed}.${origExt}`, nextExt);
  };

  const handleRunBatch = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setErrorMsg(null);
    const t0 = performance.now();
    const ext = imageMimeToExt(targetFormat);
    let totalOutputSize = 0;

    for (let i = 0; i < files.length; i++) {
      const wf = files[i];
      const isImg =
        wf.type.startsWith('image/') ||
        ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(wf.extension);
      const outName = computeOutputName(
        wf.name,
        i,
        operation === 'image-convert' && isImg ? ext : undefined
      );

      setResults((prev) => ({
        ...prev,
        [wf.id]: {
          sourceId: wf.id,
          originalName: wf.name,
          outputName: outName,
          inputSize: wf.size,
          outputSize: 0,
          status: 'processing',
        },
      }));

      try {
        let outBlob: Blob;
        if (operation === 'image-convert' && isImg) {
          const { canvas, width, height } = await loadImageCanvas(wf.file);
          const parsedW = maxWidth.trim() ? Number(maxWidth) : null;
          const computedH = parsedW && width ? Math.round((parsedW * height) / width) : null;
          const processed = await processImageCanvas(canvas, {
            ...DEFAULT_IMAGE_PARAMS,
            outputFormat: targetFormat,
            quality,
            transform: {
              ...DEFAULT_IMAGE_PARAMS.transform,
              targetWidth: parsedW,
              targetHeight: computedH,
            },
          });
          outBlob = processed.blob;
        } else {
          // Rename / package pass preserves raw bytes cleanly
          outBlob = wf.file;
        }
        totalOutputSize += outBlob.size;

        setResults((prev) => ({
          ...prev,
          [wf.id]: {
            sourceId: wf.id,
            originalName: wf.name,
            outputName: outName,
            inputSize: wf.size,
            outputSize: outBlob.size,
            status: 'done',
            blob: outBlob,
          },
        }));
      } catch (err) {
        setResults((prev) => ({
          ...prev,
          [wf.id]: {
            sourceId: wf.id,
            originalName: wf.name,
            outputName: outName,
            inputSize: wf.size,
            outputSize: 0,
            status: 'error',
            error: err instanceof Error ? err.message : 'Failed to process file',
          },
        }));
      }
    }

    setIsProcessing(false);
    recordHistory({
      toolId: 'batch-lab',
      toolName: 'Batch Lab',
      category: 'ai-batch',
      inputFilename: `${files.length} file(s)`,
      outputFilename: `batch_${files.length}_items`,
      inputSize: files.reduce((s, f) => s + f.size, 0),
      outputSize: totalOutputSize,
      durationMs: performance.now() - t0,
      mode: 'local',
    });
  };

  const completedItems = Object.values(results).filter((r) => r.status === 'done' && r.blob);

  const handleDownloadAllZip = async () => {
    if (completedItems.length === 0) return;
    setErrorMsg(null);
    const t0 = performance.now();
    try {
      const zipBlob = await createZipFromFiles(
        completedItems.map((item) => ({ name: item.outputName, data: item.blob! }))
      );
      const outName = `everything_batch_${Date.now()}.zip`;
      downloadBlob(zipBlob, outName);
      recordHistory({
        toolId: 'batch-lab',
        toolName: 'Batch ZIP Archive',
        category: 'ai-batch',
        inputFilename: `${completedItems.length} processed file(s)`,
        outputFilename: outName,
        inputSize: completedItems.reduce((s, item) => s + item.inputSize, 0),
        outputSize: zipBlob.size,
        durationMs: performance.now() - t0,
        mode: 'local',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to package batch ZIP.');
    }
  };

  const settingsPanel = (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-[#17191D]">Batch Pipeline</h3>
      <div className="space-y-1.5">
        <label className="text-xs font-medium block">Operation</label>
        <select
          value={operation}
          onChange={(e) => setOperation(e.target.value as 'image-convert' | 'rename-zip')}
          className="w-full h-9 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
        >
          <option value="image-convert">Image Compress / Resize / Convert</option>
          <option value="rename-zip">Batch Rename & ZIP Package</option>
        </select>
      </div>

      {operation === 'image-convert' && (
        <div className="space-y-3 pt-2 border-t border-[#E2E5EC]">
          <div>
            <label className="text-xs font-medium block mb-1">Output Format</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { mime: 'image/webp', label: 'WebP' },
                  { mime: 'image/jpeg', label: 'JPEG' },
                  { mime: 'image/png', label: 'PNG' },
                ] as const
              ).map((fmt) => (
                <button
                  key={fmt.mime}
                  type="button"
                  onClick={() => setTargetFormat(fmt.mime)}
                  className={`py-1.5 text-xs font-mono rounded border cursor-pointer ${
                    targetFormat === fmt.mime
                      ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                      : 'bg-[#F6F7F9] border-[#E2E5EC]'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {targetFormat !== 'image/png' && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#717782]">Quality</span>
                <span className="font-mono tabular-nums">{Math.round(quality * 100)}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                value={Math.round(quality * 100)}
                onChange={(e) => setQuality(Number(e.target.value) / 100)}
                className="w-full accent-[#1D4ED8]"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium block mb-1">Target Width (px, optional)</label>
            <input
              type="number"
              value={maxWidth}
              onChange={(e) => setMaxWidth(e.target.value)}
              placeholder="e.g. 1080"
              className="w-full h-8 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
            />
          </div>
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-[#E2E5EC]">
        <p className="text-xs font-semibold text-[#17191D]">Rename Rules</p>
        <input
          type="text"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="Filename prefix (e.g. web_)"
          className="w-full h-8 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
        />
        <input
          type="text"
          value={suffix}
          onChange={(e) => setSuffix(e.target.value)}
          placeholder="Filename suffix (e.g. _clean)"
          className="w-full h-8 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
        />
      </div>

      <button
        type="button"
        disabled={files.length === 0 || isProcessing}
        onClick={handleRunBatch}
        className="w-full h-9 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isProcessing ? 'Running Batch…' : `Process ${files.length} File(s)`}
      </button>
    </div>
  );

  return (
    <StudioShell
      filename={`batch_queue (${files.length})`}
      isProcessing={isProcessing}
      onExport={handleDownloadAllZip}
      exportLabel="Download All as ZIP"
      exportDisabled={completedItems.length === 0}
      settingsPanel={settingsPanel}
      bottomMetaLeft={`${files.length} queued · ${completedItems.length} completed`}
      bottomMetaRight="Partial-Failure Resilient + JSZip"
    >
      <input
        ref={filePickerRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(Array.from(e.target.files), false);
        }}
      />

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        {errorMsg && <StudioNotice variant="error">{errorMsg}</StudioNotice>}
        <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#17191D]">Batch Processing Queue</h2>
            <p className="text-xs text-[#717782]">
              Add multiple files, configure transforms, run locally, and download individually or as a ZIP.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => filePickerRef.current?.click()}
              className="h-8 px-3 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Files
            </button>
            {files.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearFiles();
                  setResults({});
                }}
                className="h-8 px-3 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {files.length === 0 ? (
          <div className="py-6 flex items-center justify-center">
            <StudioEmptyCard
              category="ai-batch"
              iconName="Layers"
              title="Batch Queue is Empty"
              description="Select multiple images or documents to compress, resize, rename, or package into a ZIP."
              primaryLabel="Select Files"
              onPrimaryClick={() => filePickerRef.current?.click()}
              footnote="Resilient per-file processing · Local ZIP packaging"
            />
          </div>
        ) : (
          <div className="bg-white border border-[#E2E5EC] rounded-xl overflow-hidden">
            <div className="divide-y divide-[#F1F3F6]">
              {files.map((wf, idx) => {
                const res = results[wf.id];
                return (
                  <div
                    key={wf.id}
                    className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono font-medium text-[#17191D] truncate tabular-nums">
                        {idx + 1}. {wf.name}
                      </div>
                      <div className="font-mono text-[11px] text-[#717782] mt-0.5 tabular-nums">
                        {formatBytes(wf.size)}
                        {res?.status === 'done' && (
                          <span className="text-[#0D9488]">
                            {' '}
                            → {res.outputName} ({formatBytes(res.outputSize)})
                          </span>
                        )}
                        {res?.status === 'error' && (
                          <span className="text-[#E5322D]"> · {res.error}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {res?.status === 'processing' && (
                        <span className="font-mono text-[#1D4ED8]">Processing…</span>
                      )}
                      {res?.status === 'done' && res.blob && (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#0D9488]" />
                          <button
                            type="button"
                            onClick={() => downloadBlob(res.blob!, res.outputName)}
                            className="h-7 px-2.5 bg-[#F0FDFA] hover:bg-[#CCFBF1] text-[#0D9488] rounded font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Download className="w-3 h-3" /> Save
                          </button>
                        </>
                      )}
                      {res?.status === 'error' && <XCircle className="w-4 h-4 text-[#E5322D]" />}
                      <button
                        type="button"
                        onClick={() => removeFile(wf.id)}
                        className="p-1 text-[#717782] hover:text-[#E5322D] cursor-pointer"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </StudioShell>
  );
};
