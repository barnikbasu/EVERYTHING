import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowRightLeft,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  FileCheck2,
  FolderArchive,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  XCircle,
} from 'lucide-react';
import { StudioShell, type StudioRailTab } from '../StudioShell';
import { StudioEmptyCard, StudioNotice } from '../StudioFeedback';
import { useWorkspace } from '../../state/workspaceStore';
import {
  DEFAULT_CONVERSION_SETTINGS,
  type ConversionResult,
  type ConversionSettings,
  type ConvertFormatId,
  type DetectedFileFormat,
} from '../../engines/convert/types';
import { detectFileFormat } from '../../engines/convert/formatDetector';
import {
  detectRuntimeCodecCapabilities,
  findConversionDefinition,
  getSupportedTargetsForSource,
} from '../../engines/convert/compatibilityRegistry';
import { estimateConversionOutput, executeFileConversion } from '../../engines/convert/convertEngine';
import { createZipFromFiles, parseSpreadsheetFile } from '../../engines/officeEngine';
import { downloadBlob, formatBytes } from '../../utils/formatters';
import { ConvertSettingsPanel } from './convert/ConvertSettingsPanel';
import { CompatibilityMatrixView } from './convert/CompatibilityMatrixView';

interface QueueItemState {
  id: string;
  file: File;
  detected: DetectedFileFormat | null;
  targetFormat: ConvertFormatId | '';
  sheetNames: string[];
  mediaMeta?: { width?: number; height?: number; durationSec?: number };
  status: 'inspecting' | 'ready' | 'converting' | 'done' | 'error' | 'cancelled' | 'unsupported';
  progressPct: number;
  stepLabel: string;
  result?: ConversionResult;
  error?: string;
}

const RAIL_TABS: StudioRailTab[] = [
  { id: 'convert', label: 'Convert', icon: 'ArrowLeftRight' },
  { id: 'matrix', label: 'Matrix', icon: 'TableProperties' },
];

export const ConvertStudio: React.FC = () => {
  const { files, addFiles, removeFile, clearFiles, recordHistory, initialPlanParams } = useWorkspace();
  const filePickerRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Record<string, AbortController>>({});
  const inspectedIdsRef = useRef<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<'convert' | 'matrix'>('convert');
  const [queue, setQueue] = useState<Record<string, QueueItemState>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ConversionSettings>(DEFAULT_CONVERSION_SETTINGS);
  const [isDragging, setIsDragging] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [copiedPreview, setCopiedPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const caps = useMemo(() => detectRuntimeCodecCapabilities(), []);

  const pickPreferredTarget = (
    srcFormat: ConvertFormatId | 'unknown',
    hintedFormat?: string
  ): ConvertFormatId | '' => {
    const targets = getSupportedTargetsForSource(srcFormat, caps, false);
    if (targets.length === 0) return '';
    if (hintedFormat) {
      const normalized = hintedFormat.toLowerCase().trim();
      const match = targets.find((t) => t.targetFormat === normalized);
      if (match) return match.targetFormat;
    }
    // Smart non-destructive defaults
    const preferenceOrder: ConvertFormatId[] = ['webp', 'png', 'pdf', 'wav', 'webm', 'yaml', 'json', 'csv', 'tar.gz', 'zip'];
    for (const pref of preferenceOrder) {
      if (targets.some((t) => t.targetFormat === pref && pref !== srcFormat)) return pref;
    }
    return targets[0].targetFormat;
  };

  // Sync WorkspaceFile list into Queue with signature inspection
  useEffect(() => {
    const currentIds = new Set(files.map((f) => f.id));

    setQueue((prev) => {
      const next: Record<string, QueueItemState> = {};
      for (const id of Object.keys(prev)) {
        if (currentIds.has(id)) next[id] = prev[id];
      }
      for (const wf of files) {
        if (!next[wf.id]) {
          next[wf.id] = {
            id: wf.id,
            file: wf.file,
            detected: null,
            targetFormat: '',
            sheetNames: [],
            status: 'inspecting',
            progressPct: 0,
            stepLabel: 'Inspecting file signature…',
          };
        }
      }
      return next;
    });

    if (files.length === 0) {
      setSelectedId(null);
    } else if (!selectedId || !currentIds.has(selectedId)) {
      setSelectedId(files[0].id);
    }

    for (const id of Array.from(inspectedIdsRef.current)) {
      if (!currentIds.has(id)) inspectedIdsRef.current.delete(id);
    }

    // Run signature & metadata inspection once per queued file ID
    files.forEach((wf) => {
      if (inspectedIdsRef.current.has(wf.id)) return;
      inspectedIdsRef.current.add(wf.id);

      detectFileFormat(wf.file)
        .then(async (detected) => {
          let sheetNames: string[] = [];
          let mediaMeta: QueueItemState['mediaMeta'] | undefined;

          if (detected.format === 'xlsx') {
            try {
              const parsed = await parseSpreadsheetFile(wf.file);
              sheetNames = parsed.sheetNames;
            } catch {
              // Ignore sheet pre-read errors; execution surfaces exact validation message
            }
          } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(detected.format) && typeof Image !== 'undefined') {
            const url = URL.createObjectURL(wf.file);
            try {
              const dims = await new Promise<{ width: number; height: number }>((res, rej) => {
                const img = new Image();
                img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = () => rej(new Error('Image probe failed'));
                img.src = url;
              });
              mediaMeta = dims;
            } catch {
              // Fallback without estimate
            } finally {
              URL.revokeObjectURL(url);
            }
          }

          const targets = getSupportedTargetsForSource(detected.format, caps, false);
          const defaultTgt = pickPreferredTarget(detected.format, initialPlanParams?.format);

          setQueue((prev) => {
            const item = prev[wf.id];
            if (!item || item.detected) return prev;
            return {
              ...prev,
              [wf.id]: {
                ...item,
                detected,
                sheetNames,
                mediaMeta,
                targetFormat: defaultTgt,
                status: targets.length > 0 ? 'ready' : 'unsupported',
                stepLabel:
                  targets.length > 0
                    ? `Detected ${detected.label}`
                    : `No local browser conversion available for ${detected.label}`,
              },
            };
          });
        })
        .catch((err) => {
          setQueue((prev) => {
            const item = prev[wf.id];
            if (!item) return prev;
            return {
              ...prev,
              [wf.id]: {
                ...item,
                status: 'error',
                error: err instanceof Error ? err.message : 'Failed to inspect signature',
              },
            };
          });
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // Apply AI plan hints when opened via AI Command
  useEffect(() => {
    if (!initialPlanParams) return;
    setSettings((prev) => ({
      ...prev,
      width: initialPlanParams.width ?? prev.width,
      height: initialPlanParams.height ?? prev.height,
      quality: typeof initialPlanParams.quality === 'number' ? initialPlanParams.quality : prev.quality,
    }));
  }, [initialPlanParams]);

  const orderedItems = files.map((wf) => queue[wf.id]).filter(Boolean);
  const activeItem = (selectedId ? queue[selectedId] : orderedItems[0]) || null;

  // Manage Blob object URL cleanly for active result preview
  useEffect(() => {
    if (!activeItem?.result?.blob) {
      setPreviewUrl(null);
      return;
    }
    const kind = activeItem.result.previewKind;
    if (kind === 'image' || kind === 'audio' || kind === 'video' || kind === 'pdf') {
      const url = URL.createObjectURL(activeItem.result.blob);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [activeItem?.result?.blob, activeItem?.result?.previewKind]);

  // Abort active conversions cleanly on unmount
  useEffect(() => {
    const controllers = abortControllersRef.current;
    return () => {
      Object.values(controllers).forEach((c) => c.abort());
    };
  }, []);

  const activeSourceFormat: ConvertFormatId | 'unknown' = activeItem?.detected?.format ?? 'unknown';
  const availableTargets = useMemo(
    () => getSupportedTargetsForSource(activeSourceFormat, caps, false),
    [activeSourceFormat, caps]
  );
  const activeDefinition = useMemo(() => {
    if (!activeItem || !activeItem.targetFormat || !activeItem.detected) return undefined;
    return findConversionDefinition(activeItem.detected.format, activeItem.targetFormat);
  }, [activeItem]);

  const activeEstimate = useMemo(() => {
    if (!activeItem || !activeItem.detected || !activeItem.targetFormat) return null;
    return estimateConversionOutput(
      activeItem.file.size,
      activeItem.detected.format,
      activeItem.targetFormat,
      settings,
      activeItem.mediaMeta
    );
  }, [activeItem, settings]);

  const runSingleItemConversion = async (itemId: string) => {
    const item = queue[itemId];
    if (!item || !item.targetFormat || !item.detected || item.detected.format === 'unknown') return;

    const controller = new AbortController();
    abortControllersRef.current[itemId] = controller;

    setQueue((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        status: 'converting',
        progressPct: 5,
        stepLabel: 'Starting conversion…',
        error: undefined,
      },
    }));

    try {
      const result = await executeFileConversion(item.file, item.targetFormat, settings, {
        signal: controller.signal,
        detectedHint: item.detected.format,
        onProgress: (pct, label) => {
          setQueue((prev) => {
            const cur = prev[itemId];
            if (!cur) return prev;
            return {
              ...prev,
              [itemId]: { ...cur, progressPct: pct, stepLabel: label },
            };
          });
        },
      });

      setQueue((prev) => ({
        ...prev,
        [itemId]: {
          ...prev[itemId],
          status: 'done',
          progressPct: 100,
          stepLabel: `Ready (${formatBytes(result.outputSize)})`,
          result,
          error: undefined,
        },
      }));

      recordHistory({
        toolId: 'convert-anything',
        toolName: `Convert ${result.sourceFormat.toUpperCase()} → ${result.outputFormat.toUpperCase()}`,
        category: 'convert',
        inputFilename: item.file.name,
        outputFilename: result.outputFilename,
        inputSize: result.inputSize,
        outputSize: result.outputSize,
        durationMs: result.durationMs,
        mode: 'local',
      });
    } catch (err) {
      const cancelled = controller.signal.aborted;
      const msg = err instanceof Error ? err.message : 'Conversion failed';
      setQueue((prev) => ({
        ...prev,
        [itemId]: {
          ...prev[itemId],
          status: cancelled ? 'cancelled' : 'error',
          progressPct: 0,
          stepLabel: cancelled ? 'Cancelled' : 'Failed',
          error: cancelled ? 'Cancelled by user' : msg,
        },
      }));
    } finally {
      delete abortControllersRef.current[itemId];
    }
  };

  const handleCancelItem = (itemId: string) => {
    abortControllersRef.current[itemId]?.abort();
  };

  const handleConvertAll = async (onlyFailedOrPending = true) => {
    if (orderedItems.length === 0) return;
    setGlobalError(null);
    setIsBatchRunning(true);
    for (const item of orderedItems) {
      if (!item.targetFormat || item.status === 'unsupported' || item.status === 'inspecting') {
        continue;
      }
      if (onlyFailedOrPending && item.status === 'done') continue;
      await runSingleItemConversion(item.id);
    }
    setIsBatchRunning(false);
  };

  const completedItems = orderedItems.filter((it) => it.status === 'done' && it.result);
  const failedItems = orderedItems.filter((it) => it.status === 'error' || it.status === 'cancelled');

  const handleDownloadAllZip = async () => {
    if (completedItems.length === 0) return;
    setGlobalError(null);
    const t0 = performance.now();
    try {
      const zipBlob = await createZipFromFiles(
        completedItems.map((it) => ({
          name: it.result!.outputFilename,
          data: it.result!.blob,
        }))
      );
      const outName = `everything_converted_${Date.now()}.zip`;
      downloadBlob(zipBlob, outName);
      recordHistory({
        toolId: 'convert-anything',
        toolName: 'Convert Anything ZIP Bundle',
        category: 'convert',
        inputFilename: `${completedItems.length} converted file(s)`,
        outputFilename: outName,
        inputSize: completedItems.reduce((s, it) => s + it.file.size, 0),
        outputSize: zipBlob.size,
        durationMs: performance.now() - t0,
        mode: 'local',
      });
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to package converted ZIP.');
    }
  };

  const handleApplyTargetToCompatible = () => {
    if (!activeItem?.targetFormat) return;
    const chosen = activeItem.targetFormat;
    setQueue((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const it = next[id];
        if (!it.detected) continue;
        const targets = getSupportedTargetsForSource(it.detected.format, caps, false);
        if (targets.some((t) => t.targetFormat === chosen)) {
          next[id] = {
            ...it,
            targetFormat: chosen,
            status: 'ready',
            result: undefined,
            error: undefined,
          };
        }
      }
      return next;
    });
  };

  const handleCopyPreviewText = async () => {
    if (!activeItem?.result?.previewText) return;
    try {
      await navigator.clipboard.writeText(activeItem.result.previewText);
      setCopiedPreview(true);
      setTimeout(() => setCopiedPreview(false), 1800);
    } catch {
      setGlobalError('Clipboard write is restricted in this browser window.');
    }
  };

  const settingsPanel =
    activeTab === 'convert' ? (
      <ConvertSettingsPanel
        sourceFormat={activeSourceFormat}
        targetFormat={activeItem?.targetFormat || ''}
        availableTargets={availableTargets}
        activeDefinition={activeDefinition}
        settings={settings}
        onTargetChange={(tgt) => {
          if (!activeItem) return;
          setQueue((prev) => ({
            ...prev,
            [activeItem.id]: {
              ...prev[activeItem.id],
              targetFormat: tgt,
              status: 'ready',
              result: undefined,
              error: undefined,
            },
          }));
        }}
        onSettingsChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
        onResetSettings={() => setSettings(DEFAULT_CONVERSION_SETTINGS)}
        sheetNames={activeItem?.sheetNames || []}
        estimatedOutputNote={activeEstimate}
        hasMultipleQueued={orderedItems.length > 1}
        onApplyTargetToCompatible={handleApplyTargetToCompatible}
        onConvertActive={() => activeItem && runSingleItemConversion(activeItem.id)}
        isConvertingActive={activeItem?.status === 'converting'}
        disabled={!activeItem || activeItem.status === 'inspecting' || activeItem.status === 'converting'}
      />
    ) : undefined;

  const primaryShellAction =
    completedItems.length >= 2
      ? { label: `Download All (.zip)`, fn: handleDownloadAllZip, disabled: false }
      : completedItems.length === 1
      ? {
          label: `Download .${completedItems[0].result!.outputFormat}`,
          fn: () => downloadBlob(completedItems[0].result!.blob, completedItems[0].result!.outputFilename),
          disabled: false,
        }
      : {
          label: `Convert ${orderedItems.length > 1 ? 'All' : 'File'}`,
          fn: () => handleConvertAll(false),
          disabled: orderedItems.length === 0 || isBatchRunning,
        };

  return (
    <StudioShell
      filename={
        activeTab === 'matrix'
          ? 'compatibility_matrix'
          : activeItem
          ? activeItem.file.name
          : 'convert_anything'
      }
      outputLabel={
        orderedItems.length > 0
          ? `${completedItems.length}/${orderedItems.length} ready`
          : 'Local Registry'
      }
      isProcessing={isBatchRunning || activeItem?.status === 'converting'}
      onReset={() => setSettings(DEFAULT_CONVERSION_SETTINGS)}
      onExport={activeTab === 'convert' ? primaryShellAction.fn : undefined}
      exportLabel={primaryShellAction.label}
      exportDisabled={primaryShellAction.disabled}
      railTabs={RAIL_TABS}
      activeRailTab={activeTab}
      onSelectRailTab={(tab) => setActiveTab(tab as 'convert' | 'matrix')}
      settingsPanel={settingsPanel}
      bottomMetaLeft={
        activeTab === 'matrix'
          ? 'Registry synced with active runtime browser codecs'
          : `${orderedItems.length} queued · ${completedItems.length} converted · Signatures verified locally`
      }
      bottomMetaRight="100% Client-Side Conversion"
    >
      <input
        ref={filePickerRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            addFiles(Array.from(e.target.files), false);
            e.target.value = '';
          }
        }}
      />

      {activeTab === 'matrix' ? (
        <CompatibilityMatrixView />
      ) : (
        <div
          className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.length) {
              addFiles(Array.from(e.dataTransfer.files), false);
            }
          }}
        >
          {globalError && <StudioNotice variant="error">{globalError}</StudioNotice>}

          {/* Top Workspace Control Bar */}
          <div
            className={`bg-white border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 transition-colors ${
              isDragging ? 'border-[#1D4ED8] bg-[#EFF6FF]/40 ring-2 ring-[#1D4ED8]/15' : 'border-[#E2E5EC]'
            }`}
          >
            <div>
              <h2 className="text-sm font-bold text-[#17191D]">Convert Anything</h2>
              <p className="text-xs text-[#717782]">
                True binary signature inspection across Images, Documents, Audio, Video, Archives & Structured Data.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => filePickerRef.current?.click()}
                className="h-8 px-3 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Files</span>
              </button>

              {orderedItems.length > 0 && (
                <>
                  <button
                    type="button"
                    disabled={isBatchRunning}
                    onClick={() => handleConvertAll(false)}
                    className="h-8 px-3 bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-45 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Play className="w-3 h-3" />
                    <span>{isBatchRunning ? 'Converting…' : `Convert All (${orderedItems.length})`}</span>
                  </button>

                  {failedItems.length > 0 && !isBatchRunning && (
                    <button
                      type="button"
                      onClick={() => handleConvertAll(true)}
                      className="h-8 px-3 bg-[#FFFBEB] hover:bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry ({failedItems.length})</span>
                    </button>
                  )}

                  {completedItems.length > 1 && (
                    <button
                      type="button"
                      onClick={handleDownloadAllZip}
                      className="h-8 px-3 bg-[#F0FDFA] hover:bg-[#CCFBF1] border border-[#99F6E4] text-[#0D9488] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FolderArchive className="w-3.5 h-3.5" />
                      <span>Download ZIP ({completedItems.length})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      Object.values(abortControllersRef.current).forEach((c) => c.abort());
                      clearFiles();
                      setQueue({});
                    }}
                    className="h-8 px-2.5 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] text-xs font-medium text-[#717782] hover:text-[#17191D] rounded-lg cursor-pointer"
                  >
                    Clear All
                  </button>
                </>
              )}
            </div>
          </div>

          {orderedItems.length === 0 ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-center">
                <StudioEmptyCard
                  category="convert"
                  iconName="ArrowLeftRight"
                  title="Drop Any Files to Convert"
                  description="Upload or drop one or more files. Signatures are verified in-memory and only real, executable output formats are presented."
                  primaryLabel="Select Local Files"
                  onPrimaryClick={() => filePickerRef.current?.click()}
                  secondaryLabel="View Compatibility Matrix"
                  onSecondaryClick={() => setActiveTab('matrix')}
                  footnote="100% private local engines · Multi-file batch & ZIP bundling"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  {
                    title: 'Images',
                    formats: 'JPG · PNG · WebP · BMP · ICO · GIF · SVG → Raster/PDF',
                    note: 'Plus AVIF where supported natively by browser Canvas.',
                  },
                  {
                    title: 'Documents & Sheets',
                    formats: 'PDF · DOCX · XLSX · RTF · MD · HTML · TXT',
                    note: 'PDF page rasterization, text extraction, and clean PDF pagination.',
                  },
                  {
                    title: 'Audio',
                    formats: 'WAV · MP3 · OGG · AAC · FLAC · M4A · OPUS → WAV / Opus',
                    note: 'Deterministic 16-bit PCM WAV resampling + browser Opus streams.',
                  },
                  {
                    title: 'Video',
                    formats: 'MP4 · WebM · MOV → WebM · GIF · WAV · PNG',
                    note: 'Real-time canvas capture, animated quantized GIF, or track extraction.',
                  },
                  {
                    title: 'Archives',
                    formats: 'ZIP ↔ TAR ↔ TAR.GZ · GZ · Pack Any File',
                    note: 'Worker-offloaded POSIX USTAR & DEFLATE packaging.',
                  },
                  {
                    title: 'Structured Data',
                    formats: 'JSON ↔ YAML ↔ XML ↔ CSV ↔ TSV ↔ HTML ↔ MD · XLSX',
                    note: 'AST validation prevents malformed conversions.',
                  },
                ].map((cat) => (
                  <div
                    key={cat.title}
                    className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-1"
                  >
                    <h3 className="text-xs font-bold text-[#17191D]">{cat.title}</h3>
                    <p className="text-[11px] font-mono text-[#1D4ED8]">{cat.formats}</p>
                    <p className="text-xs text-[#717782] leading-relaxed">{cat.note}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              {/* Left Queue List */}
              <div className="xl:col-span-7 bg-white border border-[#E2E5EC] rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-[#F6F7F9] border-b border-[#E2E5EC] flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-[#717782]">
                  <span>Input Queue ({orderedItems.length})</span>
                  <span>Target & Action</span>
                </div>

                <div className="divide-y divide-[#F1F3F6]">
                  {orderedItems.map((item) => {
                    const isSelected = activeItem?.id === item.id;
                    const targets = item.detected
                      ? getSupportedTargetsForSource(item.detected.format, caps, false)
                      : [];

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`p-3.5 transition-colors cursor-pointer ${
                          isSelected ? 'bg-[#EFF6FF]/45' : 'hover:bg-[#F6F7F9]/60'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2.5">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-[#17191D] truncate">
                                {item.file.name}
                              </span>
                            </div>

                            <div className="text-[11px] font-mono text-[#717782] tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span>{formatBytes(item.file.size)}</span>
                              {item.detected && (
                                <>
                                  <span>·</span>
                                  <span className="text-[#17191D] font-medium">
                                    {item.detected.label}
                                  </span>
                                  <span>·</span>
                                  <span>{item.detected.detectionMethod}</span>
                                </>
                              )}
                            </div>

                            {item.detected?.extensionMismatch && (
                              <div className="text-[11px] text-[#D97706] flex items-center gap-1 pt-0.5">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>
                                  Extension .{item.detected.declaredExtension} disagrees with signature ({item.detected.format.toUpperCase()})
                                </span>
                              </div>
                            )}

                            {item.status === 'converting' && (
                              <div className="pt-1.5 space-y-1">
                                <div className="h-1.5 w-full bg-[#E2E5EC] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#1D4ED8] transition-all duration-200"
                                    style={{ width: `${item.progressPct}%` }}
                                  />
                                </div>
                                <div className="text-[11px] font-mono text-[#1D4ED8] flex justify-between">
                                  <span>{item.stepLabel}</span>
                                  <span className="tabular-nums">{item.progressPct}%</span>
                                </div>
                              </div>
                            )}

                            {item.status === 'done' && item.result && (
                              <div className="text-[11px] font-mono text-[#0D9488] flex items-center gap-1.5 pt-0.5 tabular-nums">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">
                                  {item.result.outputFilename} ({formatBytes(item.result.outputSize)}) · {Math.round(item.result.durationMs)}ms
                                </span>
                              </div>
                            )}

                            {(item.status === 'error' || item.status === 'unsupported') && item.error && (
                              <div className="text-[11px] text-[#E5322D] flex items-start gap-1 pt-0.5">
                                <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>{item.error}</span>
                              </div>
                            )}
                          </div>

                          {/* Row Actions */}
                          <div
                            className="flex items-center gap-1.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {targets.length > 0 && (
                              <select
                                aria-label={`Target format for ${item.file.name}`}
                                value={item.targetFormat}
                                disabled={item.status === 'converting'}
                                onChange={(e) => {
                                  const val = e.target.value as ConvertFormatId;
                                  setSelectedId(item.id);
                                  setQueue((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      ...prev[item.id],
                                      targetFormat: val,
                                      status: 'ready',
                                      result: undefined,
                                      error: undefined,
                                    },
                                  }));
                                }}
                                className="h-7 px-2 bg-white border border-[#E2E5EC] rounded text-[11px] font-mono text-[#17191D] focus:outline-none focus:border-[#1D4ED8]"
                              >
                                {targets.map((t) => (
                                  <option key={t.id} value={t.targetFormat}>
                                    → .{t.outputExtension}
                                  </option>
                                ))}
                              </select>
                            )}

                            {item.status === 'converting' ? (
                              <button
                                type="button"
                                onClick={() => handleCancelItem(item.id)}
                                title="Cancel conversion"
                                className="h-7 px-2 bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#E5322D] border border-[#FECACA] rounded text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Square className="w-3 h-3" />
                                <span>Cancel</span>
                              </button>
                            ) : item.status === 'done' && item.result ? (
                              <button
                                type="button"
                                onClick={() => downloadBlob(item.result!.blob, item.result!.outputFilename)}
                                className="h-7 px-2.5 bg-[#F0FDFA] hover:bg-[#CCFBF1] text-[#0D9488] border border-[#99F6E4] rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                <span>Save</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!item.targetFormat || item.status === 'unsupported'}
                                onClick={() => runSingleItemConversion(item.id)}
                                className="h-7 px-2.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] disabled:opacity-40 text-[#1D4ED8] rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                                <span>{item.status === 'error' ? 'Retry' : 'Convert'}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                abortControllersRef.current[item.id]?.abort();
                                removeFile(item.id);
                              }}
                              aria-label={`Remove ${item.file.name}`}
                              className="p-1 text-[#717782] hover:text-[#E5322D] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Preview & Signature Inspector */}
              <div className="xl:col-span-5 bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-4">
                {!activeItem ? (
                  <p className="text-xs text-[#717782] py-8 text-center">
                    Select a file in the queue to inspect its signature and preview its conversion output.
                  </p>
                ) : (
                  <>
                    <div className="pb-3 border-b border-[#E2E5EC] space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#17191D] truncate">
                          {activeItem.file.name}
                        </span>
                        {activeItem.detected && (
                          <span className="text-[11px] font-mono text-[#1D4ED8] uppercase shrink-0">
                            {activeItem.detected.format}
                          </span>
                        )}
                      </div>
                      {activeItem.detected?.signatureHex && (
                        <div className="text-[11px] font-mono text-[#717782] truncate">
                          Magic Bytes: {activeItem.detected.signatureHex}
                        </div>
                      )}
                      {activeItem.detected?.details && (
                        <div className="text-[11px] text-[#717782]">{activeItem.detected.details}</div>
                      )}
                    </div>

                    {activeItem.status === 'unsupported' && (
                      <StudioNotice variant="warning">
                        {activeItem.stepLabel}. Open the <strong>Matrix</strong> tab on the left rail for codec details.
                      </StudioNotice>
                    )}

                    {activeItem.status === 'error' && activeItem.error && (
                      <StudioNotice variant="error">{activeItem.error}</StudioNotice>
                    )}

                    {!activeItem.result ? (
                      <div className="py-8 px-4 bg-[#F6F7F9] border border-dashed border-[#E2E5EC] rounded-lg text-center space-y-2">
                        <FileCheck2 className="w-6 h-6 text-[#1D4ED8] mx-auto" />
                        <p className="text-xs font-semibold text-[#17191D]">
                          Ready to convert{' '}
                          {activeItem.targetFormat
                            ? `to .${activeItem.targetFormat.toUpperCase()}`
                            : ''}
                        </p>
                        <p className="text-xs text-[#717782]">
                          {activeEstimate
                            ? `Estimated output: ${activeEstimate}`
                            : 'Configure options on the left drawer or click Convert Selected File.'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Output Metadata Summary */}
                        <div className="p-3 bg-[#F0FDFA] border border-[#99F6E4] rounded-lg space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#0D9488] truncate">
                              {activeItem.result.outputFilename}
                            </span>
                            <span className="font-mono text-[#17191D] tabular-nums shrink-0">
                              {formatBytes(activeItem.result.outputSize)}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-[#717782]">
                            {activeItem.result.signatureNote} · {Math.round(activeItem.result.durationMs)}ms
                          </div>
                        </div>

                        {activeItem.result.warnings.map((w, idx) => (
                          <StudioNotice key={idx} variant="warning">
                            {w}
                          </StudioNotice>
                        ))}

                        {/* Visual / Interactive Previews */}
                        {activeItem.result.previewKind === 'image' && previewUrl && (
                          <div
                            className="border border-[#E2E5EC] rounded-lg p-3 flex items-center justify-center min-h-[220px] max-h-[340px] overflow-hidden"
                            style={{
                              backgroundImage:
                                'linear-gradient(45deg, #F3F4F6 25%, transparent 25%), linear-gradient(-45deg, #F3F4F6 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #F3F4F6 75%), linear-gradient(-45deg, transparent 75%, #F3F4F6 75%)',
                              backgroundSize: '16px 16px',
                              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                            }}
                          >
                            <img
                              src={previewUrl}
                              alt={`Converted ${activeItem.result.outputFilename}`}
                              className="max-h-[300px] max-w-full object-contain"
                            />
                          </div>
                        )}

                        {activeItem.result.previewKind === 'audio' && previewUrl && (
                          <div className="p-4 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg">
                            <audio controls src={previewUrl} className="w-full" />
                          </div>
                        )}

                        {activeItem.result.previewKind === 'video' && previewUrl && (
                          <div className="border border-[#E2E5EC] rounded-lg overflow-hidden bg-[#17191D]">
                            <video controls src={previewUrl} className="w-full max-h-[280px]" />
                          </div>
                        )}

                        {activeItem.result.previewKind === 'pdf' && previewUrl && (
                          <div className="border border-[#E2E5EC] rounded-lg overflow-hidden h-[300px] bg-[#F6F7F9]">
                            <iframe
                              title="Converted PDF Preview"
                              src={previewUrl}
                              className="w-full h-full border-0"
                            />
                          </div>
                        )}

                        {activeItem.result.previewKind === 'text' && activeItem.result.previewText !== undefined && (
                          <div className="border border-[#E2E5EC] rounded-lg overflow-hidden">
                            <div className="px-3 py-1.5 bg-[#F6F7F9] border-b border-[#E2E5EC] flex items-center justify-between text-[11px] font-mono text-[#717782]">
                              <span>Output Preview ({activeItem.result.outputFormat.toUpperCase()})</span>
                              <button
                                type="button"
                                onClick={handleCopyPreviewText}
                                className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline cursor-pointer"
                              >
                                {copiedPreview ? (
                                  <>
                                    <ClipboardCheck className="w-3 h-3" /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" /> Copy
                                  </>
                                )}
                              </button>
                            </div>
                            <pre className="p-3 text-[11px] font-mono text-[#17191D] max-h-[280px] overflow-auto whitespace-pre-wrap break-all bg-white">
                              {activeItem.result.previewText}
                            </pre>
                          </div>
                        )}

                        {activeItem.result.previewKind === 'archive' && activeItem.result.archiveEntries && (
                          <div className="border border-[#E2E5EC] rounded-lg overflow-hidden">
                            <div className="px-3 py-1.5 bg-[#F6F7F9] border-b border-[#E2E5EC] flex items-center gap-1.5 text-[11px] font-mono text-[#717782]">
                              <Archive className="w-3.5 h-3.5" />
                              <span>Archive Contents ({activeItem.result.archiveEntries.length} item(s))</span>
                            </div>
                            <div className="divide-y divide-[#F1F3F6] max-h-[220px] overflow-auto text-xs font-mono">
                              {activeItem.result.archiveEntries.map((entry, idx) => (
                                <div
                                  key={`${entry.path}-${idx}`}
                                  className="px-3 py-1.5 flex items-center justify-between gap-2"
                                >
                                  <span className="truncate text-[#17191D]">{entry.path}</span>
                                  <span className="text-[#717782] shrink-0 tabular-nums">
                                    {formatBytes(entry.size)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => downloadBlob(activeItem.result!.blob, activeItem.result!.outputFilename)}
                          className="w-full h-9 bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download {activeItem.result.outputFilename}</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </StudioShell>
  );
};
