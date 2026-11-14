import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StudioShell, type StudioRailTab } from '../StudioShell';
import { StudioEmptyCard, StudioNotice } from '../StudioFeedback';
import { useWorkspace } from '../../state/workspaceStore';
import {
  DEFAULT_IMAGE_PARAMS,
  generatePassportSheet,
  loadImageCanvas,
  processImageCanvas,
  type ImageProcessParams,
} from '../../engines/imageEngine';
import {
  downloadBlob,
  formatBytes,
  formatDurationMs,
  replaceFileExtension,
  urlToFile,
} from '../../utils/formatters';
import { imageMimeToExt } from '../../utils/mediaUtils';
import { SAMPLE_IMAGE_ASSETS } from '../../assets/samples';
import { useHistoryState } from '../../hooks/useHistoryState';
import { ImageSettingsPanel } from './image/ImageSettingsPanel';

const IMAGE_RAIL_TABS: StudioRailTab[] = [
  { id: 'cutout', label: 'Cutout', icon: 'Sparkles' },
  { id: 'mask', label: 'Mask', icon: 'PenTool' },
  { id: 'tone', label: 'Tone', icon: 'SlidersHorizontal' },
  { id: 'crop', label: 'Crop', icon: 'Crop' },
  { id: 'watermark', label: 'Mark', icon: 'ShieldCheck' },
  { id: 'passport', label: 'ID Sheet', icon: 'Contact' },
];

function getInitialRailTab(toolId?: string): string {
  if (toolId === 'image-filters-tone') return 'tone';
  if (toolId === 'image-crop-resize' || toolId === 'image-compress') return 'crop';
  if (toolId === 'image-passport') return 'passport';
  return 'cutout';
}

export const ImageStudio: React.FC = () => {
  const { selectedTool, files, initialPreset, initialPlanParams, addFiles, recordHistory } = useWorkspace();
  const activeFile = files[0]?.file || null;
  const filePickerRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<string>(() => getInitialRailTab(selectedTool?.id));
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [sourceDims, setSourceDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const resolvedFormat: ImageProcessParams['outputFormat'] = (() => {
    const fmt = initialPlanParams?.format?.toLowerCase();
    if (fmt === 'webp') return 'image/webp';
    if (fmt === 'jpg' || fmt === 'jpeg') return 'image/jpeg';
    if (fmt === 'png') return 'image/png';
    if (selectedTool?.id === 'image-compress') return 'image/webp';
    if (initialPreset === 'white') return 'image/jpeg';
    return 'image/png';
  })();

  const {
    state: params,
    canUndo,
    canRedo,
    push: pushParams,
    undo: handleUndo,
    redo: handleRedo,
  } = useHistoryState<ImageProcessParams>(
    {
      ...DEFAULT_IMAGE_PARAMS,
      cutout: {
        ...DEFAULT_IMAGE_PARAMS.cutout,
        enabled: selectedTool?.id === 'image-remove-bg',
        backdropMode:
          initialPreset === 'white'
            ? 'white'
            : initialPreset === 'blur'
            ? 'blur'
            : 'transparent',
      },
      transform: {
        ...DEFAULT_IMAGE_PARAMS.transform,
        targetWidth: initialPlanParams?.width ?? null,
        targetHeight: initialPlanParams?.height ?? null,
      },
      quality: initialPlanParams?.quality ? Math.min(1, Math.max(0.1, initialPlanParams.quality)) : DEFAULT_IMAGE_PARAMS.quality,
      outputFormat: resolvedFormat,
    },
    30
  );

  const [filename, setFilename] = useState<string>(() =>
    activeFile ? replaceFileExtension(activeFile.name, 'png') : 'processed_image.png'
  );
  const [zoom, setZoom] = useState(100);
  const [beforeAfter, setBeforeAfter] = useState(true);
  const [splitPct, setSplitPct] = useState(50);

  const [outputUrl, setOutputUrl] = useState<string>('');
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputDims, setOutputDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [lastDurationMs, setLastDurationMs] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Brush Mask State
  const [brushMode, setBrushMode] = useState<'erase' | 'restore'>('erase');
  const [brushSize, setBrushSize] = useState(28);
  const [maskOverrides, setMaskOverrides] = useState<Float32Array | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Passport Sheet State
  const [passportPreset, setPassportPreset] = useState<'35x45mm' | '2x2in'>('35x45mm');
  const [passportSheet, setPassportSheet] = useState<'4x6in' | 'a4'>('4x6in');
  const [passportFormat, setPassportFormat] = useState<'image/jpeg' | 'image/png' | 'application/pdf'>('image/jpeg');

  useEffect(() => {
    setActiveTab(getInitialRailTab(selectedTool?.id));
  }, [selectedTool?.id]);

  // Load source image into offscreen canvas when activeFile changes
  useEffect(() => {
    if (!activeFile) {
      setSourceCanvas(null);
      setSourceUrl('');
      setOutputUrl('');
      setOutputBlob(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setErrorMsg(null);
        const { canvas, width, height } = await loadImageCanvas(activeFile);
        if (cancelled) return;
        setSourceCanvas(canvas);
        setSourceDims({ w: width, h: height });
        setSourceUrl(canvas.toDataURL('image/png'));
        setMaskOverrides(new Float32Array(width * height).fill(-1));
        const ext = imageMimeToExt(params.outputFormat);
        setFilename(replaceFileExtension(activeFile.name, ext));
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Unable to decode image file.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile]);

  const handleReset = () => {
    pushParams(() => ({
      ...DEFAULT_IMAGE_PARAMS,
      cutout: {
        ...DEFAULT_IMAGE_PARAMS.cutout,
        enabled: selectedTool?.id === 'image-remove-bg',
      },
    }));
    if (sourceDims.w && sourceDims.h) {
      setMaskOverrides(new Float32Array(sourceDims.w * sourceDims.h).fill(-1));
    }
  };

  // Re-run image pipeline whenever params, sourceCanvas, or maskOverrides change
  useEffect(() => {
    if (!sourceCanvas) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsProcessing(true);
      setErrorMsg(null);
      try {
        const res = await processImageCanvas(sourceCanvas, {
          ...params,
          maskOverrides,
        });
        if (cancelled) return;
        const url = URL.createObjectURL(res.blob);
        setOutputUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
        setOutputBlob(res.blob);
        setOutputDims({ w: res.width, h: res.height });
        setLastDurationMs(res.durationMs);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Image processing failed.');
        }
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sourceCanvas, params, maskOverrides]);

  useEffect(() => {
    return () => {
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [outputUrl]);

  // Keep filename extension synced with output format
  useEffect(() => {
    setFilename((prev) => replaceFileExtension(prev, imageMimeToExt(params.outputFormat)));
  }, [params.outputFormat]);

  const paintMaskAtPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sourceCanvas || !maskOverrides || activeTab !== 'mask' || !previewContainerRef.current) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;

    const px = Math.round(nx * sourceCanvas.width);
    const py = Math.round(ny * sourceCanvas.height);
    const radius = Math.max(4, Math.round((brushSize / rect.width) * sourceCanvas.width));
    const val = brushMode === 'erase' ? 0 : 1;

    setMaskOverrides((prev) => {
      if (!prev) return prev;
      const next = new Float32Array(prev);
      const r2 = radius * radius;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = py + dy;
        if (yy < 0 || yy >= sourceCanvas.height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const xx = px + dx;
          if (xx < 0 || xx >= sourceCanvas.width) continue;
          next[yy * sourceCanvas.width + xx] = val;
        }
      }
      return next;
    });
  };

  const handleGeneratePassport = async () => {
    if (!sourceCanvas) return;
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const res = await generatePassportSheet(sourceCanvas, passportPreset, passportSheet, '#FFFFFF', passportFormat);
      const ext = passportFormat === 'application/pdf' ? 'pdf' : passportFormat === 'image/png' ? 'png' : 'jpg';
      const outName = replaceFileExtension(activeFile?.name || 'passport', ext).replace(
        new RegExp(`\\.${ext}$`),
        `_${passportPreset}_sheet.${ext}`
      );
      downloadBlob(res.blob, outName);
      recordHistory({
        toolId: 'image-passport',
        toolName: 'Passport & ID Sheet',
        category: 'image',
        inputFilename: activeFile?.name || 'image',
        outputFilename: outName,
        inputSize: activeFile?.size || 0,
        outputSize: res.blob.size,
        durationMs: res.durationMs,
        mode: 'local',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate passport sheet.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    if (!outputBlob) return;
    downloadBlob(outputBlob, filename);
    recordHistory({
      toolId: selectedTool?.id || 'image-studio',
      toolName: selectedTool?.name || 'Image Studio',
      category: 'image',
      inputFilename: activeFile?.name || 'image',
      outputFilename: filename,
      inputSize: activeFile?.size || 0,
      outputSize: outputBlob.size,
      durationMs: lastDurationMs,
      mode: 'local',
    });
  };

  const applyAspectCrop = (ratio: number | null) => {
    if (!ratio || !sourceDims.w || !sourceDims.h) {
      pushParams((p) => ({ ...p, transform: { ...p.transform, cropRect: null } }));
      return;
    }
    const imgRatio = sourceDims.w / sourceDims.h;
    let w = 1;
    let h = 1;
    if (imgRatio > ratio) {
      w = ratio / imgRatio;
    } else {
      h = imgRatio / ratio;
    }
    pushParams((p) => ({
      ...p,
      transform: {
        ...p.transform,
        cropRect: { x: (1 - w) / 2, y: (1 - h) / 2, w, h },
      },
    }));
  };

  const formatExtLabel = useMemo(() => {
    const ext = imageMimeToExt(params.outputFormat).toUpperCase().replace('WEBP', 'WebP');
    return outputBlob ? `${ext} · ${formatBytes(outputBlob.size)}` : ext;
  }, [params.outputFormat, outputBlob]);

  const settingsContent = (
    <ImageSettingsPanel
      activeTab={activeTab}
      params={params}
      pushParams={pushParams}
      sourceDims={sourceDims}
      hasSourceCanvas={Boolean(sourceCanvas)}
      isProcessing={isProcessing}
      brushMode={brushMode}
      onBrushModeChange={setBrushMode}
      brushSize={brushSize}
      onBrushSizeChange={setBrushSize}
      onClearBrushStrokes={() => {
        if (sourceDims.w && sourceDims.h) {
          setMaskOverrides(new Float32Array(sourceDims.w * sourceDims.h).fill(-1));
        }
      }}
      onApplyAspectCrop={applyAspectCrop}
      passportPreset={passportPreset}
      onPassportPresetChange={setPassportPreset}
      passportSheet={passportSheet}
      onPassportSheetChange={setPassportSheet}
      passportFormat={passportFormat}
      onPassportFormatChange={setPassportFormat}
      onGeneratePassport={handleGeneratePassport}
      onPickFile={() => filePickerRef.current?.click()}
    />
  );

  return (
    <StudioShell
      filename={filename}
      onFilenameChange={setFilename}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={handleUndo}
      onRedo={handleRedo}
      onReset={handleReset}
      zoom={zoom}
      onZoomChange={setZoom}
      showBeforeAfterToggle
      beforeAfterActive={beforeAfter}
      onToggleBeforeAfter={() => setBeforeAfter((v) => !v)}
      outputLabel={formatExtLabel}
      isProcessing={isProcessing}
      onExport={handleExport}
      exportDisabled={!outputBlob}
      railTabs={IMAGE_RAIL_TABS}
      activeRailTab={activeTab}
      onSelectRailTab={setActiveTab}
      settingsPanel={settingsContent}
      bottomMetaLeft={
        sourceDims.w
          ? `Source: ${sourceDims.w} × ${sourceDims.h} px (${formatBytes(activeFile?.size || 0)}) → Output: ${outputDims.w} × ${outputDims.h} px (${formatBytes(outputBlob?.size || 0)})`
          : 'No image loaded'
      }
      bottomMetaRight={
        lastDurationMs > 0 ? `Processed locally in ${formatDurationMs(lastDurationMs)}` : 'Canvas 2D Engine'
      }
    >
      <input
        ref={filePickerRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(Array.from(e.target.files), true);
        }}
      />

      <div className="min-h-full studio-grid-bg flex flex-col items-center justify-center p-4 sm:p-8">
        {!sourceCanvas ? (
          <StudioEmptyCard
            category="image"
            iconName="Sparkles"
            title="Load an image to edit"
            description="Upload a PNG, JPEG, or WebP, or try a bundled sample image below."
            primaryLabel="Select Image"
            onPrimaryClick={() => filePickerRef.current?.click()}
          >
            <div className="grid grid-cols-3 gap-2 pt-2">
              {SAMPLE_IMAGE_ASSETS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={async () => {
                    try {
                      setErrorMsg(null);
                      const f = await urlToFile(s.url, s.filename, 'image/jpeg');
                      addFiles([f], true);
                    } catch (err) {
                      setErrorMsg(err instanceof Error ? err.message : 'Failed to load sample image.');
                    }
                  }}
                  className="text-left bg-[#F6F7F9] hover:bg-white border border-[#E2E5EC] hover:border-[#1D4ED8] rounded-lg overflow-hidden transition-colors cursor-pointer"
                >
                  <img
                    src={s.url}
                    alt={s.label}
                    referrerPolicy="no-referrer"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <div className="px-2 py-1.5 text-[11px] font-medium text-[#17191D] truncate">
                    {s.label}
                  </div>
                </button>
              ))}
            </div>
          </StudioEmptyCard>
        ) : (
          <div className="flex flex-col items-center gap-3 max-w-full">
            {errorMsg && (
              <StudioNotice variant="error" className="w-full max-w-lg">
                {errorMsg}
              </StudioNotice>
            )}

            {activeTab === 'mask' && (
              <div className="px-3 py-1.5 bg-[#17191D] text-white text-xs rounded-lg font-mono">
                Brush Active ({brushMode === 'erase' ? 'Erase Background' : 'Restore Foreground'}) — drag on image below
              </div>
            )}

            {/* Central Image Preview Canvas */}
            <div
              ref={previewContainerRef}
              onPointerDown={(e) => {
                if (activeTab === 'mask') {
                  setIsPainting(true);
                  paintMaskAtPointer(e);
                }
              }}
              onPointerMove={(e) => {
                if (isPainting && activeTab === 'mask') {
                  paintMaskAtPointer(e);
                }
              }}
              onPointerUp={() => setIsPainting(false)}
              onPointerLeave={() => setIsPainting(false)}
              style={{
                width: `min(82vw, ${Math.round(580 * (zoom / 100))}px)`,
                aspectRatio: `${Math.max(1, outputDims.w || sourceDims.w)} / ${Math.max(
                  1,
                  outputDims.h || sourceDims.h
                )}`,
              }}
              className={`relative checkerboard-bg border border-[#E2E5EC] rounded-lg shadow-sm overflow-hidden select-none ${
                activeTab === 'mask' ? 'cursor-crosshair' : ''
              }`}
            >
              {outputUrl && (
                <img
                  src={outputUrl}
                  alt="Processed output"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
              )}

              {beforeAfter && activeTab !== 'mask' && sourceUrl && (
                <>
                  <div
                    className="absolute inset-0 overflow-hidden pointer-events-none"
                    style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
                  >
                    <img
                      src={sourceUrl}
                      alt="Original source"
                      className="w-full h-full object-contain bg-[#F6F7F9]"
                    />
                  </div>
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-[#1D4ED8] pointer-events-none"
                    style={{ left: `${splitPct}%` }}
                  />
                  <input
                    type="range"
                    min={5}
                    max={95}
                    value={splitPct}
                    onChange={(e) => setSplitPct(Number(e.target.value))}
                    aria-label="Before and after split slider"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
                  />
                  <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 bg-[#17191D]/80 text-white text-[10px] font-mono rounded pointer-events-none">
                    Original
                  </span>
                  <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 bg-[#0D9488] text-white text-[10px] font-mono rounded pointer-events-none">
                    Processed
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </StudioShell>
  );
};
