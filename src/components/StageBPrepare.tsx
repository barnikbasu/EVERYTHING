import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ClipboardPaste,
  ShieldCheck,
  Upload,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import { useWorkspace } from '../state/workspaceStore';
import { CATEGORY_META } from '../registry/toolRegistry';
import { ToolIcon } from './ToolIcon';
import { SAMPLE_IMAGE_ASSETS } from '../assets/samples';
import { urlToFile, validateFilesForTool } from '../utils/formatters';
import { readSupportedClipboardFiles } from '../utils/clipboard';
import { useClipboardFilePaste } from '../hooks/useClipboardFilePaste';
import { StudioNotice } from './StudioFeedback';

export const StageBPrepare: React.FC = () => {
  const { selectedTool, initialPreset, goHome, openToolExecute } = useWorkspace();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(
    initialPreset || selectedTool?.presets?.[0]?.id || null
  );
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);
  const [sliderPos, setSliderPos] = useState(52);
  const [cutoutPreviewUrl, setCutoutPreviewUrl] = useState<string | null>(null);
  const [cutoutPreviewFailed, setCutoutPreviewFailed] = useState(false);

  useEffect(() => {
    setSelectedPreset(initialPreset || selectedTool?.presets?.[0]?.id || null);
    setErrorMsg(null);
  }, [selectedTool?.id, initialPreset]);

  useEffect(() => {
    if (selectedTool?.id !== 'image-remove-bg') {
      setCutoutPreviewUrl(null);
      setCutoutPreviewFailed(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [{ computeCutoutAlphaMask, loadImageCanvas }, sample] = await Promise.all([
          import('../engines/imageEngine'),
          Promise.resolve(SAMPLE_IMAGE_ASSETS[0]),
        ]);
        const file = await urlToFile(sample.url, sample.filename, 'image/jpeg');
        const { canvas } = await loadImageCanvas(file);
        if (cancelled) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = computeCutoutAlphaMask(imgData, 34, 1.5, true);
        ctx.putImageData(new ImageData(new Uint8ClampedArray(data), canvas.width, canvas.height), 0, 0);
        if (!cancelled) {
          setCutoutPreviewUrl(canvas.toDataURL('image/png'));
          setCutoutPreviewFailed(false);
        }
      } catch {
        if (!cancelled) {
          setCutoutPreviewUrl(null);
          setCutoutPreviewFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTool?.id]);

  const handleIncomingFiles = (incoming: File[]) => {
    if (!selectedTool) return;
    setErrorMsg(null);
    const { valid, errors } = validateFilesForTool(incoming, selectedTool);
    if (errors.length > 0 && valid.length === 0) {
      setErrorMsg(errors[0]);
      return;
    }
    if (errors.length > 0) {
      setErrorMsg(errors[0]);
    }
    if (valid.length > 0) {
      openToolExecute(selectedTool.id, valid, selectedPreset);
    }
  };

  useClipboardFilePaste((pasted) => handleIncomingFiles(pasted), {
    enabled: Boolean(selectedTool),
  });

  if (!selectedTool) return null;
  const cat = CATEGORY_META[selectedTool.category];

  const handlePasteClick = async () => {
    setErrorMsg(null);
    const { files: pasted, unsupportedError } = await readSupportedClipboardFiles('clipboard');
    if (pasted.length === 0) {
      setErrorMsg(unsupportedError || 'No supported file found in clipboard.');
      return;
    }
    handleIncomingFiles(pasted);
  };

  const handleSampleLoad = async (sampleId: string) => {
    const sample = SAMPLE_IMAGE_ASSETS.find((s) => s.id === sampleId);
    if (!sample) return;
    setLoadingSampleId(sampleId);
    setErrorMsg(null);
    try {
      const file = await urlToFile(sample.url, sample.filename, 'image/jpeg');
      handleIncomingFiles([file]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load sample asset.');
    } finally {
      setLoadingSampleId(null);
    }
  };

  const supportsImageSamples =
    selectedTool.acceptedExtensions.some((e) => ['jpg', 'jpeg', 'png', 'webp'].includes(e)) &&
    selectedTool.category !== 'pdf';

  const acceptedAttr = selectedTool.acceptedExtensions.includes('*')
    ? undefined
    : selectedTool.acceptedExtensions.map((e) => `.${e}`).join(',');

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      {/* Top Breadcrumb & Title */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={goHome}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#717782] hover:text-[#17191D] cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to All Tools</span>
        </button>

        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-mono">
            <span className="font-semibold" style={{ color: cat.primaryColor }}>
              {selectedTool.categoryLabel}
            </span>
            <span className="text-[#717782]">/</span>
            <span className="text-[#717782]">{selectedTool.engineName}</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#17191D] text-balance">
            {selectedTool.name}
          </h1>
          <p className="text-sm text-[#717782]">{selectedTool.description}</p>
        </div>
      </div>

      {/* Main Two-Column Prepare Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Upload Dropzone + Samples */}
        <div className="lg:col-span-6 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            multiple={selectedTool.supportsMultiple}
            accept={acceptedAttr}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleIncomingFiles(Array.from(e.target.files));
            }}
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleIncomingFiles(Array.from(e.dataTransfer.files));
            }}
            className={`bg-white border rounded-xl p-6 sm:p-8 text-center space-y-4 transition-colors ${
              isDragging ? 'border-[#1D4ED8] bg-[#EFF6FF]/40' : 'border-[#E2E5EC]'
            }`}
          >
            <div
              className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center border"
              style={{
                backgroundColor: cat.lightTint,
                color: cat.primaryColor,
                borderColor: `${cat.primaryColor}25`,
              }}
            >
              <ToolIcon name={selectedTool.iconName} className="w-5 h-5" />
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-11 px-6 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>
                  Select {selectedTool.supportsMultiple ? 'Files' : 'File'}
                </span>
              </button>
              <p className="text-xs text-[#717782]">
                or drop {selectedTool.supportsMultiple ? 'one or more files' : 'a file'} anywhere in this box
              </p>
            </div>

            {supportsImageSamples && (
              <div>
                <button
                  type="button"
                  onClick={handlePasteClick}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-lg text-xs font-medium text-[#17191D] cursor-pointer"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-[#717782]" />
                  <span>Paste image with</span>
                  <kbd className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-[#E2E5EC]">
                    Ctrl+V
                  </kbd>
                </button>
              </div>
            )}

            {errorMsg && <StudioNotice variant="error">{errorMsg}</StudioNotice>}

            <div className="pt-3 border-t border-[#F1F3F6] text-xs text-[#717782] space-y-1">
              <p className="font-mono text-[11px]">
                Accepted:{' '}
                {selectedTool.acceptedExtensions.includes('*')
                  ? 'All file types'
                  : selectedTool.acceptedExtensions.map((e) => e.toUpperCase()).join(', ')}{' '}
                · Max {selectedTool.maxRecommendedSizeMB} MB
              </p>
              <p className="inline-flex items-center gap-1.5 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#0D9488]" />
                Processed locally in your browser · Originals stay untouched
              </p>
            </div>
          </div>

          {/* Real Bundled Sample Assets (Only shown when real bundled assets match the tool) */}
          {supportsImageSamples && (
            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono uppercase tracking-wider text-[#717782]">
                  Try a bundled sample image
                </span>
                <span className="font-mono text-[11px] text-[#717782]">Click to launch</span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {SAMPLE_IMAGE_ASSETS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    disabled={loadingSampleId === sample.id}
                    onClick={() => handleSampleLoad(sample.id)}
                    className="group text-left bg-[#F6F7F9] hover:bg-white border border-[#E2E5EC] hover:border-[#1D4ED8] rounded-lg overflow-hidden transition-colors cursor-pointer"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-[#F6F7F9]">
                      <img
                        src={sample.url}
                        alt={sample.label}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="px-2 py-1.5">
                      <div className="text-[11px] font-semibold text-[#17191D] truncate">
                        {loadingSampleId === sample.id ? 'Loading…' : sample.label}
                      </div>
                      <div className="text-[10px] font-mono text-[#717782]">{sample.tag}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Interactive Preview / Output Presets / Launch Empty Studio */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white border border-[#E2E5EC] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#17191D]">
                  {selectedTool.id === 'image-remove-bg'
                    ? 'Interactive Cutout Preview'
                    : 'Workspace Configuration'}
                </h2>
                <p className="text-xs text-[#717782]">
                  {selectedTool.engineName} · Outputs: {selectedTool.outputFormats.join(' / ')}
                </p>
              </div>
              <span className="font-mono text-[11px] text-[#0D9488]">Ready</span>
            </div>

            {selectedTool.id === 'image-remove-bg' && (
              <div className="space-y-2">
                <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-[#E2E5EC] select-none checkerboard-bg">
                  <img
                    src={SAMPLE_IMAGE_ASSETS[0].url}
                    alt="Original preview"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Real local cutout engine result on right half of split slider */}
                  <div
                    className="absolute inset-0 checkerboard-bg overflow-hidden"
                    style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
                  >
                    {cutoutPreviewUrl ? (
                      <img
                        src={cutoutPreviewUrl}
                        alt="Computed cutout preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#F6F7F9]/90 px-4 text-center text-xs text-[#717782]">
                        {cutoutPreviewFailed
                          ? 'Sample preview requires network image access. Upload a local file to run the cutout engine offline.'
                          : 'Running local cutout preview…'}
                      </div>
                    )}
                  </div>
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-[#1D4ED8] pointer-events-none"
                    style={{ left: `${sliderPos}%` }}
                  />
                  <input
                    type="range"
                    min={10}
                    max={90}
                    value={sliderPos}
                    onChange={(e) => setSliderPos(Number(e.target.value))}
                    aria-label="Preview before and after comparison slider"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
                  />
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-[#17191D]/80 text-white text-[10px] font-mono rounded">
                    Original
                  </span>
                  <span className="absolute top-2.5 right-2.5 px-2 py-0.5 bg-[#1D4ED8] text-white text-[10px] font-mono rounded">
                    {cutoutPreviewUrl ? 'Live Engine Alpha' : 'Preview'}
                  </span>
                </div>
                <p className="text-[11px] text-[#717782] font-mono">
                  Drag slider to compare original vs local edge-matting alpha · Upload any image to tune tolerance and brush mask
                </p>
              </div>
            )}

            {selectedTool.presets && selectedTool.presets.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#17191D] flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#717782]" />
                  <span>Select initial preset</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedTool.presets.map((p) => (
                    <label
                      key={p.id}
                      className={`p-3 rounded-lg border cursor-pointer flex items-start gap-2.5 transition-colors ${
                        selectedPreset === p.id
                          ? 'bg-[#EFF6FF] border-[#1D4ED8]'
                          : 'bg-[#F6F7F9] border-[#E2E5EC] hover:bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="prepare-preset"
                        checked={selectedPreset === p.id}
                        onChange={() => setSelectedPreset(p.id)}
                        className="mt-0.5 accent-[#1D4ED8]"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#17191D]">{p.label}</div>
                        <div className="text-[11px] text-[#717782]">{p.detail}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {selectedTool.limitationsNote && (
              <StudioNotice variant="warning">
                <strong>Note:</strong> {selectedTool.limitationsNote}
              </StudioNotice>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-10 px-4 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>Choose File to Open {selectedTool.name}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Batch Lab Shortcut */}
          <button
            type="button"
            onClick={() => openToolExecute('batch-lab')}
            className="w-full p-4 bg-white border border-[#E2E5EC] hover:border-[#1D4ED8]/50 rounded-xl flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#F0FDFA] text-[#0D9488] flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#17191D]">
                  Have multiple files to process at once?
                </div>
                <div className="text-[11px] text-[#717782]">
                  Queue batch resize, compress, rename, and ZIP exports in Batch Lab
                </div>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#1D4ED8] whitespace-nowrap">
              Open Batch Lab →
            </span>
          </button>
        </div>
      </div>

      {/* 3-Column Standards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-1.5">
          <h3 className="text-sm font-semibold text-[#17191D]">Deterministic Local Engine</h3>
          <p className="text-xs text-[#717782] leading-relaxed">
            Powered by {selectedTool.engineName}. Processing begins only after you load a valid file and confirm your export action.
          </p>
        </div>
        <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-1.5">
          <h3 className="text-sm font-semibold text-[#17191D]">Non-Destructive Workflow</h3>
          <p className="text-xs text-[#717782] leading-relaxed">
            Your source file stays untouched in memory. Preview outputs and adjust parameters freely before saving a new copy.
          </p>
        </div>
        <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-1.5">
          <h3 className="text-sm font-semibold text-[#17191D]">Transparent Limits</h3>
          <p className="text-xs text-[#717782] leading-relaxed">
            Recommended browser input limit: {selectedTool.maxRecommendedSizeMB} MB. Supported exports:{' '}
            {selectedTool.outputFormats.join(', ')}.
          </p>
        </div>
      </div>
    </div>
  );
};
