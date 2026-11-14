import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { StudioShell, type StudioRailTab } from '../StudioShell';
import { StudioEmptyCard, StudioNotice } from '../StudioFeedback';
import { useWorkspace } from '../../state/workspaceStore';
import {
  applyAnnotationsAndRedactions,
  compressPdf,
  fillAndFlattenPdf,
  imagesToPdf,
  inspectPdfFormFields,
  mergePdfs,
  organizePdf,
  renderPdfPreviews,
  renderSinglePdfPageCanvas,
  splitPdf,
  type PdfAnnotationItem,
  type PdfFormFieldInfo,
  type PdfPagePreview,
  type PdfPageSpec,
} from '../../engines/pdfEngine';
import { downloadBlob, formatBytes, replaceFileExtension } from '../../utils/formatters';
import { useHistoryState } from '../../hooks/useHistoryState';
import { PdfSettingsPanel } from './pdf/PdfSettingsPanel';
import { PdfThumbnailGrid } from './pdf/PdfThumbnailGrid';

const PDF_RAIL_TABS: StudioRailTab[] = [
  { id: 'organize', label: 'Organize', icon: 'LayoutGrid' },
  { id: 'merge', label: 'Merge', icon: 'FileStack' },
  { id: 'split', label: 'Split', icon: 'Scissors' },
  { id: 'compress', label: 'Compress', icon: 'Minimize2' },
  { id: 'annotate', label: 'Sign/Mark', icon: 'PenTool' },
  { id: 'redact', label: 'Redact', icon: 'ShieldAlert' },
  { id: 'forms', label: 'Forms', icon: 'FileCheck2' },
  { id: 'img2pdf', label: 'Img→PDF', icon: 'Images' },
];

function getInitialPdfTab(toolId?: string): string {
  switch (toolId) {
    case 'pdf-merge':
      return 'merge';
    case 'pdf-split':
      return 'split';
    case 'pdf-compress':
      return 'compress';
    case 'pdf-sign-annotate':
      return 'annotate';
    case 'pdf-redact':
      return 'redact';
    case 'pdf-forms-flatten':
      return 'forms';
    case 'pdf-images-to-pdf':
      return 'img2pdf';
    default:
      return 'organize';
  }
}

export const PdfStudio: React.FC = () => {
  const { selectedTool, files, initialPreset, addFiles, removeFile, recordHistory } = useWorkspace();
  const [activeTab, setActiveTab] = useState<string>(() => getInitialPdfTab(selectedTool?.id));
  const [filename, setFilename] = useState<string>('document_output.pdf');
  const [zoom, setZoom] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const primaryPdf = files.find((f) => f.extension === 'pdf' || f.type === 'application/pdf')?.file || null;
  const pdfQueue = files.filter((f) => f.extension === 'pdf');
  const imageFiles = files.filter(
    (f) => f.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(f.extension)
  );

  // Page thumbnails & Organize Undo/Redo stack
  const [previews, setPreviews] = useState<PdfPagePreview[]>([]);
  const {
    state: currentSpecs,
    canUndo: canUndoSpecs,
    canRedo: canRedoSpecs,
    push: pushSpecs,
    reset: resetSpecs,
    undo: undoSpecs,
    redo: redoSpecs,
  } = useHistoryState<PdfPageSpec[]>([], 25);

  // Split state
  const [splitRange, setSplitRange] = useState('1-2');
  const [splitMode, setSplitMode] = useState<'single-pdf' | 'zip-pages'>('single-pdf');

  // Compress state
  const [compressPreset, setCompressPreset] = useState<'recommended' | 'maximum' | 'lossless'>(
    (initialPreset as 'recommended' | 'maximum' | 'lossless') || 'recommended'
  );
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);

  // Images -> PDF state
  const [imgPageMode, setImgPageMode] = useState<'a4' | 'letter' | 'fit-image'>('a4');

  // Annotate & Redact interactive page state
  const [activePageNum, setActivePageNum] = useState(1);
  const [pageCanvasDataUrl, setPageCanvasDataUrl] = useState<string>('');
  const [annotations, setAnnotations] = useState<PdfAnnotationItem[]>([]);
  const [drawTool, setDrawTool] = useState<'redact' | 'highlight' | 'text' | 'signature'>('redact');
  const [textInput, setTextInput] = useState('Approved');
  const [watermarkText, setWatermarkText] = useState('');
  const [dragBox, setDragBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const pageStageRef = useRef<HTMLDivElement>(null);

  // Signature pad
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // AcroForm fields
  const [formFields, setFormFields] = useState<PdfFormFieldInfo[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [flattenForms, setFlattenForms] = useState(true);

  useEffect(() => {
    const nextTab = getInitialPdfTab(selectedTool?.id);
    setActiveTab(nextTab);
    if (nextTab === 'redact') setDrawTool('redact');
    else if (nextTab === 'annotate') setDrawTool('highlight');
  }, [selectedTool?.id]);

  // Load previews & form fields whenever primaryPdf changes
  useEffect(() => {
    if (!primaryPdf) {
      setPreviews([]);
      resetSpecs([]);
      setFormFields([]);
      setPageCanvasDataUrl('');
      return;
    }

    setFilename(replaceFileExtension(primaryPdf.name, 'pdf').replace('.pdf', '_edited.pdf'));
    setCompressedBlob(null);
    setAnnotations([]);
    setStatusMsg(null);
    setErrorMsg(null);

    let cancelled = false;
    (async () => {
      try {
        setIsProcessing(true);
        const [{ pages }, fields] = await Promise.all([
          renderPdfPreviews(primaryPdf, 0.42),
          inspectPdfFormFields(primaryPdf).catch(() => []),
        ]);
        if (cancelled) return;
        setPreviews(pages);
        const initialSpecs: PdfPageSpec[] = pages.map((_, idx) => ({
          originalIndex: idx,
          rotation: 0,
          deleted: false,
        }));
        resetSpecs(initialSpecs);
        setActivePageNum(1);
        setFormFields(fields);
        const initVals: Record<string, string | boolean> = {};
        fields.forEach((f) => {
          initVals[f.name] = f.type === 'checkbox' ? Boolean(f.checked) : f.value;
        });
        setFormValues(initVals);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to parse PDF document.');
        }
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [primaryPdf, resetSpecs]);

  // Render high-res active page when in Annotate or Redact mode
  useEffect(() => {
    if (!primaryPdf || (activeTab !== 'annotate' && activeTab !== 'redact')) return;
    let cancelled = false;
    (async () => {
      try {
        const canvas = await renderSinglePdfPageCanvas(primaryPdf, activePageNum, 1.5);
        if (!cancelled) {
          setPageCanvasDataUrl(canvas.toDataURL('image/png'));
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Unable to render PDF page.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [primaryPdf, activePageNum, activeTab]);

  const moveSpec = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= currentSpecs.length) return;
    pushSpecs((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const rotateSpec = (idx: number) => {
    pushSpecs((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, rotation: ((s.rotation + 90) % 360) as 0 | 90 | 180 | 270 } : s
      )
    );
  };

  const toggleDeleteSpec = (idx: number) => {
    pushSpecs((prev) => prev.map((s, i) => (i === idx ? { ...s, deleted: !s.deleted } : s)));
  };

  const handleCompressRun = async () => {
    if (!primaryPdf) return;
    setIsProcessing(true);
    setErrorMsg(null);
    setProgressPct(0);
    const t0 = performance.now();
    try {
      const blob = await compressPdf(primaryPdf, compressPreset, setProgressPct);
      setCompressedBlob(blob);
      const saved = Math.round(((primaryPdf.size - blob.size) / Math.max(1, primaryPdf.size)) * 100);
      setStatusMsg(
        `Compressed ${formatBytes(primaryPdf.size)} → ${formatBytes(blob.size)} (${saved > 0 ? `-${saved}%` : 'minimal change'})`
      );
      recordHistory({
        toolId: 'pdf-compress',
        toolName: 'Compress PDF',
        category: 'pdf',
        inputFilename: primaryPdf.name,
        outputFilename: filename,
        inputSize: primaryPdf.size,
        outputSize: blob.size,
        durationMs: performance.now() - t0,
        mode: 'local',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF compression failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setIsProcessing(true);
    const t0 = performance.now();

    try {
      let outBlob: Blob;
      let outName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
      let inputName = primaryPdf?.name || 'documents';
      let inputSize = primaryPdf?.size || 0;

      if (activeTab === 'merge') {
        const pdfList = pdfQueue.map((f) => f.file);
        outBlob = await mergePdfs(pdfList);
        inputName = `${pdfList.length} PDFs`;
        inputSize = pdfList.reduce((s, f) => s + f.size, 0);
      } else if (activeTab === 'split') {
        if (!primaryPdf) throw new Error('Load a PDF first.');
        const res = await splitPdf(primaryPdf, splitRange, splitMode);
        outBlob = res.blob;
        outName = replaceFileExtension(filename, res.extension);
      } else if (activeTab === 'compress') {
        if (!primaryPdf) throw new Error('Load a PDF first.');
        outBlob = compressedBlob || (await compressPdf(primaryPdf, compressPreset, setProgressPct));
      } else if (activeTab === 'img2pdf') {
        const imgs = imageFiles.map((f) => f.file);
        outBlob = await imagesToPdf(imgs, imgPageMode);
        inputName = `${imgs.length} images`;
        inputSize = imgs.reduce((s, f) => s + f.size, 0);
      } else if (activeTab === 'annotate' || activeTab === 'redact') {
        if (!primaryPdf) throw new Error('Load a PDF first.');
        outBlob = await applyAnnotationsAndRedactions(
          primaryPdf,
          annotations,
          watermarkText.trim() ? { text: watermarkText, opacity: 0.28, fontSize: 42 } : undefined
        );
      } else if (activeTab === 'forms') {
        if (!primaryPdf) throw new Error('Load a PDF first.');
        outBlob = await fillAndFlattenPdf(primaryPdf, formValues, flattenForms);
      } else {
        if (!primaryPdf) throw new Error('Load a PDF first.');
        outBlob = await organizePdf(primaryPdf, currentSpecs);
      }

      downloadBlob(outBlob, outName);
      setStatusMsg(`Exported ${outName} (${formatBytes(outBlob.size)})`);
      recordHistory({
        toolId: `pdf-${activeTab}`,
        toolName: `PDF ${activeTab}`,
        category: 'pdf',
        inputFilename: inputName,
        outputFilename: outName,
        inputSize,
        outputSize: outBlob.size,
        durationMs: performance.now() - t0,
        mode: 'local',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Pointer drawing for Annotate / Redact boxes
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pageStageRef.current) return;
    const rect = pageStageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (drawTool === 'text') {
      if (!textInput.trim()) return;
      setAnnotations((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          pageNumber: activePageNum,
          type: 'text',
          xRatio: x,
          yRatio: y,
          wRatio: 0.25,
          hRatio: 0.05,
          text: textInput,
        },
      ]);
      return;
    }

    if (drawTool === 'signature') {
      if (!signatureDataUrl) {
        setErrorMsg('Draw a signature in the left panel first, then click the page to place it.');
        return;
      }
      setAnnotations((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          pageNumber: activePageNum,
          type: 'signature',
          xRatio: Math.max(0, x - 0.12),
          yRatio: Math.max(0, y - 0.04),
          wRatio: 0.24,
          hRatio: 0.08,
          signatureDataUrl,
        },
      ]);
      return;
    }

    setDragBox({ x0: x, y0: y, x1: x, y1: y });
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragBox || !pageStageRef.current) return;
    const rect = pageStageRef.current.getBoundingClientRect();
    const x1 = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y1 = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDragBox((b) => (b ? { ...b, x1, y1 } : null));
  };

  const handleStagePointerUp = () => {
    if (!dragBox) return;
    const xRatio = Math.min(dragBox.x0, dragBox.x1);
    const yRatio = Math.min(dragBox.y0, dragBox.y1);
    const wRatio = Math.abs(dragBox.x1 - dragBox.x0);
    const hRatio = Math.abs(dragBox.y1 - dragBox.y0);
    setDragBox(null);

    if (wRatio < 0.015 || hRatio < 0.01) return;
    setAnnotations((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        pageNumber: activePageNum,
        type: drawTool === 'redact' ? 'redact' : 'highlight',
        xRatio,
        yRatio,
        wRatio,
        hRatio,
      },
    ]);
  };

  // Signature pad handlers
  const handleSigPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.strokeStyle = '#17191D';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsSigning(true);
  };

  const handleSigPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isSigning || !sigCanvasRef.current) return;
    const ctx = sigCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const rect = sigCanvasRef.current.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const handleSigPointerUp = () => {
    if (!isSigning || !sigCanvasRef.current) return;
    setIsSigning(false);
    setSignatureDataUrl(sigCanvasRef.current.toDataURL('image/png'));
  };

  const clearSignaturePad = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl(null);
  };

  const settingsPanel = (
    <PdfSettingsPanel
      activeTab={activeTab}
      primaryPdf={primaryPdf}
      pdfQueue={pdfQueue}
      imageFiles={imageFiles}
      previews={previews}
      currentSpecs={currentSpecs}
      splitRange={splitRange}
      onSplitRangeChange={setSplitRange}
      splitMode={splitMode}
      onSplitModeChange={setSplitMode}
      compressPreset={compressPreset}
      onCompressPresetChange={(preset) => {
        setCompressPreset(preset);
        setCompressedBlob(null);
      }}
      compressedBlob={compressedBlob}
      progressPct={progressPct}
      isProcessing={isProcessing}
      onCompressRun={handleCompressRun}
      drawTool={drawTool}
      onDrawToolChange={setDrawTool}
      textInput={textInput}
      onTextInputChange={setTextInput}
      watermarkText={watermarkText}
      onWatermarkTextChange={setWatermarkText}
      annotations={annotations}
      onRemoveLastAnnotation={() => setAnnotations((a) => a.slice(0, -1))}
      sigCanvasRef={sigCanvasRef}
      onSigPointerDown={handleSigPointerDown}
      onSigPointerMove={handleSigPointerMove}
      onSigPointerUp={handleSigPointerUp}
      onClearSignaturePad={clearSignaturePad}
      formFields={formFields}
      formValues={formValues}
      onFormValueChange={(name, value) => setFormValues((v) => ({ ...v, [name]: value }))}
      flattenForms={flattenForms}
      onFlattenFormsChange={setFlattenForms}
      imgPageMode={imgPageMode}
      onImgPageModeChange={setImgPageMode}
      onRemoveFile={removeFile}
      onPickFiles={() => fileInputRef.current?.click()}
    />
  );

  return (
    <StudioShell
      filename={filename}
      onFilenameChange={setFilename}
      canUndo={activeTab === 'organize' && canUndoSpecs}
      canRedo={activeTab === 'organize' && canRedoSpecs}
      onUndo={undoSpecs}
      onRedo={redoSpecs}
      zoom={zoom}
      onZoomChange={setZoom}
      outputLabel={primaryPdf ? `${previews.length} pages · ${formatBytes(primaryPdf.size)}` : undefined}
      isProcessing={isProcessing}
      onExport={handleExport}
      exportLabel={
        activeTab === 'redact'
          ? 'Apply Redactions & Export'
          : activeTab === 'merge'
          ? 'Merge & Download'
          : 'Export PDF'
      }
      exportDisabled={
        activeTab === 'img2pdf'
          ? imageFiles.length === 0
          : activeTab === 'merge'
          ? pdfQueue.length < 2
          : !primaryPdf
      }
      railTabs={PDF_RAIL_TABS}
      activeRailTab={activeTab}
      onSelectRailTab={setActiveTab}
      settingsPanel={settingsPanel}
      bottomMetaLeft={
        primaryPdf
          ? `${primaryPdf.name} · ${previews.length} page(s) · ${formatBytes(primaryPdf.size)}`
          : `${imageFiles.length} image(s) queued`
      }
      bottomMetaRight="pdf-lib + PDF.js Local Engine"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={activeTab === 'img2pdf' ? 'image/*' : '.pdf,image/*'}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            const replace = activeTab !== 'merge' && activeTab !== 'img2pdf';
            addFiles(Array.from(e.target.files), replace);
          }
        }}
      />

      <div className="min-h-full studio-grid-bg p-4 sm:p-6 space-y-4">
        {errorMsg && <StudioNotice variant="error">{errorMsg}</StudioNotice>}
        {statusMsg && <StudioNotice variant="success">{statusMsg}</StudioNotice>}

        {!primaryPdf && activeTab !== 'img2pdf' ? (
          <div className="py-8 flex justify-center">
            <StudioEmptyCard
              category="pdf"
              iconName="FileStack"
              title="Load a PDF Document"
              description="Select one or more PDF files from your device to organize, compress, split, sign, or securely redact."
              primaryLabel="Select PDF File"
              onPrimaryClick={() => fileInputRef.current?.click()}
            />
          </div>
        ) : activeTab === 'annotate' || activeTab === 'redact' ? (
          /* Interactive Single-Page Canvas for Annotations & Redaction */
          <div className="flex flex-col items-center gap-4">
            {previews.length > 1 && (
              <div className="flex items-center gap-2 bg-white border border-[#E2E5EC] rounded-lg px-3 py-1.5 text-xs">
                <button
                  type="button"
                  disabled={activePageNum <= 1}
                  onClick={() => setActivePageNum((p) => Math.max(1, p - 1))}
                  className="px-2 py-0.5 border border-[#E2E5EC] rounded disabled:opacity-40 cursor-pointer"
                >
                  Prev
                </button>
                <span className="font-mono">
                  Page {activePageNum} / {previews.length}
                </span>
                <button
                  type="button"
                  disabled={activePageNum >= previews.length}
                  onClick={() => setActivePageNum((p) => Math.min(previews.length, p + 1))}
                  className="px-2 py-0.5 border border-[#E2E5EC] rounded disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}

            <div
              ref={pageStageRef}
              onPointerDown={handleStagePointerDown}
              onPointerMove={handleStagePointerMove}
              onPointerUp={handleStagePointerUp}
              style={{ width: `min(90vw, ${Math.round(620 * (zoom / 100))}px)` }}
              className="relative bg-white border border-[#E2E5EC] shadow-sm select-none cursor-crosshair overflow-hidden"
            >
              {pageCanvasDataUrl && (
                <img
                  src={pageCanvasDataUrl}
                  alt={`PDF Page ${activePageNum}`}
                  className="w-full h-auto block pointer-events-none"
                />
              )}

              {annotations
                .filter((a) => a.pageNumber === activePageNum)
                .map((a) => (
                  <div
                    key={a.id}
                    style={{
                      left: `${a.xRatio * 100}%`,
                      top: `${a.yRatio * 100}%`,
                      width: `${a.wRatio * 100}%`,
                      height: `${a.hRatio * 100}%`,
                    }}
                    className={`absolute pointer-events-none ${
                      a.type === 'redact'
                        ? 'bg-[#17191D]'
                        : a.type === 'highlight'
                        ? 'bg-[#FDE047]/45 border border-[#D97706]/50'
                        : a.type === 'text'
                        ? 'text-xs font-bold text-[#17191D]'
                        : ''
                    }`}
                  >
                    {a.type === 'text' && a.text}
                    {a.type === 'signature' && a.signatureDataUrl && (
                      <img src={a.signatureDataUrl} alt="Signature" className="w-full h-full object-contain" />
                    )}
                  </div>
                ))}

              {dragBox && (
                <div
                  style={{
                    left: `${Math.min(dragBox.x0, dragBox.x1) * 100}%`,
                    top: `${Math.min(dragBox.y0, dragBox.y1) * 100}%`,
                    width: `${Math.abs(dragBox.x1 - dragBox.x0) * 100}%`,
                    height: `${Math.abs(dragBox.y1 - dragBox.y0) * 100}%`,
                  }}
                  className={`absolute pointer-events-none border-2 ${
                    drawTool === 'redact'
                      ? 'bg-[#17191D]/75 border-[#E5322D]'
                      : 'bg-[#FDE047]/40 border-[#D97706]'
                  }`}
                />
              )}
            </div>
          </div>
        ) : activeTab === 'img2pdf' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {imageFiles.map((img, i) => (
              <div
                key={img.id}
                className="bg-white border border-[#E2E5EC] rounded-lg p-2 space-y-2"
              >
                <img
                  src={img.objectUrl}
                  alt={img.name}
                  className="aspect-[3/4] w-full object-contain bg-[#F6F7F9] rounded"
                />
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="truncate">
                    {i + 1}. {img.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(img.id)}
                    className="text-[#717782] hover:text-[#E5322D] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <PdfThumbnailGrid
            previews={previews}
            currentSpecs={currentSpecs}
            onMoveSpec={moveSpec}
            onRotateSpec={rotateSpec}
            onToggleDeleteSpec={toggleDeleteSpec}
          />
        )}
      </div>
    </StudioShell>
  );
};
